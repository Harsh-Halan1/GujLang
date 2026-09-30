import type { Expr, FunctionDecl, Module, Span, Stmt, TypeName } from "./ast";
import { type Diagnostic, diagnostic } from "./diagnostics";

export type ValueType = Exclude<TypeName, "string" | "error">;
export type SymbolInfo = {
  name: string;
  type: ValueType;
  declaredAt: Span;
  scope: "global" | string;
  role: "global" | "parameter" | "local";
};

export function analyze(module: Module): {
  symbols: SymbolInfo[];
  expressionTypes: WeakMap<Expr, TypeName>;
  diagnostics: Diagnostic[];
} {
  const symbols: SymbolInfo[] = [];
  const expressionTypes = new WeakMap<Expr, TypeName>();
  const diagnostics: Diagnostic[] = [];
  const signatures = new Map<string, FunctionDecl>();
  const report = (code: string, message: string, span: Span) =>
    diagnostics.push(diagnostic("semantic", code, message, `Arth: ${message}`, span));

  for (const fn of module.functions) {
    if (signatures.has(fn.name))
      report("S011", `Function '${fn.name}' is already declared`, fn.span);
    else signatures.set(fn.name, fn);
  }

  const infer = (e: Expr, env: Map<string, ValueType>, scope: string): TypeName => {
    let type: TypeName;
    if (e.kind === "number") type = e.numericKind;
    else if (e.kind === "boolean") type = "bool";
    else if (e.kind === "string") type = "string";
    else if (e.kind === "variable") {
      const value = env.get(e.name);
      if (!value) {
        report("S001", `Undeclared variable '${e.name}' in ${scope}`, e.span);
        type = "error";
      } else type = value;
    } else if (e.kind === "call") {
      const fn = signatures.get(e.name);
      if (!fn) {
        report("S012", `Unknown function '${e.name}'`, e.span);
        for (const arg of e.arguments) infer(arg, env, scope);
        type = "error";
      } else {
        if (fn.parameters.length !== e.arguments.length)
          report(
            "S013",
            `Function '${e.name}' expects ${fn.parameters.length} argument(s), received ${e.arguments.length}`,
            e.span,
          );
        e.arguments.forEach((arg, index) => {
          const actual = infer(arg, env, scope);
          const expected = fn.parameters[index]?.type;
          if (expected && actual !== "error" && actual !== expected)
            report(
              "S014",
              `Argument ${index + 1} of '${e.name}' expects ${expected}, received ${actual}`,
              arg.span,
            );
        });
        type = fn.returnType;
      }
    } else if (e.kind === "unary") {
      const operand = infer(e.operand, env, scope);
      if (operand === "error") type = "error";
      else if (e.op === "not") {
        if (operand !== "bool") {
          report("S002", "'nathi' requires a boolean operand", e.span);
          type = "error";
        } else type = "bool";
      } else if (operand !== "int" && operand !== "float") {
        report("S003", "Unary '-' requires a numeric operand", e.span);
        type = "error";
      } else type = operand;
    } else {
      const left = infer(e.left, env, scope);
      const right = infer(e.right, env, scope);
      if (left === "error" || right === "error") type = "error";
      else if (["AND", "OR"].includes(e.op)) {
        if (left !== "bool" || right !== "bool") {
          report("S004", "Boolean operators require boolean operands", e.span);
          type = "error";
        } else type = "bool";
      } else if (["+", "-", "*", "/"].includes(e.op)) {
        if (!["int", "float"].includes(left) || !["int", "float"].includes(right)) {
          report("S005", `Operator '${e.op}' requires numeric operands`, e.span);
          type = "error";
        } else type = e.op === "/" || left === "float" || right === "float" ? "float" : "int";
      } else {
        const equality = e.op === "==" || e.op === "!=";
        const valid = equality
          ? left === right
          : ["int", "float"].includes(left) && ["int", "float"].includes(right);
        if (!valid) {
          report("S006", `Incompatible operand types for '${e.op}'`, e.span);
          type = "error";
        } else type = "bool";
      }
    }
    expressionTypes.set(e, type);
    return type;
  };

  const alwaysReturns = (items: Stmt[]): boolean => {
    for (const stmt of items) {
      if (stmt.kind === "return") return true;
      if (
        stmt.kind === "if" &&
        stmt.elseBlock &&
        alwaysReturns(stmt.thenBlock) &&
        alwaysReturns(stmt.elseBlock)
      )
        return true;
    }
    return false;
  };

  const checkStatements = (
    items: Stmt[],
    env: Map<string, ValueType>,
    scope: string,
    returnType?: ValueType,
  ) => {
    for (const stmt of items) {
      if (stmt.kind === "declare") {
        const valueType = infer(stmt.initializer, env, scope);
        if (env.has(stmt.name))
          report("S007", `Variable '${stmt.name}' is already declared in ${scope}`, stmt.span);
        else if (valueType === "string")
          report("S008", "String literals can only be printed directly", stmt.span);
        else if (valueType !== "error") {
          env.set(stmt.name, valueType);
          symbols.push({
            name: stmt.name,
            type: valueType,
            declaredAt: stmt.span,
            scope,
            role: scope === "global" ? "global" : "local",
          });
        }
      } else if (stmt.kind === "assign") {
        const valueType = infer(stmt.value, env, scope);
        const target = env.get(stmt.name);
        if (!target) report("S001", `Undeclared variable '${stmt.name}' in ${scope}`, stmt.span);
        else if (valueType !== "error" && valueType !== target)
          report(
            "S009",
            `Cannot assign ${valueType} to ${target} variable '${stmt.name}'`,
            stmt.span,
          );
      } else if (stmt.kind === "print") {
        infer(stmt.value, env, scope);
      } else if (stmt.kind === "return") {
        const actual = infer(stmt.value, env, scope);
        if (!returnType)
          report("S015", "Return statements are only valid inside a function", stmt.span);
        else if (actual === "string") report("S016", "Functions cannot return strings", stmt.span);
        else if (actual !== "error" && actual !== returnType)
          report(
            "S017",
            `Return value must have type ${returnType}, received ${actual}`,
            stmt.span,
          );
      } else {
        const condition = infer(stmt.condition, env, scope);
        if (condition !== "bool" && condition !== "error")
          report("S010", "Condition must have type bool", stmt.condition.span);
        checkStatements(stmt.kind === "if" ? stmt.thenBlock : stmt.body, env, scope, returnType);
        if (stmt.kind === "if" && stmt.elseBlock)
          checkStatements(stmt.elseBlock, env, scope, returnType);
      }
    }
  };

  const globals = new Map<string, ValueType>();
  checkStatements(module.program.statements, globals, "global");
  for (const fn of module.functions) {
    const env = new Map<string, ValueType>();
    for (const parameter of fn.parameters) {
      if (env.has(parameter.name))
        report("S018", `Parameter '${parameter.name}' is repeated`, parameter.span);
      else {
        env.set(parameter.name, parameter.type);
        symbols.push({
          name: parameter.name,
          type: parameter.type,
          declaredAt: parameter.span,
          scope: fn.name,
          role: "parameter",
        });
      }
    }
    checkStatements(fn.body, env, fn.name, fn.returnType);
    if (!alwaysReturns(fn.body))
      report("S019", `Function '${fn.name}' must return ${fn.returnType} on every path`, fn.span);
  }
  return { symbols, expressionTypes, diagnostics };
}
