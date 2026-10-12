import type { Constraint, Pin, RuntimeName, VersionParts } from "./types";

type Triple = [number, number, number];

export function parsePin(raw: string): Pin | null {
  const cleaned = raw
    .trim()
    .replace(/^v/i, "")
    .replace(/\.x$/i, "")
    .replace(/\.\*$/, "");
  const match = cleaned.match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?$/);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: match[2] != null ? Number(match[2]) : null,
    patch: match[3] != null ? Number(match[3]) : null,
    raw: raw.trim(),
  };
}

export function pinFromImageTag(tag: string): Pin | null {
  const leading = tag.split("@")[0]?.split("-")[0] ?? tag;
  if (!leading || /^(latest|lts|stable|alpine|slim)$/i.test(leading)) return null;
  if (leading.includes("${")) return null;
  return parsePin(leading);
}

export function parseConstraint(input: string): Constraint {
  const raw = input.trim();
  if (!raw) return { op: "unknown" };
  const orParts = splitTop(raw, "||");
  if (orParts.length > 1) {
    return { op: "or", parts: orParts.map((part) => parseAnd(part)) };
  }
  return parseAnd(raw);
}

export function pinSatisfies(constraint: Constraint, pin: Pin): boolean | null {
  const low = satisfies(constraint, versionAt(pin, "low"));
  const high = satisfies(constraint, versionAt(pin, "high"));
  if (low === true && high === true) return true;
  if (low === false && high === false) return false;
  return null;
}

export type PinDrift =
  | { level: "none"; keys: string[] }
  | { level: "release" | "minor"; keys: string[] };

export function comparePins(runtime: RuntimeName, pins: Pin[]): PinDrift {
  if (pins.length < 2) return { level: "none", keys: [] };

  const releaseKeys = unique(
    pins
      .map((pin) => releaseKey(runtime, pin))
      .filter((key): key is string => key != null),
  );
  if (releaseKeys.length > 1) {
    return { level: "release", keys: sortVersionKeys(releaseKeys) };
  }

  if (runtime === "node") {
    const minors = unique(
      pins
        .filter((pin) => pin.minor != null)
        .map((pin) => `${pin.major}.${pin.minor}`),
    );
    if (minors.length > 1) return { level: "minor", keys: sortVersionKeys(minors) };
  } else {
    const patches = unique(
      pins
        .filter((pin) => pin.minor != null && pin.patch != null)
        .map((pin) => `${pin.major}.${pin.minor}.${pin.patch}`),
    );
    if (patches.length > 1) return { level: "minor", keys: sortVersionKeys(patches) };
  }

  return { level: "none", keys: releaseKeys };
}

export function sortVersionKeys(keys: string[]): string[] {
  return [...keys].sort((a, b) => {
    const left = a.split(".").map(Number);
    const right = b.split(".").map(Number);
    const length = Math.max(left.length, right.length);
    for (let index = 0; index < length; index += 1) {
      const delta = (left[index] ?? -1) - (right[index] ?? -1);
      if (delta !== 0) return delta;
    }
    return 0;
  });
}

function releaseKey(runtime: RuntimeName, pin: Pin): string | null {
  if (runtime === "node") return String(pin.major);
  if (pin.minor == null) return null;
  return `${pin.major}.${pin.minor}`;
}

function versionAt(pin: Pin, end: "low" | "high"): Triple {
  if (pin.minor == null) {
    return end === "low" ? [pin.major, 0, 0] : [pin.major, 999, 999];
  }
  if (pin.patch == null) {
    return end === "low"
      ? [pin.major, pin.minor, 0]
      : [pin.major, pin.minor, 999];
  }
  return [pin.major, pin.minor, pin.patch];
}

function satisfies(constraint: Constraint, tuple: Triple): boolean | null {
  switch (constraint.op) {
    case "any":
      return true;
    case "unknown":
      return null;
    case "or": {
      const parts = constraint.parts.map((part) => satisfies(part, tuple));
      if (parts.some((part) => part === true)) return true;
      if (parts.every((part) => part === false)) return false;
      return null;
    }
    case "and": {
      const parts = constraint.parts.map((part) => satisfies(part, tuple));
      if (parts.some((part) => part === false)) return false;
      if (parts.every((part) => part === true)) return true;
      return null;
    }
    case "cmp":
      return satisfiesCmp(constraint.sign, constraint.version, tuple);
    case "caret":
      return satisfiesCaret(constraint.version, tuple);
    case "tilde":
      return satisfiesTilde(constraint.version, tuple);
    default:
      return null;
  }
}

