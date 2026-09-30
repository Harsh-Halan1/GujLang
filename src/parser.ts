import type { Expr, FunctionDecl, Module, Program, Span, Stmt, TypeName } from "./ast";
import { type Diagnostic, diagnostic } from "./diagnostics";
import type { Token } from "./lexer";

class ParseIssue extends Error {
  constructor(
    message: string,
    public token: Token,
  ) {
    super(message);
  }
}
const join = (a: Span, b: Span): Span => ({
  start: a.start,
  end: b.end,
  line: a.line,
  column: a.column,
  endLine: b.endLine,
  endColumn: b.endColumn,
});

export function parse(tokens: Token[]): {
  module: Module;
  program: Program;
  diagnostics: Diagnostic[];
} {
  let current = 0;
  const diagnostics: Diagnostic[] = [];
  const peek = () => tokens[current] ?? tokens[tokens.length - 1];
  const previous = () => tokens[Math.max(0, current - 1)];
  const at = (...types: string[]) => types.includes(peek().type);
  const take = () => tokens[current++];
  const match = (...types: string[]) => {
    if (at(...types)) {
      take();
      return true;
    }
    return false;
  };
  const need = (type: string, hint: string): Token => {
    if (at(type)) return take();
    throw new ParseIssue(`Expected ${hint}`, peek());
  };
  const statementStart = () =>
    at("DECLARE", "IF", "WHILE", "PRINT", "RETURN", "FUNCTION") ||
    (at("IDENT") && tokens[current + 1]?.type === "=");

  function typeName(): Exclude<TypeName, "string" | "error"> {
    const token = need("IDENT", "a type name (int, float, or bool)");
    const value = String(token.value ?? token.lexeme).toLowerCase();
    if (value === "int" || value === "float" || value === "bool") return value;
    throw new ParseIssue(`Unknown type '${value}'`, token);
  }

  function functionDeclaration(): FunctionDecl {
    const start = need("FUNCTION", "'kaam'/'function'");
    const name = need("IDENT", "a function name");
    need("(", "'('");
    const parameters: FunctionDecl["parameters"] = [];
    if (!at(")")) {
      do {
        const parameter = need("IDENT", "a parameter name");
        need(":", "':' after a parameter name");
        const type = typeName();
        parameters.push({
          name: String(parameter.value),
          type,
          span: join(parameter.span, previous().span),
        });
      } while (match(","));
    }
    need(")", "')'");
    need("ARROW", "'->' before the return type");
    const returnType = typeName();
    need("DO", "'kar'/'do' before the function body");
    const body = block();
    return {
      kind: "function",
      name: String(name.value),
      parameters,
      returnType,
      body,
      span: join(start.span, previous().span),
    };
  }

  function statement(): Stmt {
    const start = peek();
    if (match("DECLARE")) {
      const id = need("IDENT", "a variable name");
      need("=", "'='");
      const initializer = expression();
      return {
        kind: "declare",
        name: String(id.value),
        initializer,
        span: join(start.span, initializer.span),
      };
    }
    if (match("IDENT")) {
      const id = previous();
      need("=", "'='");
      const value = expression();
      return { kind: "assign", name: String(id.value), value, span: join(start.span, value.span) };
    }
    if (match("PRINT")) {
      const value = at("STRING")
        ? (() => {
            const t = take();
            return { kind: "string", value: String(t.value), span: t.span } as Expr;
          })()
        : expression();
      return { kind: "print", value, span: join(start.span, value.span) };
    }
    if (match("RETURN")) {
      const value = expression();
      return { kind: "return", value, span: join(start.span, value.span) };
    }
    if (match("IF")) {
      const condition = expression();
      need("THEN", "'to'/'then'");
      need("DO", "'kar'/'do'");
      const thenBlock = block();
      let elseBlock: Stmt[] | undefined;
      if (match("ELSE")) {
        need("DO", "'kar' after else");
        elseBlock = block();
      }
      return {
        kind: "if",
        condition,
        thenBlock,
        elseBlock,
        span: join(start.span, previous().span),
      };
    }
    if (match("WHILE")) {
      const condition = expression();
      need("DO", "'kar'");
      const body = block();
      return { kind: "while", condition, body, span: join(start.span, previous().span) };
    }
    if (match("UNSUPPORTED"))
      throw new ParseIssue(`'${start.lexeme}' is reserved but not supported in v2`, start);
    throw new ParseIssue(`Unexpected token '${peek().lexeme || "end of input"}'`, peek());
  }
  function block(): Stmt[] {
    const body: Stmt[] = [];
    while (!at("END", "EOF")) {
      const before = current;
      try {
        body.push(statement());
      } catch (error) {
        recover(error);
      }
      if (current === before && !at("EOF")) take();
    }
    need("END", "'bas'/'end' to close this block");
    return body;
  }
  function recover(error: unknown) {
    const issue = error instanceof ParseIssue ? error : new ParseIssue("Invalid statement", peek());
    const entry = diagnostic(
      "parser",
      "P001",
      issue.message,
      `Vaky rachana: ${issue.message}`,
      issue.token.span,
    );
    diagnostics.push(entry);
    if (!at("EOF", "END") && !statementStart())
      while (!at("EOF", "END") && !statementStart()) take();
    entry.recovery = {
      line: peek().span.line,
      column: peek().span.column,
      lexeme: peek().lexeme || "EOF",
    };
  }
  function primary(): Expr {
    const t = take();
    if (t.type === "INT" || t.type === "FLOAT")
      return {
        kind: "number",
        value: Number(t.value),
        numericKind: t.type === "INT" ? "int" : "float",
        span: t.span,
      };
    if (t.type === "TRUE" || t.type === "FALSE")
      return { kind: "boolean", value: t.type === "TRUE", span: t.span };
    if (t.type === "IDENT") {
      const name = String(t.value);
      if (match("(")) {
        const args: Expr[] = [];
        if (!at(")")) {
          do args.push(expression());
          while (match(","));
        }
        const close = need(")", "')' after function arguments");
        return { kind: "call", name, arguments: args, span: join(t.span, close.span) };
      }
      return { kind: "variable", name, span: t.span };
    }
    if (t.type === "(") {
      const e = expression();
      need(")", "')'");
      return { ...e, span: join(t.span, previous().span) };
    }
    throw new ParseIssue(`Expected an expression, found '${t.lexeme || "end of input"}'`, t);
  }
  function unary(): Expr {
    if (match("-", "NOT", "NOT_SYMBOL")) {
      const op = previous(),
        operand = unary();
      return {
        kind: "unary",
        op: op.type === "-" ? "-" : "not",
        operand,
        span: join(op.span, operand.span),
      };
    }
    return primary();
  }
  function chain(next: () => Expr, ops: string[]): Expr {
    let left = next();
    while (match(...ops)) {
      const op = previous(),
        right = next();
      left = { kind: "binary", op: op.type, left, right, span: join(left.span, right.span) };
    }
    return left;
  }
  function mul(): Expr {
    return chain(unary, ["*", "/"]);
  }
  function add(): Expr {
    return chain(mul, ["+", "-"]);
  }
  function comparison(): Expr {
    const left = add();
    if (match(">", "<", ">=", "<=", "==", "!=")) {
      const op = previous(),
        right = add();
      if (at(">", "<", ">=", "<=", "==", "!="))
        throw new ParseIssue("Chained comparisons are not allowed", peek());
      return { kind: "binary", op: op.type, left, right, span: join(left.span, right.span) };
    }
    return left;
  }
  function notExpr(): Expr {
    if (match("NOT", "NOT_SYMBOL")) {
      const op = previous(),
        operand = notExpr();
      return { kind: "unary", op: "not", operand, span: join(op.span, operand.span) };
    }
    return comparison();
  }
  function andExpr(): Expr {
    return chain(notExpr, ["AND"]);
  }
  function expression(): Expr {
    return chain(andExpr, ["OR"]);
  }

  const statements: Stmt[] = [];
  const functions: FunctionDecl[] = [];
  while (!at("EOF")) {
    const before = current;
    try {
      if (at("FUNCTION")) functions.push(functionDeclaration());
      else statements.push(statement());
    } catch (error) {
      recover(error);
    }
    if (current === before && !at("EOF")) take();
  }
  const eof = peek().span;
  const program: Program = {
    kind: "program",
    statements,
    span: {
      start: 0,
      end: eof.end,
      line: 1,
      column: 1,
      endLine: eof.endLine,
      endColumn: eof.endColumn,
    },
  };
  return { module: { kind: "module", functions, program }, program, diagnostics };
}
