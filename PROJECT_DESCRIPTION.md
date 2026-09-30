# Project Description

**GujLang: A Gujarati-Inspired Toy Language, Compiler, and Interactive Visualizer**
Course: 4CS501CC25 — Principles of Compiler Design | Nirma University

> The binding grammar/semantics spec lives in [GRAMMAR.md](./GRAMMAR.md). If anything
> below conflicts with it, GRAMMAR.md is authoritative.

## 1. Motivation

Compiler design is usually taught and practiced against a generic, English-keyword toy
language. We wanted a project that still exercises every phase of a real compiler
pipeline, but adds a genuine design dimension on top of the standard exercises: **what
happens if the language's keyword layer is localized?**

GujLang keeps every required compiler phase intact, while replacing the toy language's
keywords with Gujarati words spelled phonetically (e.g. `jo` for `if`). The scope of that
localization is deliberately precise — see Section 3 — rather than a claim that "the
whole language" is Gujarati.

## 2. Language Overview: GujLang (v2)

V2 includes the complete v1 core plus typed functions, parameters, calls, returns, and
recursion. Functions use call-by-value and have isolated local frames; they cannot read
global or caller variables. `rokay`/`aagad` (`break`/`continue`) remain reserved keywords
without grammar or runtime behavior (see GRAMMAR.md §1).

### 2.1 Keyword table
| English keyword | GujLang keyword |
|---|---|
| `if` / `then` / `else` | `jo` / `to` / `nahi to` |
| `while` | `jyare` |
| `do` / `end` | `kar` / `bas` |
| `var` / `let` | `rakh` |
| `print` | `bolo` |
| `true` / `false` | `sacu` / `khotu` |
| `and` / `or` / `not` | `ane` / `athva` / `nathi` |
| `function` / `return` | `kaam` / `pachu aap` |

### 2.2 Sample program
```
rakh x = 5
jo x > 3 to kar
    bolo "moto che"
bas
nahi to kar
    bolo "nano che"
bas
```
Every `kar` is closed by exactly one `bas` — the single block-delimiter rule (full
grammar in GRAMMAR.md §2).

## 3. Localization Scope — what is and isn't GujLang

To avoid overclaiming, here's exactly what's localized and what isn't:

| Element | GujLang? |
|---|---|
| Keywords (`jo`, `bolo`, `rakh`, ...) | Yes — and the lexer accepts the English equivalent too (dual-mode, see §4) |
| Compiler diagnostics (errors) | Yes — bilingual, GujLang phrasing alongside the standard English message |
| Identifiers (variable names) | No — free-form, any valid identifier, not translated |
| String literals | No — printed verbatim, exactly as written, not translated |

This is a **keyword and diagnostics localization**, not a claim that the language is
"Gujarati throughout." The earlier idea of a keyword-lookup command as *source syntax*
has been dropped — it's better suited as a visualizer help panel (see §6), since adding
it as an in-language construct would mean specifying its own grammar and semantics for
no compiler-design benefit.

## 4. Dual-Mode Input

The lexer is **table-driven**: every keyword maps to a token type through a lookup table
listing both its GujLang and English spellings (e.g. `{"jo": IF, "if": IF}`). The
compiler accepts either keyword set — or a mix of both — in the same source file. This
is a compatibility feature at the lexer level; it does not by itself localize anything
beyond the keyword layer described in §3.

## 5. Compiler Pipeline and Unit Mapping

| Phase | Description | Syllabus Unit |
|---|---|---|
| **Lexical Analysis** | Table-driven, dual-language tokenizer; reports lexical errors with line numbers, bilingually | II, III |
| **Syntax Analysis** | Recursive-descent parser over the CFG in GRAMMAR.md; builds an AST; panic-mode error recovery | II, IV |
| **Semantic Analysis** | Symbol table (name, type); static per-variable type checking; undeclared/redeclared variable checks, reported bilingually | V |
| **Intermediate Code Generation** | Three-address code (TAC), including backpatching for `jo`/`jyare` control flow | V |
| **Optimization** | Independently selectable passes: constant folding, dead code elimination (see §7 for how this ties to CLO 3) | VII |
| **Code Generation** | Dual backend — see §7 | VI, VII |

## 6. The Visualizer

