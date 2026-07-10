import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { parse as parseYaml } from "yaml";
import type {
  CiConfig,
  Command,
  Component,
  HelmCheck,
  Runtime,
  WorkflowConfig,
  YamlUpdate,
} from "./types.js";

const SKIP_DIRECTORIES = new Set([
  ".git",
  ".next",
  ".turbo",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "tmp",
  "vendor",
]);

function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "application";
}

function walk(root: string, predicate: (name: string) => boolean, depth = 0): string[] {
  if (depth > 5) return [];
  const found: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRECTORIES.has(entry.name)) {
        found.push(...walk(join(root, entry.name), predicate, depth + 1));
      }
    } else if (entry.isFile() && predicate(entry.name)) {
      found.push(join(root, entry.name));
    }
  }
  return found;
}

function readJson(path: string): Record<string, unknown> | undefined {
  if (!existsSync(path)) return undefined;
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

function detectNode(root: string, pkg: Record<string, unknown>): CiConfig {
  const scripts = (pkg.scripts ?? {}) as Record<string, string>;
  const commands: Command[] = [];
  const packageManager = existsSync(join(root, "pnpm-lock.yaml"))
    ? "pnpm"
    : existsSync(join(root, "yarn.lock"))
      ? "yarn"
      : "npm";
  const dependencyFile = packageManager === "pnpm"
    ? "pnpm-lock.yaml"
    : packageManager === "yarn"
      ? "yarn.lock"
      : existsSync(join(root, "package-lock.json"))
        ? "package-lock.json"
        : undefined;
  const install = packageManager === "pnpm"
    ? "pnpm install --frozen-lockfile"
    : packageManager === "yarn"
      ? "yarn install --immutable"
      : dependencyFile
        ? "npm ci"
        : "npm install";

  if (scripts["ci:prepare"]) {
    commands.push({ name: "Prepare", run: `${packageManager} run ci:prepare` });
  } else if (scripts["prisma:generate"]) {
    commands.push({ name: "Generate Prisma client", run: `${packageManager} run prisma:generate` });
  }
  for (const script of ["lint", "typecheck"] as const) {
    if (scripts[script]) commands.push({ name: script === "lint" ? "Lint" : "Typecheck", run: `${packageManager} run ${script}` });
  }
  if (scripts.test) {
    commands.push({ name: "Test", run: `${packageManager} test` });
  } else {
    for (const script of ["test:unit", "test:a11y"] as const) {
      if (scripts[script]) commands.push({ name: `Run ${script}`, run: `${packageManager} run ${script}` });
    }
  }
  if (commands.length === 0 && scripts.build) {
    commands.push({ name: "Build", run: `${packageManager} run build` });
  }

  let version = "24";
  for (const file of [".nvmrc", ".node-version"]) {
    const path = join(root, file);
    if (existsSync(path)) {
      version = readFileSync(path, "utf8").trim().replace(/^v/, "");
      break;
    }
  }

  return {
    runtime: "node",
    version,
    packageManager,
    ...(dependencyFile ? { dependencyFile } : {}),
    install,
    commands,
    helm: [],
  };
}

function detectRuntime(root: string): CiConfig {
  const pkg = readJson(join(root, "package.json"));
  if (pkg) return detectNode(root, pkg);

  if (existsSync(join(root, "pyproject.toml")) || existsSync(join(root, "requirements.txt"))) {
    const commands: Command[] = [];
    const pyproject = existsSync(join(root, "pyproject.toml"))
      ? readFileSync(join(root, "pyproject.toml"), "utf8")
      : "";
    if (pyproject.includes("[tool.ruff")) commands.push({ name: "Lint", run: "python -m ruff check ." });
    if (existsSync(join(root, "tests"))) commands.push({ name: "Test", run: "python -m pytest" });
    const dependencyFile = existsSync(join(root, "requirements-dev.txt"))
      ? "requirements-dev.txt"
      : existsSync(join(root, "requirements.txt"))
        ? "requirements.txt"
        : "pyproject.toml";
    const install = dependencyFile.endsWith(".txt")
      ? `python -m pip install -r ${dependencyFile}`
      : "python -m pip install .";
    return { runtime: "python", version: "3.13", dependencyFile, install, commands, helm: [] };
  }

  if (existsSync(join(root, "go.mod"))) {
    return {
      runtime: "go",
      version: "stable",
      dependencyFile: "go.sum",
      install: "go mod download",
      commands: [
        { name: "Vet", run: "go vet ./..." },
        { name: "Test", run: "go test ./..." },
      ],
      helm: [],
    };
  }

  const dotnetFiles = readdirSync(root).filter((name) => name.endsWith(".sln") || name.endsWith(".csproj"));
  if (dotnetFiles.length > 0) {
    return {
      runtime: "dotnet",
      version: "10.0.x",
      install: "dotnet restore",
      commands: [
        { name: "Build", run: "dotnet build --no-restore" },
        { name: "Test", run: "dotnet test --no-build" },
      ],
      helm: [],
    };
  }

  const commands: Command[] = [];
  const makefile = join(root, "Makefile");
  if (existsSync(makefile)) {
    const contents = readFileSync(makefile, "utf8");
    for (const target of ["lint", "test", "check"]) {
      if (new RegExp(`^${target}:`, "m").test(contents)) {
        commands.push({ name: `Make ${target}`, run: `make ${target}` });
      }
    }
  }
  return { runtime: "generic", version: "", commands, helm: [] };
}

interface DockerStage {
  name: string;
  parent: string;
}

function dockerTargets(path: string): string[] {
  const stages: DockerStage[] = [];
  const referenced = new Set<string>();
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const from = line.match(/^\s*FROM\s+(?:--platform=\S+\s+)?(\S+)(?:\s+AS\s+([A-Za-z0-9_.-]+))?/i);
    if (from) {
      const parent = from[1] ?? "";
      const name = from[2] ?? "";
      if (name) stages.push({ name, parent });
      continue;
    }
    const copy = line.match(/--from=([A-Za-z0-9_.-]+)/i);
    if (copy?.[1]) referenced.add(copy[1]);
  }
  const names = new Set(stages.map((stage) => stage.name));
  for (const stage of stages) {
    if (names.has(stage.parent)) referenced.add(stage.parent);
  }
  const leaves = stages.map((stage) => stage.name).filter((name) => !referenced.has(name));
  return leaves.length > 0 ? leaves : [""];
}

