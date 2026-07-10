import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { parse as parseYaml } from "yaml";
import { loadConfig } from "../src/config.js";
import { detectProject } from "../src/detect.js";
import { writeGeneratedFiles } from "../src/files.js";
import { renderFiles } from "../src/render.js";

const sandbox = join(process.cwd(), "tmp", "tests");

function fixture(name: string): string {
  const root = join(sandbox, name);
  mkdirSync(root, { recursive: true });
  return root;
}

function write(root: string, path: string, content: string): void {
  const destination = join(root, path);
  mkdirSync(join(destination, ".."), { recursive: true });
  writeFileSync(destination, content, "utf8");
}

beforeEach(() => rmSync(sandbox, { recursive: true, force: true }));
afterEach(() => rmSync(sandbox, { recursive: true, force: true }));

describe("project detection", () => {
  test("detects a Node multi-image Helm GitOps project", () => {
    const root = fixture("orders");
    write(root, "package.json", JSON.stringify({ scripts: {
      lint: "eslint .",
      typecheck: "tsc --noEmit",
      "prisma:generate": "prisma generate",
      test: "vitest run",
    } }));
    write(root, "package-lock.json", "{}");
    write(root, "Dockerfile", `FROM node:24 AS base
FROM base AS deps
FROM deps AS build
FROM build AS web
COPY --from=build /app /app
FROM deps AS worker
`);
    write(root, "deploy/helm/orders/Chart.yaml", "apiVersion: v2\nname: orders\nversion: 0.1.0\n");
    write(root, "deploy/helm/orders/values-staging.yaml", "image:\n  tag: staging\n");
    write(root, "deploy/helm/orders/values-live.yaml", "image:\n  tag: v0.0.0\n");

    const config = detectProject(root);

    expect(config.ci.runtime).toBe("node");
    expect(config.ci.install).toBe("npm ci");
    expect(config.ci.commands.map((command) => command.name)).toEqual([
      "Generate Prisma client",
      "Lint",
      "Typecheck",
      "Test",
    ]);
    expect(config.containers.components.map((component) => component.target)).toEqual(["web", "worker"]);
    expect(config.containers.components.map((component) => component.image)).toEqual(["orders-web", "orders-worker"]);
    expect(config.deployment.staging.updates).toEqual([{
      file: "deploy/helm/orders/values-staging.yaml",
      expression: ".image.tag",
    }]);
    expect(config.deployment.production.enabled).toBe(true);
    expect(config.ci.helm).toHaveLength(1);
  });

  test("detects Python checks without inventing container deployment", () => {
    const root = fixture("reporting");
    write(root, "pyproject.toml", "[project]\nname = \"reporting\"\n[tool.ruff]\n");
    mkdirSync(join(root, "tests"));

    const config = detectProject(root);

    expect(config.ci.runtime).toBe("python");
    expect(config.ci.commands.map((command) => command.run)).toEqual([
      "python -m ruff check .",
      "python -m pytest",
    ]);
    expect(config.containers.components).toEqual([]);
    expect(config.deployment.staging.enabled).toBe(false);
  });

  test("finds nested image tag paths", () => {
    const root = fixture("nested-images");
    write(root, "values-staging.yaml", "web:\n  image:\n    tag: old\nworker-service:\n  image:\n    tag: old\n");

    const config = detectProject(root);

    expect(config.deployment.staging.updates.map((update) => update.expression)).toEqual([
      ".web.image.tag",
      '["worker-service"].image.tag',
    ]);
  });
});

describe("generation", () => {
  test("writes parseable workflows and reloads the manifest", () => {
    const root = fixture("shipping");
    write(root, "package.json", JSON.stringify({ scripts: { test: "node --test" } }));
    write(root, "package-lock.json", "{}");
    write(root, "Dockerfile", "FROM node:24 AS web\n");
    const config = detectProject(root);
    const files = renderFiles(config);

    const result = writeGeneratedFiles(root, files, { force: false, dryRun: false });

    expect(result.conflicts).toEqual([]);
    expect(loadConfig(root)).toEqual(config);
    for (const file of files.filter((candidate) => candidate.path.endsWith(".yml"))) {
      expect(() => parseYaml(readFileSync(join(root, file.path), "utf8"))).not.toThrow();
    }
    const staging = parseYaml(readFileSync(join(root, ".github/workflows/staging.yml"), "utf8")) as Record<string, unknown>;
    expect((staging.jobs as Record<string, unknown>).checks).toBeDefined();
    expect((staging.jobs as Record<string, unknown>).build).toBeDefined();
  });

  test("does not overwrite a conflicting workflow during init", () => {
    const root = fixture("conflict");
    write(root, "package.json", JSON.stringify({ scripts: { test: "node --test" } }));
    write(root, ".github/workflows/staging.yml", "name: Custom\n");
    const config = detectProject(root);

    const result = writeGeneratedFiles(root, renderFiles(config), { force: false, dryRun: false });

    expect(result.conflicts).toContain(".github/workflows/staging.yml");
    expect(readFileSync(join(root, ".github/workflows/staging.yml"), "utf8")).toBe("name: Custom\n");
  });

  test("sync output is idempotent", () => {
    const root = fixture("idempotent");
    write(root, "go.mod", "module example.com/idempotent\n");
    const files = renderFiles(detectProject(root));
    writeGeneratedFiles(root, files, { force: false, dryRun: false });

    const second = writeGeneratedFiles(root, files, { force: true, dryRun: false });

    expect(second.written).toEqual([]);
    expect(second.unchanged).toHaveLength(files.length);
  });
});