The visualizer's job is to show **why** each phase produced what it produced, not just
the output:

- **Tokens** — list with type, lexeme, and source line/column range; hovering a token
  highlights the exact source span it came from
- **Parse tree / AST** — rendered as a tree; hovering a node shows which grammar rule
  produced it
- **Symbol table** — shown evolving statement-by-statement (insertions and type
  assignments), not just a final snapshot
- **TAC** — instructions with explicit control-flow labels (`L1`, `L2`, ...) and the
  backpatched jump targets visible
- **Optimization** — before/after TAC shown side by side (diffed), with each removed or
  folded line annotated with which rule fired
- **Codegen / VM execution** — generated instructions plus a step-through **Run** view
  showing VM stack, program counter, and output as it executes; register views belong to
  the pseudo-assembly allocation panel, not the stack VM
- **Errors & recovery tab** — one or more deliberately broken sample programs, each
  showing multiple detected errors in a single pass, with line numbers, bilingual
  messages, and (for syntax errors) the synchronization point used to recover
- **Keyword-lookup help panel** — the English-equivalent lookup from §3, as a help
  overlay, not a language construct
- **Demo/presentation mode** — a fixed set of canned programs (correct and
  intentionally broken) with next/prev navigation, so a lab or viva demo can step
  through prepared scenarios instead of relying on live typing

## 7. Code Generation & Optimization Strategy (course alignment)

The syllabus and practical list (Exp. 8, 10) require register allocation and graph
coloring specifically — a pure stack-VM target has no registers to allocate, which would
leave that lab outcome undemonstrated. To cover it without giving up the simplicity of a
runnable VM:

- **Primary backend — stack-VM.** Generated bytecode is directly executable by the
  bundled VM interpreter. This is what the **Run** button in the visualizer uses, and
  what all demo programs are validated against.
- **Secondary teaching backend — register-allocated pseudo-assembly.** The same TAC is also
  compiled to pseudo-assembly using a small fixed set of virtual registers, with
  register allocation performed via **graph coloring** over the TAC's interference
  graph (spilling to memory when the coloring doesn't fit). This backend is for
  demonstration of Exp. 8/10 and is not required to execute — it exists so the register
  allocation and graph-coloring lab outcome has a concrete, inspectable artifact.

**CLO 3 ("select the appropriate optimization technique")** is demonstrated by making
the optimization passes independently toggleable in the visualizer — constant folding
and dead code elimination can each be switched on/off, so the demo can show *choosing*
an optimization and its before/after effect, rather than a single fixed pipeline.

## 8. Reliability & Error Handling

| Situation | Expected behavior |
|---|---|
| Malformed input (lexical/syntax errors) | Collected via panic-mode recovery (GRAMMAR.md §6); compilation halts before codegen if any error was recorded |
| Invalid types (e.g. `5 + sacu`) | Caught at semantic analysis, reported bilingually, compilation halts before codegen — never generate code from an invalid program |
| Division by zero | Caught by the VM at runtime; bilingual runtime error, graceful halt, no crash |
| Infinite loops | VM enforces a hard instruction-count cap (default ~100,000); execution halts with a clear message instead of freezing |
| Sample programs | Kept in `samples/` with expected outputs; run as a smoke test before any lab/demo to confirm they still pass after code changes |

**On the "no backend / dependency-free" claim:** this must be verified, not assumed —
run an actual production build (`bun run build`), serve the static output with the
network disconnected, and confirm zero failed requests before presenting this as a
property of the tool. If the build turns out to need any external call, the docs should
say so plainly rather than claim full independence.

## 9. Tech Stack

- **Compiler core:** TypeScript — lexer, parser, semantic analyzer, IR generator,
  optimizer, both codegen backends, and the stack-VM interpreter, as a standalone module
- **Visualizer:** React, using the same TypeScript compiler core directly in the browser
- **No backend** — intended as a static web app; verify per §8 before presenting this as
  a guarantee

## 10. Originality Statement

The GujLang keyword mapping, the dual-language table-driven lexer design, the bilingual
diagnostic system, the dual codegen backend, and the phase-by-phase visualizer are
original work produced for this assignment. The underlying compiler theory (lexing,
parsing, semantic analysis, TAC, optimization, register allocation via graph coloring,
code generation) follows standard techniques as taught in the course.