function satisfiesCmp(
  sign: ">=" | ">" | "<=" | "<" | "=",
  version: VersionParts,
  tuple: Triple,
): boolean {
  const point: Triple = [version.major, version.minor ?? 0, version.patch ?? 0];
  const delta = compareTriple(tuple, point);
  if (sign === "=") return delta === 0;
  if (sign === ">=") return delta >= 0;
  if (sign === ">") return delta > 0;
  if (sign === "<=") return delta <= 0;
  return delta < 0;
}

function satisfiesCaret(version: VersionParts, tuple: Triple): boolean {
  const minor = version.minor ?? 0;
  const patch = version.patch ?? 0;
  const lower: Triple = [version.major, minor, patch];
  let upper: Triple;
  if (version.major > 0) upper = [version.major + 1, 0, 0];
  else if (version.minor == null) upper = [1, 0, 0];
  else if (version.minor === 0) upper = [0, 0, patch + 1];
  else upper = [0, minor + 1, 0];
  return compareTriple(tuple, lower) >= 0 && compareTriple(tuple, upper) < 0;
}

function satisfiesTilde(version: VersionParts, tuple: Triple): boolean {
  const minor = version.minor ?? 0;
  const patch = version.patch ?? 0;
  const lower: Triple = [version.major, minor, patch];
  const upper: Triple =
    version.minor == null
      ? [version.major + 1, 0, 0]
      : [version.major, minor + 1, 0];
  return compareTriple(tuple, lower) >= 0 && compareTriple(tuple, upper) < 0;
}

function compareTriple(left: Triple, right: Triple): number {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

function parseAnd(raw: string): Constraint {
  const parts = raw.trim().split(/\s+/).filter(Boolean);
  if (parts.length > 1) return { op: "and", parts: parts.map((part) => parseAtom(part)) };
  return parseAtom(raw.trim());
}

function parseAtom(token: string): Constraint {
  if (token === "*" || token.toLowerCase() === "x") return { op: "any" };
  const comparator = token.match(/^(>=|<=|>|<|=)\s*(.+)$/);
  if (comparator) {
    const version = parseVer(comparator[2] ?? "");
    if (!version) return { op: "unknown" };
    return {
      op: "cmp",
      sign: comparator[1] as ">=" | ">" | "<=" | "<" | "=",
      version: version.parts,
    };
  }
  if (token.startsWith("^") || token.startsWith("~")) {
    const version = parseVer(token.slice(1));
    if (!version) return { op: "unknown" };
    return {
      op: token.startsWith("^") ? "caret" : "tilde",
      version: version.parts,
    };
  }
  const bare = parseVer(token);
  if (!bare) return { op: "unknown" };
  return bareRange(bare);
}

function bareRange(parsed: ParsedVer): Constraint {
  const { parts, wildMinor, wildPatch } = parsed;
  if (wildMinor || parts.minor == null) {
    return {
      op: "and",
      parts: [
        { op: "cmp", sign: ">=", version: { major: parts.major, minor: 0, patch: 0 } },
        { op: "cmp", sign: "<", version: { major: parts.major + 1, minor: 0, patch: 0 } },
      ],
    };
  }
  if (wildPatch || parts.patch == null) {
    return {
      op: "and",
      parts: [
        {
          op: "cmp",
          sign: ">=",
          version: { major: parts.major, minor: parts.minor, patch: 0 },
        },
        {
          op: "cmp",
          sign: "<",
          version: { major: parts.major, minor: parts.minor + 1, patch: 0 },
        },
      ],
    };
  }
  return { op: "cmp", sign: "=", version: parts };
}

type ParsedVer = {
  parts: VersionParts;
  wildMinor: boolean;
  wildPatch: boolean;
};

function parseVer(token: string): ParsedVer | null {
  const cleaned = token.trim().replace(/^v/i, "");
  const match = cleaned.match(/^(\d+|x|\*)(?:\.(\d+|x|\*))?(?:\.(\d+|x|\*))?$/i);
  if (!match || match[1] == null) return null;
  if (match[1] === "*" || match[1].toLowerCase() === "x") return null;
  const major = Number(match[1]);
  const wildMinor = match[2] != null && /^(x|\*)$/i.test(match[2]);
  const wildPatch = match[3] != null && /^(x|\*)$/i.test(match[3]);
  const minor =
    match[2] == null || wildMinor ? null : Number(match[2]);
  const patch =
    match[3] == null || wildPatch ? null : Number(match[3]);
  return { parts: { major, minor, patch }, wildMinor, wildPatch };
}

function splitTop(input: string, separator: string): string[] {
  return input
    .split(separator)
    .map((part) => part.trim())
    .filter(Boolean);
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
