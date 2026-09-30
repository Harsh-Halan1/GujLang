import type { TacInstruction } from "./ir";
import { formatTac } from "./ir";

export type RegisterAllocation = {
  registers: Record<string, string>;
  spills: string[];
  assembly: string[];
  interference: [string, string][];
};
export function allocateRegisters(code: TacInstruction[], registerCount = 4): RegisterAllocation {
  const labels = new Map(
    code.flatMap((instruction, index) =>
      instruction.op === "label" ? [[instruction.name, index] as const] : [],
    ),
  );
  const useDef = code.map((instruction) => ({ uses: uses(instruction), def: def(instruction) }));
  const liveIn: Set<string>[] = code.map(() => new Set()),
    liveOut: Set<string>[] = code.map(() => new Set());
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = code.length - 1; i >= 0; i--) {
      const instruction = code[i];
      const successors =
        instruction.op === "goto"
          ? [labels.get(instruction.target)].filter((n): n is number => n !== undefined)
          : instruction.op === "ifFalse"
            ? [i + 1, labels.get(instruction.target)].filter((n): n is number => n !== undefined)
            : instruction.op === "return" || instruction.op === "halt"
              ? []
              : i + 1 < code.length
                ? [i + 1]
                : [];
      const out = new Set(successors.flatMap((index) => [...liveIn[index]]));
      const input = new Set(out);
      const definition = useDef[i].def;
      if (definition) input.delete(definition);
      for (const value of useDef[i].uses) input.add(value);
      if (!equal(liveOut[i], out) || !equal(liveIn[i], input)) {
        liveOut[i] = out;
        liveIn[i] = input;
        changed = true;
      }
    }
  }
  const graph = new Map<string, Set<string>>();
  const edge = (a: string, b: string) => {
    if (a === b) return;
    graph.get(a)?.add(b);
    graph.get(b)?.add(a);
  };
  for (let i = 0; i < code.length; i++) {
    for (const value of useDef[i].uses) if (!graph.has(value)) graph.set(value, new Set());
    const definition = useDef[i].def;
    if (definition) {
      if (!graph.has(definition)) graph.set(definition, new Set());
      for (const live of liveOut[i]) edge(definition, live);
    }
  }
  const colors: Record<string, string> = {},
    spills: string[] = [];
  const order = [...graph.keys()].sort(
    (a, b) => (graph.get(b)?.size ?? 0) - (graph.get(a)?.size ?? 0),
  );
  for (const value of order) {
    const unavailable = new Set(
      [...(graph.get(value) ?? [])].map((neighbor) => colors[neighbor]).filter(Boolean),
    );
    const color = Array.from({ length: registerCount }, (_, i) => `R${i}`).find(
      (candidate) => !unavailable.has(candidate),
    );
    if (color) colors[value] = color;
    else spills.push(value);
  }
  const location = (name: string) => colors[name] ?? `[spill:${name}]`;
  const assembly = code.map((instruction) => {
    switch (instruction.op) {
      case "label":
        return `${instruction.name}:`;
      case "function":
        return `${instruction.name}(${instruction.parameters.join(", ")}):`;
      case "call":
        return `CALL ${instruction.name}(${instruction.args.map(location).join(", ")}) -> ${location(instruction.target)}`;
      case "return":
        return `RET ${location(instruction.value)}`;
      case "halt":
        return "HALT";
      case "const":
        return `MOV ${location(instruction.target)}, ${JSON.stringify(instruction.value)}`;
      case "copy":
        return `MOV ${location(instruction.target)}, ${location(instruction.source)}`;
      case "unary":
        return `${instruction.operator === "not" ? "NOT" : "NEG"} ${location(instruction.target)}, ${location(instruction.operand)}`;
      case "binary":
        return `${mnemonic(instruction.operator)} ${location(instruction.target)}, ${location(instruction.left)}, ${location(instruction.right)}`;
      case "print":
        return `PRINT ${location(instruction.value)}`;
      case "ifFalse":
        return `BRZ ${location(instruction.condition)}, ${instruction.target}`;
      case "goto":
        return `JMP ${instruction.target}`;
      default:
        return "";
    }
  });
  return {
    registers: colors,
    spills,
    assembly,
    interference: [...graph].flatMap(([a, neighbors]) =>
      [...neighbors].filter((b) => a < b).map((b) => [a, b] as [string, string]),
    ),
  };
}
export function renderTac(code: TacInstruction[]): string[] {
  return formatTac(code);
}
function def(instruction: TacInstruction): string | undefined {
  return ["const", "copy", "unary", "binary", "call"].includes(instruction.op)
    ? (instruction as { target: string }).target
    : undefined;
}
function uses(instruction: TacInstruction): string[] {
  if (instruction.op === "copy") return [instruction.source];
  if (instruction.op === "unary") return [instruction.operand];
  if (instruction.op === "binary") return [instruction.left, instruction.right];
  if (instruction.op === "print") return [instruction.value];
  if (instruction.op === "ifFalse") return [instruction.condition];
  if (instruction.op === "call") return instruction.args;
  if (instruction.op === "return") return [instruction.value];
  return [];
}
function equal(a: Set<string>, b: Set<string>): boolean {
  return a.size === b.size && [...a].every((item) => b.has(item));
}
function mnemonic(operator: string): string {
  return (
    {
      "+": "ADD",
      "-": "SUB",
      "*": "MUL",
      "/": "DIV",
      AND: "AND",
      OR: "OR",
      ">": "CMP_GT",
      "<": "CMP_LT",
      ">=": "CMP_GE",
      "<=": "CMP_LE",
      "==": "CMP_EQ",
      "!=": "CMP_NE",
    }[operator] ?? "OP"
  );
}
