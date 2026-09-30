import { readFileSync } from "node:fs";
import { compile } from "../src/index";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Smoke test failed: ${message}`);
}

const branching = compile(`rakh x = 5
jo x > 3 to kar
  bolo "moto che"
bas
nahi to kar
  bolo "nano che"
bas`);
assert(!branching.diagnostics.length, "canonical nested if/else sample compiles");
assert(branching.runtime?.output[0] === "moto che", "if branch executes and prints text");
const branchingFixture = compile(readFileSync("samples/branching.guj", "utf8"));
assert(branchingFixture.runtime?.output[0] === "moto che", "canonical sample fixture runs");

const loop = compile(`rakh i = 0
jyare i < 3 kar
  bolo i
  i = i + 1
bas`);
assert(JSON.stringify(loop.runtime?.output) === JSON.stringify(["0", "1", "2"]), "loop executes");
const loopFixture = compile(readFileSync("samples/loop.guj", "utf8"));
assert(
  JSON.stringify(loopFixture.runtime?.output) === JSON.stringify(["0", "1", "2"]),
  "loop fixture runs",
);

const mixed = compile(`let total = 2 + 3 * 4
if total == 14 then do
  print total
end`);
assert(mixed.runtime?.output[0] === "14", "English keyword aliases and precedence work");
const mixedFixture = compile(readFileSync("samples/mixed-keywords.guj", "utf8"));
assert(mixedFixture.runtime?.output[0] === "14", "mixed keyword fixture runs");

const optimized = compile("bolo (2 + 3) * 4");
const unoptimized = compile("bolo (2 + 3) * 4", {
  optimizations: { constantFolding: false, deadCodeElimination: false },
});
assert(optimized.runtime?.output[0] === "20", "optimized code preserves execution output");
assert((optimized.tac?.length ?? 0) < (unoptimized.tac?.length ?? 0), "optimization reduces TAC");
assert((optimized.optimizationAnnotations?.length ?? 0) > 0, "optimization records fired rules");
assert(
  (optimized.registerAllocation?.assembly.length ?? 0) > 0,
  "register pseudo-assembly is generated",
);
assert(
  optimized.registerAllocation?.registers &&
    Object.keys(optimized.registerAllocation.registers).length > 0,
  "TAC values receive registers",
);
const branchDefs = new Set(
  (branching.tac ?? []).flatMap((line) => {
    const match = /^(t\d+) =/.exec(line);
    return match ? [match[1]] : [];
  }),
);
assert(branchDefs.has("t4"), "DCE keeps condition values used by branches");
assert(
  !(branching.tac ?? []).some((line) => line.startsWith("x =")),
  "DCE removes transitive dead assignments",
);

const invalid = compile(`rakh ready = sacu
ready = 3`);
assert(
  invalid.diagnostics.some((d) => d.code === "S009"),
  "static assignment type error is rejected",
);
assert(!invalid.bytecode, "invalid source does not reach code generation");
const invalidFixture = compile(readFileSync("samples/invalid-type.guj", "utf8"));
assert(
  invalidFixture.diagnostics.some((d) => d.code === "S009"),
  "invalid fixture is rejected",
);
const mixedComparison = compile("bolo 1 == 1.0");
assert(
  mixedComparison.diagnostics.some((d) => d.code === "S006"),
  "equality follows the documented same-type rule",
);

const breakOutsideLoop = compile("rokay");
assert(
  breakOutsideLoop.diagnostics.some((d) => d.code === "S020"),
  "break outside a loop is rejected",
);
const unsupportedReturn = compile("pachu aap 1");
assert(
  unsupportedReturn.diagnostics.some((d) => d.code === "S015"),
  "return is rejected outside a function",
);

const shortCircuitAnd = compile(`rakh x = 0
jo x != 0 ane 10 / x > 2 to kar
  bolo 1
bas`);
assert(
  !shortCircuitAnd.diagnostics.some((d) => d.message === "Division by zero"),
  "and short-circuits a guarded division",
);
const shortCircuitOr = compile("bolo sacu athva 1 / 0 > 0");
assert(
  shortCircuitOr.runtime?.output[0] === "true",
  "or short-circuits when the left side is true",
);

const factorial = compile(`kaam factorial(n: int) -> int kar
  jo n <= 1 to kar
    pachu aap 1
  bas
  pachu aap n * factorial(n - 1)
bas
rakh result = factorial(5)
bolo result`);
assert(factorial.runtime?.output[0] === "120", "recursive calls return through isolated VM frames");
assert(
  factorial.registerAllocation?.registers["factorial::n"] !== undefined,
  "function parameters participate in register allocation",
);

const callStatement = compile(`kaam announce() -> int kar
  bolo "called"
  pachu aap 0
bas
announce()`);
assert(callStatement.runtime?.output[0] === "called", "standalone calls can perform side effects");

const loopControl = compile(`rakh i = 0
jyare i < 8 kar
  i = i + 1
  jo i == 2 to kar
    aagad
  bas
  jo i == 6 to kar
    rokay
  bas
  bolo i
bas`);
assert(
  JSON.stringify(loopControl.runtime?.output) === JSON.stringify(["1", "3", "4", "5"]),
  "break and continue target the nearest loop",
);
const continueOutsideLoop = compile("aagad");
assert(
  continueOutsideLoop.diagnostics.some((d) => d.code === "S021"),
  "continue outside a loop is rejected",
);

const conditionalDeclaration = compile(`jo khotu to kar
  rakh temp = 99
bas
bolo temp`);
assert(
  conditionalDeclaration.diagnostics.some((d) => d.code === "S022"),
  "conditional declarations cannot be read on paths where they did not execute",
);

const deadAfterReturn = compile(`kaam value() -> int kar
  pachu aap 1
  bolo "unreachable"
bas
rakh result = value()
bolo result`);
assert(
  !(deadAfterReturn.tac ?? []).some((line) => line.includes("unreachable")),
  "DCE removes unreachable instructions after a return",
);

const shortCircuitSyntax = compile("bolo 2 * nathi sacu");
assert(
  shortCircuitSyntax.diagnostics.some((d) => d.phase === "parser"),
  "not obeys the documented precedence",
);
const undocumentedOperators = compile("bolo sacu && khotu");
assert(
  undocumentedOperators.diagnostics.some((d) => d.phase === "lexer"),
  "C-style operators are rejected",
);

const notExpression = compile("bolo nathi nathi sacu");
assert(notExpression.runtime?.output[0] === "true", "not operator is right-recursive");

const divZero = compile("bolo 1 / 0");
assert(
  divZero.diagnostics.some((d) => d.phase === "runtime"),
  "division by zero halts gracefully",
);

const infinite = compile("jyare sacu kar\nbas", { instructionLimit: 30 });
assert(
  infinite.diagnostics.some((d) => d.message.includes("Instruction limit")),
  "instruction cap stops infinite loops",
);

const recovery = compile("rakh = 1\nbolo 2\nrakh = 3");
assert(
  recovery.diagnostics.filter((d) => d.phase === "parser").length >= 2,
  "parser reports multiple errors",
);
const recoveredSemantics = compile("rakh = 1\nbolo unknown\nrakh ready = sacu\nready = 2");
assert(
  recoveredSemantics.diagnostics.some((d) => d.code === "P001"),
  "parser errors are retained after recovery",
);
assert(
  recoveredSemantics.diagnostics.some((d) => d.code === "S001"),
  "semantic analysis continues after parser recovery",
);
assert(
  recoveredSemantics.diagnostics.some((d) => d.code === "S009"),
  "later type errors are reported after parser recovery",
);

console.log("GujLang smoke checks passed");
