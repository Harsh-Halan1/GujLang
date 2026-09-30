# Grammar & Semantics Specification (v2)

This is the binding GujLang specification. The parser, semantic checker, VM, visualizer,
and project documentation must agree with this file.

## 1. Implemented scope

V2 supports declarations, expressions, `if`/`else`, `while`, `print`, typed functions,
function calls, and typed returns. `rokay`/`break` and `aagad`/`continue` remain reserved
lexer keywords but have no grammar, runtime, or user-facing claim of support.

## 2. Keywords and input

Keywords accept GujLang and English aliases. Diagnostics are bilingual. Identifiers and
string literals are free-form and are not translated.

| Concept | English | GujLang |
|---|---|---|
| function / return | `function` / `return` | `kaam` / `pachu aap` |
| var / let | `var` / `let` | `rakh` |
| if / then / else | `if` / `then` / `else` | `jo` / `to` / `nahi to` |
| while | `while` | `jyare` |
| block open / close | `do` / `end` | `kar` / `bas` |
| print | `print` | `bolo` |
| true / false | `true` / `false` | `sacu` / `khotu` |
| and / or / not | `and` / `or` / `not` | `ane` / `athva` / `nathi` |

Comments start with `#` or `//` and continue to end of line.

## 3. EBNF

```ebnf
module          := top_level* EOF
top_level       := function_decl | stmt
function_decl   := ('kaam' | 'function') IDENT '(' parameters? ')' '->' type block
parameters      := parameter (',' parameter)*
parameter       := IDENT ':' type
type            := 'int' | 'float' | 'bool'
stmt            := decl_stmt | assign_stmt | if_stmt | while_stmt | print_stmt | return_stmt
decl_stmt       := 'rakh' IDENT '=' expr
assign_stmt     := IDENT '=' expr
if_stmt         := ('jo' | 'if') expr ('to' | 'then') block (('nahi to' | 'else') block)?
while_stmt      := ('jyare' | 'while') expr block
block           := ('kar' | 'do') stmt* ('bas' | 'end')
print_stmt      := ('bolo' | 'print') (expr | STRING)
return_stmt     := ('pachu aap' | 'return') expr
expr            := or_expr
or_expr         := and_expr (('athva' | 'or') and_expr)*
and_expr        := not_expr (('ane' | 'and') not_expr)*
not_expr        := ('nathi' | 'not') not_expr | comparison
comparison      := add_expr (REL_OP add_expr)?
add_expr        := mul_expr (('+' | '-') mul_expr)*
mul_expr        := unary_expr (('*' | '/') unary_expr)*
unary_expr      := '-' unary_expr | primary
primary         := NUMBER | 'sacu' | 'khotu' | call | IDENT | '(' expr ')'
call            := IDENT '(' arguments? ')'
arguments       := expr (',' expr)*
REL_OP          := '>' | '<' | '>=' | '<=' | '==' | '!='
```

Strings are accepted only directly by `bolo`; they are not expression primaries, arguments,
variables, or return values. Every `kar` opens exactly one block and every block has its own
`bas`. Blocks after `jo`, `nahi to`, and `jyare` follow the same rule. A function body is
also exactly one such block.

## 4. Precedence (low to high)

1. `athva` / `or`
2. `ane` / `and`
3. `nathi` / `not`
4. Comparisons (non-associative; write `a < b ane b < c` instead of chaining)
5. `+` and `-`
6. `*` and `/`
7. Unary `-`

## 5. Static semantics

- Types are `int`, `float`, and `bool`. Declarations infer a fixed type from their initializer.
- Numeric operands can mix; `/` and any operation involving a float produce `float`.
- Conditions require `bool`. Equality requires matching types; relational operators require numbers.
- Function parameters and returns use the same three types. Calls are expressions and are
  checked for declared name, argument count, and argument types before code generation.
- Calls pass values by value. Recursion is supported; execution uses a VM-managed call stack
  with a depth limit.
- Functions have a flat local scope containing parameters and declarations. Names cannot be
  redeclared in that function, including in nested blocks. Functions cannot read or write
  top-level variables or a caller's locals. Top-level declarations retain one flat global scope.
- A return is valid only inside a function, and its expression must match the declared return
  type. Every function must return on every control-flow path. A sequence returns once a return
  statement is reached; an `if` returns on all paths only when it has an `else` and both arms do.
  A loop alone never proves that a function returns.
- Function names use a namespace separate from variable names. Function declarations are
  visible throughout the module, including calls written before the declaration.

## 6. Runtime and reliability

Division by zero halts with a bilingual VM diagnostic. The VM enforces a hard instruction cap
and function call-depth limit. Invalid types, unknown functions, wrong arity, and missing return
paths are rejected before code generation. The register pseudo-assembly is an inspectable TAC
backend artifact; the stack VM remains the backend that executes programs.

## 7. Error recovery

| Phase | Strategy |
|---|---|
| Lexical | Skip invalid characters, report source spans bilingually, and continue tokenizing. |
| Syntax | Panic-mode recovery synchronizes at statement starts, `bas`/`end`, or EOF; preserve a synchronizing statement start for the next parse attempt and consume a block closer only inside a block. |
| Semantic | Report independent errors while treating invalid expressions as error-typed. Any diagnostic blocks code generation. |
