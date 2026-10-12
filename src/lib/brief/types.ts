export type Severity = "attention" | "watch" | "note";

export type RuntimeName = "node" | "python" | "go" | "ruby";

export const RUNTIME_LABEL: Record<RuntimeName, string> = {
  node: "Node",
  python: "Python",
  go: "Go",
  ruby: "Ruby",
};

export type ScriptKind = "dev" | "start" | "test" | "build" | "lint" | "other";

export type Script = {
  name: string;
  command: string;
  kind: ScriptKind;
};

export type MakeTarget = {
  name: string;
  file: string;
};

export type ComposeService = {
  name: string;
  image: string | null;
  ports: string[];
  file: string;
};

export type EnvReference = {
  file: string;
  line: number;
};

export type EnvVar = {
  name: string;
  references: EnvReference[];
  referenceCount: number;
};

export type Pin = {
  major: number;
  minor: number | null;
  patch: number | null;
  raw: string;
};

export type VersionParts = {
  major: number;
  minor: number | null;
  patch: number | null;
};

export type Constraint =
  | { op: "any" }
  | { op: "unknown" }
  | { op: "or"; parts: Constraint[] }
  | { op: "and"; parts: Constraint[] }
  | { op: "cmp"; sign: ">=" | ">" | "<=" | "<" | "="; version: VersionParts }
  | { op: "caret"; version: VersionParts }
  | { op: "tilde"; version: VersionParts };

export type Declaration = {
  runtime: RuntimeName;
  file: string;
  raw: string;
  source: string;
  pin: Pin | null;
  constraint: Constraint | null;
  unresolved: boolean;
};

export type Invocation = {
  file: string;
  command: string;
  kind: "script" | "make" | "install" | "compose";
  name: string | null;
};

export type WorkflowJob = {
  name: string;
  runsOn: string | null;
  commands: string[];
};

export type Workflow = {
  file: string;
  name: string;
  triggers: string[];
  jobs: WorkflowJob[];
};

export type ReadmeCommand = {
  file: string;
  line: number;
  command: string;
  kind: "script" | "make" | "compose";
  name: string;
  exists: boolean;
};

export type Finding = {
  id: string;
  severity: Severity;
  title: string;
  detail: string;
  files: string[];
};

export type Identity = {
  name: string;
  description: string | null;
  license: string | null;
  readmeTitle: string | null;
};

export type PackageManager = {
  name: "npm" | "pnpm" | "yarn" | "bun";
  lockfile: string | null;
  declared: string | null;
};

export type Brief = {
  checkout: string;
  location: string | null;
  scannedAt: string;
  filesScanned: number;
  truncated: boolean;
  identity: Identity;
  stack: string[];
  packageManager: PackageManager | null;
  scripts: Script[];
  makeTargets: MakeTarget[];
  services: ComposeService[];
  env: {
    used: EnvVar[];
    exampleKeys: string[];
    exampleFile: string | null;
    missing: string[];
    stale: string[];
  };
  declarations: Declaration[];
  workflows: Workflow[];
  readmeCommands: ReadmeCommand[];
  findings: Finding[];
  evidence: string[];
};

export type ScanState = {
  brief: Brief;
  error: string | null;
  active: "harbor-api" | "tidy-lib" | "path";
};

export type ScanOptions = {
  checkout: string;
  location?: string | null;
};
