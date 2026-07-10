import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { GeneratedFile } from "./types.js";

export interface WriteOptions {
  force: boolean;
  dryRun: boolean;
}

export interface WriteResult {
  written: string[];
  unchanged: string[];
  conflicts: string[];
}

export function writeGeneratedFiles(root: string, files: GeneratedFile[], options: WriteOptions): WriteResult {
  const result: WriteResult = { written: [], unchanged: [], conflicts: [] };
  for (const file of files) {
    const destination = join(root, file.path);
    if (existsSync(destination)) {
      const current = readFileSync(destination, "utf8");
      if (current === file.content) {
        result.unchanged.push(file.path);
        continue;
      }
      if (!options.force) {
        result.conflicts.push(file.path);
        continue;
      }
    }
    result.written.push(file.path);
    if (!options.dryRun) {
      mkdirSync(dirname(destination), { recursive: true });
      writeFileSync(destination, file.content, "utf8");
    }
  }
  return result;
}

