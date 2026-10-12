export function andList(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

export function headline(findings: { severity: string }[]): string {
  const attention = findings.filter((finding) => finding.severity === "attention").length;
  const watch = findings.filter((finding) => finding.severity === "watch").length;
  const notes = findings.filter((finding) => finding.severity === "note").length;
  if (attention === 0 && watch === 0 && notes === 0) {
    return "The files Foyer compared agree with each other.";
  }
  const parts: string[] = [];
  if (attention > 0) {
    parts.push(
      attention === 1
        ? "1 thing to fix before you trust the setup"
        : `${attention} things to fix before you trust the setup`,
    );
  }
  if (watch > 0) {
    parts.push(watch === 1 ? "1 worth a look" : `${watch} worth a look`);
  }
  if (notes > 0 && attention === 0 && watch === 0) {
    parts.push(notes === 1 ? "1 note" : `${notes} notes`);
  }
  const sentence = parts.join(", ");
  return `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}.`;
}

export function formatUtcDay(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("en-GB", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
