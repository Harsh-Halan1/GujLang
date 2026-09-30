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
  outputLength: number;
  functionName?: string;
  callDepth?: number;
};
const runtimeSpan: Span = { start: 0, end: 0, line: 1, column: 1, endLine: 1, endColumn: 1 };
type Value = number | boolean | string;
type Frame = { returnPc: number; variables: Record<string, Value>; functionName: string };

export function run(
  code: Instruction[],
  options: { instructionLimit?: number; captureTrace?: boolean; traceLimit?: number } = {},
): RuntimeResult {
  const stack: Value[] = [],
    mainVariables: Record<string, Value> = Object.create(null),
    output: string[] = [],
    diagnostics: Diagnostic[] = [],
    trace: TraceFrame[] = [];
  const instructionLimit = options.instructionLimit ?? 100_000;
  const traceLimit = options.traceLimit ?? 10_000;
  const functions = new Map<string, { entry: number; parameters: string[] }>();
  code.forEach((ins, index) => {
    if (ins.op === "FUNCTION")
      functions.set(ins.name, { entry: index + 1, parameters: ins.parameters });
  });
  const calls: Frame[] = [];
  let variables = mainVariables;
  let functionName: string | undefined;
  let pc = 0,
    steps = 0;
  const fail = (message: string, gujlangMessage: string) =>
    diagnostics.push(diagnostic("runtime", "R001", message, gujlangMessage, runtimeSpan));

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
        const value = stack.pop();
        if (value === undefined) throw new Error("Stack underflow");
        variables[ins.name] = value;
      } else if (ins.op === "UNARY") {
        const value = stack.pop();
        if (value === undefined) throw new Error("Stack underflow");
        stack.push(ins.operator === "-" ? -(value as number) : !value);
      } else if (ins.op === "BINARY") {
        const right = stack.pop(),
          left = stack.pop();
        if (left === undefined || right === undefined) throw new Error("Stack underflow");
        let value: Value;
        switch (ins.operator) {
          case "+":
            value = (left as number) + (right as number);
            break;
          case "-":
            value = (left as number) - (right as number);
            break;
          case "*":
            value = (left as number) * (right as number);
            break;
          case "/":
            if (right === 0) throw new Error("Division by zero");
            value = (left as number) / (right as number);
            break;
          case "AND":
            value = Boolean(left) && Boolean(right);
            break;
          case "OR":
            value = Boolean(left) || Boolean(right);
            break;
          case ">":
            value = (left as number) > (right as number);
            break;
          case "<":
            value = (left as number) < (right as number);
            break;
          case ">=":
            value = (left as number) >= (right as number);
            break;
          case "<=":
            value = (left as number) <= (right as number);
            break;
          case "==":
            value = left === right;
            break;
          case "!=":
            value = left !== right;
            break;
          default:
            throw new Error(`Unsupported operator ${ins.operator}`);
        }
        stack.push(value);
      } else if (ins.op === "PRINT") {
        const value = stack.pop();
        if (value === undefined) throw new Error("Stack underflow");
        output.push(String(value));
      } else if (ins.op === "POP") {
        if (stack.pop() === undefined) throw new Error("Stack underflow");
      } else if (ins.op === "JUMP") pc = ins.target;
      else if (ins.op === "JUMP_IF_FALSE") {
        const value = stack.pop();
        if (!value) pc = ins.target;
      } else if (ins.op === "FUNCTION") pc = code.length;
      else if (ins.op === "CALL") {
        const fn = functions.get(ins.name);
        if (!fn) throw new Error(`Unknown function '${ins.name}'`);
        if (fn.parameters.length !== ins.argumentCount)
          throw new Error(`Wrong argument count for '${ins.name}'`);
        if (calls.length >= 1024) throw new Error("Maximum function call depth exceeded");
        if (stack.length < ins.argumentCount) throw new Error("Stack underflow");
        const args = stack.splice(stack.length - ins.argumentCount, ins.argumentCount);
        calls.push({ returnPc: pc, variables, functionName: ins.name });
        variables = Object.assign(
          Object.create(null),
          Object.fromEntries(fn.parameters.map((name, index) => [name, args[index]])),
        );
        functionName = ins.name;
        pc = fn.entry;
      } else if (ins.op === "RETURN") {
        const value = stack.pop();
        if (value === undefined) throw new Error("Stack underflow");
        const caller = calls.pop();
        if (!caller) throw new Error("Return without a caller");
        variables = caller.variables;
        functionName = calls.length ? calls[calls.length - 1].functionName : undefined;
        pc = caller.returnPc;
        stack.push(value);
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
          outputLength: output.length,
          functionName,
          callDepth: calls.length,
        });
    }
  }
  return { output, steps, diagnostics, variables: mainVariables, trace };
}
