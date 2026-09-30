# GujLang Project Handoff

This file is the resume point for future contributors and models. Read it before making changes. `GRAMMAR.md` is the binding language specification; this file records project state and workflow rather than overriding the grammar.

## Product and course context

GujLang is a Gujarati-inspired keyword language, compiler, and browser visualizer for Nirma University's 4CS501CC25 Principles of Compiler Design innovative assignment. The team is Harsh Thakkar (23BCE091) and Hrushi Bhanvadiya (23BCE106). The goal is a useful teaching tool for students and faculty, not only a minimal course submission.

The language localizes keywords and diagnostics, not identifiers or string literals. Both GujLang and English keywords are accepted. The visualizer explains each compiler phase and supports lab/presentation use.

## Current implementation

- Compiler pipeline: lexer, recursive-descent parser, AST, static semantics and definite-assignment checks, TAC, independently toggleable constant folding and dead-code elimination, executable stack VM, plus graph-coloring register-allocated pseudo-assembly.
- Language v2 includes declarations, expressions, `if`/`else`, `while`, `print`, typed functions, parameters, calls, returns, recursion, and loop control (`rokay`/`break`, `aagad`/`continue`). Print statements support string concatenation with printable scalar values; string-bearing expressions remain print-only and string comparison is unsupported. Function locals are isolated from globals and other calls.
- Diagnostics are bilingual; syntax recovery can retain multiple diagnostics. VM execution has division-by-zero handling, an instruction cap, and a call-depth limit.
- Visualizer exposes source-aware tokens, AST, evolving symbols, TAC/optimization, register allocation, Run stepping, and errors. Run controls include Previous/Next, Final step, and Auto step. The current VM instruction has a compact operation/effect diagram, with raw JSON available in a collapsed disclosure.
- CodeMirror editor has GujLang syntax colors, a white cursor, bounded scrolling, two-space Tab indentation and Shift+Tab outdent. Enter continues block indentation; typing a closer (`bas`/`end`) or alternate branch (`else`/`nahi to`) aligns it with its matching opener. The typed-closer dedent was verified in the browser.
- Documentation dialog includes language and compiler guides. Manual dev-server offline check after reload was reported successful by the user; a production-hosting offline check remains outstanding.

## Repository map

- `src/`: compiler, VM, CLI, TAC and register allocator.
- `visualizer/`: React visualizer, CodeMirror editor and styles.
- `samples/`: example programs.
- `test/smoke.test.ts`: compiler smoke coverage.
- `GRAMMAR.md`: binding syntax and semantics.
- `PROJECT_BRIEF.md`, `PROJECT_DESCRIPTION.md`, `COURSE_REFERENCE.md`: assignment overview and course mapping.
- `codebase_audit_report.md`: audit findings, dispositions, and remaining release verification.
- `README.md`: install, run, and user-facing project summary.

## History and decisions

Commits show major milestones: initial compiler/visualizer (`fdf8296`), CodeMirror and UI improvements (`29d5bcc`), white cursor (`4c3e3bf`), typed functions v2 (`f24e560`), and compiler audit fixes (`6f46a9f`). Break/continue and follow-up hardening were completed and committed before the latest audit/quality pass.

Key scope decisions:

1. Project name is **GujLang** (earlier document drafts said Gujlish; use GujLang).
2. Use Bun 1.4.2 and Biome. Package manager metadata and lockfile use Bun.
3. Stack VM executes programs. Register allocation produces inspectable pseudo-assembly to cover course concepts; it is not a second executable backend.
4. Both keyword sets are accepted. Keywords are case-insensitive; identifiers preserve spelling and case.
5. Every `kar` block has exactly one `bas` closer.
6. Optimization passes stay independently toggleable to demonstrate their effect.
7. Keep Run as an execution phase with Previous/Next, Final step, and Auto step controls. Show program output in its own panel below VM state instead of adding another phase tab.
8. Visual operation diagrams are intentionally concise and supplemental; raw VM instruction data remains inspectable.

## Current in-progress changes

At handoff creation, changes from the previous review and current UI request are uncommitted. Inspect `git status` and `git diff` before editing. Known touched areas include:

- audit/doc accuracy and grammar casing details;
- a real Gujlish semantic diagnostic translation and more smoke cases;
- accessibility improvements in the visualizer;
- editor indentation behavior, including typed-closer alignment;
- Run final-step/auto-step controls and current-instruction diagrams.
- Run layout now has an aligned instruction/state row and a separate output panel below the VM state.
- Print string concatenation is implemented and specified; smoke coverage includes variable, numeric, and boolean values and rejects storing strings.

Current verification passed: `bun run lint`, `bun run typecheck`, `bun run test` (production web/core build plus compiler smoke checks), and `git diff --check`. Browser checks confirm instruction and VM state panels share the same top edge, output is a separate panel beneath VM state, and `bolo "total = " + total` displays the formatted value. The prior editor/stepper checks also passed. The user approved committing this complete change set; Git history is the source of truth for its commit.

## Remaining product/release work

### Immediate UI task

- [x] Confirm and fix auto-indent/dedent for `kar`/`do` and `bas`/`end`/`else`/`nahi to` lines. The two-space Tab/Shift+Tab shortcut is implemented.
- [x] Confirm Run Auto step advances and Final step reaches completed output.
- [x] Align Run panels and place program output in its own panel below VM state.
- [x] Add print-only string concatenation for text and scalar values.
- [x] Verify the revised layout in browser and run project checks.

### Release verification / later improvements

- Serve the actual production bundle under the intended deployment setup, load it, disconnect network, reload, and run a sample. Existing user verification was specifically on the dev setup and should not be generalized.
- Manual cross-browser check in current Chrome/Edge/Firefox/Safari targets and a screen-reader pass are not automated or yet completed.
- Decide whether to add browser-driven regression coverage for editor keyboard behavior and Run controls; current smoke tests mainly cover compiler behavior.
- Evaluate trace memory/runtime behavior for very large programs and document practical limits; VM instruction cap exists.
- Keep documentation synchronized with `GRAMMAR.md`; remove stale audit recommendations only when preserving audit provenance remains unnecessary.

## Developer workflow

Use Windows PowerShell in the repository. Bun is expected at `C:\Users\hthak\.bun\bin\bun.exe` (user installed Bun 1.4.2). Dependencies are in `node_modules`.

```powershell
bun install --frozen-lockfile
bun run lint
bun run typecheck
bun run test
bun run dev
```

`bun run test` builds both core and web production outputs, then runs `test/smoke.test.ts` as compiled JS. It does not automate browser checks. For the static web bundle use `bun run build` and then the configured hosting/preview mechanism. Do not claim production offline readiness based only on dev-server behavior.

Before continuing, review repository-specific `AGENTS.md` instructions if present. Preserve user changes, inspect diffs, do not reset/revert files, and do not commit/push unless the user explicitly asks. Report checks and remaining limitations plainly.

## Resume checklist

1. Read `HANDOFF.md`, `GRAMMAR.md`, and `git status --short`.
2. Review current diff before altering shared files.
3. Run `bun run lint`, `bun run typecheck`, and `bun run test` after further edits.
4. Update this handoff with the verified outcomes and any new decisions before stopping.
