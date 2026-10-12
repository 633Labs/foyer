import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ScanError, scanRepository } from "./scan";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function writeRepo(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "foyer-"));
  tempDirs.push(dir);
  for (const [name, contents] of Object.entries(files)) {
    const full = path.join(dir, name);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, contents);
  }
  return dir;
}

describe("sample checkouts", () => {
  it("briefs Harbor with the disagreements a newcomer would hit", () => {
    const brief = scanRepository(path.join(process.cwd(), "samples/harbor-api"), {
      checkout: "Harbor API",
    });
    const ids = brief.findings.map((finding) => finding.id);

    expect(brief.identity.name).toBe("harbor-api");
    expect(brief.env.missing).toEqual(["STRIPE_WEBHOOK_SECRET"]);
    expect(brief.env.stale).toEqual(["UNUSED_REDIS_URL"]);
    expect(ids).toEqual(
      expect.arrayContaining([
        "runtime-node-release",
        "runtime-python-release",
        "env-undocumented",
        "env-stale",
        "npm-ci-without-lockfile",
        "invoked-missing-scripts",
        "readme-missing-commands",
        "gitignore-env",
        "dockerignore-missing",
        "license-missing",
      ]),
    );
    expect(brief.services.map((service) => service.name).sort()).toEqual(["api", "db"]);
    expect(brief.readmeCommands.find((command) => command.name === "seed")?.exists).toBe(false);
    expect(brief.readmeCommands.find((command) => command.name === "test")?.exists).toBe(true);

    const serialized = JSON.stringify(brief);
    expect(serialized).not.toContain("postgres://localhost");
    expect(serialized).not.toContain("UNUSED_REDIS_URL=");
  });

  it("briefs Tidy Lib with an empty finding list", () => {
    const brief = scanRepository(path.join(process.cwd(), "samples/tidy-lib"), {
      checkout: "Tidy Lib",
    });
    expect(brief.findings).toEqual([]);
    expect(brief.env.missing).toEqual([]);
    expect(brief.packageManager?.lockfile).toBe("package-lock.json");
  });
});

describe("path checks", () => {
  it("refuses a relative path and a file", () => {
    expect(() => scanRepository("samples/harbor-api", { checkout: "x" })).toThrow(ScanError);
    expect(() =>
      scanRepository(path.join(process.cwd(), "samples/tidy-lib/package.json"), {
        checkout: "x",
      }),
    ).toThrow(/file/);
  });

  it("reports an engines range that excludes the image", () => {
    const dir = writeRepo({
      "package.json": JSON.stringify({
        name: "narrow",
        engines: { node: ">=20" },
        scripts: { start: "node server.js" },
      }),
      ".nvmrc": "20\n",
      Dockerfile: "FROM node:18-alpine\n",
      ".gitignore": "node_modules/\n.env\n",
      ".dockerignore": ".git\n",
      "README.md": "# Narrow\n",
      LICENSE: "MIT License\n",
    });
    const brief = scanRepository(dir, { checkout: "narrow" });
    expect(brief.findings.map((finding) => finding.id)).toContain("engines-node-excludes");
    expect(brief.findings.map((finding) => finding.id)).toContain("runtime-node-release");
  });
});

describe("CLI", () => {
  it("prints the Harbor briefing", () => {
    let output = "";
    try {
      output = execFileSync(
        "node",
        ["--import", "tsx", "src/cli.ts", "samples/harbor-api"],
        { encoding: "utf8", cwd: process.cwd() },
      );
    } catch (error) {
      const failed = error as { stdout?: string; status?: number };
      output = failed.stdout ?? "";
      expect(failed.status).toBe(1);
    }
    expect(output).toContain("STRIPE_WEBHOOK_SECRET");
    expect(output).toContain("# harbor-api");
  });
});
