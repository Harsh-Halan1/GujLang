import type { Expr, FunctionDecl, Module, Span, Stmt, TypeName } from "./ast";
import { type Diagnostic, diagnostic } from "./diagnostics";

export type ValueType = Exclude<TypeName, "string" | "error">;
export type SymbolInfo = {
  name: string;
  type: ValueType;
  declaredAt: Span;
  scope: "global" | string;
  role: "global" | "parameter" | "local" | "function";
  parameters?: { name: string; type: ValueType }[];
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
    diagnostics.push(diagnostic("semantic", code, message, gujlangMessage(code), span));

  const containsStringLiteral = (expr: Expr): boolean => {
    if (expr.kind === "string") return true;
    if (expr.kind === "call") return expr.arguments.some(containsStringLiteral);
    if (expr.kind === "unary") return containsStringLiteral(expr.operand);
    if (expr.kind === "binary")
      return containsStringLiteral(expr.left) || containsStringLiteral(expr.right);
    return false;
  };

  for (const fn of module.functions) {
    if (signatures.has(fn.name))
      report("S011", `Function '${fn.name}' is already declared`, fn.span);
    else signatures.set(fn.name, fn);
    symbols.push({
      name: fn.name,
      type: fn.returnType,
      declaredAt: fn.span,
      scope: "functions",
      role: "function",
      parameters: fn.parameters.map(({ name, type }) => ({ name, type })),
    });
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
        if (e.op === "+" && (left === "string" || right === "string")) {
          if (
            !["int", "float", "bool", "string"].includes(left) ||
            !["int", "float", "bool", "string"].includes(right)
          ) {
            report("S005", `Operator '${e.op}' requires printable operands`, e.span);
            type = "error";
          } else type = "string";
        } else if (!["int", "float"].includes(left) || !["int", "float"].includes(right)) {
          report("S005", `Operator '${e.op}' requires numeric operands`, e.span);
          type = "error";
        } else type = e.op === "/" || left === "float" || right === "float" ? "float" : "int";
      } else {
        const equality = e.op === "==" || e.op === "!=";
        const valid = equality
          ? left === right && left !== "string"
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
    loopDepth = 0,
  ) => {
    for (const stmt of items) {
      if (
        stmt.kind !== "print" &&
        ((stmt.kind === "declare" && containsStringLiteral(stmt.initializer)) ||
          (stmt.kind === "assign" && containsStringLiteral(stmt.value)) ||
          (stmt.kind === "return" && containsStringLiteral(stmt.value)) ||
          ((stmt.kind === "if" || stmt.kind === "while") && containsStringLiteral(stmt.condition)))
      )
        report(
          "S023",
          "String literals and concatenation are only valid in print statements",
          stmt.span,
        );
      if (stmt.kind === "declare") {
        const valueType = infer(stmt.initializer, env, scope);
        if (env.has(stmt.name))
          report("S007", `Variable '${stmt.name}' is already declared in ${scope}`, stmt.span);
        else if (valueType !== "error" && valueType !== "string") {
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
      } else if (stmt.kind === "call") {
        infer(stmt.expression, env, scope);
      } else if (stmt.kind === "return") {
        const actual = infer(stmt.value, env, scope);
        if (!returnType)
          report("S015", "Return statements are only valid inside a function", stmt.span);
        else if (actual !== "error" && actual !== returnType)
          report(
            "S017",
            `Return value must have type ${returnType}, received ${actual}`,
            stmt.span,
          );
      } else if (stmt.kind === "break" || stmt.kind === "continue") {
        if (loopDepth === 0)
          report(
            stmt.kind === "break" ? "S020" : "S021",
            `${stmt.kind === "break" ? "rokay" : "aagad"} is only valid inside a while loop`,
            stmt.span,
          );
      } else {
        const condition = infer(stmt.condition, env, scope);
        if (condition !== "bool" && condition !== "error")
          report("S010", "Condition must have type bool", stmt.condition.span);
        checkStatements(
          stmt.kind === "if" ? stmt.thenBlock : stmt.body,
          env,
          scope,
          returnType,
          loopDepth + (stmt.kind === "while" ? 1 : 0),
        );
        if (stmt.kind === "if" && stmt.elseBlock)
          checkStatements(stmt.elseBlock, env, scope, returnType, loopDepth);
      }
    }
  };

  const checkDefiniteAssignment = (
    statements: Stmt[],
    declared: Set<string>,
    assigned: Set<string>,
    scope: string,
  ): Set<string> => {
    const checkExpr = (expr: Expr, state: Set<string>) => {
      if (expr.kind === "variable") {
        if (declared.has(expr.name) && !state.has(expr.name))
          report("S022", `Variable '${expr.name}' may be uninitialized in ${scope}`, expr.span);
      } else if (expr.kind === "call") {
        for (const argument of expr.arguments) checkExpr(argument, state);
      } else if (expr.kind === "unary") checkExpr(expr.operand, state);
      else if (expr.kind === "binary") {
        checkExpr(expr.left, state);
        checkExpr(expr.right, state);
      }
    };

    let state = assigned;
    for (const stmt of statements) {
      if (stmt.kind === "declare") {
        checkExpr(stmt.initializer, state);
        if (!declared.has(stmt.name)) {
          declared.add(stmt.name);
          state.add(stmt.name);
        }
      } else if (stmt.kind === "assign") {
        checkExpr(stmt.value, state);
        if (declared.has(stmt.name) && !state.has(stmt.name))
          report(
            "S022",
            `Variable '${stmt.name}' may not exist on this path in ${scope}`,
            stmt.span,
          );
        state.add(stmt.name);
      } else if (stmt.kind === "print" || stmt.kind === "return") {
        checkExpr(stmt.value, state);
      } else if (stmt.kind === "call") {
        checkExpr(stmt.expression, state);
      } else if (stmt.kind === "if") {
        checkExpr(stmt.condition, state);
        const incoming = new Set(state);
        const thenState = checkDefiniteAssignment(
          stmt.thenBlock,
          declared,
          new Set(incoming),
          scope,
        );
        const elseState = stmt.elseBlock
          ? checkDefiniteAssignment(stmt.elseBlock, declared, new Set(incoming), scope)
          : incoming;
        state = new Set([...thenState].filter((name) => elseState.has(name)));
      } else if (stmt.kind === "while") {
        checkExpr(stmt.condition, state);
        checkDefiniteAssignment(stmt.body, declared, new Set(state), scope);
      }
    }
    return state;
  };

  const globals = new Map<string, ValueType>();
  checkStatements(module.program.statements, globals, "global");
  checkDefiniteAssignment(module.program.statements, new Set(), new Set(), "global scope");
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
    const parameters = new Set(fn.parameters.map((parameter) => parameter.name));
    checkDefiniteAssignment(fn.body, new Set(parameters), new Set(parameters), fn.name);
    if (!alwaysReturns(fn.body))
      report("S019", `Function '${fn.name}' must return ${fn.returnType} on every path`, fn.span);
  }
  return { symbols, expressionTypes, diagnostics };
}

