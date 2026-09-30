import type { Expr, Module, Stmt } from "./ast";

export type Instruction =
  | { op: "CONST"; value: number | boolean | string }
  | { op: "LOAD"; name: string }
  | { op: "STORE"; name: string }
  | { op: "UNARY"; operator: string }
  | { op: "BINARY"; operator: string }
  | { op: "PRINT" }
  | { op: "JUMP"; target: number }
  | { op: "JUMP_IF_FALSE"; target: number }
  | { op: "FUNCTION"; name: string; parameters: string[] }
  | { op: "CALL"; name: string; argumentCount: number }
  | { op: "POP" }
  | { op: "RETURN" }
  | { op: "HALT" };

export type TacInstruction =
  | { op: "const"; target: string; value: number | boolean | string }
  | { op: "copy"; target: string; source: string }
  | { op: "unary"; target: string; operator: string; operand: string }
  | { op: "binary"; target: string; operator: string; left: string; right: string }
  | { op: "print"; value: string }
  | { op: "ifFalse"; condition: string; target: string }
  | { op: "goto"; target: string }
  | { op: "label"; name: string }
  | { op: "function"; name: string; parameters: string[] }
  | { op: "call"; target: string; name: string; args: string[] }
  | { op: "return"; value: string }
  | { op: "halt" };

export function generateTac(module: Module): TacInstruction[] {
  const out: TacInstruction[] = [];
  let temp = 0;
  let label = 0;
  let localPrefix = "";
  const loopTargets: { breakLabel: string; continueLabel: string }[] = [];
  const fresh = () => `t${++temp}`;
  const freshLabel = () => `L${++label}`;
  const expr = (e: Expr): string => {
    if (e.kind === "number" || e.kind === "boolean" || e.kind === "string") {
      const target = fresh();
      out.push({ op: "const", target, value: e.value });
      return target;
    }
    if (e.kind === "variable") {
      const target = fresh();
      out.push({ op: "copy", target, source: `${localPrefix}${e.name}` });
      return target;
    }
    if (e.kind === "call") {
      const args = e.arguments.map(expr);
      const target = fresh();
      out.push({ op: "call", target, name: e.name, args });
      return target;
    }
    if (e.kind === "unary") {
      const operand = expr(e.operand),
        target = fresh();
      out.push({ op: "unary", target, operator: e.op, operand });
      return target;
    }
    if (e.kind === "binary" && (e.op === "AND" || e.op === "OR")) {
      const left = expr(e.left);
      const target = fresh();
      if (e.op === "AND") {
        const doneLabel = freshLabel();
        const falseLabel = freshLabel();
        out.push({ op: "ifFalse", condition: left, target: falseLabel });
        const right = expr(e.right);
        out.push(
          { op: "copy", target, source: right },
          { op: "goto", target: doneLabel },
          { op: "label", name: falseLabel },
          { op: "const", target, value: false },
          { op: "label", name: doneLabel },
        );
      } else {
        const doneLabel = freshLabel();
        const rightLabel = freshLabel();
        out.push(
          { op: "ifFalse", condition: left, target: rightLabel },
          { op: "const", target, value: true },
          { op: "goto", target: doneLabel },
          { op: "label", name: rightLabel },
        );
        const right = expr(e.right);
        out.push({ op: "copy", target, source: right }, { op: "label", name: doneLabel });
      }
      return target;
    }
    const left = expr(e.left),
      right = expr(e.right),
      target = fresh();
    out.push({ op: "binary", target, operator: e.op, left, right });
    return target;
  };
  const list = (statements: Stmt[]) => {
    for (const stmt of statements) {
      if (stmt.kind === "declare" || stmt.kind === "assign") {
        out.push({
          op: "copy",
          target: `${localPrefix}${stmt.name}`,
          source: expr(stmt.kind === "declare" ? stmt.initializer : stmt.value),
        });
      } else if (stmt.kind === "print") out.push({ op: "print", value: expr(stmt.value) });
      else if (stmt.kind === "call") expr(stmt.expression);
      else if (stmt.kind === "return") out.push({ op: "return", value: expr(stmt.value) });
      else if (stmt.kind === "break") {
        const target = loopTargets.at(-1);
        if (target) out.push({ op: "goto", target: target.breakLabel });
      } else if (stmt.kind === "continue") {
        const target = loopTargets.at(-1);
        if (target) out.push({ op: "goto", target: target.continueLabel });
      } else if (stmt.kind === "if") {
        const condition = expr(stmt.condition),
          otherwise = freshLabel(),
          done = stmt.elseBlock ? freshLabel() : undefined;
        out.push({ op: "ifFalse", condition, target: otherwise });
        list(stmt.thenBlock);
        if (stmt.elseBlock && done) out.push({ op: "goto", target: done });
        out.push({ op: "label", name: otherwise });
        if (stmt.elseBlock) {
          list(stmt.elseBlock);
          if (done) out.push({ op: "label", name: done });
        }
      } else {
        const head = freshLabel(),
          done = freshLabel();
        loopTargets.push({ breakLabel: done, continueLabel: head });
        out.push({ op: "label", name: head });
        const condition = expr(stmt.condition);
        out.push({ op: "ifFalse", condition, target: done });
        list(stmt.body);
        out.push({ op: "goto", target: head }, { op: "label", name: done });
        loopTargets.pop();
      }
    }
  };
  list(module.program.statements);
  out.push({ op: "halt" });
  for (const fn of module.functions) {
    localPrefix = `${fn.name}::`;
    out.push({
      op: "function",
      name: fn.name,
      parameters: fn.parameters.map((parameter) => `${localPrefix}${parameter.name}`),
    });
    list(fn.body);
  }
  return out;
}

