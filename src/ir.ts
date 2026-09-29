import type { Expr, Program, Stmt } from "./ast";

export type Instruction =
  | { op: "CONST"; value: number | boolean | string }
  | { op: "LOAD"; name: string }
  | { op: "STORE"; name: string }
  | { op: "UNARY"; operator: string }
  | { op: "BINARY"; operator: string }
  | { op: "PRINT" }
  | { op: "JUMP"; target: number }
  | { op: "JUMP_IF_FALSE"; target: number }
  | { op: "HALT" };

export type TacInstruction =
  | { op: "const"; target: string; value: number | boolean | string }
  | { op: "copy"; target: string; source: string }
  | { op: "unary"; target: string; operator: string; operand: string }
  | { op: "binary"; target: string; operator: string; left: string; right: string }
  | { op: "print"; value: string }
  | { op: "ifFalse"; condition: string; target: string }
  | { op: "goto"; target: string }
  | { op: "label"; name: string };

export function generateTac(program: Program): TacInstruction[] {
  const out: TacInstruction[] = [];
  let temp = 0;
  let label = 0;
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
      out.push({ op: "copy", target, source: e.name });
      return target;
    }
    if (e.kind === "unary") {
      const operand = expr(e.operand),
        target = fresh();
      out.push({ op: "unary", target, operator: e.op, operand });
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
          target: stmt.name,
          source: expr(stmt.kind === "declare" ? stmt.initializer : stmt.value),
        });
      } else if (stmt.kind === "print") out.push({ op: "print", value: expr(stmt.value) });
      else if (stmt.kind === "if") {
        const condition = expr(stmt.condition),
          otherwise = freshLabel(),
          done = freshLabel();
        out.push({ op: "ifFalse", condition, target: otherwise });
        list(stmt.thenBlock);
        if (stmt.elseBlock) out.push({ op: "goto", target: done });
        out.push({ op: "label", name: otherwise });
        if (stmt.elseBlock) {
          list(stmt.elseBlock);
          out.push({ op: "label", name: done });
        }
      } else {
        const head = freshLabel(),
          done = freshLabel();
        out.push({ op: "label", name: head });
        const condition = expr(stmt.condition);
        out.push({ op: "ifFalse", condition, target: done });
        list(stmt.body);
        out.push({ op: "goto", target: head }, { op: "label", name: done });
      }
    }
  };
  list(program.statements);
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
      default:
        return "";
    }
  });
}

export function generate(program: Program): Instruction[] {
  const code: Instruction[] = [];
  const expr = (e: Expr) => {
    if (e.kind === "number" || e.kind === "boolean" || e.kind === "string")
      code.push({ op: "CONST", value: e.value });
    else if (e.kind === "variable") code.push({ op: "LOAD", name: e.name });
    else if (e.kind === "unary") {
      expr(e.operand);
      code.push({ op: "UNARY", operator: e.op });
    } else {
      expr(e.left);
      expr(e.right);
      code.push({ op: "BINARY", operator: e.op });
    }
  };
  const list = (ss: Stmt[]) => {
    for (const s of ss) {
      if (s.kind === "declare") {
        expr(s.initializer);
        code.push({ op: "STORE", name: s.name });
      } else if (s.kind === "assign") {
        expr(s.value);
        code.push({ op: "STORE", name: s.name });
      } else if (s.kind === "print") {
        expr(s.value);
        code.push({ op: "PRINT" });
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
        expr(s.condition);
        const exit = code.push({ op: "JUMP_IF_FALSE", target: -1 }) - 1;
        list(s.body);
        code.push({ op: "JUMP", target: head });
        code[exit] = { op: "JUMP_IF_FALSE", target: code.length };
      }
    }
  };
  list(program.statements);
  code.push({ op: "HALT" });
  return code;
}
