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
  const functions = new Map(
    code.flatMap((instruction, index) =>
      instruction.op === "function" ? [[instruction.name, index + 1] as const] : [],
    ),
  );
  const functionAt: (string | undefined)[] = [];
  const returnSites = new Map<string, number[]>();
  let activeFunction: string | undefined;
  code.forEach((instruction, index) => {
    if (instruction.op === "function") activeFunction = instruction.name;
    functionAt[index] = activeFunction;
    if (instruction.op === "call" && index + 1 < code.length) {
      const sites = returnSites.get(instruction.name) ?? [];
      sites.push(index + 1);
      returnSites.set(instruction.name, sites);
    }
  });
  const successors = (index: number): number[] => {
    const instruction = code[index];
    if (instruction.op === "goto") return [labels.get(instruction.target)].filter(isIndex);
    if (instruction.op === "ifFalse")
      return [index + 1, labels.get(instruction.target)].filter(isIndex);
    if (instruction.op === "call")
      return [index + 1, functions.get(instruction.name)].filter(isIndex);
    if (instruction.op === "return") return returnSites.get(functionAt[index] ?? "") ?? [];
    if (instruction.op === "halt") return [];
    return index + 1 < code.length ? [index + 1] : [];
  };
  const useDef = code.map((instruction) => ({ uses: uses(instruction), defs: defs(instruction) }));
  const liveIn: Set<string>[] = code.map(() => new Set());
  const liveOut: Set<string>[] = code.map(() => new Set());
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = code.length - 1; i >= 0; i--) {
      const out = new Set(successors(i).flatMap((index) => [...liveIn[index]]));
      const input = new Set(out);
      for (const definition of useDef[i].defs) input.delete(definition);
      for (const value of useDef[i].uses) input.add(value);
      if (!equal(liveOut[i], out) || !equal(liveIn[i], input)) {
        liveOut[i] = out;
        liveIn[i] = input;
        changed = true;
      }
    }
  }

  const graph = new Map<string, Set<string>>();
  const node = (name: string) => {
    if (!graph.has(name)) graph.set(name, new Set());
  };
  const edge = (left: string, right: string) => {
    if (left === right) return;
    node(left);
    node(right);
    graph.get(left)?.add(right);
    graph.get(right)?.add(left);
  };
  for (let i = 0; i < code.length; i++) {
    const instruction = code[i];
    for (const value of useDef[i].uses) node(value);
    for (const definition of useDef[i].defs) {
      node(definition);
      for (const live of liveOut[i]) edge(definition, live);
    }
    if (instruction.op === "function") {
      const parameters = instruction.parameters;
      for (let a = 0; a < parameters.length; a++) {
        node(parameters[a]);
        for (let b = a + 1; b < parameters.length; b++) edge(parameters[a], parameters[b]);
        for (const live of liveIn[i + 1] ?? []) edge(parameters[a], live);
      }
    }
  }

  const colorCount = Math.max(0, Math.floor(registerCount));
  const remaining = new Set(graph.keys());
  const stack: string[] = [];
  while (remaining.size) {
    const lowDegree = [...remaining].find(
      (value) =>
        [...(graph.get(value) ?? [])].filter((neighbor) => remaining.has(neighbor)).length <
        colorCount,
    );
    const selected =
      lowDegree ??
      [...remaining].sort(
        (left, right) => degree(right, graph, remaining) - degree(left, graph, remaining),
      )[0];
    stack.push(selected);
    remaining.delete(selected);
  }

  const registers: Record<string, string> = {};
  const spills: string[] = [];
  while (stack.length) {
    const value = stack.pop();
    if (value === undefined) continue;
    const unavailable = new Set(
      [...(graph.get(value) ?? [])].map((neighbor) => registers[neighbor]).filter(Boolean),
    );
    const color = Array.from({ length: colorCount }, (_, index) => `R${index}`).find(
      (candidate) => !unavailable.has(candidate),
    );
    if (color) registers[value] = color;
    else spills.push(value);
  }

  const location = (name: string) => registers[name] ?? `[spill:${name}]`;
  const load = (name: string, scratch: string): { lines: string[]; value: string } => {
    const value = location(name);
    return value.startsWith("[spill:")
      ? { lines: [`LOAD ${scratch}, ${value}`], value: scratch }
      : { lines: [], value };
  };
  const store = (name: string, value: string) =>
    location(name).startsWith("[spill:") ? [`STORE ${location(name)}, ${value}`] : [];
  const assembly = code.flatMap((instruction): string[] => {
    switch (instruction.op) {
      case "label":
        return [`${instruction.name}:`];
      case "function":
        return [`${instruction.name}(${instruction.parameters.map(location).join(", ")}):`];
      case "call": {
        const args = instruction.args.map((arg, index) => `ARG ${index}, ${location(arg)}`);
        const target = location(instruction.target);
        const result = target.startsWith("[spill:") ? "R_TMP2" : target;
        return [
          ...args,
          `CALL ${instruction.name}, ${instruction.args.length} -> ${result}`,
          ...store(instruction.target, result),
        ];
      }
      case "return": {
        const value = load(instruction.value, "R_TMP0");
        return [...value.lines, `RET ${value.value}`];
      }
      case "halt":
        return ["HALT"];
      case "const": {
        const target = location(instruction.target);
        const destination = target.startsWith("[spill:") ? "R_TMP0" : target;
        return [
          `MOV ${destination}, ${JSON.stringify(instruction.value)}`,
          ...store(instruction.target, destination),
        ];
      }
      case "copy": {
        const source = load(instruction.source, "R_TMP0");
        const target = location(instruction.target);
        if (target.startsWith("[spill:")) {
          if (source.value.startsWith("R_TMP"))
            return [...source.lines, `STORE ${target}, ${source.value}`];
          return [`STORE ${target}, ${source.value}`];
        }
        return [...source.lines, `MOV ${target}, ${source.value}`];
      }
      case "unary": {
        const operand = load(instruction.operand, "R_TMP0");
        const target = location(instruction.target);
        const destination = target.startsWith("[spill:") ? "R_TMP1" : target;
        return [
          ...operand.lines,
          `${instruction.operator === "not" ? "NOT" : "NEG"} ${destination}, ${operand.value}`,
          ...store(instruction.target, destination),
        ];
      }
      case "binary": {
        const left = load(instruction.left, "R_TMP0");
        const right = load(instruction.right, "R_TMP1");
        const target = location(instruction.target);
        const destination = target.startsWith("[spill:") ? "R_TMP2" : target;
        return [
          ...left.lines,
          ...right.lines,
          `${mnemonic(instruction.operator)} ${destination}, ${left.value}, ${right.value}`,
          ...store(instruction.target, destination),
        ];
      }
      case "print": {
        const value = load(instruction.value, "R_TMP0");
        return [...value.lines, `PRINT ${value.value}`];
      }
      case "ifFalse": {
        const condition = load(instruction.condition, "R_TMP0");
        return [...condition.lines, `BRZ ${condition.value}, ${instruction.target}`];
      }
      case "goto":
        return [`JMP ${instruction.target}`];
      default:
        return [];
    }
  });
  return {
    registers,
    spills,
    assembly,
    interference: [...graph].flatMap(([left, neighbors]) =>
      [...neighbors]
        .filter((right) => left < right)
        .map((right) => [left, right] as [string, string]),
    ),
  };
}

export function renderTac(code: TacInstruction[]): string[] {
  return formatTac(code);
}

function defs(instruction: TacInstruction): string[] {
  if (instruction.op === "function") return instruction.parameters;
  return ["const", "copy", "unary", "binary", "call"].includes(instruction.op)
    ? [(instruction as { target: string }).target]
    : [];
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

function degree(value: string, graph: Map<string, Set<string>>, remaining: Set<string>): number {
  return [...(graph.get(value) ?? [])].filter((neighbor) => remaining.has(neighbor)).length;
}

function equal(left: Set<string>, right: Set<string>): boolean {
  return left.size === right.size && [...left].every((item) => right.has(item));
}

function isIndex(value: number | undefined): value is number {
  return value !== undefined && value >= 0;
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
