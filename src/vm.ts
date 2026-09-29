import type { Span } from "./ast";
import { type Diagnostic, diagnostic } from "./diagnostics";
import type { Instruction } from "./ir";

export type RuntimeResult = {
  output: string[];
  steps: number;
  diagnostics: Diagnostic[];
  variables: Record<string, number | boolean | string>;
  trace: TraceFrame[];
};
export type TraceFrame = {
  pc: number;
  nextPc: number;
  instruction: Instruction;
  stack: (number | boolean | string)[];
  variables: Record<string, number | boolean | string>;
  output: string[];
};
const runtimeSpan: Span = { start: 0, end: 0, line: 1, column: 1, endLine: 1, endColumn: 1 };
export function run(
  code: Instruction[],
  options: { instructionLimit?: number; captureTrace?: boolean; traceLimit?: number } = {},
): RuntimeResult {
  const stack: (number | boolean | string)[] = [],
    variables: Record<string, number | boolean | string> = {},
    output: string[] = [],
    diagnostics: Diagnostic[] = [],
    trace: TraceFrame[] = [];
  const instructionLimit = options.instructionLimit ?? 100_000;
  const traceLimit = options.traceLimit ?? 10_000;
  let pc = 0,
    steps = 0;
  const fail = (message: string, gujlangMessage: string) => {
    diagnostics.push(diagnostic("runtime", "R001", message, gujlangMessage, runtimeSpan));
  };
  while (pc >= 0 && pc < code.length) {
    if (++steps > instructionLimit) {
      fail("Instruction limit exceeded; possible infinite loop", "Anant loop ni shanka");
      break;
    }
    const instructionPc = pc;
    const ins = code[pc++];
    try {
      if (ins.op === "CONST") stack.push(ins.value);
      else if (ins.op === "LOAD") {
        if (!(ins.name in variables)) throw new Error(`Undefined variable '${ins.name}'`);
        stack.push(variables[ins.name]);
      } else if (ins.op === "STORE") {
        const v = stack.pop();
        if (v === undefined) throw new Error("Stack underflow");
        variables[ins.name] = v;
      } else if (ins.op === "UNARY") {
        const a = stack.pop();
        if (a === undefined) throw new Error("Stack underflow");
        stack.push(ins.operator === "-" ? -(a as number) : !a);
      } else if (ins.op === "BINARY") {
        const b = stack.pop(),
          a = stack.pop();
        if (a === undefined || b === undefined) throw new Error("Stack underflow");
        let v: number | boolean;
        switch (ins.operator) {
          case "+":
            v = (a as number) + (b as number);
            break;
          case "-":
            v = (a as number) - (b as number);
            break;
          case "*":
            v = (a as number) * (b as number);
            break;
          case "/":
            if (b === 0) throw new Error("Division by zero");
            v = (a as number) / (b as number);
            break;
          case "AND":
            v = Boolean(a) && Boolean(b);
            break;
          case "OR":
            v = Boolean(a) || Boolean(b);
            break;
          case ">":
            v = (a as number) > (b as number);
            break;
          case "<":
            v = (a as number) < (b as number);
            break;
          case ">=":
            v = (a as number) >= (b as number);
            break;
          case "<=":
            v = (a as number) <= (b as number);
            break;
          case "==":
            v = a === b;
            break;
          case "!=":
            v = a !== b;
            break;
          default:
            throw new Error(`Unsupported operator ${ins.operator}`);
        }
        stack.push(v);
      } else if (ins.op === "PRINT") {
        const v = stack.pop();
        if (v === undefined) throw new Error("Stack underflow");
        output.push(String(v));
      } else if (ins.op === "JUMP") pc = ins.target;
      else if (ins.op === "JUMP_IF_FALSE") {
        const v = stack.pop();
        if (!v) pc = ins.target;
      } else if (ins.op === "HALT") {
        recordTrace();
        break;
      }
      recordTrace();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      fail(
        message,
        message === "Division by zero" ? "Shunya thi bhagakar" : `Runtime bhul: ${message}`,
      );
      recordTrace();
      break;
    }

    function recordTrace() {
      if (options.captureTrace && trace.length < traceLimit)
        trace.push({
          pc: instructionPc,
          nextPc: pc,
          instruction: ins,
          stack: [...stack],
          variables: { ...variables },
          output: [...output],
        });
    }
  }
  return { output, steps, diagnostics, variables, trace };
}
