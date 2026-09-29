# Course Reference — 4CS501CC25 Principles of Compiler Design

Nirma University | Institute of Technology, School of Technology | B.Tech CSE
Course Type: Core | Year of Introduction: 2025-26 | **L-T-P-C: 3-0-2-4**
Total Teaching Hours: **45** | Total Practical Hours: **30**

Quick-reference pulled from the official course syllabus and practical (LOP) document.

---

## Course Learning Outcomes (CLOs)

| # | Outcome | Bloom's Level |
|---|---|---|
| 1 | Summarise the functionalities of various phases of the compiler | BL2 |
| 2 | Apply language theory concepts to various phases of compiler design | BL3 |
| 3 | Select the appropriate optimization technique for the compilation process | BL5 |
| 4 | Implement various compiler phases using the appropriate compiler design tools | BL6 |

---

## Unit-Wise Syllabus (45 hrs total)

### Unit I — Introduction (3 hrs)
- Overview of principles and significance of compiler design
- Structure of a compiler
- Types of compilers and their applications
- The role of language theory in compiler design

### Unit II — Formal Languages and Automata (6 hrs)
- Introduction to formal languages and their types
- Need for automata and formal languages in compiler design
- Deterministic and Non-Deterministic Finite Automata (DFA / NFA)
- Conversion from NFA to DFA
- Finite Automata; Regular Expression to Automata

### Unit III — Lexical Analysis (5 hrs)
- Role of a Lexical Analyzer
- Input Buffering
- Specifications of Tokens
- Recognition of Tokens
- Lexical Analyzer Generator (Lex/Flex)

### Unit IV — Syntax Analysis (10 hrs)
- Context-Free Grammar (CFG)
- Top-down parsing
- Bottom-up parsing
- LR Parsers
- Error Recovery
- Parsing for ambiguous grammar
- Parsing generator tools (YACC)

### Unit V — Semantic Analysis and Intermediate Code Generation (13 hrs — largest unit)
- Typical semantic errors
- Static and Dynamic Checks
- Syntax Directed Definitions (SDD) & Translation Schemes (SDT)
- Type checking
- Syntax Directed Translation Schemes
- Intermediate code representations
- Three Address Code (TAC)
- Control Flow
- Backpatching

### Unit VI — Runtime Environment (2 hrs)
- Storage Organization
- Stack Allocation
- Heap Management

### Unit VII — Code Generation and Optimization (6 hrs)
- Issues in code generation
- Data Flow and Control Flow
- Peephole Optimization
- Register Allocation
- Machine-independent optimization techniques
- Introduction to cross-compilers

### Self-Study
Content declared at the start of the semester. **~10% of exam questions** are drawn from self-study content — check announcements for what's assigned.

---

## Suggested Readings / References

1. Aho, Lam, Ullman, Sethi — *Compilers: Principles, Techniques and Tools* (Pearson)
2. Jean-Paul Trembly & Paul G Sorenson — *The Theory and Practice of Compiler Writing* (McGraw Hill)
3. Keith D Cooper & Linda Torczon — *Engineering a Compiler* (Elsevier)
4. John C. Martin — *Introduction to Languages and Theory of Computation* (McGraw Hill)
5. Michael Sipser — *Theory of Computation* (Thomson)

---

## Practical List (LOP) — 30 hrs total

| # | Title | Hrs | Mapped CLOs |
|---|---|---|---|
| 1 | Get acquainted with the Lexical Analyzer Generator (Lex/Flex) tool to recognize tokens from a given source code fragment | 02 | 1,2,4 |
| 2 | Implement a Lexical Analyzer: define a source language + constructs (one control construct, two arithmetic operators, one loop construct); use Lex/Flex to generate a token stream after eliminating comments/extraneous tokens; report lexical errors with line numbers | 02 | 1,2,4 |
| 3 | Implement Symbol Table Generation: extend Exp. 2 to build a symbol table (identifier name, data type, address); add all unique identifiers | 04 | 1,4 |
| 4 | Implement a Syntax Analyzer: write a CFG for the language constructs; use Lex + YACC to validate syntax | 04 | 1,4 |
| 5 | Implement Error Recovery in the Syntax Analyzer: extend Exp. 4 with error recovery to detect/report syntax errors | 04 | 1,2,4 |
| 6 | Implement a Semantic Analyzer: semantic rules for declarations to update symbol data types; detect undeclared variables and redeclaration | 02 | 1,2,4 |
| 7 | Implement a Three-Address Code Generator for control statements | 04 | 1,2,4 |
| 8 | Implement an Assembly Code Generator: implement `getreg()` to allocate registers to TAC variables | 04 | 1,2,4 |
| 9 | Implement Code Optimization Techniques: implement any one code optimization technique | 02 | 1,2,4 |
| 10 | Optimize Register Allocation Using Graph Coloring | 02 | 1,3,4 |

---

## Innovative Assignment (context)
Separate from the practical list above — see [PROJECT_BRIEF.md](./PROJECT_BRIEF.md) and
[PROJECT_DESCRIPTION.md](./PROJECT_DESCRIPTION.md) for the GujLang compiler project
built for this requirement. Quick recap of the ask: working prototype + source code +
documentation, uploaded to LMS, presented/demonstrated live, explaining the compiler
design concepts and novelty used, individually or in a group of max 2.

---

## How This Maps to the GujLang Project

| Practical / Unit | Covered in GujLang project? |
|---|---|
| Unit II (Automata) | Underlies lexer's token recognition (regex-based token specs) |
| Unit III + Exp. 1–3 (Lexer, Symbol Table) | ✅ Dual-language lexer + symbol table |
| Unit IV + Exp. 4–5 (Syntax Analysis) | ✅ CFG + recursive-descent parser + error recovery |
| Unit V + Exp. 6–7 (Semantic Analysis, TAC) | ✅ Type checking, bilingual semantic errors, TAC + backpatching |
| Unit VI (Runtime Environment) | Partial — stack-VM model touches storage organization |
| Unit VII + Exp. 8–10 (Codegen, Optimization, Register Allocation) | ✅ Toggleable constant folding and dead code elimination; executable stack-VM backend plus inspectable pseudo-assembly backend with graph-color register allocation |