export function formatTac(code: TacInstruction[]): string[] {
  return code.map((ins) => {
    switch (ins.op) {
      case "const":
        return `${ins.target} = ${JSON.stringify(ins.value)}`;
      case "copy":
        return `${ins.target} = ${ins.source}`;
      case "unary":
        return `${ins.target} = ${ins.operator}${ins.operand}`;
      case "binary":
        return `${ins.target} = ${ins.left} ${ins.operator} ${ins.right}`;
      case "print":
        return `print ${ins.value}`;
      case "ifFalse":
        return `ifFalse ${ins.condition} goto ${ins.target}`;
      case "goto":
        return `goto ${ins.target}`;
      case "label":
        return `${ins.name}:`;
      case "function":
        return `function ${ins.name}(${ins.parameters.join(", ")}):`;
      case "call":
        return `${ins.target} = call ${ins.name}(${ins.args.join(", ")})`;
      case "return":
        return `return ${ins.value}`;
      case "halt":
        return "halt";
      default:
        return "";
    }
  });
}

export function generate(module: Module): Instruction[] {
  const code: Instruction[] = [];
  const loops: { head: number; breaks: number[] }[] = [];
  const expr = (e: Expr) => {
    if (e.kind === "number" || e.kind === "boolean" || e.kind === "string")
      code.push({ op: "CONST", value: e.value });
    else if (e.kind === "variable") code.push({ op: "LOAD", name: e.name });
    else if (e.kind === "call") {
      for (const arg of e.arguments) expr(arg);
      code.push({ op: "CALL", name: e.name, argumentCount: e.arguments.length });
    } else if (e.kind === "unary") {
      expr(e.operand);
      code.push({ op: "UNARY", operator: e.op });
    } else if (e.kind === "binary" && (e.op === "AND" || e.op === "OR")) {
      expr(e.left);
      const branch = code.push({ op: "JUMP_IF_FALSE", target: -1 }) - 1;
      if (e.op === "AND") {
        expr(e.right);
        const done = code.push({ op: "JUMP", target: -1 }) - 1;
        code[branch] = { op: "JUMP_IF_FALSE", target: code.length };
        code.push({ op: "CONST", value: false });
        code[done] = { op: "JUMP", target: code.length };
      } else {
        code.push({ op: "CONST", value: true });
        const done = code.push({ op: "JUMP", target: -1 }) - 1;
        code[branch] = { op: "JUMP_IF_FALSE", target: code.length };
        expr(e.right);
        code[done] = { op: "JUMP", target: code.length };
      }
    } else {
      expr(e.left);
      expr(e.right);
      code.push({ op: "BINARY", operator: e.op });
    }
  };
  const list = (statements: Stmt[]) => {
    for (const s of statements) {
      if (s.kind === "declare") {
        expr(s.initializer);
        code.push({ op: "STORE", name: s.name });
      } else if (s.kind === "assign") {
        expr(s.value);
        code.push({ op: "STORE", name: s.name });
      } else if (s.kind === "print") {
        expr(s.value);
        code.push({ op: "PRINT" });
      } else if (s.kind === "call") {
        expr(s.expression);
        code.push({ op: "POP" });
      } else if (s.kind === "return") {
        expr(s.value);
        code.push({ op: "RETURN" });
      } else if (s.kind === "break") {
        const loop = loops.at(-1);
        if (loop) loop.breaks.push(code.push({ op: "JUMP", target: -1 }) - 1);
      } else if (s.kind === "continue") {
        const loop = loops.at(-1);
        if (loop) code.push({ op: "JUMP", target: loop.head });
      } else if (s.kind === "if") {
        expr(s.condition);
        const cond = code.push({ op: "JUMP_IF_FALSE", target: -1 }) - 1;
        list(s.thenBlock);
        if (s.elseBlock) {
          const done = code.push({ op: "JUMP", target: -1 }) - 1;
          code[cond] = { op: "JUMP_IF_FALSE", target: code.length };
          list(s.elseBlock);
          code[done] = { op: "JUMP", target: code.length };
        } else code[cond] = { op: "JUMP_IF_FALSE", target: code.length };
      } else {
        const head = code.length;
        const loop = { head, breaks: [] as number[] };
        loops.push(loop);
        expr(s.condition);
        const exit = code.push({ op: "JUMP_IF_FALSE", target: -1 }) - 1;
        list(s.body);
        code.push({ op: "JUMP", target: head });
        code[exit] = { op: "JUMP_IF_FALSE", target: code.length };
        for (const jump of loop.breaks) code[jump] = { op: "JUMP", target: code.length };
        loops.pop();
      }
    }
  };
  list(module.program.statements);
  code.push({ op: "HALT" });
  for (const fn of module.functions) {
    code.push({
      op: "FUNCTION",
      name: fn.name,
      parameters: fn.parameters.map((parameter) => parameter.name),
    });
    list(fn.body);
  }
  return code;
}
