# Project Brief — Innovative Assignment

**Course:** 4CS501CC25 — Principles of Compiler Design
**Institute:** Institute of Technology, Nirma University
**Programme:** B.Tech CSE, Semester VII

## Project Title
**GujLang: A Gujarati-Inspired Toy Language, Compiler, and Interactive Visualizer**

## Team
| Name | Student ID |
|---|---|
| Harsh Thakkar | 23BCE091 |
| Hrushi Bhanvadiya | 23BCE106 |

## Brief Description
We are building a complete compiler for a small toy imperative language (declarations,
expressions, `if`/`else`, `while`, `print`, and typed functions with parameters and returns) whose **keyword layer** is localized into
"GujLang" — Gujarati words spelled phonetically in place of standard English keywords
(e.g. `jo` for `if`, `jyare` for `while`, `bolo` for `print`). Identifiers and string
literals remain free-form/untranslated; the localization is specifically the keywords
and the compiler's diagnostics.

The compiler implements a substantial compiler pipeline taught in the course — lexical analysis, syntax
analysis, semantic analysis, intermediate code generation, optimization, and code
generation — and accepts **both** the GujLang and standard English keyword sets through a
single, table-driven lexer. Error messages are emitted bilingually, using GujLang phrasing
alongside the standard message. Code generation targets two backends: an executable
stack-VM (used for live demos) and a register-allocated pseudo-assembly form using graph
coloring, so the syllabus's register-allocation outcome has a concrete artifact even
though the VM itself doesn't use registers. Functions support value parameters, typed
returns, per-call local frames, and recursion; `rokay`/`aagad` remain reserved.

The entire pipeline is paired with a browser-based visualizer that shows each compilation
phase step by step — with source-position highlighting, an evolving symbol table, TAC
control-flow labels, and before/after optimization diffs, not just final outputs — plus a
demo-program loader for quick, repeatable presentation.

## Novelty
Rather than implementing the standard pipeline against a generic English-keyword toy
language (as covered in the lab practicals), we localize the language itself. This adds a
genuine language-design dimension on top of the required compiler phases — a
table-driven, locale-aware lexer, bilingual diagnostics, and an accessible, readable
sample-program set — while keeping every required compiler phase intact and demonstrable.

## Deliverables
- Working prototype: compiler + executable stack-VM interpreter + register-allocated pseudo-assembly output + web visualizer
- Complete source code
- Project documentation (this brief, project description, README)
- Live demonstration with sample GujLang programs
