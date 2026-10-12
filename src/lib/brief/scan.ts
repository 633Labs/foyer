import fs from "fs";
import path from "path";
import type { Brief, ScanOptions } from "./types";
import { extractSignals } from "./extract";
import { buildFindings } from "./findings";
import { listFiles } from "./walk";

const BLOCKED_PREFIXES = [
  "/etc",
  "/proc",
  "/sys",
  "/dev",
  "/boot",
  "/root",
  "/var/log",
  "/var/run",
  "/bin",
  "/sbin",
  "/usr/bin",
  "/usr/sbin",
];

export class ScanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScanError";
  }
}

export function scanRepository(root: string, options: ScanOptions): Brief {
  const resolved = assertDirectory(root);
  const listed = listFiles(resolved);
  const signals = extractSignals(options.checkout, listed.files);
  const { findings, readmeCommands } = buildFindings(signals);
  if (listed.truncated) {
    findings.push({
      id: "scan-truncated",
      severity: "note",
      title: "The scan stopped at 4,000 files",
      detail: "Deeper files were left unread. Point Foyer at a single package if this checkout is a large monorepo.",
      files: [],
    });
  }
  const newest = listed.files.reduce((max, file) => Math.max(max, file.mtimeMs), 0);

  const used = new Set(signals.envUsed.map((entry) => entry.name));
  const example = new Set(signals.exampleKeys);

  return {
    checkout: options.checkout,
    location: options.location ?? null,
    scannedAt: new Date(newest || 0).toISOString(),
    filesScanned: listed.files.length,
    truncated: listed.truncated,
    identity: {
      name: signals.identityName ?? options.checkout,
      description: signals.description,
      license: signals.packageLicense ?? signals.licenseFile,
      readmeTitle: signals.readmeTitle,
    },
    stack: signals.stack,
    packageManager: signals.packageManager,
    scripts: signals.scripts,
    makeTargets: signals.makeTargets,
    services: signals.services,
    env: {
      used: signals.envUsed,
      exampleKeys: signals.exampleKeys,
      exampleFile: signals.exampleFile,
      missing: signals.exampleFile
        ? [...used].filter((name) => !example.has(name)).sort()
        : [...used].sort(),
      stale: signals.exampleFile
        ? [...example].filter((name) => !used.has(name)).sort()
        : [],
    },
    declarations: signals.declarations,
    workflows: signals.workflows,
    readmeCommands,
    findings,
    evidence: signals.evidence,
  };
}

export function assertDirectory(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) throw new ScanError("Enter the absolute path of a checkout.");
  if (trimmed.includes("\0")) throw new ScanError("That path is not a checkout.");
  if (!path.isAbsolute(trimmed)) {
    throw new ScanError("Use an absolute path, such as /absolute/path/to/checkout.");
  }
  const resolved = path.resolve(trimmed);
  if (!fs.existsSync(resolved)) throw new ScanError(`No directory at ${resolved}.`);
  let real: string;
  try {
    real = fs.realpathSync(resolved);
  } catch {
    throw new ScanError(`Can't read ${resolved}.`);
  }
  if (isBlocked(real)) {
    throw new ScanError("That path is too broad to scan. Point Foyer at a single checkout.");
  }
  let stat: fs.Stats;
  try {
    stat = fs.statSync(real);
  } catch {
    throw new ScanError(`Can't read ${real}.`);
  }
  if (!stat.isDirectory()) throw new ScanError(`${real} is a file, not a checkout.`);
  return real;
}

function isBlocked(real: string): boolean {
  if (real === "/") return true;
  return BLOCKED_PREFIXES.some(
    (prefix) => real === prefix || real.startsWith(`${prefix}/`),
  );
}
