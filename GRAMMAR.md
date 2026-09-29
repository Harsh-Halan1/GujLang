# Grammar & Semantics Specification (v1)

This is the binding spec — the implementation and all other docs must agree with this
file. If a doc contradicts this file, this file wins until both are updated together.

## 1. Core Language Scope (v1)

**Implemented and specified in v1:** variable declarations, expressions, `if`/`else`,
`while`, `print`.

**Deferred — not implemented, not part of v1 grammar:** functions (`kaam`), `return`
(`pachu aap`), `break`/`continue` (`rokay`/`aagad`). These keywords are reserved in the
lexer's keyword table so they tokenize correctly and produce a clear "not yet supported"
parse error if used, but they have no grammar rule or runtime semantics until a future
version defines and demos them. Do not present them as working features.

### Core v1 keyword table
| Concept | English | GujLang |
|---|---|---|
| variable declaration | `var` / `let` | `rakh` |
| if / then / else | `if` / `then` / `else` | `jo` / `to` / `nahi to` |
| while | `while` | `jyare` |
| block open / close | `do` / `end` | `kar` / `bas` |
| print | `print` | `bolo` |
| true / false | `true` / `false` | `sacu` / `khotu` |
| and / or / not | `and` / `or` / `not` | `ane` / `athva` / `nathi` |

Both language columns resolve to the same token kinds; English block spellings `do`/`end` have
exactly the same single-open/single-close behavior as `kar`/`bas`.

## 2. Formal Grammar (EBNF)

The EBNF below uses canonical GujLang spellings. Before parsing, the lexer maps the
English aliases in the table above to the same token kinds. `#` and `//` start a
single-line comment; comments and whitespace do not separate the grammar's statements.

```
program     := stmt_list EOF
stmt_list   := stmt*

stmt        := decl_stmt | assign_stmt | if_stmt | while_stmt | print_stmt

decl_stmt   := 'rakh' IDENT '=' expr
assign_stmt := IDENT '=' expr

if_stmt     := 'jo' expr 'to' block ( 'nahi' 'to' block )?
while_stmt  := 'jyare' expr block

block       := 'kar' stmt_list 'bas'

print_stmt  := 'bolo' (expr | STRING)

expr        := or_expr
or_expr     := and_expr ( 'athva' and_expr )*
and_expr    := not_expr ( 'ane' not_expr )*
not_expr    := 'nathi' not_expr | rel_expr
rel_expr    := add_expr ( REL_OP add_expr )?        -- REL_OP: > < >= <= == !=
add_expr    := mul_expr ( ('+' | '-') mul_expr )*
mul_expr    := unary_expr ( ('*' | '/') unary_expr )*
unary_expr  := '-' unary_expr | primary
primary     := NUMBER | 'sacu' | 'khotu' | IDENT | '(' expr ')'
```

`STRING` is a lexer token for a quoted string literal and is accepted only directly
after `bolo`; it is not an expression primary. Printing an `int`, `float`, or `bool`
expression is supported using the VM's canonical textual format for that value.

**The single block rule:** `kar ... bas` is the *only* block delimiter in the language,
used identically after `to`, after `nahi to`, and after `jyare <cond>`. Every `kar` must
be closed by exactly one `bas` — there is no shared or optional closing.

### Corrected canonical sample
The earlier sample used one `bas` to close two blocks — that was a documentation bug,
not intended syntax. Corrected:
```
rakh x = 5
jo x > 3 to kar
    bolo "moto che"
bas
nahi to kar
    bolo "nano che"
bas
```

## 3. Operator Precedence (low → high)
1. `athva` (or)
2. `ane` (and)
3. `nathi` (not) — unary
4. relational `> < >= <= == !=` — **non-associative**, no chained comparisons (`a < b < c` is a syntax error, write `a < b ane b < c`)
5. `+` `-`
6. `*` `/`
7. unary `-`

## 4. Type System
- Three types in v1: `int`, `float`, `bool`. String literals are permitted only as
  direct `bolo` arguments — there are no string variables, concatenation, or comparison.
- A variable's type is fixed at its `rakh` declaration (inferred from the initializer)
  and **cannot change** on later assignment — assigning a `bool` value to an `int`
  variable is a semantic error, not a silent conversion.
- `int` and `float` mix freely in arithmetic (`int` promotes to `float`).
- Arithmetic operators `+`, `-`, `*`, `/` require numeric operands; `/` produces a
  `float`. Unary `-` requires a numeric operand. Relational comparisons require numeric
  operands and produce `bool`; equality/inequality require operands of the same type.
- `ane`, `athva`, and `nathi` require `bool` operands and produce `bool`. Conditions in
  `jo` and `jyare` must have type `bool`.
- `bool` values only interact with `ane` / `athva` / `nathi` and the result of a
  relational comparison — no implicit int↔bool conversion.

## 5. Scope Rules
- Single flat/global scope in v1. `if` and `while` blocks do **not** introduce a new
  scope — this matches having no function call frames yet.
- Block-level lexical scoping is explicitly deferred until functions (`kaam`) are
  specified, since nested scope only becomes meaningful once there are call frames to
  scope against.

## 6. Error Recovery
| Phase | Strategy |
|---|---|
| Lexical | Skip the offending character, report `(line, bilingual message)`, continue tokenizing. A single pass surfaces every lexical error, not just the first. |
| Syntax | Panic-mode recovery: on a parse error, discard tokens until a synchronizing token (`rakh`, `jo`, `jyare`, `bolo`, `IDENT` when followed by `=`, `bas`, or EOF), report, resume from there. A synchronizing token that begins a new statement is retained for the next parse attempt; `bas` is consumed only to close the current block. One compile attempt should surface multiple independent syntax errors. |
| Semantic | Report and continue, treating the erroring expression as an error-type placeholder (prevents one bad declaration from cascading into dozens of false positives). **Compilation halts before codegen** if any semantic error was recorded — never generate code for a program known to be invalid. |

## 7. Runtime Error Behavior (VM)
| Condition | Behavior |
|---|---|
| Division by zero | Caught at the divide instruction; execution halts with a bilingual runtime error — no crash |
| Infinite loop | VM enforces a hard instruction-count cap (default ~100,000 executed instructions, configurable); on exceeding it, halts with a "possible infinite loop" message rather than freezing the tab |
| Type error at runtime | Should be unreachable — static type checking must reject these before codegen. If the VM ever hits one, treat it as a compiler bug, not expected program behavior, and fix the checker |
