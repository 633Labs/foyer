import fs from "fs";
import path from "path";

export const MAX_FILES = 4000;
export const MAX_BYTES = 350_000;

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "coverage",
  ".next",
  ".venv",
  "venv",
  "__pycache__",
  "vendor",
  "target",
  ".turbo",
  "out",
  ".cache",
]);

export type ListedFile = {
  rel: string;
  abs: string;
  mtimeMs: number;
  size: number;
};

export function listFiles(root: string): { files: ListedFile[]; truncated: boolean } {
  const rules = readFoyerIgnore(root);
  const files: ListedFile[] = [];
  const stack = [root];
  let truncated = false;

  while (stack.length > 0) {
    const dir = stack.pop();
    if (!dir) break;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (files.length >= MAX_FILES) {
        truncated = true;
        return { files, truncated };
      }
      const abs = path.join(dir, entry.name);
      const rel = path.relative(root, abs).split(path.sep).join("/");
      if (ignored(rel, rules)) continue;
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (shouldSkipDir(entry.name)) continue;
        stack.push(abs);
        continue;
      }
      if (!entry.isFile()) continue;
      try {
        const stat = fs.statSync(abs);
        files.push({ rel, abs, mtimeMs: stat.mtimeMs, size: stat.size });
      } catch {
        continue;
      }
    }
  }

  files.sort((a, b) => a.rel.localeCompare(b.rel));
  return { files, truncated };
}

export function readTextFile(abs: string, size: number): string | null {
  if (size > MAX_BYTES || size < 0) return null;
  let fd: number | null = null;
  try {
    const sampleLength = Math.min(1024, size);
    const sample = Buffer.alloc(sampleLength);
    fd = fs.openSync(abs, "r");
    if (sampleLength > 0) fs.readSync(fd, sample, 0, sampleLength, 0);
    if (sample.includes(0)) return null;
    return fs.readFileSync(abs, "utf8");
  } catch {
    return null;
  } finally {
    if (fd != null) {
      try {
        fs.closeSync(fd);
      } catch {
        /* already closed */
      }
    }
  }
}

function readFoyerIgnore(root: string): string[] {
  const ignorePath = path.join(root, ".foyerignore");
  if (!fs.existsSync(ignorePath)) return [];
  try {
    return fs
      .readFileSync(ignorePath, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("#"));
  } catch {
    return [];
  }
}

function ignored(rel: string, rules: string[]): boolean {
  return rules.some((rule) => {
    if (rule.endsWith("/")) {
      const prefix = rule.slice(0, -1);
      return rel === prefix || rel.startsWith(`${prefix}/`);
    }
    return rel === rule;
  });
}

function shouldSkipDir(name: string): boolean {
  if (SKIP_DIRS.has(name)) return true;
  if (name.startsWith(".") && name !== ".github" && name !== ".devcontainer") return true;
  return false;
}
