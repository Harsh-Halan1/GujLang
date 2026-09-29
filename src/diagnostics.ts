import type { Span } from "./ast";

export type Phase = "lexer" | "parser" | "semantic" | "runtime";
export type Diagnostic = {
  phase: Phase;
  code: string;
  message: string;
  gujlangMessage: string;
  span: Span;
  recovery?: { line: number; column: number; lexeme: string };
};
export const diagnostic = (
  phase: Phase,
  code: string,
  message: string,
  gujlangMessage: string,
  span: Span,
): Diagnostic => ({ phase, code, message, gujlangMessage, span });

export class CompileFailure extends Error {
  constructor(public readonly diagnostics: Diagnostic[]) {
    super(
      diagnostics
        .map(
          (d) =>
            `${d.phase} ${d.code}: ${d.message} (${d.gujlangMessage}) at ${d.span.line}:${d.span.column}`,
        )
        .join("\n"),
    );
    this.name = "CompileFailure";
  }
}
