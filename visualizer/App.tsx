import { lazy, Suspense, useMemo, useRef, useState } from "react";
import type { Stmt, TypeName } from "../src/ast";
import { type CompileResult, compile } from "../src/compiler";
import type { Token } from "../src/lexer";
import type { GujLangEditorHandle } from "./GujLangEditor";

const GujLangEditor = lazy(() =>
  import("./GujLangEditor").then((module) => ({ default: module.GujLangEditor })),
);

type Tab = "overview" | "tokens" | "syntax" | "symbols" | "ir" | "assembly" | "run" | "errors";
type Guide = "language" | "compiler";
type Demo = { title: string; source: string; description: string };
const demos: Demo[] = [
  {
    title: "Branching",
    source: `rakh x = 5\njo x > 3 to kar\n  bolo "moto che"\nbas\nnahi to kar\n  bolo "nano che"\nbas`,
    description: "A conditional, paired blocks, and a string output.",
  },
  {
    title: "Counter loop",
    source: `rakh i = 0\njyare i < 4 kar\n  bolo i\n  i = i + 1\nbas`,
    description: "A loop that updates and prints a global variable.",
  },
  {
    title: "Optimization",
    source: `rakh answer = (2 + 3) * 4\nbolo answer`,
    description: "Compare constant folding and dead-code elimination.",
  },
  {
    title: "Multiple errors",
    source: `rakh = 4\nbolo unknown\nrakh ready = sacu\nready = 2`,
    description: "Inspect parser recovery and semantic diagnostics.",
  },
  {
    title: "Recursive function",
    source: `kaam factorial(n: int) -> int kar\n  jo n <= 1 to kar\n    pachu aap 1\n  bas\n  pachu aap n * factorial(n - 1)\nbas\nrakh answer = factorial(5)\nbolo answer`,
    description: "A recursive function with typed parameters, branching, and a return value.",
  },
  {
    title: "Loop control",
    source: `rakh i = 0\njyare i < 8 kar\n  i = i + 1\n  jo i == 2 to kar\n    aagad\n  bas\n  jo i == 6 to kar\n    rokay\n  bas\n  bolo i\nbas`,
    description: "Skip one iteration and then exit the nearest loop early.",
  },
];
const keywordRows = [
  ["if / then / else", "jo / to / nahi to"],
  ["while", "jyare"],
  ["do / end", "kar / bas"],
  ["var / let", "rakh"],
  ["print", "bolo"],
  ["true / false", "sacu / khotu"],
  ["and / or / not", "ane / athva / nathi"],
  ["function / return", "kaam / pachu aap"],
  ["break / continue", "rokay / aagad"],
];

const initialSource = demos[0].source;
const ruleFor = (statement: Stmt) =>
  ({
    declare: "decl_stmt := 'rakh' IDENT '=' expr",
    assign: "assign_stmt := IDENT '=' expr",
    print: "print_stmt := 'bolo' (expr | STRING)",
    call: "call_stmt := IDENT '(' arguments? ')'",
    return: "return_stmt := 'pachu aap' expr",
    break: "break_stmt := 'rokay'",
    continue: "continue_stmt := 'aagad'",
    if: "if_stmt := ('jo' | 'if') expr ('to' | 'then') block (('nahi to' | 'else') block)?",
    while: "while_stmt := ('jyare' | 'while') expr block",
  })[statement.kind];
function AstNode({ value }: { value: unknown }) {
  if (!value || typeof value !== "object") return <span>{String(value)}</span>;
  const node = value as Record<string, unknown>;
  const title =
    node.kind === "module"
      ? "module := top_level* EOF"
      : node.kind === "function"
        ? "function_decl := 'kaam' IDENT '(' parameters ')' '->' type block"
        : node.kind === "call"
          ? "call := IDENT '(' arguments? ')'"
          : node.kind === "return"
            ? "return_stmt := 'pachu aap' expr"
            : node.kind === "program"
              ? "program := stmt_list EOF"
              : node.kind === "binary"
                ? "expr := expr operator expr"
                : node.kind === "unary"
                  ? "unary_expr := operator expr"
                  : node.kind === "variable"
                    ? "primary := IDENT"
                    : node.kind === "number"
                      ? "primary := NUMBER"
                      : node.kind === "boolean"
                        ? "primary := boolean literal"
                        : node.kind === "string"
                          ? "STRING (valid directly after bolo)"
                          : (ruleFor(node as unknown as Stmt) ?? String(node.kind));
  return (
    <details
      className="ast-node"
      open={node.kind === "module" || node.kind === "program"}
      title={title}
    >
      <summary>
        <span className="node-kind">{String(node.kind)}</span>
        {node.name ? <code>{String(node.name)}</code> : null}
        {node.op ? <code>{String(node.op)}</code> : null}
        {node.value !== undefined ? <code>{String(node.value)}</code> : null}
        <small>{title}</small>
      </summary>
      <div className="ast-children">
        {Object.entries(node)
          .filter(([key]) => !["kind", "span", "name", "op", "value"].includes(key))
          .map(([key, child]) => (
            <div key={key}>
              <em>{key}</em>
              {Array.isArray(child) ? (
                child.map((item, index) => <AstNode key={index} value={item} />)
              ) : child && typeof child === "object" ? (
                <AstNode value={child} />
              ) : (
                <span>{String(child)}</span>
              )}
            </div>
          ))}
      </div>
    </details>
  );
}

