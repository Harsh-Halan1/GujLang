import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { compile } from "./compiler";

const inputPath = process.argv[2];
if (!inputPath) {
  console.error("Usage: gujlang <source-file> [--no-run]");
  process.exitCode = 2;
} else {
  const source = readFileSync(resolve(inputPath), "utf8");
  const result = compile(source, { run: !process.argv.includes("--no-run") });
  if (result.diagnostics.length) {
    for (const item of result.diagnostics) {
      console.error(
        `${item.phase} ${item.code} at ${item.span.line}:${item.span.column}: ${item.message} [${item.gujlangMessage}]`,
      );
    }
    process.exitCode = 1;
  } else {
    console.log("TAC:");
    for (const line of result.tac ?? []) console.log(`  ${line}`);
    console.log("\nRegister allocated pseudo-assembly:");
    for (const line of result.registerAllocation?.assembly ?? []) console.log(`  ${line}`);
    console.log(`\nRegister map: ${JSON.stringify(result.registerAllocation?.registers ?? {})}`);
    console.log(`Spills: ${result.registerAllocation?.spills.join(", ") || "none"}`);
    if (result.runtime) {
      console.log("\nProgram output:");
      for (const line of result.runtime.output) console.log(line);
    }
  }
}
