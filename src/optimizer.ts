import type { TacInstruction } from "./ir";

export type OptimizationName = "constantFolding" | "deadCodeElimination";
export type OptimizationResult = { code: TacInstruction[]; annotations: string[] };

export function optimize(
  input: TacInstruction[],
  enabled: Partial<Record<OptimizationName, boolean>> = {},
): OptimizationResult {
  let code = input.map((instruction) => ({ ...instruction })) as TacInstruction[];
  const annotations: string[] = [];
  if (enabled.constantFolding) {
    const constants = new Map<string, number | boolean | string>();
    const folded: TacInstruction[] = [];
    for (const instruction of code) {
      if (instruction.op === "label" || instruction.op === "goto" || instruction.op === "ifFalse")
        constants.clear();
      if (instruction.op === "const") constants.set(instruction.target, instruction.value);
      else if (instruction.op === "copy") {
        const known = constants.get(instruction.source);
        if (known !== undefined) constants.set(instruction.target, known);
        else constants.delete(instruction.target);
      } else if (instruction.op === "unary") {
        const value = constants.get(instruction.operand);
        if (
          value !== undefined &&
          (instruction.operator === "-" ? typeof value === "number" : typeof value === "boolean")
        ) {
          const result = instruction.operator === "-" ? -(value as number) : !(value as boolean);
          folded.push({ op: "const", target: instruction.target, value: result });
          constants.set(instruction.target, result);
          annotations.push(`${instruction.target}: constant-folded unary ${instruction.operator}`);
          continue;
        }
        constants.delete(instruction.target);
      } else if (instruction.op === "binary") {
        const left = constants.get(instruction.left),
          right = constants.get(instruction.right);
        if (left !== undefined && right !== undefined) {
          const result = evaluate(instruction.operator, left, right);
          if (result !== undefined) {
            folded.push({ op: "const", target: instruction.target, value: result });
            constants.set(instruction.target, result);
            annotations.push(
              `${instruction.target}: constant-folded ${instruction.left} ${instruction.operator} ${instruction.right}`,
            );
            continue;
          }
        }
        constants.delete(instruction.target);
      }
      folded.push(instruction);
    }
    code = folded;
  }
  if (enabled.deadCodeElimination) {
    let removed = true;
    while (removed) {
      const labels = new Map(
        code.flatMap((instruction, index) =>
          instruction.op === "label" ? [[instruction.name, index] as const] : [],
        ),
      );
      const liveIn: Set<string>[] = code.map(() => new Set());
      const liveOut: Set<string>[] = code.map(() => new Set());
      let changed = true;
      while (changed) {
        changed = false;
        for (let i = code.length - 1; i >= 0; i--) {
          const instruction = code[i];
          const successors =
            instruction.op === "goto"
              ? [labels.get(instruction.target)].filter((n): n is number => n !== undefined)
              : instruction.op === "ifFalse"
                ? [i + 1, labels.get(instruction.target)].filter(
                    (n): n is number => n !== undefined,
                  )
                : i + 1 < code.length
                  ? [i + 1]
                  : [];
          const next = new Set(successors.flatMap((index) => [...liveIn[index]]));
          const definition = defines(instruction),
            uses = used(instruction);
          if (!same(liveOut[i], next)) {
            liveOut[i] = new Set(next);
            changed = true;
          }
          if (definition) next.delete(definition);
          for (const use of uses) next.add(use);
          if (!same(liveIn[i], next)) {
            liveIn[i] = next;
            changed = true;
          }
        }
      }
      const previousLength = code.length;
      code = code.filter((instruction, index) => {
        const definition = defines(instruction);
        if (
          definition &&
          !liveOut[index].has(definition) &&
          ["const", "copy", "unary", "binary"].includes(instruction.op)
        ) {
          annotations.push(`${definition}: removed unused definition`);
          return false;
        }
        return true;
      });
      removed = code.length < previousLength;
    }
  }
  return { code, annotations };
}

function evaluate(
  op: string,
  a: number | boolean | string,
  b: number | boolean | string,
): number | boolean | undefined {
  switch (op) {
    case "+":
      return (a as number) + (b as number);
    case "-":
      return (a as number) - (b as number);
    case "*":
      return (a as number) * (b as number);
    case "/":
      return b === 0 ? undefined : (a as number) / (b as number);
    case "AND":
      return Boolean(a) && Boolean(b);
    case "OR":
      return Boolean(a) || Boolean(b);
    case ">":
      return (a as number) > (b as number);
    case "<":
      return (a as number) < (b as number);
    case ">=":
      return (a as number) >= (b as number);
    case "<=":
      return (a as number) <= (b as number);
    case "==":
      return a === b;
    case "!=":
      return a !== b;
    default:
      return undefined;
  }
}
function defines(ins: TacInstruction): string | undefined {
  return ["const", "copy", "unary", "binary"].includes(ins.op)
    ? (ins as { target: string }).target
    : undefined;
}
function used(ins: TacInstruction): string[] {
  if (ins.op === "copy") return [ins.source];
  if (ins.op === "unary") return [ins.operand];
  if (ins.op === "binary") return [ins.left, ins.right];
  if (ins.op === "print") return [ins.value];
  if (ins.op === "ifFalse") return [ins.condition];
  return [];
}
function same(a: Set<string>, b: Set<string>): boolean {
  return a.size === b.size && [...a].every((value) => b.has(value));
}
