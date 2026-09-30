# Grammar & Semantics Specification (v2)

This is the binding GujLang specification. The parser, semantic checker, VM, visualizer,
and project documentation must agree with this file.

## 1. Implemented scope

V2 supports declarations, expressions, `if`/`else`, `while`, `print`, typed functions,
function calls, typed returns, and loop control with `rokay`/`break` and `aagad`/`continue`.
The lexer also reserves `kaam`, `pachu aap`, `rokay`, and `aagad` so unsupported
spellings are not mistaken for identifiers; each is implemented in v2 as documented here.

## 2. Keywords and input

Keywords accept GujLang and English aliases. Diagnostics are bilingual. Identifiers and
string literals are free-form and are not translated.

| Concept | English | GujLang |
|---|---|---|
| function / return | `function` / `return` | `kaam` / `pachu aap` |
| break / continue | `break` / `continue` | `rokay` / `aagad` |
| var / let | `var` / `let` | `rakh` |
| if / then / else | `if` / `then` / `else` | `jo` / `to` / `nahi to` |
| while | `while` | `jyare` |
| block open / close | `do` / `end` | `kar` / `bas` |
| print | `print` | `bolo` |
| true / false | `true` / `false` | `sacu` / `khotu` |
| and / or / not | `and` / `or` / `not` | `ane` / `athva` / `nathi` |

Comments start with `#` or `//` and continue to end of line. Keywords are matched
case-insensitively; identifiers retain their original spelling and case.

## 3. EBNF

```ebnf
module          := top_level* EOF
top_level       := function_decl | stmt
function_decl   := ('kaam' | 'function') IDENT '(' parameters? ')' '->' type block
parameters      := parameter (',' parameter)*
parameter       := IDENT ':' type
type            := 'int' | 'float' | 'bool'
stmt            := decl_stmt | assign_stmt | if_stmt | while_stmt | print_stmt | return_stmt | break_stmt | continue_stmt | call_stmt
decl_stmt       := 'rakh' IDENT '=' expr
assign_stmt     := IDENT '=' expr
if_stmt         := ('jo' | 'if') expr ('to' | 'then') block (('nahi to' | 'else') block)?
while_stmt      := ('jyare' | 'while') expr block
block           := ('kar' | 'do') stmt* ('bas' | 'end')
print_stmt      := ('bolo' | 'print') expr
return_stmt     := ('pachu aap' | 'return') expr
break_stmt      := 'rokay' | 'break'
continue_stmt   := 'aagad' | 'continue'
call_stmt       := call
expr            := or_expr
or_expr         := and_expr (('athva' | 'or') and_expr)*
and_expr        := not_expr (('ane' | 'and') not_expr)*
not_expr        := ('nathi' | 'not') not_expr | comparison
comparison      := add_expr (REL_OP add_expr)?
add_expr        := mul_expr (('+' | '-') mul_expr)*
mul_expr        := unary_expr (('*' | '/') unary_expr)*
unary_expr      := '-' unary_expr | primary
primary         := NUMBER | STRING | 'sacu' | 'khotu' | call | IDENT | '(' expr ')'
call            := IDENT '(' arguments? ')'
arguments       := expr (',' expr)*
REL_OP          := '>' | '<' | '>=' | '<=' | '==' | '!='
```

Function declarations are collected before body analysis, so functions can call each other
and themselves regardless of declaration order. Each function has its own flat local
environment; top-level statements have a separate flat global environment.

String literals are expression primaries so `bolo "value = " + x` can concatenate text with
an integer, float, boolean, or another string. The `+` operator concatenates when either operand
is a string; non-string `+` remains numeric addition. String literals and concatenations are
valid only in print statements: strings cannot be stored in variables, passed to functions, used
as conditions, compared, or returned. Every `kar` opens exactly one block and every block has its
own `bas`. Blocks after `jo`, `nahi to`, and `jyare` follow the same rule. A function body is
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

- Variable and function types are `int`, `float`, and `bool`. Declarations infer a fixed type from their initializer.
- Numeric operands can mix; arithmetic involving `/` or a float produces `float`, while comparisons produce `bool`.
- Conditions require `bool`. Equality requires matching types; relational operators require numbers.
- In print expressions, `+` concatenates string and printable scalar values (int, float, bool, and string); all other arithmetic remains numeric. A string-bearing expression is rejected outside a print statement.
- Function parameters and returns use the same three types. Calls are expressions and are
  checked for declared name, argument count, and argument types before code generation.
- Calls pass values by value. Recursion is supported; execution uses a VM-managed call stack
  with a depth limit.
- Functions have a flat local scope containing parameters and declarations. Names cannot be
  redeclared in that function, including in nested blocks. Functions cannot read or write
  top-level variables or a caller's locals. Top-level declarations retain one flat global scope.
- `if` and `while` blocks do not create scopes. Because a declaration inside a conditional or
  loop may not execute on every path, reads and assignments to a name that may not yet exist are
  rejected by definite-assignment analysis before code generation.
- A declaration initializer executes before the declared name becomes available. A read of a
  declared name on a path where its declaration has not executed is an error (`S022`).
- A return is valid only inside a function, and its expression must match the declared return
  type. Every function must return on every control-flow path. A sequence returns once a return
  statement is reached; an `if` returns on all paths only when it has an `else` and both arms do.
  A loop alone never proves that a function returns.
- `rokay` and `aagad` are valid only inside a `jyare`/`while` loop. They affect the nearest
  enclosing loop, even when nested inside conditionals or other loops. `rokay` exits that loop;
  `aagad` skips to its condition check.
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