function gujlangMessage(code: string): string {
  return (
    {
      S001: "Aa variable aa scope ma declare nathi kari.",
      S002: "'nathi' mate boolean value jaruri chhe.",
      S003: "Unary '-' mate number jaruri chhe.",
      S004: "Boolean operators ma banne operands boolean hova joie.",
      S005: "Aa operator mate numeric operands jaruri chhe.",
      S006: "Aa operator mate operands na types compatible hova joie.",
      S007: "Aa variable aa scope ma pehlethi declare chhe.",
      S009: "Aapeli value no type variable na type sathe match thato nathi.",
      S010: "Condition boolean hovi joie.",
      S011: "Aa function pehlethi declare chhe.",
      S012: "Aa function declare kari nathi.",
      S013: "Function call ma arguments ni sankhya barabar nathi.",
      S014: "Function argument no type expected type sathe match thato nathi.",
      S015: "'pachu aap' fakt function ni andar vapri shakai.",
      S017: "Return value no type function na declared return type sathe match thavo joie.",
      S018: "Aa parameter nu naam pehlethi vaprayu chhe.",
      S019: "Function na darek path mathi return value aapvi jaruri chhe.",
      S020: "'rokay' fakt while loop ni andar vapri shakai.",
      S021: "'aagad' fakt while loop ni andar vapri shakai.",
      S022: "Aa variable aa path par hamesha initialized nathi.",
      S023: "String ane concatenation fakt print statement ma vapri shakai.",
    }[code] ?? "Semantic bhul: source code na niyamo tapaso."
  );
}