function detectComponents(root: string, projectName: string): Component[] {
  const dockerfiles = walk(root, (name) => name === "Dockerfile" || name.startsWith("Dockerfile.")).sort();
  const candidates = dockerfiles.flatMap((file) =>
    dockerTargets(file).map((target) => ({ file, target })),
  );
  const usedImages = new Set<string>();
  return candidates.map(({ file, target }, index) => {
    const fileSuffix = basename(file).replace(/^Dockerfile\.?/, "");
    const suffixParts = dockerfiles.length > 1 ? [fileSuffix, target] : [target || fileSuffix];
    const suffix = suffixParts.filter(Boolean).join("-") || (candidates.length > 1 ? String(index + 1) : "");
    const name = normalizeName(suffix || projectName);
    let image = candidates.length === 1 ? projectName : normalizeName(`${projectName}-${name}`);
    if (usedImages.has(image)) image = `${image}-${index + 1}`;
    usedImages.add(image);
    return {
      name,
      image,
      context: ".",
      dockerfile: relative(root, file).replaceAll("\\", "/"),
      target,
      platforms: "linux/amd64",
    };
  });
}

function expressionSegment(key: string): string {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(key) ? `.${key}` : `[${JSON.stringify(key)}]`;
}

function imageTagExpressions(value: unknown, path = ""): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const record = value as Record<string, unknown>;
  const found: string[] = [];
  for (const [key, child] of Object.entries(record)) {
    const childPath = `${path}${expressionSegment(key)}`;
    if (key === "image" && child && typeof child === "object" && !Array.isArray(child)) {
      const image = child as Record<string, unknown>;
      if (typeof image.tag === "string") found.push(`${childPath}.tag`);
    }
    found.push(...imageTagExpressions(child, childPath));
  }
  return [...new Set(found)];
}

function detectUpdates(root: string, environment: "staging" | "live"): YamlUpdate[] {
  const expected = `values-${environment}.yaml`;
  const files = walk(root, (name) => name === expected);
  return files.flatMap((file) => {
    try {
      const parsed = parseYaml(readFileSync(file, "utf8")) as unknown;
      return imageTagExpressions(parsed).map((expression) => ({
        file: relative(root, file).replaceAll("\\", "/"),
        expression,
      }));
    } catch {
      return [];
    }
  });
}

function detectHelm(root: string): HelmCheck[] {
  return walk(root, (name) => name === "Chart.yaml").map((chartFile) => {
    const chart = dirname(relative(root, chartFile)).replaceAll("\\", "/");
    const values = readdirSync(dirname(chartFile))
      .filter((name) => /^values-(staging|live|preview)\.ya?ml$/.test(name))
      .sort()
      .map((name) => `${chart}/${name}`);
    return { chart, values };
  });
}

export function detectProject(root: string): WorkflowConfig {
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    throw new Error(`Project directory does not exist: ${root}`);
  }
  const projectName = normalizeName(basename(root));
  const ci = detectRuntime(root);
  ci.helm = detectHelm(root);
  const stagingUpdates = detectUpdates(root, "staging");
  const productionUpdates = detectUpdates(root, "live");
  return {
    version: 1,
    project: { name: projectName, defaultBranch: "main" },
    platformWorkflows: "mythral0/platform-workflows@v1",
    ci,
    containers: {
      registry: "ghcr.io",
      components: detectComponents(root, projectName),
    },
    deployment: {
      staging: { enabled: stagingUpdates.length > 0, updates: stagingUpdates },
      production: { enabled: productionUpdates.length > 0, updates: productionUpdates },
      preview: { enabled: false },
    },
  };
}

export function detectedRuntime(config: WorkflowConfig): Runtime {
  return config.ci.runtime;
}