function TokenTable({ tokens, onSelect }: { tokens: Token[]; onSelect: (token: Token) => void }) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Kind</th>
            <th>Lexeme</th>
            <th>Source range</th>
          </tr>
        </thead>
        <tbody>
          {tokens
            .filter((token) => token.type !== "EOF")
            .map((token, index) => (
              <tr key={`${token.span.start}-${index}`}>
                <td>
                  <span className={`tag ${token.kind}`}>{token.type}</span>
                </td>
                <td>
                  <button
                    type="button"
                    className="token-select"
                    onClick={() => onSelect(token)}
                    aria-label={`Select source token ${token.lexeme}`}
                  >
                    <code>{token.lexeme}</code>
                  </button>
                </td>
                <td>
                  {token.span.line}:{token.span.column}–{token.span.endLine}:{token.span.endColumn}
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}

function historyFor(
  result: CompileResult,
): { statement: string; snapshot: { name: string; type: TypeName | string }[] }[] {
  if (!result.program) return [];
  const history: { statement: string; snapshot: { name: string; type: TypeName | string }[] }[] =
    [];
  const visit = (
    statements: Stmt[],
    scope: string,
    symbols: Map<string, TypeName | string>,
    known: Map<string, TypeName | string>,
  ) => {
    for (const statement of statements) {
      if (statement.kind === "declare")
        symbols.set(
          statement.name,
          result.expressionTypes?.get(statement.initializer) ??
            known.get(statement.name) ??
            "unknown",
        );
      const label =
        statement.kind === "assign"
          ? `assign ${statement.name}`
          : statement.kind === "call"
            ? `call ${statement.expression.name}`
            : statement.kind;
      history.push({
        statement: scope === "global" ? label : `${scope} · ${label}`,
        snapshot: [...symbols].map(([name, type]) => ({ name, type })),
      });
      if (statement.kind === "if") {
        visit(statement.thenBlock, scope, symbols, known);
        if (statement.elseBlock) visit(statement.elseBlock, scope, symbols, known);
      }
      if (statement.kind === "while") visit(statement.body, scope, symbols, known);
    }
  };
  const globalSymbols = (result.symbols ?? []).filter((symbol) => symbol.role === "global");
  visit(
    result.program.statements,
    "global",
    new Map(),
    new Map(globalSymbols.map((symbol) => [symbol.name, symbol.type])),
  );
  for (const fn of result.functions ?? []) {
    const functionSymbols = (result.symbols ?? []).filter(
      (symbol) => symbol.scope === fn.name && symbol.role !== "function",
    );
    const parameters = functionSymbols.filter((symbol) => symbol.role === "parameter");
    visit(
      fn.body,
      fn.name,
      new Map(parameters.map((symbol) => [symbol.name, symbol.type])),
      new Map(functionSymbols.map((symbol) => [symbol.name, symbol.type])),
    );
  }
  return history;
}

export default function App() {
  const [source, setSource] = useState(initialSource);
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [constantFolding, setConstantFolding] = useState(true);
  const [deadCodeElimination, setDeadCodeElimination] = useState(true);
  const [demoIndex, setDemoIndex] = useState(0);
  const [showKeywords, setShowKeywords] = useState(false);
  const [showDocumentation, setShowDocumentation] = useState(false);
  const [activeGuide, setActiveGuide] = useState<Guide>("language");
  const [traceIndex, setTraceIndex] = useState(0);
  const [runRequested, setRunRequested] = useState(false);
  const editor = useRef<GujLangEditorHandle>(null);
  const sourceEpoch = useRef(0);
  const result = useMemo(
    () =>
      compile(source, {
        run: runRequested,
        captureTrace: runRequested,
        optimizations: { constantFolding, deadCodeElimination },
      }),
    [source, constantFolding, deadCodeElimination, runRequested],
  );
  const successful = !!result.bytecode;
  const diagnosticCount = result.diagnostics.length;
  const history = historyFor(result);
  const trace = result.runtime?.trace ?? [];
  const frame = trace[Math.min(traceIndex, Math.max(0, trace.length - 1))];
  const selectToken = (token: Token) => {
    editor.current?.selectRange(token.span.start, token.span.end);
  };
  const inspectPhase = (tab: Tab) => {
    setActiveTab(tab);
    setShowDocumentation(false);
  };
  const loadDemo = (direction: number) => {
    const next = (demoIndex + direction + demos.length) % demos.length;
    setDemoIndex(next);
    sourceEpoch.current++;
    setSource(demos[next].source);
    setTraceIndex(0);
    setRunRequested(false);
  };
  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "overview", label: "Overview" },
    {
      id: "tokens",
      label: "Tokens",
      count: result.tokens.filter((token) => token.type !== "EOF").length,
    },
    { id: "syntax", label: "Syntax" },
    { id: "symbols", label: "Symbols", count: result.symbols.length },
    { id: "ir", label: "TAC & optimize" },
    { id: "assembly", label: "Registers" },
    { id: "run", label: "Run" },
    { id: "errors", label: "Errors", count: diagnosticCount },
  ];

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="/">
          <span className="brand-mark">G</span>
          <span>
            GujLang<small>Compiler learning studio</small>
          </span>
        </a>
        <div className="top-actions">
          <span className="status">
            <i /> Core compiler ready
          </span>
          <button type="button" className="quiet" onClick={() => setShowKeywords(true)}>
            Keyword guide
          </button>
          <button
            type="button"
            className="quiet documentation-trigger"
            onClick={() => setShowDocumentation(true)}
          >
            Documentation
          </button>
          <button
            type="button"
            className="primary"
            onClick={() => {
              setRunRequested(true);
              setActiveTab("run");
              setTraceIndex(0);
            }}
          >
            ▶ Run program
          </button>
        </div>
      </header>
      <section className="hero">
        <div>
          <p className="eyebrow">PRINCIPLES OF COMPILER DESIGN · V2</p>
          <h1>
            See how your program
            <br />
            <span>becomes a program.</span>
          </h1>
          <p className="hero-copy">
            Follow GujLang through each compiler phase—from source tokens to executable VM steps.
          </p>
        </div>
        <div className="hero-card">
          <span className="hero-card-icon">⌘</span>
          <div>
            <strong>
              {successful
                ? "Compilation succeeded"
                : `${diagnosticCount} issue${diagnosticCount === 1 ? "" : "s"} found`}
            </strong>
            <small>
              {result.tokens.length - 1} tokens · {result.symbols.length} symbols ·{" "}
              {result.tac?.length ?? 0} optimized TAC lines
            </small>
          </div>
          <span className="live-dot" />
        </div>
      </section>
      <section className="workspace">
        <div className="editor-panel">
          <div className="panel-heading">
            <div>
              <span className="section-index">01</span>
              <strong>Source program</strong>
            </div>
            <span className="language-pill">GUJLANG · V2</span>
          </div>
          <div className="editor-wrap">
            <Suspense fallback={<div className="editor-loading">Loading code editor…</div>}>
              <GujLangEditor
                editorRef={editor}
                value={source}
                sourceEpoch={sourceEpoch.current}
                onChange={(nextSource) => {
                  setSource(nextSource);
                  setTraceIndex(0);
                  setRunRequested(false);
                }}
              />
            </Suspense>
          </div>
          <div className="editor-footer">
            <span>
              <span className="keycap">⌘</span> Editing recompiles each phase
            </span>
            <div>
              <button
                type="button"
                className="quiet small"
                onClick={() => {
                  sourceEpoch.current++;
                  setSource("");
                  setRunRequested(false);
                }}
              >
                Clear
              </button>
              <button
                type="button"
                className="quiet small"
                onClick={() => {
                  sourceEpoch.current++;
                  setSource(initialSource);
                  setDemoIndex(0);
                  setRunRequested(false);
                }}
              >
                Reset
              </button>
            </div>
          </div>
          <div className="demo-card">
            <div>
              <span className="demo-label">
                DEMO {String(demoIndex + 1).padStart(2, "0")} /{" "}
                {String(demos.length).padStart(2, "0")}
              </span>
              <strong>{demos[demoIndex].title}</strong>
              <small>{demos[demoIndex].description}</small>
            </div>
            <div className="demo-controls">
              <button type="button" aria-label="Previous demo" onClick={() => loadDemo(-1)}>
                ←
              </button>
              <button type="button" aria-label="Next demo" onClick={() => loadDemo(1)}>
                →
              </button>
            </div>
          </div>
          <div className="phase-mini">
            <span>LEXER</span>
            <b>›</b>
            <span>PARSER</span>
            <b>›</b>
            <span>SEMANTICS</span>
            <b>›</b>
            <span>VM</span>
          </div>
        </div>
        <div className="results-panel">
          <nav className="tabs" aria-label="Compiler phases">
            {tabs.map((tab) => (
              <button
                type="button"
                className={activeTab === tab.id ? "active" : ""}
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
                {tab.count !== undefined && <span>{tab.count}</span>}
              </button>
            ))}
          </nav>
          <div className="tab-content">
            {activeTab === "overview" && (
              <div className="overview-grid">
                <div className="overview-title">
                  <span className="eyebrow">COMPILATION FLOW</span>
                  <h2>Every phase, explained.</h2>
                  <p>Choose a phase tab to inspect the compiler’s work.</p>
                </div>
                {[
                  ["A", "Lexical analysis", "Recognize keywords, literals, and names", "tokens"],
                  ["B", "Syntax analysis", "Build the AST from grammar rules", "syntax"],
                  ["C", "Semantic analysis", "Resolve names and check types", "symbols"],
                  ["D", "Intermediate code", "Lower statements into labeled TAC", "ir"],
                  ["E", "Optimization", "Toggle independent TAC passes", "ir"],
                  ["F", "Code generation", "Compare VM bytecode and colored registers", "assembly"],
                ].map(([letter, title, description, tab]) => (
                  <button
                    type="button"
                    className="phase-card"
                    key={letter}
                    onClick={() => setActiveTab(tab as Tab)}
                  >
                    <span>{letter}</span>
                    <strong>{title}</strong>
                    <small>{description}</small>
                    <b>↗</b>
                  </button>
                ))}
              </div>
            )}
            {activeTab === "tokens" && (
              <section className="phase-view">
                <div className="view-title">
                  <div>
                    <span className="eyebrow">PHASE 01</span>
                    <h2>Token stream</h2>
                  </div>
                  <span className="count-pill">{result.tokens.length - 1} tokens</span>
                </div>
                <p className="helper">Select a token to highlight its exact span in the editor.</p>
                <TokenTable tokens={result.tokens} onSelect={selectToken} />
              </section>
            )}
            {activeTab === "syntax" && (
              <section className="phase-view">
                <div className="view-title">
                  <div>
                    <span className="eyebrow">PHASE 02</span>
                    <h2>Abstract syntax tree</h2>
                  </div>
                  {result.program && (
                    <span className="count-pill">
                      {result.functions?.length ?? 0} functions · {result.program.statements.length}{" "}
                      top-level statements
                    </span>
                  )}
                </div>
                <p className="helper">
                  Open a node’s grammar hint to see the production rule that created it.
                </p>
                {result.program ? (
                  <div className="ast-root">
                    <AstNode
                      value={{
                        kind: "module",
                        functions: result.functions ?? [],
                        program: result.program,
                      }}
                    />
                  </div>
                ) : (
                  <EmptyState text="The parser needs a valid program before an AST can be shown." />
                )}
              </section>
            )}
            {activeTab === "symbols" && (
              <section className="phase-view">
                <div className="view-title">
                  <div>
                    <span className="eyebrow">PHASE 03</span>
                    <h2>Symbol table history</h2>
                  </div>
                  <span className="count-pill">Global + function-local scopes</span>
                </div>
                <p className="helper">
                  Declarations become visible in order; functions have separate per-call locals.
                </p>
                {history.length ? (
                  <div className="history-list">
                    {history.map((step, index) => (
                      <article key={`${step.statement}-${index}`} className="history-step">
                        <span className="history-index">{String(index + 1).padStart(2, "0")}</span>
                        <div>
                          <strong>{step.statement}</strong>
                          <div className="symbol-snapshot">
                            {step.snapshot.length ? (
                              step.snapshot.map((symbol) => (
                                <span key={symbol.name}>
                                  <code>{symbol.name}</code>
                                  <small>{symbol.type}</small>
                                </span>
                              ))
                            ) : (
                              <small>No declared variables yet</small>
                            )}
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <EmptyState text="No valid declarations to show yet." />
                )}
                {result.symbols.some(
                  (symbol) => symbol.role === "parameter" || symbol.role === "local",
                ) && (
                  <div className="history-list function-symbols">
                    {[
                      ...new Set(
                        result.symbols
                          .filter(
                            (symbol) => symbol.role === "parameter" || symbol.role === "local",
                          )
                          .map((symbol) => symbol.scope),
                      ),
                    ].map((scope) => (
                      <article key={scope} className="history-step">
                        <span className="history-index">FN</span>
                        <div>
                          <strong>{scope} · local frame</strong>
                          <div className="symbol-snapshot">
                            {result.symbols
                              .filter(
                                (symbol) =>
                                  symbol.scope === scope &&
                                  (symbol.role === "parameter" || symbol.role === "local"),
                              )
                              .map((symbol, index) => (
                                <span key={`${scope}-${symbol.name}-${index}`}>
                                  <code>{symbol.name}</code>
                                  <small>
                                    {symbol.type} · {symbol.role}
                                  </small>
                                </span>
                              ))}
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
                {result.symbols.some((symbol) => symbol.role === "function") && (
                  <div className="history-list function-symbols">
                    {result.symbols
                      .filter((symbol) => symbol.role === "function")
                      .map((symbol) => (
                        <article key={`function-${symbol.name}`} className="history-step">
                          <span className="history-index">FN</span>
                          <div>
                            <strong>{symbol.name} · function</strong>
                            <div className="symbol-snapshot">
                              <span>
                                <code>
                                  (
                                  {symbol.parameters
                                    ?.map((parameter) => `${parameter.name}: ${parameter.type}`)
                                    .join(", ")}
                                  ) → {symbol.type}
                                </code>
                                <small>signature</small>
                              </span>
                            </div>
                          </div>
                        </article>
                      ))}
                  </div>
                )}
              </section>
            )}
            {activeTab === "ir" && (
              <section className="phase-view">
                <div className="view-title">
                  <div>
                    <span className="eyebrow">PHASE 04 · 05</span>
                    <h2>TAC & optimization</h2>
                  </div>
                  <span className="count-pill">
                    {result.optimizationAnnotations?.length ?? 0} rule notes
                  </span>
                </div>
                <div className="toggle-row">
                  <label>
                    <input
                      type="checkbox"
                      checked={constantFolding}
                      onChange={(event) => setConstantFolding(event.target.checked)}
                    />{" "}
                    Constant folding
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={deadCodeElimination}
                      onChange={(event) => setDeadCodeElimination(event.target.checked)}
                    />{" "}
                    Dead-code elimination
                  </label>
                </div>
                <div className="code-columns">
                  <CodeList title="Before optimization" lines={result.rawTac ?? []} />
                  <CodeList
                    title="After optimization"
                    lines={result.tac ?? []}
                    annotations={result.optimizationAnnotations}
                  />
                </div>
                <div className="annotation-list">
                  {result.optimizationAnnotations?.map((annotation) => (
                    <span key={annotation}>✦ {annotation}</span>
                  ))}
                </div>
              </section>
            )}
            {activeTab === "assembly" && (
              <section className="phase-view">
                <div className="view-title">
                  <div>
                    <span className="eyebrow">PHASE 06</span>
                    <h2>Register allocation</h2>
                  </div>
                  <span className="count-pill">Graph coloring</span>
                </div>
                <p className="helper">
                  Inspectable teaching output; the stack VM remains the executable backend.
                </p>
                {result.registerAllocation ? (
                  <>
                    <CodeList
                      title="Register-allocated pseudo-assembly"
                      lines={result.registerAllocation.assembly}
                    />
                    <div className="allocation-summary">
                      <div>
                        <small>REGISTER MAP</small>
                        <p>
                          {Object.entries(result.registerAllocation.registers).map(
                            ([name, register]) => (
                              <span key={name}>
                                <code>{name}</code> → <b>{register}</b>
                              </span>
                            ),
                          )}
                        </p>
                      </div>
                      <div>
                        <small>SPILLS</small>
                        <p>
                          {result.registerAllocation.spills.length ? (
                            result.registerAllocation.spills.map((name) => (
                              <code key={name}>{name}</code>
                            ))
                          ) : (
                            <span className="success-text">None needed</span>
                          )}
                        </p>
                      </div>
                      <div>
                        <small>INTERFERENCE EDGES</small>
                        <p>
                          {result.registerAllocation.interference.map(([a, b]) => (
                            <span key={`${a}-${b}`}>
                              <code>{a}</code> — <code>{b}</code>
                            </span>
                          ))}
                        </p>
                      </div>
                    </div>
                  </>
                ) : (
                  <EmptyState text="Code generation waits for valid source." />
                )}
              </section>
            )}
            {activeTab === "run" && (
              <section className="phase-view">
                <div className="view-title">
                  <div>
                    <span className="eyebrow">EXECUTION</span>
                    <h2>Step through the VM</h2>
                  </div>
                  <span className="count-pill">{result.runtime?.steps ?? 0} instructions</span>
                </div>
                {trace.length ? (
                  <>
                    <div className="step-controls">
                      <button
                        type="button"
                        onClick={() => setTraceIndex(Math.max(0, traceIndex - 1))}
                      >
                        ← Previous
                      </button>
                      <span>
                        Step {Math.min(traceIndex + 1, trace.length)} of {trace.length}
                      </span>
                      <button
                        type="button"
                        onClick={() => setTraceIndex(Math.min(trace.length - 1, traceIndex + 1))}
                      >
                        Next →
                      </button>
                    </div>
                    <input
                      className="trace-slider"
                      type="range"
                      min={0}
                      max={trace.length - 1}
                      value={Math.min(traceIndex, trace.length - 1)}
                      onChange={(event) => setTraceIndex(Number(event.target.value))}
                    />
                    <div className="vm-grid">
                      <CodeList
                        title={`PC ${frame?.pc ?? 0} · current instruction`}
                        lines={[frame ? JSON.stringify(frame.instruction) : "—"]}
                      />
                      <div className="vm-state">
                        <h3>VM state after instruction</h3>
                        <small>CALL FRAME</small>
                        <p>
                          {frame?.functionName ?? "main"} · depth {frame?.callDepth ?? 0}
                        </p>
                        <small>STACK</small>
                        <p>
                          {frame?.stack.length ? (
                            frame.stack.map((value, index) => (
                              <code key={index}>{String(value)}</code>
                            ))
                          ) : (
                            <i>empty</i>
                          )}
                        </p>
                        <small>VARIABLES</small>
                        <p>
                          {Object.entries(frame?.variables ?? {}).map(([name, value]) => (
                            <span key={name}>
                              <code>{name}</code> = {String(value)}
                            </span>
                          ))}
                        </p>
                        <small>OUTPUT</small>
                        <p className="output-box">
                          {result.runtime?.output.slice(0, frame?.outputLength ?? 0).join("\n") ||
                            "No output yet"}
                        </p>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="run-empty">
                    <EmptyState
                      text={
                        successful
                          ? "Run the compiled bytecode to inspect its stack, variables, and output."
                          : "Fix compile errors before running the VM."
                      }
                    />
                    {successful && (
                      <button
                        type="button"
                        className="primary"
                        onClick={() => setRunRequested(true)}
                      >
                        ▶ Run VM
                      </button>
                    )}
                  </div>
                )}
              </section>
            )}
            {activeTab === "errors" && (
              <section className="phase-view">
                <div className="view-title">
                  <div>
                    <span className="eyebrow">DIAGNOSTICS</span>
                    <h2>Errors & recovery</h2>
                  </div>
                  <span className={`count-pill ${diagnosticCount ? "warning-pill" : ""}`}>
                    {diagnosticCount} found
                  </span>
                </div>
                {diagnosticCount ? (
                  <div className="diagnostic-list">
                    {result.diagnostics.map((diagnostic, index) => (
                      <article key={`${diagnostic.code}-${index}`}>
                        <div>
                          <span className="tag error-tag">
                            {diagnostic.phase} · {diagnostic.code}
                          </span>
                          <span className="diagnostic-location">
                            Line {diagnostic.span.line}, column {diagnostic.span.column}
                          </span>
                        </div>
                        <strong>{diagnostic.message}</strong>
                        <small>{diagnostic.gujlangMessage}</small>
                        {diagnostic.recovery && (
                          <small>
                            Recovered at {diagnostic.recovery.line}:{diagnostic.recovery.column}
                          </small>
                        )}
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="all-clear">
                    <span>✓</span>
                    <div>
                      <strong>No compiler errors</strong>
                      <small>Lexical, syntax, and semantic phases completed cleanly.</small>
                    </div>
                  </div>
                )}
              </section>
            )}
          </div>
        </div>
      </section>
      <footer>
        <span>
          GUJLANG STUDIO <i /> Compiler core v0.1
        </span>
        <span>Built for learning compiler design</span>
      </footer>
      {showDocumentation && (
        <div className="modal-backdrop documentation-backdrop" role="presentation">
          <section
            className="documentation-modal"
            role="dialog"
            aria-modal="true"
            aria-label="GujLang documentation"
          >
            <header className="documentation-header">
              <div>
                <span className="eyebrow">GUJLANG · V2 REFERENCE</span>
                <h2>Documentation</h2>
              </div>
              <button
                type="button"
                className="modal-close documentation-close"
                onClick={() => setShowDocumentation(false)}
                aria-label="Close documentation"
              >
                ×
              </button>
            </header>
            <nav className="documentation-nav" aria-label="Documentation sections">
              <button
                type="button"
                className={activeGuide === "language" ? "active" : ""}
                onClick={() => setActiveGuide("language")}
              >
                Language guide
              </button>
              <button
                type="button"
                className={activeGuide === "compiler" ? "active" : ""}
                onClick={() => setActiveGuide("compiler")}
              >
                Compiler guide
              </button>
            </nav>
            <div className="documentation-scroll">
              {activeGuide === "language" && (
                <section className="phase-view documentation-view">
                  <div className="view-title">
                    <div>
                      <span className="eyebrow">REFERENCE · V2</span>
                      <h2>GujLang language guide</h2>
                    </div>
                  </div>
                  <p className="helper">
                    A compact guide to the syntax and rules implemented by this compiler.
                  </p>
                  <div className="documentation-grid">
                    <article className="documentation-card">
                      <span className="demo-label">A PROGRAM</span>
                      <pre>{`rakh total = 0
rakh i = 1
jyare i <= 5 kar
  total = total + i
  i = i + 1
bas
bolo total`}</pre>
                      <p>Declarations, assignments, loops, and output run from top to bottom.</p>
                    </article>
                    <article className="documentation-card">
                      <span className="demo-label">KEYWORDS</span>
                      <div className="guide-pairs">
                        {keywordRows.slice(0, 8).map(([english, gujlang]) => (
                          <div key={english}>
                            <code>{gujlang}</code>
                            <span>{english}</span>
                          </div>
                        ))}
                      </div>
                      <p>
                        English aliases are also accepted; both spellings compile to the same token.
                      </p>
                    </article>
                    <article className="documentation-card">
                      <span className="demo-label">BLOCKS AND CONDITIONS</span>
                      <pre>{`jo ready ane count > 0 to kar
  bolo "ready"
bas
nahi to kar
  bolo "not ready"
bas`}</pre>
                      <p>
                        Every <code>kar</code> opens one block and must have its own{" "}
                        <code>bas</code>.
                      </p>
                    </article>
                    <article className="documentation-card">
                      <span className="demo-label">TYPES AND SCOPE</span>
                      <ul>
                        <li>
                          Types are inferred at declaration: <code>int</code>, <code>float</code>,
                          or <code>bool</code>.
                        </li>
                        <li>Variable types stay fixed after declaration.</li>
                        <li>Integer and float arithmetic can mix; division produces a float.</li>
                        <li>
                          Top-level variables are global; each function has a separate flat local
                          scope.
                        </li>
                        <li>
                          Functions use typed parameters, a typed return, and may call themselves
                          recursively.
                        </li>
                        <li>
                          Strings are accepted only as direct <code>bolo</code> arguments.
                        </li>
                      </ul>
                    </article>
                    <article className="documentation-card">
                      <span className="demo-label">FUNCTIONS AND RETURNS</span>
                      <pre>{`kaam add(a: int, b: int) -> int kar
  pachu aap a + b
bas
rakh total = add(2, 3)
bolo total`}</pre>
                      <p>
                        Calls pass values into a fresh local frame. Parameters and local variables
                        cannot read global variables, and every function path must return the
                        declared type. Recursive calls are supported.
                      </p>
                    </article>
                    <article className="documentation-card">
                      <span className="demo-label">EXPRESSIONS AND COMMENTS</span>
                      <pre>{`# full-line comment
rakh price = 12.5 // inline comment
rakh discounted = price * 0.9
rakh valid = discounted <= 20
bolo valid`}</pre>
                      <p>
                        Expressions use parentheses and unary signs alongside arithmetic,
                        comparisons, and boolean operators. Comments start with <code>#</code> or
                        <code>{"//"}</code> and continue to the end of the line.
                      </p>
                    </article>
                    <article className="documentation-card">
                      <span className="demo-label">OPERATOR PRECEDENCE · LOW TO HIGH</span>
                      <ol>
                        <li>
                          <code>athva</code> (or)
                        </li>
                        <li>
                          <code>ane</code> (and)
                        </li>
                        <li>
                          <code>nathi</code> (not)
                        </li>
                        <li>
                          Comparisons: <code>&gt; &lt; &gt;= &lt;= == !=</code>
                        </li>
                        <li>
                          <code>+ -</code>, then <code>* /</code>, then unary <code>-</code>
                        </li>
                      </ol>
                      <p>
                        Comparisons cannot be chained; combine them with <code>ane</code>.
                      </p>
                    </article>
                    <article className="documentation-card">
                      <span className="demo-label">LOOP CONTROL</span>
                      <p>
                        <code>rokay</code> exits the nearest enclosing loop. <code>aagad</code>{" "}
                        skips to its next condition check. Both must appear inside a{" "}
                        <code>jyare</code>
                        loop, including when nested in a conditional.
                      </p>
                      <button
                        type="button"
                        className="quiet small"
                        onClick={() => {
                          setShowDocumentation(false);
                          setShowKeywords(true);
                        }}
                      >
                        Open full keyword table
                      </button>
                    </article>
                    <article className="documentation-card">
                      <span className="demo-label">ERRORS AND RECOVERY</span>
                      <ul>
                        <li>
                          Lexer errors identify the source location and skip the invalid character.
                        </li>
                        <li>
                          Parser errors recover at statement boundaries so later issues can still be
                          shown.
                        </li>
                        <li>Type and undeclared-name errors prevent code generation.</li>
                        <li>
                          Use the Errors phase tab to inspect diagnostics and recovery points.
                        </li>
                      </ul>
                    </article>
                  </div>
                </section>
              )}
              {activeGuide === "compiler" && (
                <section className="phase-view documentation-view">
                  <div className="view-title">
                    <div>
                      <span className="eyebrow">TEACHING NOTES · V2</span>
                      <h2>Compiler and runtime guide</h2>
                    </div>
                  </div>
                  <p className="helper">
                    Follow how source becomes executable instructions and where each course concept
                    appears.
                  </p>
                  <div className="pipeline-guide">
                    {[
                      [
                        "01",
                        "Lexical analysis",
                        "Groups source characters into typed tokens with line and column spans.",
                      ],
                      [
                        "02",
                        "Parsing",
                        "Checks the grammar and builds an abstract syntax tree; syntax errors recover at statement boundaries.",
                      ],
                      [
                        "03",
                        "Semantic analysis",
                        "Resolves declared variables and checks expression types before code generation.",
                      ],
                      [
                        "04",
                        "Three-address code",
                        "Lowers expressions and control flow into temporary values, labels, and jumps.",
                      ],
                      [
                        "05",
                        "Optimization",
                        "Toggle constant folding and dead-code elimination independently, then inspect the changed TAC.",
                      ],
                      [
                        "06",
                        "Backends and execution",
                        "The stack VM executes programs. Graph coloring assigns pseudo-registers for an inspectable second backend artifact.",
                      ],
                    ].map(([number, title, description]) => (
                      <article key={number}>
                        <span>{number}</span>
                        <div>
                          <strong>{title}</strong>
                          <p>{description}</p>
                        </div>
                      </article>
                    ))}
                  </div>
                  <div className="documentation-grid compiler-concepts">
                    <article className="documentation-card">
                      <span className="demo-label">WHAT TO LOOK FOR</span>
                      <ul>
                        <li>
                          <strong>Tokens:</strong> category, lexeme, and exact source range.
                        </li>
                        <li>
                          <strong>AST:</strong> tree structure with the grammar production for each
                          node.
                        </li>
                        <li>
                          <strong>Symbols:</strong> declaration order, inferred types, and flat
                          scope.
                        </li>
                        <li>
                          <strong>TAC:</strong> temporaries and labels that make control flow
                          explicit.
                        </li>
                      </ul>
                    </article>
                    <article className="documentation-card">
                      <span className="demo-label">COMPARING BACKENDS</span>
                      <p>
                        The stack VM is the executable backend. Register allocation is a teaching
                        artifact generated from TAC: inspect its interference graph, register map,
                        and spills to discuss graph coloring. It is not a native machine-code
                        backend.
                      </p>
                    </article>
                  </div>
                  <div className="documentation-note">
                    <strong>Runtime safeguards</strong>
                    <p>
                      Division by zero halts with a diagnostic. An instruction cap stops programs
                      that may loop forever. Static type errors block code generation.
                    </p>
                  </div>
                  <div className="guide-links">
                    <button
                      type="button"
                      onClick={() => {
                        setShowDocumentation(false);
                        inspectPhase("tokens");
                      }}
                    >
                      Inspect tokens →
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowDocumentation(false);
                        inspectPhase("syntax");
                      }}
                    >
                      Inspect the AST →
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowDocumentation(false);
                        inspectPhase("ir");
                      }}
                    >
                      Inspect TAC and optimizations →
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowDocumentation(false);
                        inspectPhase("assembly");
                      }}
                    >
                      Inspect register allocation →
                    </button>
                  </div>
                </section>
              )}
            </div>
          </section>
        </div>
      )}
      {showKeywords && (
        <div className="modal-backdrop" role="presentation">
          <section
            className="keyword-modal"
            role="dialog"
            aria-modal="true"
            aria-label="GujLang keyword guide"
          >
            <button type="button" className="modal-close" onClick={() => setShowKeywords(false)}>
              ×
            </button>
            <span className="eyebrow">QUICK REFERENCE</span>
            <h2>Keyword guide</h2>
            <p>English aliases and GujLang spellings map to the same compiler tokens.</p>
            <table>
              <thead>
                <tr>
                  <th>English</th>
                  <th>GujLang</th>
                </tr>
              </thead>
              <tbody>
                {keywordRows.map(([english, gujlang]) => (
                  <tr key={english}>
                    <td>{english}</td>
                    <td>
                      <code>{gujlang}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <small>Names and string contents remain unchanged.</small>
          </section>
        </div>
      )}
    </main>
  );
}

function CodeList({
  title,
  lines,
  annotations = [],
}: {
  title: string;
  lines: string[];
  annotations?: string[];
}) {
  return (
    <div className="code-list">
      <h3>{title}</h3>
      {lines.length ? (
        <ol>
          {lines.map((line, index) => {
            const assignmentTarget = line.split(" = ", 1)[0];
            const note = annotations.find((annotation) => {
              const separator = annotation.lastIndexOf(": ");
              return separator > 0 && annotation.slice(0, separator) === assignmentTarget;
            });
            return (
              <li key={`${index}-${line}`}>
                <code>{line}</code>
                {note && <small title={note}>✦</small>}
              </li>
            );
          })}
        </ol>
      ) : (
        <div className="empty-inline">No output for this phase.</div>
      )}
    </div>
  );
}
function EmptyState({ text }: { text: string }) {
  return (
    <div className="empty-state">
      <span>◇</span>
      <p>{text}</p>
    </div>
  );
}
