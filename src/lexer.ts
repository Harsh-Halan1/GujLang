import type { Span } from "./ast";
import { type Diagnostic, diagnostic } from "./diagnostics";

export type TokenKind =
  | "number"
  | "string"
  | "identifier"
  | "keyword"
  | "operator"
  | "punctuation"
  | "eof";
export type Token = {
  kind: TokenKind;
  type: string;
  lexeme: string;
  value?: string | number | boolean;
  span: Span;
};

const aliases = new Map<string, string>([
  ["rakh", "DECLARE"],
  ["let", "DECLARE"],
  ["var", "DECLARE"],
  ["jo", "IF"],
  ["if", "IF"],
  ["to", "THEN"],
  ["then", "THEN"],
  ["else", "ELSE"],
  ["kaam", "FUNCTION"],
  ["function", "FUNCTION"],
  ["return", "RETURN"],
  ["int", "TYPE_INT"],
  ["float", "TYPE_FLOAT"],
  ["bool", "TYPE_BOOL"],
  ["jyare", "WHILE"],
  ["while", "WHILE"],
  ["kar", "DO"],
  ["do", "DO"],
  ["bas", "END"],
  ["end", "END"],
  ["bolo", "PRINT"],
  ["print", "PRINT"],
  ["sacu", "TRUE"],
  ["true", "TRUE"],
  ["khotu", "FALSE"],
  ["false", "FALSE"],
  ["ane", "AND"],
  ["and", "AND"],
  ["athva", "OR"],
  ["or", "OR"],
  ["nathi", "NOT"],
  ["not", "NOT"],
  ["rokay", "BREAK"],
  ["break", "BREAK"],
  ["aagad", "CONTINUE"],
  ["continue", "CONTINUE"],
]);

export function lex(source: string): { tokens: Token[]; diagnostics: Diagnostic[] } {
  const tokens: Token[] = [],
    diagnostics: Diagnostic[] = [];
  let i = 0,
    line = 1,
    column = 1;
  const point = () => ({ offset: i, line, column });
  const advance = () => {
    const ch = source[i++];
    if (ch === "\n") {
      line++;
      column = 1;
    } else column++;
    return ch;
  };
  const emit = (
    kind: TokenKind,
    type: string,
    start: ReturnType<typeof point>,
    value?: Token["value"],
  ) => {
    tokens.push({
      kind,
      type,
      lexeme: source.slice(start.offset, i),
      value,
      span: {
        start: start.offset,
        end: i,
        line: start.line,
        column: start.column,
        endLine: line,
        endColumn: column,
      },
    });
  };
  while (i < source.length) {
    if (/\s/.test(source[i])) {
      advance();
      continue;
    }
    if (source[i] === "#" || (source[i] === "/" && source[i + 1] === "/")) {
      while (i < source.length && source[i] !== "\n") advance();
      continue;
    }
    const start = point(),
      ch = source[i];
    if (/[A-Za-z_]/.test(ch)) {
      while (/[A-Za-z0-9_]/.test(source[i] ?? "")) advance();
      const word = source.slice(start.offset, i),
        lower = word.toLowerCase();
      if (lower === "pachu" && /^\s+aap\b/i.test(source.slice(i))) {
        const phrase = /^\s+aap\b/i.exec(source.slice(i))?.[0];
        if (phrase) {
          for (let n = 0; n < phrase.length; n++) advance();
          emit("keyword", "RETURN", start);
          continue;
        }
      }
      if (lower === "nahi" && /^\s+to\b/i.test(source.slice(i))) {
        const gap = /^\s+to\b/i.exec(source.slice(i))?.[0];
        if (!gap) continue;
        for (let n = 0; n < gap.length; n++) advance();
        emit("keyword", "ELSE", start);
        continue;
      }
      const type = aliases.get(lower);
      if (type) {
        const tokenType = type.startsWith("TYPE_") ? "IDENT" : type;
        emit(
          type === "AND" || type === "OR" || type === "NOT" ? "operator" : "keyword",
          tokenType,
          start,
          tokenType === "IDENT" ? word : undefined,
        );
      } else emit("identifier", "IDENT", start, word);
      continue;
    }
    if (/\d/.test(ch) || (ch === "." && /\d/.test(source[i + 1] ?? ""))) {
      while (/\d/.test(source[i] ?? "")) advance();
      if (source[i] === ".") {
        advance();
        while (/\d/.test(source[i] ?? "")) advance();
      }
      const lexeme = source.slice(start.offset, i),
        value = Number(lexeme);
      if (!Number.isFinite(value))
        diagnostics.push(
          diagnostic("lexer", "L002", "Invalid numeric literal", "Nambar barabar nathi", {
            start: start.offset,
            end: i,
            line: start.line,
            column: start.column,
            endLine: line,
            endColumn: column,
          }),
        );
      else emit("number", lexeme.includes(".") ? "FLOAT" : "INT", start, value);
      continue;
    }
    if (ch === '"' || ch === "'") {
      const quote = advance();
      let value = "",
        closed = false;
      while (i < source.length) {
        const c = advance();
        if (c === quote) {
          closed = true;
          break;
        }
        if (c === "\\" && i < source.length) {
          const e = advance();
          value += e === "n" ? "\n" : e === "t" ? "\t" : e;
        } else value += c;
      }
      if (!closed)
        diagnostics.push(
          diagnostic("lexer", "L001", "Unterminated string literal", "String puro nathi", {
            start: start.offset,
            end: i,
            line: start.line,
            column: start.column,
            endLine: line,
            endColumn: column,
          }),
        );
      else emit("string", "STRING", start, value);
      continue;
    }
    const two = source.slice(i, i + 2);
    if ([">=", "<=", "==", "!=", "->"].includes(two)) {
      advance();
      advance();
      emit(two === "->" ? "punctuation" : "operator", two === "->" ? "ARROW" : two, start);
      continue;
    }
    if ("+-*/><".includes(ch)) {
      advance();
      emit("operator", ch, start);
      continue;
    }
    if ("=():,".includes(ch)) {
      advance();
      emit("punctuation", ch === "=" ? "=" : ch, start);
      continue;
    }
    advance();
    diagnostics.push(
      diagnostic("lexer", "L000", `Unexpected character '${ch}'`, `Ajani akshar '${ch}'`, {
        start: start.offset,
        end: i,
        line: start.line,
        column: start.column,
        endLine: line,
        endColumn: column,
      }),
    );
  }
  const eof: Span = { start: i, end: i, line, column, endLine: line, endColumn: column };
  tokens.push({ kind: "eof", type: "EOF", lexeme: "", span: eof });
  return { tokens, diagnostics };
}
