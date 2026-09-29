import type { Expr, Program, Span, Stmt, TypeName } from "./ast";
import { type Diagnostic, diagnostic } from "./diagnostics";

export type SymbolInfo = {
  name: string;
  type: Exclude<TypeName, "string" | "error">;
  declaredAt: Span;
};
export function analyze(program: Program): {
  symbols: SymbolInfo[];
  expressionTypes: WeakMap<Expr, TypeName>;
  diagnostics: Diagnostic[];
} {
  const symbols = new Map<string, SymbolInfo>(),
    expressionTypes = new WeakMap<Expr, TypeName>(),
    diagnostics: Diagnostic[] = [];
  const report = (code: string, message: string, span: Span) =>
    diagnostics.push(diagnostic("semantic", code, message, `Arth: ${message}`, span));
  const infer = (e: Expr): TypeName => {
    if (e.kind === "number") return e.numericKind;
    if (e.kind === "boolean") return "bool";
    if (e.kind === "string") return "string";
    if (e.kind === "variable") {
      const s = symbols.get(e.name);
      if (!s) {
        report("S001", `Undeclared variable '${e.name}'`, e.span);
        return "error";
      }
      return s.type;
    }
    if (e.kind === "unary") {
      const t = infer(e.operand);
      if (e.op === "not") {
        if (t !== "bool" && t !== "error") {
          report("S002", "'nathi' requires a boolean operand", e.span);
          return "error";
        }
        return "bool";
      }
      if (t !== "int" && t !== "float" && t !== "error") {
        report("S003", "Unary '-' requires a numeric operand", e.span);
        return "error";
      }
      return t;
    }
    const l = infer(e.left),
      r = infer(e.right);
    if (l === "error" || r === "error") return "error";
    if (["AND", "OR"].includes(e.op)) {
      if (l !== "bool" || r !== "bool") {
        report("S004", "Boolean operators require boolean operands", e.span);
        return "error";
      }
      return "bool";
    }
    if (["+", "-", "*", "/"].includes(e.op)) {
      if (!["int", "float"].includes(l) || !["int", "float"].includes(r)) {
        report("S005", `Operator '${e.op}' requires numeric operands`, e.span);
        return "error";
      }
      return e.op === "/" || l === "float" || r === "float" ? "float" : "int";
    }
    if ([">", "<", ">=", "<=", "==", "!="].includes(e.op)) {
      const equality = e.op === "==" || e.op === "!=";
      const valid = equality
        ? l === r
        : ["int", "float"].includes(l) && ["int", "float"].includes(r);
      if (!valid) {
        report("S006", `Incompatible operand types for '${e.op}'`, e.span);
        return "error";
      }
      return "bool";
    }
    return "error";
  };
  const statements = (items: Stmt[]) => {
    for (const s of items) {
      if (s.kind === "declare") {
        const t = infer(s.initializer);
        if (symbols.has(s.name)) report("S007", `Variable '${s.name}' is already declared`, s.span);
        else if (t !== "error" && t !== "string")
          symbols.set(s.name, { name: s.name, type: t, declaredAt: s.span });
        else if (t === "string")
          report("S008", "String literals can only be printed directly", s.span);
      } else if (s.kind === "assign") {
        const valueType = infer(s.value),
          target = symbols.get(s.name);
        if (!target) report("S001", `Undeclared variable '${s.name}'`, s.span);
        else if (valueType !== "error" && valueType !== target.type)
          report(
            "S009",
            `Cannot assign ${valueType} to ${target.type} variable '${s.name}'`,
            s.span,
          );
      } else if (s.kind === "print") {
        const t = infer(s.value);
        if (t === "error") continue;
      } else {
        const t = infer(s.condition);
        if (t !== "bool" && t !== "error")
          report("S010", "Condition must have type bool", s.condition.span);
        if (s.kind === "if") {
          statements(s.thenBlock);
          if (s.elseBlock) statements(s.elseBlock);
        } else statements(s.body);
      }
    }
  };
  statements(program.statements);
  // Cache inferred types without emitting the same diagnostics a second time.
  const cache = (e: Expr): TypeName => {
    if (e.kind === "unary") {
      const a = cache(e.operand);
      const t = e.op === "not" ? "bool" : a;
      expressionTypes.set(e, t);
      return t;
    }
    if (e.kind === "binary") {
      const l = cache(e.left),
        r = cache(e.right);
      const t: TypeName = ["AND", "OR", ">", "<", ">=", "<=", "==", "!="].includes(e.op)
        ? "bool"
        : e.op === "/" || l === "float" || r === "float"
          ? "float"
          : l;
      expressionTypes.set(e, t);
      return t;
    }
    const t: TypeName =
      e.kind === "number"
        ? e.numericKind
        : e.kind === "boolean"
          ? "bool"
          : e.kind === "string"
            ? "string"
            : (symbols.get(e.name)?.type ?? "error");
    expressionTypes.set(e, t);
    return t;
  };
  const visit = (items: Stmt[]) => {
    for (const s of items) {
      if (s.kind === "declare") cache(s.initializer);
      else if (s.kind === "assign" || s.kind === "print")
        cache(s.kind === "assign" ? s.value : s.value);
      else if (s.kind === "if") {
        cache(s.condition);
        visit(s.thenBlock);
        if (s.elseBlock) visit(s.elseBlock);
      } else {
        cache(s.condition);
        visit(s.body);
      }
    }
  };
  visit(program.statements);
  return { symbols: [...symbols.values()], expressionTypes, diagnostics };
}
