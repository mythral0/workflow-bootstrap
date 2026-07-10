#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { loadConfig } from "./config.js";
import { detectProject } from "./detect.js";
import { writeGeneratedFiles } from "./files.js";
import { renderFiles } from "./render.js";
import { VERSION } from "./version.js";

interface Options {
  yes: boolean;
  force: boolean;
  dryRun: boolean;
  root: string;
}

function parseOptions(args: string[]): Options {
  let root = process.cwd();
  const positional = args.filter((arg) => !arg.startsWith("--"));
  if (positional[0]) root = resolve(positional[0]);
  return {
    yes: args.includes("--yes") || args.includes("-y"),
    force: args.includes("--force"),
    dryRun: args.includes("--dry-run"),
    root,
  };
}

async function confirm(question: string): Promise<boolean> {
  const terminal = createInterface({ input, output });
  const answer = await terminal.question(`${question} [y/N] `);
  terminal.close();
  return /^y(es)?$/i.test(answer.trim());
}

function printResult(result: ReturnType<typeof writeGeneratedFiles>, dryRun: boolean): void {
  const action = dryRun ? "Would write" : "Wrote";
  for (const path of result.written) console.log(`${action} ${path}`);
  for (const path of result.unchanged) console.log(`Unchanged ${path}`);
  if (result.conflicts.length > 0) {
    console.error("Refusing to overwrite existing files:");
    for (const path of result.conflicts) console.error(`- ${path}`);
    console.error("Review the files, then rerun with --force to replace them.");
    process.exitCode = 1;
  }
}

async function init(args: string[]): Promise<void> {
  const options = parseOptions(args);
  const config = detectProject(options.root);
  console.log(`Detected ${config.ci.runtime} project '${config.project.name}'.`);
  console.log(`Detected ${config.containers.components.length} container component(s).`);
  console.log(`Detected ${config.deployment.staging.updates.length} staging and ${config.deployment.production.updates.length} production GitOps update(s).`);
  if (!options.yes && !(await confirm("Generate workflow configuration?"))) {
    console.log("No files changed.");
    return;
  }
  printResult(writeGeneratedFiles(options.root, renderFiles(config), options), options.dryRun);
}

function sync(args: string[]): void {
  const options = parseOptions(args);
  const config = loadConfig(options.root);
  printResult(writeGeneratedFiles(options.root, renderFiles(config), { ...options, force: true }), options.dryRun);
}

function check(args: string[]): void {
  const options = parseOptions(args);
  const config = loadConfig(options.root);
  const expected = renderFiles(config);
  const errors: string[] = [];
  for (const file of expected) {
    const path = resolve(options.root, file.path);
    if (!existsSync(path)) {
      errors.push(`${file.path} is missing`);
    } else if (readFileSync(path, "utf8") !== file.content) {
      errors.push(`${file.path} has drifted; run workflow-bootstrap sync`);
    }
  }
  for (const update of [...config.deployment.staging.updates, ...config.deployment.production.updates]) {
    if (!existsSync(resolve(options.root, update.file))) errors.push(`GitOps update file is missing: ${update.file}`);
  }
  if (errors.length > 0) throw new Error(errors.join("\n"));
  console.log(`Workflow configuration is valid (${expected.length} generated files).`);
}

function help(): void {
  console.log(`workflow-bootstrap <command> [directory] [options]

Commands:
  init     Detect a project and generate its configuration and workflows
  sync     Regenerate workflows from .workflow-bootstrap.yml
  check    Validate configuration and detect generated-file drift

Options:
  -y, --yes     Accept detected settings without prompting
  --force       Replace conflicting files during init
  --dry-run     Report changes without writing files
  -h, --help    Show this help
  -v, --version Show the installed package version`);
}

async function main(): Promise<void> {
  const [command = "help", ...args] = process.argv.slice(2);
  if (command === "-h" || command === "--help" || command === "help") return help();
  if (command === "-v" || command === "--version") {
    console.log(VERSION);
    return;
  }
  if (command === "init") return init(args);
  if (command === "sync") return sync(args);
  if (command === "check") return check(args);
  throw new Error(`Unknown command '${command}'. Run workflow-bootstrap --help.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
