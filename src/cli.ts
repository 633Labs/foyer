import path from "node:path";
import { toMarkdown } from "./lib/brief/markdown";
import { ScanError, scanRepository } from "./lib/brief/scan";

const args = process.argv.slice(2).filter((arg) => arg !== "--");
const json = args.includes("--json");
const strict = args.includes("--strict");
const target = args.find((arg) => !arg.startsWith("--"));

if (!target) {
  process.stderr.write(
    "Usage: npm run brief -- <checkout> [--json] [--strict]\n\nPrints a briefing for a checkout. Exits 1 when something needs attention.\n--strict also exits 1 for items worth a look.\n",
  );
  process.exit(2);
}

try {
  const root = path.resolve(process.cwd(), target);
  const brief = scanRepository(root, {
    checkout: path.basename(root),
    location: root,
  });
  process.stdout.write(json ? `${JSON.stringify(brief, null, 2)}\n` : toMarkdown(brief));
  const failed = brief.findings.some((finding) =>
    strict ? finding.severity !== "note" : finding.severity === "attention",
  );
  process.exit(failed ? 1 : 0);
} catch (error) {
  const message = error instanceof ScanError ? error.message : "Foyer could not read that checkout.";
  process.stderr.write(`${message}\n`);
  process.exit(2);
}
