import type {
  Declaration,
  Finding,
  Invocation,
  Pin,
  ReadmeCommand,
} from "./types";
import { RUNTIME_LABEL } from "./types";
import { andList } from "./format";
import type { Signals } from "./extract";
import { gitignoreCovers, readmeCommands } from "./extract";
import { comparePins, pinSatisfies } from "./versions";

const SEVERITY_ORDER = { attention: 0, watch: 1, note: 2 };

export function buildFindings(signals: Signals): { findings: Finding[]; readmeCommands: ReadmeCommand[] } {
  const findings: Finding[] = [];
  const scriptNames = new Set(signals.scripts.map((script) => script.name));
  const makeNames = new Set(signals.makeTargets.map((target) => target.name));

  findings.push(...runtimeFindings(signals.declarations));
  findings.push(...envFindings(signals));
  findings.push(...invocationFindings(signals.invocations, scriptNames, signals.packageManager?.lockfile ?? null));
  const commands = readmeFindings(signals, scriptNames, makeNames, findings);
  findings.push(...hygieneFindings(signals));

  findings.sort((a, b) => {
    const severity = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (severity !== 0) return severity;
    return a.id.localeCompare(b.id);
  });

  return { findings, readmeCommands: commands };
}

function runtimeFindings(declarations: Declaration[]): Finding[] {
  const findings: Finding[] = [];
  const runtimes = ["node", "python", "go", "ruby"] as const;
  for (const runtime of runtimes) {
    const group = declarations.filter((declaration) => declaration.runtime === runtime);
    const pins = group
      .map((declaration) => declaration.pin)
      .filter((pin): pin is Pin => pin != null);
    const drift = comparePins(runtime, pins);
    if (drift.level === "release" || drift.level === "minor") {
      const pinDecls = group.filter((declaration) => declaration.pin);
      findings.push({
        id: `runtime-${runtime}-${drift.level}`,
        severity: drift.level === "release" ? "attention" : "watch",
        title: `${RUNTIME_LABEL[runtime]} is declared as ${andList(drift.keys)}`,
        detail: `${sentenceList(pinDecls.map((declaration) => `${declaration.file} says ${declaration.raw}`))}. A checkout, an image, and CI that install different ${RUNTIME_LABEL[runtime]} releases will disagree about what "works".`,
        files: unique(pinDecls.map((declaration) => declaration.file)),
      });
    }

    const constraints = group.filter((declaration) => declaration.constraint);
    const excluded: string[] = [];
    for (const constraint of constraints) {
      if (!constraint.constraint) continue;
      for (const pinDecl of group) {
        if (!pinDecl.pin) continue;
        if (pinSatisfies(constraint.constraint, pinDecl.pin) === false) {
          excluded.push(
            `${pinDecl.file} (${pinDecl.raw}) is outside ${constraint.file} ${constraint.source} (${constraint.raw})`,
          );
        }
      }
    }
    if (excluded.length > 0) {
      findings.push({
        id: `engines-${runtime}-excludes`,
        severity: "attention",
        title: `${RUNTIME_LABEL[runtime]} pins sit outside the published range`,
        detail: `${sentenceList(excluded)}.`,
        files: unique(constraints.map((declaration) => declaration.file)),
      });
    }

    const unresolved = group.filter((declaration) => declaration.unresolved);
    if (unresolved.length > 0) {
      findings.push({
        id: `runtime-${runtime}-unresolved`,
        severity: "note",
        title: `A ${RUNTIME_LABEL[runtime]} declaration was left uncompared`,
        detail: `${sentenceList(unresolved.map((declaration) => `${declaration.file} says ${declaration.raw}`))}. Codename and expression pins are reported, then left out of the comparison.`,
        files: unique(unresolved.map((declaration) => declaration.file)),
      });
    }
  }
  return findings;
}

function envFindings(signals: Signals): Finding[] {
  const findings: Finding[] = [];
  const used = new Set(signals.envUsed.map((entry) => entry.name));
  const example = new Set(signals.exampleKeys);
  const missing = [...used].filter((name) => !example.has(name)).sort();
  const stale = [...example].filter((name) => !used.has(name)).sort();

  if (signals.envUsed.length > 0 && !signals.exampleFile) {
    findings.push({
      id: "env-undocumented",
      severity: "attention",
      title: "Environment variables are read in code, and no example file documents them",
      detail: `Add a .env.example with ${andList(missing)}. Foyer only records names, never values.`,
      files: unique(signals.envUsed.flatMap((entry) => entry.references.map((reference) => reference.file))),
    });
    return findings;
  }

  if (missing.length > 0) {
    findings.push({
      id: "env-undocumented",
      severity: "attention",
      title:
        missing.length === 1
          ? `${missing[0]} is read in code and missing from ${signals.exampleFile}`
          : `${missing.length} variables are read in code and missing from ${signals.exampleFile}`,
      detail: `${andList(missing)} ${missing.length === 1 ? "is" : "are"} referenced and absent from ${signals.exampleFile}. A new checkout can boot for the person who already has a private env file and fail for everyone else.`,
      files: unique([
        signals.exampleFile ?? "",
        ...signals.envUsed
          .filter((entry) => missing.includes(entry.name))
          .flatMap((entry) => entry.references.map((reference) => reference.file)),
      ].filter(Boolean)),
    });
  }

  if (stale.length > 0 && signals.exampleFile) {
    findings.push({
      id: "env-stale",
      severity: "watch",
      title:
        stale.length === 1
          ? `${stale[0]} is documented and no longer read`
          : `${stale.length} documented variables are no longer read`,
      detail: `${andList(stale)} ${stale.length === 1 ? "appears" : "appear"} in ${signals.exampleFile} and did not show up as a literal read. Dynamic lookups such as process.env[name] are invisible to this check.`,
      files: [signals.exampleFile],
    });
  }

  return findings;
}

