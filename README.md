# GujLang 🪔

A toy imperative programming language with **Gujarati-inspired keywords**, a full
compiler pipeline, and an interactive browser-based visualizer — built for the
Principles of Compiler Design (4CS501CC25) innovative assignment at Nirma University.

```
rakh x = 5
jo x > 3 to kar
    bolo "moto che"
bas
nahi to kar
    bolo "nano che"
bas
```

> v2 adds typed functions, parameters, calls, returns, and recursion to the complete v1
> core. `rokay`/`aagad` (`break`/`continue`) remain reserved and unimplemented.

## Features

- 🔤 **Dual-language lexer** — write programs in GujLang, standard English keywords, or
  a mix of both; a table-driven lookup resolves both to the same tokens
- 🌳 Full pipeline: lexer → parser → AST → semantic analysis → three-address code →
  optimizer → **dual codegen** (stack-VM bytecode + register-allocated pseudo-assembly
  via graph coloring)
- 🗣️ **Bilingual diagnostics** for lexical, syntax, and semantic errors, with panic-mode
  recovery that surfaces multiple errors in one pass
- 🖥️ **Interactive visualizer** — step through tokens (with source highlighting),
  parse tree, evolving symbol table, TAC with control-flow labels, before/after
  optimization diffs, and VM execution
- ▶️ **Run button** — executes the compiled stack-VM output in-browser, with a hard
  instruction cap so an infinite loop halts cleanly instead of freezing the tab
- 🎛️ **Toggleable optimizations** — switch constant folding / dead code elimination
  on or off independently to demonstrate *selecting* an optimization technique
- 📋 **Demo/presentation mode** — one click loads a canned sample (correct or
  intentionally broken) for repeatable lab/viva demonstration
- 📖 Keyword-lookup help panel showing the English equivalent of every GujLang keyword
  (a visualizer feature, not a language construct — see PROJECT_DESCRIPTION.md §3)

## Keyword Cheat Sheet

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

Full grammar, precedence, types, scope, and error-recovery spec:
[GRAMMAR.md](./GRAMMAR.md). Concept-to-syllabus mapping and design rationale:
[PROJECT_DESCRIPTION.md](./PROJECT_DESCRIPTION.md).

## Compiler Core (initial implementation)

Implemented so far in `src/`: source-aware lexer, recursive-descent parser, static type
checker, stack-VM bytecode generator/interpreter, TAC generation, independently toggleable
constant folding and dead-code elimination, and inspectable graph-coloring register
pseudo-assembly with spills, and the React browser visualizer with phase tabs, optimization
toggles, demo programs, and VM stepping. Language samples and smoke checks are in
`samples/` and `test/`.

Run a source file with `bun run cli samples/branching.guj`, or build and run it with
`bun run start samples/branching.guj`.

## Project Structure

```
gujlang/
├── src/                # lexer, parser, semantics, TAC, optimizer, VM, register allocator, CLI
├── visualizer/         # React UI and responsive teaching views
├── samples/            # demo programs + expected outputs (smoke-test fixtures)
├── test/               # smoke suite
├── GRAMMAR.md
├── PROJECT_BRIEF.md
├── PROJECT_DESCRIPTION.md
├── COURSE_REFERENCE.md
└── README.md
```

## Getting Started

```bash
bun install
bun run lint
bun run typecheck
bun run test    # compiler core checks, including samples/ smoke tests
bun run dev      # start the browser visualizer at localhost
bun run cli samples/branching.guj  # run a sample through the CLI
bun run start samples/branching.guj # run a compiled CLI build
bun run build   # production build — verify it works fully offline before demoing
```

## Team

- Harsh Thakkar (23BCE091)
- Hrushi Bhanvadiya (23BCE106)

## Course Context

Submitted as the Innovative Assignment for **4CS501CC25 Principles of Compiler Design**,
B.Tech CSE, Nirma University. See [PROJECT_BRIEF.md](./PROJECT_BRIEF.md) for the
one-page summary, [PROJECT_DESCRIPTION.md](./PROJECT_DESCRIPTION.md) for concepts/
novelty/unit coverage, [GRAMMAR.md](./GRAMMAR.md) for the binding spec, and
[COURSE_REFERENCE.md](./COURSE_REFERENCE.md) for syllabus/practical-list context.
