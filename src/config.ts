import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import type { WorkflowConfig } from "./types.js";

export function loadConfig(root: string): WorkflowConfig {
  const path = join(root, ".workflow-bootstrap.yml");
  if (!existsSync(path)) throw new Error(".workflow-bootstrap.yml does not exist; run init first.");
  const config = parseYaml(readFileSync(path, "utf8")) as WorkflowConfig;
  const errors = validateConfig(config);
  if (errors.length > 0) throw new Error(`Invalid .workflow-bootstrap.yml:\n- ${errors.join("\n- ")}`);
  return config;
}

export function validateConfig(config: WorkflowConfig): string[] {
  const errors: string[] = [];
  if (config?.version !== 1) errors.push("version must be 1");
  if (!config?.project?.name) errors.push("project.name is required");
  if (!config?.project?.defaultBranch) errors.push("project.defaultBranch is required");
  if (!/^[-A-Za-z0-9_.]+\/[-A-Za-z0-9_.]+@[-A-Za-z0-9_.]+$/.test(config?.platformWorkflows ?? "")) {
    errors.push("platformWorkflows must look like owner/repository@ref");
  }
  if (!config?.ci?.runtime) errors.push("ci.runtime is required");
  if (!Array.isArray(config?.ci?.commands)) errors.push("ci.commands must be an array");
  if (!Array.isArray(config?.containers?.components)) errors.push("containers.components must be an array");
  for (const component of config?.containers?.components ?? []) {
    for (const field of ["name", "image", "context", "dockerfile", "platforms"] as const) {
      if (!component[field]) errors.push(`component ${component.name || "<unnamed>"}.${field} is required`);
    }
  }
  for (const [name, environment] of Object.entries({
    staging: config?.deployment?.staging,
    production: config?.deployment?.production,
  })) {
    if (!environment || !Array.isArray(environment.updates)) {
      errors.push(`deployment.${name}.updates must be an array`);
      continue;
    }
    if (environment.enabled && environment.updates.length === 0) {
      errors.push(`deployment.${name} is enabled but has no updates`);
    }
  }
  return errors;
}