function invocationFindings(
  invocations: Invocation[],
  scripts: Set<string>,
  lockfile: string | null,
): Finding[] {
  const findings: Finding[] = [];
  const installs = invocations.filter((invocation) => invocation.kind === "install");
  if (installs.length > 0 && !lockfile) {
    const files = unique(installs.map((invocation) => invocation.file));
    findings.push({
      id: "npm-ci-without-lockfile",
      severity: "attention",
      title: "A clean install is declared, and there is no lockfile",
      detail: `${sentenceList(files.map((file) => `${file} runs a frozen install`))}. npm ci, and the equivalent pnpm and yarn flags, refuse to run without the lockfile those commands expect.`,
      files,
    });
  }

  const missing = invocations.filter(
    (invocation) => invocation.kind === "script" && invocation.name && !scripts.has(invocation.name),
  );
  if (missing.length > 0) {
    findings.push({
      id: "invoked-missing-scripts",
      severity: "attention",
      title: "A container or workflow calls a script that package.json does not define",
      detail: `${sentenceList(missing.map((invocation) => `${invocation.file} runs \`${invocation.command}\``))}.`,
      files: unique(missing.map((invocation) => invocation.file)),
    });
  }
  return findings;
}

function readmeFindings(
  signals: Signals,
  scripts: Set<string>,
  makeNames: Set<string>,
  findings: Finding[],
): ReadmeCommand[] {
  const commands: ReadmeCommand[] = [];
  for (const readme of signals.readmeFiles) {
    for (const command of readmeCommands(readme.file, readme.text)) {
      const exists =
        command.kind === "script"
          ? scripts.has(command.name)
          : command.kind === "make"
            ? makeNames.has(command.name)
            : signals.services.length > 0;
      commands.push({ ...command, file: readme.file, exists });
    }
  }
  const missing = commands.filter((command) => !command.exists);
  if (missing.length > 0) {
    findings.push({
      id: "readme-missing-commands",
      severity: "attention",
      title: "The README runs commands this checkout does not have",
      detail: `${sentenceList(missing.map((command) => `\`${command.command}\` (${command.file}:${command.line})`))}.`,
      files: unique(missing.map((command) => command.file)),
    });
  }
  return commands;
}

function hygieneFindings(signals: Signals): Finding[] {
  const findings: Finding[] = [];
  const envUsed = signals.envUsed.length > 0 || signals.exampleFile != null;
  const envIgnored = gitignoreCovers(signals.gitignoreText, ".env");
  if (signals.hasDotEnv && !envIgnored) {
    findings.push({
      id: "gitignore-env",
      severity: "attention",
      title: "A .env file is in the tree and .gitignore does not cover it",
      detail:
        "Foyer did not read the values. The file is still one git add away from the history. Add a .env rule before the next commit.",
      files: [".gitignore", ".env"],
    });
  } else if (envUsed && !envIgnored) {
    findings.push({
      id: "gitignore-env",
      severity: "watch",
      title: ".gitignore does not cover .env",
      detail:
        "The code reads environment variables. A local .env created later can be committed unless .gitignore names it.",
      files: [".gitignore"],
    });
  }

  if (signals.hasPackageJson && !gitignoreCovers(signals.gitignoreText, "node_modules")) {
    findings.push({
      id: "gitignore-node-modules",
      severity: "watch",
      title: ".gitignore does not cover node_modules",
      detail: "Installed dependencies will show up as untracked files, and sometimes as a commit.",
      files: [".gitignore"],
    });
  }

  if (signals.hasDockerfile && !signals.hasDockerignore) {
    findings.push({
      id: "dockerignore-missing",
      severity: "watch",
      title: "A Dockerfile has no .dockerignore beside the build",
      detail:
        "COPY . sends the whole build context. .git, local env files, and dependency folders ride along unless .dockerignore says otherwise. .gitignore does not apply to Docker.",
      files: ["Dockerfile"],
    });
  }

  if (!signals.packageLicense && !signals.licenseFile) {
    findings.push({
      id: "license-missing",
      severity: "note",
      title: "No license is declared",
      detail:
        "Without a LICENSE file or a package.json license field, the default is that nobody else has permission to use the code.",
      files: [],
    });
  }

  if (signals.readmeFiles.length === 0) {
    findings.push({
      id: "readme-missing",
      severity: "watch",
      title: "There is no README",
      detail: "Foyer can list scripts and pins. It cannot replace the paragraph that says what this checkout is for.",
      files: [],
    });
  }

  if (
    signals.scripts.length === 0 &&
    signals.makeTargets.length === 0 &&
    signals.services.length === 0 &&
    (signals.hasPackageJson || signals.stack.length > 0)
  ) {
    findings.push({
      id: "no-run-command",
      severity: "note",
      title: "No run command is declared",
      detail: "package.json scripts, a Makefile, and Compose were all quiet. The way to start this checkout is still tribal knowledge.",
      files: [],
    });
  }

  if (signals.workspaces) {
    findings.push({
      id: "workspaces-root-only",
      severity: "note",
      title: "Workspaces are declared, and this briefing is of the root",
      detail: "Nested packages can carry their own scripts and env reads. Open one of those directories for a briefing of that package.",
      files: ["package.json"],
    });
  }

  for (const note of signals.notes) {
    findings.push({
      id: note.id,
      severity: "note",
      title: `Couldn't fully read ${note.file}`,
      detail: note.detail,
      files: [note.file],
    });
  }

  return findings;
}

function sentenceList(items: string[]): string {
  const shown = items.slice(0, 6);
  const extra = items.length - shown.length;
  const sentence = andList(shown);
  return extra > 0 ? `${sentence}, plus ${extra} more` : sentence;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
