import type { Program, TypeName } from "./ast";
import type { Diagnostic } from "./diagnostics";
import { formatTac, generate, generateTac, type Instruction, type TacInstruction } from "./ir";
import { lex } from "./lexer";
import { type OptimizationName, optimize } from "./optimizer";
import { parse } from "./parser";
import { allocateRegisters, type RegisterAllocation } from "./regalloc";
import { analyze, type SymbolInfo } from "./semantics";
import { type RuntimeResult, run } from "./vm";

export type CompileResult = {
  program?: Program;
  tokens: ReturnType<typeof lex>["tokens"];
  diagnostics: Diagnostic[];
  symbols: SymbolInfo[];
  expressionTypes?: WeakMap<import("./ast").Expr, TypeName>;
  bytecode?: Instruction[];
  tac?: string[];
  rawTac?: string[];
  tacInstructions?: TacInstruction[];
  optimizationAnnotations?: string[];
  registerAllocation?: RegisterAllocation;
  runtime?: RuntimeResult;
};
export function compile(
  source: string,
  options: {
    run?: boolean;
    instructionLimit?: number;
    optimizations?: Partial<Record<OptimizationName, boolean>>;
    registerCount?: number;
    captureTrace?: boolean;
  } = {},
): CompileResult {
  const lexed = lex(source),
    parsed = parse(lexed.tokens),
    diagnostics = [...lexed.diagnostics, ...parsed.diagnostics];
  if (diagnostics.length) return { tokens: lexed.tokens, diagnostics, symbols: [] };
  const checked = analyze(parsed.program);
  diagnostics.push(...checked.diagnostics);
  if (diagnostics.length)
    return {
      program: parsed.program,
      tokens: lexed.tokens,
      diagnostics,
      symbols: checked.symbols,
      expressionTypes: checked.expressionTypes,
    };
  const bytecode = generate(parsed.program);
  const rawTacInstructions = generateTac(parsed.program);
  const optimized = optimize(
    rawTacInstructions,
    options.optimizations ?? { constantFolding: true, deadCodeElimination: true },
  );
  const rawTac = formatTac(rawTacInstructions),
    tac = formatTac(optimized.code);
  const registerAllocation = allocateRegisters(optimized.code, options.registerCount);
  const runtime =
    options.run === false
      ? undefined
      : run(bytecode, {
          instructionLimit: options.instructionLimit,
          captureTrace: options.captureTrace,
        });
  return {
    program: parsed.program,
    tokens: lexed.tokens,
    diagnostics: runtime?.diagnostics ?? [],
    symbols: checked.symbols,
    expressionTypes: checked.expressionTypes,
    bytecode,
    rawTac,
    tacInstructions: optimized.code,
    optimizationAnnotations: optimized.annotations,
    registerAllocation,
    tac,
    runtime,
  };
}
