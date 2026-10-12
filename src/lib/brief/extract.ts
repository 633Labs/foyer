import path from "path";
import { parse as parseYaml } from "yaml";
import type {
  ComposeService,
  Declaration,
  EnvReference,
  EnvVar,
  Invocation,
  MakeTarget,
  PackageManager,
  RuntimeName,
  Script,
  ScriptKind,
  Workflow,
} from "./types";
import { parseConstraint, parsePin, pinFromImageTag } from "./versions";
import type { ListedFile } from "./walk";
import { readTextFile } from "./walk";

const CODE_EXT = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".mts",
  ".cts",
  ".vue",
  ".svelte",
  ".py",
  ".go",
  ".rb",
  ".php",
  ".rs",
]);

const ENV_DENY = new Set([
  "NODE_ENV",
  "CI",
  "DEBUG",
  "NODE_OPTIONS",
  "PATH",
  "HOME",
  "USER",
  "SHELL",
  "PWD",
  "TMPDIR",
  "LANG",
  "TERM",
  "SHLVL",
  "INIT_CWD",
]);

const ENV_PATTERNS = [
  /process\.env\.([A-Z][A-Z0-9_]+)/g,
  /process\.env\[\s*['"]([A-Z][A-Z0-9_]+)['"]\s*\]/g,
  /import\.meta\.env\.([A-Z][A-Z0-9_]+)/g,
  /import\.meta\.env\[\s*['"]([A-Z][A-Z0-9_]+)['"]\s*\]/g,
  /os\.environ\.get\(\s*['"]([A-Z][A-Z0-9_]+)['"]/g,
  /os\.environ\[\s*['"]([A-Z][A-Z0-9_]+)['"]\s*\]/g,
  /os\.getenv\(\s*['"]([A-Z][A-Z0-9_]+)['"]/g,
  /os\.Getenv\(\s*['"]([A-Z][A-Z0-9_]+)['"]/g,
  /os\.LookupEnv\(\s*['"]([A-Z][A-Z0-9_]+)['"]/g,
  /Deno\.env\.get\(\s*['"]([A-Z][A-Z0-9_]+)['"]/g,
];

const PM_BUILTINS = new Set([
  "install",
  "i",
  "ci",
  "add",
  "remove",
  "rm",
  "update",
  "outdated",
  "audit",
  "pack",
  "publish",
  "link",
  "unlink",
  "config",
  "cache",
  "init",
  "create",
  "docs",
  "help",
  "version",
  "why",
  "ls",
  "list",
  "rebuild",
  "prune",
  "dedupe",
  "explore",
  "fund",
  "pkg",
  "exec",
  "dlx",
  "run",
  "clean-install",
]);

const RUNTIME_FILES: Record<string, RuntimeName> = {
  ".nvmrc": "node",
  ".node-version": "node",
  ".python-version": "python",
  ".ruby-version": "ruby",
};

const TOOL_NAMES: Record<string, RuntimeName> = {
  node: "node",
  nodejs: "node",
  python: "python",
  ruby: "ruby",
  go: "go",
  golang: "go",
};

const IMAGE_RUNTIMES: Record<string, RuntimeName> = {
  node: "node",
  python: "python",
  golang: "go",
  ruby: "ruby",
};

export type Signals = {
  notes: { id: string; file: string; detail: string }[];
  identityName: string | null;
  description: string | null;
  packageLicense: string | null;
  licenseFile: string | null;
  readmeTitle: string | null;
  readmeFiles: { file: string; text: string }[];
  scripts: Script[];
  workspaces: boolean;
  packageManager: PackageManager | null;
  hasPackageJson: boolean;
  makeTargets: MakeTarget[];
  services: ComposeService[];
  hasDockerfile: boolean;
  hasDockerignore: boolean;
  gitignoreText: string | null;
  hasDotEnv: boolean;
  declarations: Declaration[];
  invocations: Invocation[];
  workflows: Workflow[];
  envUsed: EnvVar[];
  exampleKeys: string[];
  exampleFile: string | null;
  stack: string[];
  evidence: string[];
};

export function extractSignals(
  rootName: string,
  files: ListedFile[],
): Signals {
  const byRel = new Map(files.map((file) => [file.rel, file]));
  const notes: Signals["notes"] = [];
  const evidence = new Set<string>();
  const stack = new Set<string>();
  const declarations: Declaration[] = [];
  const invocations: Invocation[] = [];

  const packageFile = byRel.get("package.json");
  let identityName: string | null = null;
  let description: string | null = null;
  let packageLicense: string | null = null;
  let scripts: Script[] = [];
  let workspaces = false;
  let packageManager: PackageManager | null = null;
  const hasPackageJson = packageFile != null;

  if (packageFile) {
    evidence.add(packageFile.rel);
    stack.add("Node.js");
    const text = readTextFile(packageFile.abs, packageFile.size);
    if (text == null) {
      notes.push({
        id: "unreadable-package-json",
        file: packageFile.rel,
        detail: "package.json could not be read as text.",
      });
    } else {
      try {
        const json = JSON.parse(text) as Record<string, unknown>;
        if (typeof json.name === "string" && json.name.trim()) identityName = json.name.trim();
        if (typeof json.description === "string" && json.description.trim()) {
          description = json.description.trim().slice(0, 280);
        }
        if (typeof json.license === "string") packageLicense = json.license;
        else if (isRecord(json.license) && typeof json.license.type === "string") {
          packageLicense = json.license.type;
        }
        workspaces = Array.isArray(json.workspaces) || isRecord(json.workspaces);
        if (isRecord(json.scripts)) {
          scripts = Object.entries(json.scripts)
            .filter((entry): entry is [string, string] => typeof entry[1] === "string")
            .map(([name, command]) => ({ name, command, kind: classifyScript(name) }))
            .sort(compareScripts);
        }
        const engines = isRecord(json.engines) ? json.engines : null;
        if (engines && typeof engines.node === "string") {
          declarations.push(
            constraintDeclaration("node", "package.json", engines.node, "engines.node"),
          );
        }
        const volta = isRecord(json.volta) ? json.volta : null;
        if (volta && (typeof volta.node === "string" || typeof volta.node === "number")) {
          declarations.push(
            pinDeclaration("node", "package.json", String(volta.node), "volta.node"),
          );
        }
        if (typeof json.packageManager === "string") {
          packageManager = managerFromDeclared(json.packageManager, files);
        }
      } catch {
        notes.push({
          id: "unreadable-package-json",
          file: "package.json",
          detail: "package.json is not valid JSON, so scripts and engines were skipped.",
        });
      }
    }
  }

  if (!packageManager && hasPackageJson) {
    packageManager = managerFromLock(files) ?? {
      name: "npm",
      lockfile: null,
      declared: null,
    };
  }

  if (
    files.some(
      (file) =>
        file.rel.endsWith(".ts") ||
        file.rel.endsWith(".tsx") ||
        file.rel === "tsconfig.json" ||
        file.rel.endsWith("/tsconfig.json"),
    )
  ) {
    stack.add("TypeScript");
  }
  if (
    files.some((file) =>
      /^next\.config\.(js|mjs|ts|cjs)$/.test(path.posix.basename(file.rel)),
    )
  ) {
    stack.add("Next.js");
  }
  if (byRel.has("go.mod")) stack.add("Go");
  if (byRel.has("Cargo.toml")) stack.add("Rust");
  if (byRel.has("Gemfile")) stack.add("Ruby");
  if (byRel.has("pyproject.toml") || byRel.has("requirements.txt") || files.some((file) => file.rel.endsWith(".py"))) {
    stack.add("Python");
  }

  for (const [basename, runtime] of Object.entries(RUNTIME_FILES)) {
    const file = byRel.get(basename);
    if (!file) continue;
    evidence.add(file.rel);
    const text = readTextFile(file.abs, file.size);
    const line = text?.split(/\r?\n/).find((entry) => entry.trim() && !entry.trim().startsWith("#"));
    if (!line) continue;
    declarations.push(pinDeclaration(runtime, file.rel, line.trim(), basename));
  }

  const toolVersions = byRel.get(".tool-versions");
  if (toolVersions) {
    evidence.add(toolVersions.rel);
    const text = readTextFile(toolVersions.abs, toolVersions.size) ?? "";
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const [tool, version] = trimmed.split(/\s+/);
      if (!tool || !version) continue;
      const runtime = TOOL_NAMES[tool.toLowerCase()];
      if (!runtime) continue;
      declarations.push(pinDeclaration(runtime, toolVersions.rel, version, `.tool-versions ${tool}`));
    }
  }

  const mise = byRel.get("mise.toml") ?? byRel.get(".mise.toml");
  if (mise) {
    evidence.add(mise.rel);
    declarations.push(...parseMise(mise.rel, readTextFile(mise.abs, mise.size) ?? ""));
  }

  const goMod = byRel.get("go.mod");
  if (goMod) {
    evidence.add(goMod.rel);
    const text = readTextFile(goMod.abs, goMod.size) ?? "";
    const goLine = text.match(/^go\s+(\d+\.\d+(?:\.\d+)?)/m);
    if (goLine?.[1]) declarations.push(pinDeclaration("go", goMod.rel, goLine[1], "go.mod"));
    const toolchain = text.match(/^toolchain\s+go(\d+\.\d+(?:\.\d+)?)/m);
    if (toolchain?.[1]) {
      declarations.push(pinDeclaration("go", goMod.rel, toolchain[1], "go.mod toolchain"));
    }
    const moduleName = text.match(/^module\s+(\S+)/m);
    if (!identityName && moduleName?.[1]) {
      identityName = moduleName[1].split("/").pop() ?? moduleName[1];
    }
  }

  const pyproject = byRel.get("pyproject.toml");
  if (pyproject) {
    evidence.add(pyproject.rel);
    const text = readTextFile(pyproject.abs, pyproject.size) ?? "";
    const requires = text.match(/requires-python\s*=\s*["']([^"']+)["']/);
    if (requires?.[1]) {
      declarations.push(
        constraintDeclaration("python", pyproject.rel, requires[1], "requires-python"),
      );
    }
    if (!identityName) {
      const name = text.match(/^name\s*=\s*["']([^"']+)["']/m);
      if (name?.[1]) identityName = name[1];
    }
    if (!description) {
      const described = text.match(/^description\s*=\s*["']([^"']+)["']/m);
      if (described?.[1]) description = described[1].slice(0, 280);
    }
  }

  const dockerfiles = files.filter((file) => isDockerfile(file.rel));
  for (const file of dockerfiles) {
    evidence.add(file.rel);
    stack.add("Docker");
    const text = readTextFile(file.abs, file.size);
    if (text == null) continue;
    declarations.push(...dockerfileDeclarations(file.rel, text));
    invocations.push(...dockerfileInvocations(file.rel, text));
  }

  const composeFiles = files.filter((file) => isComposeFile(file.rel));
  const services: ComposeService[] = [];
  for (const file of composeFiles) {
    evidence.add(file.rel);
    stack.add("Compose");
    const text = readTextFile(file.abs, file.size);
    if (text == null) continue;
    try {
      const doc = parseYaml(text);
      services.push(...composeServices(file.rel, doc));
      declarations.push(...composeDeclarations(file.rel, doc));
    } catch {
      notes.push({
        id: `unreadable-${file.rel}`,
        file: file.rel,
        detail: `${file.rel} is not valid YAML, so its services were skipped.`,
      });
    }
  }

  const workflows: Workflow[] = [];
  for (const file of files.filter((entry) => isWorkflow(entry.rel))) {
    evidence.add(file.rel);
    stack.add("GitHub Actions");
    const text = readTextFile(file.abs, file.size);
    if (text == null) continue;
    try {
      const doc = parseYaml(text);
      const workflow = parseWorkflow(file.rel, doc);
      workflows.push(workflow);
      declarations.push(...workflowDeclarations(file.rel, doc));
      for (const job of workflow.jobs) {
        for (const command of job.commands) {
          invocations.push(...invocationsFromCommand(file.rel, command));
        }
      }
    } catch {
      notes.push({
        id: `unreadable-${file.rel}`,
        file: file.rel,
        detail: `${file.rel} is not valid YAML, so its jobs were skipped.`,
      });
    }
  }

  const makeTargets: MakeTarget[] = [];
  for (const file of files.filter((entry) => isMakefile(entry.rel))) {
    evidence.add(file.rel);
    const text = readTextFile(file.abs, file.size) ?? "";
    for (const target of makefileTargets(text)) {
      makeTargets.push({ name: target, file: file.rel });
    }
  }

  const envMap = new Map<string, EnvReference[]>();
  for (const file of files) {
    if (!CODE_EXT.has(path.posix.extname(file.rel))) continue;
    const text = readTextFile(file.abs, file.size);
    if (text == null) continue;
    const before = envMap.size;
    collectEnv(file.rel, text, envMap);
    if (envMap.size !== before || [...envMap.values()].some((refs) => refs.some((ref) => ref.file === file.rel))) {
      evidence.add(file.rel);
    }
  }

  const example = files.find((file) =>
    /^\.env\.(example|sample|template)$/.test(path.posix.basename(file.rel)) &&
    !file.rel.includes("/"),
  ) ?? files.find((file) => /^\.env\.(example|sample|template)$/.test(path.posix.basename(file.rel)));
  let exampleKeys: string[] = [];
  let exampleFile: string | null = null;
  if (example) {
    evidence.add(example.rel);
    exampleFile = example.rel;
    exampleKeys = parseEnvExample(readTextFile(example.abs, example.size) ?? "");
  }

  const readme = files.find((file) => /^readme\.md$/i.test(path.posix.basename(file.rel)) && !file.rel.includes("/"))
    ?? files.find((file) => /^readme\.md$/i.test(path.posix.basename(file.rel)));
  const readmeFiles: { file: string; text: string }[] = [];
  let readmeTitle: string | null = null;
  if (readme) {
    evidence.add(readme.rel);
    const text = readTextFile(readme.abs, readme.size) ?? "";
    readmeFiles.push({ file: readme.rel, text });
    const heading = text.match(/^#\s+(.+)$/m);
    if (heading?.[1]) readmeTitle = heading[1].trim();
  }

  const license = files.find((file) => /^(license|licence|copying)(\.|$)/i.test(path.posix.basename(file.rel)));
  let licenseFile: string | null = null;
  if (license) {
    evidence.add(license.rel);
    const text = readTextFile(license.abs, license.size) ?? "";
    licenseFile = detectLicenseName(text) ?? "custom";
  }

  const gitignore = byRel.get(".gitignore");
  let gitignoreText: string | null = null;
  if (gitignore) {
    evidence.add(gitignore.rel);
    gitignoreText = readTextFile(gitignore.abs, gitignore.size);
  }

  const envUsed: EnvVar[] = [...envMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([name, references]) => ({
      name,
      references: references.slice(0, 8),
      referenceCount: references.length,
    }));

  return {
    notes,
    identityName: identityName ?? rootName,
    description,
    packageLicense,
    licenseFile,
    readmeTitle,
    readmeFiles,
    scripts,
    workspaces,
    packageManager,
    hasPackageJson,
    makeTargets,
    services,
    hasDockerfile: dockerfiles.length > 0,
    hasDockerignore: files.some((file) => path.posix.basename(file.rel) === ".dockerignore"),
    gitignoreText,
    hasDotEnv: files.some((file) => path.posix.basename(file.rel) === ".env"),
    declarations: dedupeDeclarations(declarations),
    invocations,
    workflows,
    envUsed,
    exampleKeys,
    exampleFile,
    stack: [...stack],
    evidence: [...evidence].sort(),
  };
}

export function readmeCommands(file: string, text: string): { line: number; command: string; kind: "script" | "make" | "compose"; name: string }[] {
  const found: { line: number; command: string; kind: "script" | "make" | "compose"; name: string }[] = [];
  const lines = text.split(/\r?\n/);
  let inFence = false;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (/^\s*```/.test(line) || /^\s*~~~/.test(line)) {
      inFence = !inFence;
      continue;
    }
    const chunks = inFence ? [line] : inlineCodes(line);
    for (const chunk of chunks) {
      found.push(
        ...commandsInText(chunk).map((command) => ({ ...command, line: index + 1 })),
      );
    }
  }
  const seen = new Set<string>();
  return found.filter((command) => {
    const key = `${command.kind}:${command.name}:${command.line}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function gitignoreCovers(text: string | null, name: string): boolean {
  if (!text) return false;
  const rules = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && !line.startsWith("!"));
  return rules.some((rule) => {
    const normalized = rule.replace(/^\//, "");
    if (name === ".env") {
      return (
        normalized === ".env" ||
        normalized === ".env*" ||
        normalized === "*.env" ||
        normalized === ".env.*" ||
        normalized === "**/.env" ||
        normalized === "**/.env*"
      );
    }
    return (
      normalized === name ||
      normalized === `${name}/` ||
      normalized === `**/${name}` ||
      normalized === `**/${name}/`
    );
  });
}

function collectEnv(file: string, text: string, into: Map<string, EnvReference[]>): void {
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    for (const pattern of ENV_PATTERNS) {
      const expression = new RegExp(pattern.source, "g");
      let match: RegExpExecArray | null;
      while ((match = expression.exec(line))) {
        const name = match[1];
        if (!name || ENV_DENY.has(name)) continue;
        const list = into.get(name) ?? [];
        if (!list.some((reference) => reference.file === file && reference.line === index + 1)) {
          list.push({ file, line: index + 1 });
        }
        into.set(name, list);
      }
    }
  }
}

function parseEnvExample(text: string): string[] {
  const keys: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^(?:export\s+)?([A-Z][A-Z0-9_]+)\s*=/);
    if (match?.[1] && !keys.includes(match[1])) keys.push(match[1]);
  }
  return keys;
}

function commandsInText(text: string): { command: string; kind: "script" | "make" | "compose"; name: string }[] {
  const found: { command: string; kind: "script" | "make" | "compose"; name: string }[] = [];
  const run = /\b(?:npm|pnpm|yarn|bun)\s+run\s+([A-Za-z0-9:_./-]+)/g;
  const lifecycle = /\b(?:npm|pnpm|yarn|bun)\s+(test|start)\b/g;
  const direct = /\b(?:pnpm|yarn)\s+([A-Za-z0-9:_-]+)/g;
  const make = /\bmake\s+([A-Za-z0-9_-]+)/g;
  const compose = /\bdocker(?:-compose|\s+compose)\s+up\b/g;

  for (const match of text.matchAll(run)) {
    if (match[1]) found.push({ command: match[0], kind: "script", name: match[1] });
  }
  for (const match of text.matchAll(lifecycle)) {
    if (match[1]) found.push({ command: match[0], kind: "script", name: match[1] });
  }
  for (const match of text.matchAll(direct)) {
    const name = match[1];
    if (!name || PM_BUILTINS.has(name)) continue;
    found.push({ command: match[0], kind: "script", name });
  }
  for (const match of text.matchAll(make)) {
    const name = match[1];
    if (!name || name.startsWith("-")) continue;
    found.push({ command: match[0], kind: "make", name });
  }
  for (const match of text.matchAll(compose)) {
    found.push({ command: match[0], kind: "compose", name: "up" });
  }
  return found;
}

function inlineCodes(line: string): string[] {
  return [...line.matchAll(/`([^`]+)`/g)].map((match) => match[1] ?? "").filter(Boolean);
}

function invocationsFromCommand(file: string, command: string): Invocation[] {
  const found: Invocation[] = [];
  if (/\b(?:npm|pnpm|yarn)\s+(?:ci|clean-install)\b/.test(command) || /\bpnpm\s+install\s+--frozen-lockfile\b/.test(command)) {
    found.push({ file, command: command.trim(), kind: "install", name: null });
  }
  for (const match of command.matchAll(/\b(?:npm|pnpm|yarn|bun)\s+run\s+([A-Za-z0-9:_./-]+)/g)) {
    if (match[1]) found.push({ file, command: match[0], kind: "script", name: match[1] });
  }
  for (const match of command.matchAll(/\b(?:npm|pnpm|yarn|bun)\s+(start|test)\b/g)) {
    if (match[1]) found.push({ file, command: match[0], kind: "script", name: match[1] });
  }
  return found;
}

function dockerfileInvocations(file: string, text: string): Invocation[] {
  const commands = text
    .split(/\r?\n/)
    .filter((line) => /^\s*(RUN|CMD|ENTRYPOINT)\b/i.test(line))
    .map((line) => line.replace(/[[\]",]/g, " "));
  return commands.flatMap((line) => invocationsFromCommand(file, line));
}

function dockerfileDeclarations(file: string, text: string): Declaration[] {
  const lines = text.split(/\r?\n/);
  const args = new Map<string, string>();
  for (const line of lines) {
    const arg = line.match(/^\s*ARG\s+([A-Za-z_][A-Za-z0-9_]*)=(.+)$/);
    if (arg?.[1] && arg[2]) args.set(arg[1], arg[2].trim());
  }
  const declarations: Declaration[] = [];
  for (const line of lines) {
    const from = line.match(/^\s*FROM\s+(\S+)/i);
    if (!from?.[1]) continue;
    const image = substitute(from[1], args);
    const runtime = runtimeFromImage(image);
    if (!runtime) continue;
    const tag = image.split(":").slice(1).join(":") || "";
    if (!tag || tag.includes("${")) {
      declarations.push({
        runtime,
        file,
        raw: image,
        source: "FROM",
        pin: null,
        constraint: null,
        unresolved: true,
      });
      continue;
    }
    const pin = pinFromImageTag(tag);
    declarations.push({
      runtime,
      file,
      raw: image,
      source: "FROM",
      pin,
      constraint: null,
      unresolved: pin == null,
    });
  }
  return declarations;
}

function composeServices(file: string, doc: unknown): ComposeService[] {
  if (!isRecord(doc) || !isRecord(doc.services)) return [];
  return Object.entries(doc.services).map(([name, value]) => {
    const service = isRecord(value) ? value : {};
    const ports = Array.isArray(service.ports)
      ? service.ports.map((port) => String(port))
      : [];
    return {
      name,
      image: typeof service.image === "string" ? service.image : null,
      ports,
      file,
    };
  });
}

function composeDeclarations(file: string, doc: unknown): Declaration[] {
  if (!isRecord(doc) || !isRecord(doc.services)) return [];
  const declarations: Declaration[] = [];
  for (const value of Object.values(doc.services)) {
    if (!isRecord(value) || typeof value.image !== "string") continue;
    const runtime = runtimeFromImage(value.image);
    if (!runtime) continue;
    const tag = value.image.split(":").slice(1).join(":");
    const pin = tag ? pinFromImageTag(tag) : null;
    declarations.push({
      runtime,
      file,
      raw: value.image,
      source: "compose image",
      pin,
      constraint: null,
      unresolved: pin == null,
    });
  }
  return declarations;
}

function parseWorkflow(file: string, doc: unknown): Workflow {
  const record = isRecord(doc) ? doc : {};
  const on = record.on ?? record.true;
  const jobs = isRecord(record.jobs) ? record.jobs : {};
  return {
    file,
    name: typeof record.name === "string" ? record.name : path.posix.basename(file),
    triggers: triggersOf(on),
    jobs: Object.entries(jobs).map(([name, value]) => {
      const job = isRecord(value) ? value : {};
      const steps = Array.isArray(job.steps) ? job.steps : [];
      const commands = steps
        .map((step) => (isRecord(step) && typeof step.run === "string" ? step.run.split("\n")[0]?.trim() : null))
        .filter((command): command is string => Boolean(command))
        .slice(0, 8);
      const runsOn = typeof job["runs-on"] === "string" ? job["runs-on"] : null;
      return { name, runsOn, commands };
    }),
  };
}

function workflowDeclarations(file: string, doc: unknown): Declaration[] {
  if (!isRecord(doc) || !isRecord(doc.jobs)) return [];
  const declarations: Declaration[] = [];
  for (const jobValue of Object.values(doc.jobs)) {
    if (!isRecord(jobValue)) continue;
    const steps = Array.isArray(jobValue.steps) ? jobValue.steps : [];
    for (const step of steps) {
      if (!isRecord(step) || typeof step.uses !== "string" || !isRecord(step.with)) continue;
      const action = step.uses.split("@")[0]?.split("/").pop() ?? "";
      const version = step.with["node-version"] ?? step.with["python-version"] ?? step.with["go-version"] ?? step.with["ruby-version"];
      const runtime = actionRuntime(action);
      if (!runtime || version == null) continue;
      const values = resolveVersion(version, jobValue);
      if (values == null) {
        declarations.push({
          runtime,
          file,
          raw: String(version).trim(),
          source: action,
          pin: null,
          constraint: null,
          unresolved: true,
        });
        continue;
      }
      for (const value of values) {
        if (/^(>=|<=|>|<|=|\^|~)/.test(value)) {
          declarations.push(constraintDeclaration(runtime, file, value, action));
        } else {
          declarations.push(pinDeclaration(runtime, file, value, action));
        }
      }
    }
  }
  return declarations;
}

function resolveVersion(version: unknown, job: Record<string, unknown>): string[] | null {
  if (typeof version === "number") return [String(version)];
  if (typeof version !== "string") return null;
  const expression = version.trim().match(/^\$\{\{\s*matrix\.([A-Za-z0-9_-]+)\s*\}\}$/);
  if (!expression) return [version.trim()];
  const strategy = isRecord(job.strategy) ? job.strategy : null;
  const matrix = strategy && isRecord(strategy.matrix) ? strategy.matrix : null;
  const key = expression[1];
  const value = key && matrix ? matrix[key] : null;
  if (Array.isArray(value)) {
    const literals = value.filter((item) => ["string", "number"].includes(typeof item)).map(String);
    return literals.length > 0 ? literals : null;
  }
  if (typeof value === "string" || typeof value === "number") return [String(value)];
  return null;
}

function actionRuntime(action: string): RuntimeName | null {
  if (action === "setup-node") return "node";
  if (action === "setup-python") return "python";
  if (action === "setup-go") return "go";
  if (action === "setup-ruby") return "ruby";
  return null;
}

function parseMise(file: string, text: string): Declaration[] {
  const declarations: Declaration[] = [];
  let inTools = false;
  for (const line of text.split(/\r?\n/)) {
    const section = line.match(/^\s*\[([^\]]+)\]\s*$/);
    if (section) {
      inTools = section[1] === "tools";
      continue;
    }
    if (!inTools) continue;
    const match = line.match(/^\s*(node|nodejs|python|go|golang|ruby)\s*=\s*["']?([^"'#\s]+)/);
    if (!match?.[1] || !match[2]) continue;
    const runtime = TOOL_NAMES[match[1]];
    if (!runtime) continue;
    declarations.push(pinDeclaration(runtime, file, match[2], "mise"));
  }
  return declarations;
}

function pinDeclaration(runtime: RuntimeName, file: string, raw: string, source: string): Declaration {
  const token = raw.trim();
  if (/^lts([/*]|$)/i.test(token) || token === "latest" || token.includes("${{")) {
    return { runtime, file, raw: token, source, pin: null, constraint: null, unresolved: true };
  }
  const pin = parsePin(token);
  return {
    runtime,
    file,
    raw: token,
    source,
    pin,
    constraint: null,
    unresolved: pin == null,
  };
}

function constraintDeclaration(runtime: RuntimeName, file: string, raw: string, source: string): Declaration {
  const constraint = parseConstraint(raw);
  return {
    runtime,
    file,
    raw: raw.trim(),
    source,
    pin: null,
    constraint: constraint.op === "unknown" ? null : constraint,
    unresolved: constraint.op === "unknown",
  };
}

function makefileTargets(text: string): string[] {
  const targets: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z0-9][A-Za-z0-9_-]*)\s*:(?!=)/);
    if (match?.[1] && !targets.includes(match[1])) targets.push(match[1]);
  }
  return targets;
}

function managerFromDeclared(declared: string, files: ListedFile[]): PackageManager {
  const name = declared.startsWith("pnpm")
    ? "pnpm"
    : declared.startsWith("yarn")
      ? "yarn"
      : declared.startsWith("bun")
        ? "bun"
        : "npm";
  const fromLock = managerFromLock(files);
  return { name, lockfile: fromLock?.lockfile ?? null, declared };
}

function managerFromLock(files: ListedFile[]): PackageManager | null {
  const names = new Set(files.map((file) => file.rel));
  if (names.has("pnpm-lock.yaml")) return { name: "pnpm", lockfile: "pnpm-lock.yaml", declared: null };
  if (names.has("yarn.lock")) return { name: "yarn", lockfile: "yarn.lock", declared: null };
  if (names.has("bun.lock") || names.has("bun.lockb")) {
    return { name: "bun", lockfile: names.has("bun.lock") ? "bun.lock" : "bun.lockb", declared: null };
  }
  if (names.has("package-lock.json")) return { name: "npm", lockfile: "package-lock.json", declared: null };
  return null;
}

function runtimeFromImage(image: string): RuntimeName | null {
  const name = image.split(":")[0] ?? image;
  const base = name.split("/").pop() ?? name;
  return IMAGE_RUNTIMES[base] ?? null;
}

function substitute(value: string, args: Map<string, string>): string {
  return value.replace(
    /\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-([^}]*))?\}|\$([A-Za-z_][A-Za-z0-9_]*)/g,
    (full, name: string | undefined, fallback: string | undefined, bare: string | undefined) => {
      const key = name || bare;
      if (key && args.has(key)) return args.get(key) ?? full;
      if (fallback !== undefined) return fallback;
      return full;
    },
  );
}

function detectLicenseName(text: string): string | null {
  const head = text.slice(0, 400);
  if (/MIT License/i.test(head)) return "MIT";
  if (/Apache License/i.test(head)) return "Apache-2.0";
  if (/GNU GENERAL PUBLIC LICENSE/i.test(head)) return "GPL";
  if (/BSD/.test(head)) return "BSD";
  if (/ISC/.test(head)) return "ISC";
  if (/Mozilla Public License/i.test(head)) return "MPL";
  return null;
}

function isDockerfile(rel: string): boolean {
  const base = path.posix.basename(rel);
  return base === "Dockerfile" || base.startsWith("Dockerfile.") || base.endsWith(".Dockerfile");
}

function isComposeFile(rel: string): boolean {
  const base = path.posix.basename(rel);
  return (
    base === "docker-compose.yml" ||
    base === "docker-compose.yaml" ||
    base === "compose.yml" ||
    base === "compose.yaml"
  );
}

function isWorkflow(rel: string): boolean {
  return rel.startsWith(".github/workflows/") && /\.ya?ml$/.test(rel) && rel.split("/").length === 3;
}

function isMakefile(rel: string): boolean {
  const base = path.posix.basename(rel);
  return base === "Makefile" || base === "makefile" || base === "GNUmakefile";
}

function classifyScript(name: string): ScriptKind {
  const normalized = name.toLowerCase();
  if (normalized === "dev" || normalized.startsWith("dev:") || normalized.endsWith(":dev")) return "dev";
  if (normalized === "start" || normalized.startsWith("start:")) return "start";
  if (normalized === "test" || normalized.startsWith("test:") || normalized.includes(":test")) return "test";
  if (normalized === "build" || normalized.startsWith("build:") || normalized === "compile") return "build";
  if (/(lint|format|typecheck|type-check)/.test(normalized)) return "lint";
  return "other";
}

function compareScripts(a: Script, b: Script): number {
  const order: ScriptKind[] = ["dev", "start", "test", "build", "lint", "other"];
  const delta = order.indexOf(a.kind) - order.indexOf(b.kind);
  if (delta !== 0) return delta;
  return a.name.localeCompare(b.name);
}

function dedupeDeclarations(list: Declaration[]): Declaration[] {
  const seen = new Set<string>();
  const result: Declaration[] = [];
  for (const declaration of list) {
    const key = `${declaration.runtime}|${declaration.file}|${declaration.raw}|${declaration.source}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(declaration);
  }
  return result;
}

function triggersOf(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (typeof value === "boolean") return [value ? "on" : "off"];
  if (Array.isArray(value)) return value.map(String);
  if (isRecord(value)) return Object.keys(value);
  return [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
