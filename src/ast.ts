export type Span = {
  start: number;
  end: number;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
};
export type TypeName = "int" | "float" | "bool" | "string" | "error";

export type Expr =
  | { kind: "number"; value: number; numericKind: "int" | "float"; span: Span }
  | { kind: "boolean"; value: boolean; span: Span }
  | { kind: "string"; value: string; span: Span }
  | { kind: "variable"; name: string; span: Span }
  | { kind: "call"; name: string; arguments: Expr[]; span: Span }
  | { kind: "unary"; op: "-" | "not"; operand: Expr; span: Span }
  | { kind: "binary"; op: string; left: Expr; right: Expr; span: Span };

export type Stmt =
  | { kind: "declare"; name: string; initializer: Expr; span: Span }
  | { kind: "assign"; name: string; value: Expr; span: Span }
  | { kind: "print"; value: Expr; span: Span }
  | { kind: "return"; value: Expr; span: Span }
  | { kind: "if"; condition: Expr; thenBlock: Stmt[]; elseBlock?: Stmt[]; span: Span }
  | { kind: "while"; condition: Expr; body: Stmt[]; span: Span };

export type Program = { kind: "program"; statements: Stmt[]; span: Span };
export type FunctionParameter = {
  name: string;
  type: Exclude<TypeName, "string" | "error">;
  span: Span;
};
export type FunctionDecl = {
  kind: "function";
  name: string;
  parameters: FunctionParameter[];
  returnType: Exclude<TypeName, "string" | "error">;
  body: Stmt[];
  span: Span;
};
export type Module = { kind: "module"; functions: FunctionDecl[]; program: Program };
