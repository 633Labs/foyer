import type { Brief, Finding, Severity } from "@/lib/brief/types";
import { RUNTIME_LABEL } from "@/lib/brief/types";
import { formatUtcDay, headline } from "@/lib/brief/format";
import { toMarkdown } from "@/lib/brief/markdown";

const SEVERITY_LABEL: Record<Severity, string> = {
  attention: "Attention",
  watch: "Watch",
  note: "Note",
};

const SEVERITY_CLASS: Record<Severity, string> = {
  attention: "border-rust",
  watch: "border-amber",
  note: "border-moss",
};

export function BriefView({ brief }: { brief: Brief }) {
  const markdown = toMarkdown(brief);
  const sameName = brief.identity.name === brief.checkout;

  return (
    <article className="mt-10" data-testid="briefing">
      <p className="kicker" data-testid="brief-kicker">
        {brief.location ? brief.location : `Sample · ${brief.checkout}`}
      </p>
      <h1
        className="mt-3 font-heading text-4xl tracking-tight text-foreground sm:text-5xl"
        data-testid="brief-title"
      >
        {brief.checkout}
      </h1>
      {!sameName ? (
        <p className="mt-2 font-mono text-sm text-muted-foreground">{brief.identity.name}</p>
      ) : null}
      {brief.identity.description ? (
        <p className="mt-4 max-w-2xl text-lg leading-8 text-foreground/90">
          {brief.identity.description}
        </p>
      ) : null}
      <p className="mt-4 max-w-2xl text-base leading-7 text-foreground" data-testid="summary">
        {headline(brief.findings)}
      </p>
      <p className="mt-3 text-sm text-muted-foreground">
        {brief.stack.join(" · ") || "No stack markers"}
        {brief.identity.license ? ` · ${brief.identity.license}` : ""}
        {` · ${brief.filesScanned} files`}
        {` · newest file ${formatUtcDay(brief.scannedAt)}`}
      </p>

      <section id="findings" className="mt-10">
        <h2 className="font-heading text-2xl">Findings</h2>
        {brief.findings.length === 0 ? (
          <p
            className="mt-4 border-l-2 border-moss py-1 pl-4 text-base leading-7"
            data-testid="findings-clear"
          >
            Nothing in this checkout disagrees. Runtime pins, environment names, README
            commands, and ignore files all line up with what Foyer could see.
          </p>
        ) : (
          <ol className="mt-4 flex flex-col gap-3">
            {brief.findings.map((finding, index) => (
              <li key={finding.id}>
                <FindingRow finding={finding} index={index + 1} />
              </li>
            ))}
          </ol>
        )}
      </section>

      <Section index="01" title="How to run it">
        {brief.packageManager ? (
          <p className="text-sm leading-6 text-muted-foreground">
            {brief.packageManager.name}
            {brief.packageManager.lockfile
              ? ` · lockfile ${brief.packageManager.lockfile}`
              : " · no lockfile in this checkout"}
            {brief.packageManager.declared ? ` · declared ${brief.packageManager.declared}` : ""}
          </p>
        ) : null}
        {brief.scripts.length > 0 ? (
          <dl className="mt-4 divide-y divide-border border-y border-border">
            {brief.scripts.map((script) => (
              <div key={script.name} className="grid gap-1 py-3 sm:grid-cols-[8rem_1fr] sm:gap-4">
                <dt className="font-mono text-sm">{script.name}</dt>
                <dd className="font-mono text-sm text-muted-foreground break-all">{script.command}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">No package.json scripts.</p>
        )}
        {brief.makeTargets.length > 0 ? (
          <p className="mt-4 text-sm leading-6">
            Make targets:{" "}
            {brief.makeTargets.map((target) => (
              <code key={`${target.file}:${target.name}`} className="mr-2 font-mono text-[0.85em]">
                {target.name}
              </code>
            ))}
          </p>
        ) : null}
        {brief.services.length > 0 ? (
          <ul className="mt-4 flex flex-col gap-2">
            {brief.services.map((service) => (
              <li key={`${service.file}:${service.name}`} className="text-sm leading-6">
                <span className="font-mono">{service.name}</span>
                {service.image ? <span className="text-muted-foreground"> · {service.image}</span> : null}
                {service.ports.length > 0 ? (
                  <span className="text-muted-foreground"> · {service.ports.join(", ")}</span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </Section>

      <Section index="02" title="Environment">
        {brief.env.exampleFile ? (
          <p className="text-sm text-muted-foreground">Names from {brief.env.exampleFile}. Values stay on disk.</p>
        ) : (
          <p className="text-sm text-muted-foreground">No .env.example, .env.sample, or .env.template.</p>
        )}
        {brief.env.used.length === 0 ? (
          <p className="mt-3 text-sm leading-6">No literal environment reads in the source Foyer scanned.</p>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {brief.env.used.map((entry) => {
              const missing = brief.env.missing.includes(entry.name);
              return (
                <li key={entry.name} className="text-sm leading-6">
                  <code className="font-mono">{entry.name}</code>
                  {missing ? <span className="ml-2 text-rust">missing from the example</span> : null}
                  <span className="mt-1 block font-mono text-xs text-muted-foreground">
                    {entry.references
                      .slice(0, 4)
                      .map((reference) => `${reference.file}:${reference.line}`)
                      .join("  ")}
                    {entry.referenceCount > 4 ? `  +${entry.referenceCount - 4}` : ""}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {brief.env.stale.length > 0 ? (
          <p className="mt-4 text-sm leading-6">
            Documented and unread:{" "}
            {brief.env.stale.map((name) => (
              <code key={name} className="mr-2 font-mono">
                {name}
              </code>
            ))}
          </p>
        ) : brief.env.exampleFile && brief.env.missing.length === 0 && brief.env.used.length > 0 ? (
          <p className="mt-4 text-sm leading-6">Every documented name shows up as a literal read.</p>
        ) : null}
      </Section>

      <Section index="03" title="Runtimes">
        {brief.declarations.length === 0 ? (
          <p className="text-sm leading-6">
            No Node, Python, Go, or Ruby version pin showed up in the usual files.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {brief.declarations.map((declaration) => (
              <li
                key={`${declaration.runtime}:${declaration.file}:${declaration.source}:${declaration.raw}`}
                className="grid gap-1 text-sm sm:grid-cols-[5rem_1fr_auto] sm:items-baseline sm:gap-4"
              >
                <span>{RUNTIME_LABEL[declaration.runtime]}</span>
                <span className="font-mono text-xs text-muted-foreground sm:text-sm">
                  {declaration.file}
                  <span className="text-muted-foreground/80"> · {declaration.source}</span>
                </span>
                <span className="font-mono">{declaration.raw}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section index="04" title="Automation">
        {brief.workflows.length === 0 ? (
          <p className="text-sm leading-6">No GitHub Actions workflows.</p>
        ) : (
          <ul className="flex flex-col gap-4">
            {brief.workflows.map((workflow) => (
              <li key={workflow.file}>
                <p className="text-sm">
                  <span className="font-medium">{workflow.name}</span>
                  <span className="text-muted-foreground">
                    {" "}
                    · {workflow.triggers.join(", ") || "no trigger parsed"} · {workflow.file}
                  </span>
                </p>
                <ul className="mt-2 flex flex-col gap-1">
                  {workflow.jobs.map((job) => (
                    <li key={job.name} className="font-mono text-xs text-muted-foreground">
                      {job.name}
                      {job.runsOn ? ` on ${job.runsOn}` : ""}
                      {job.commands.length > 0 ? ` — ${job.commands.join(" · ")}` : ""}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section index="05" title="README commands">
        {brief.readmeCommands.length === 0 ? (
          <p className="text-sm leading-6">
            No npm, yarn, pnpm, bun, make, or Compose commands were found in fenced or inline code.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {brief.readmeCommands.map((command) => (
              <li key={`${command.line}:${command.command}`} className="text-sm leading-6">
                <code className="font-mono">{command.command}</code>
                <span className={command.exists ? "ml-2 text-moss" : "ml-2 text-rust"}>
                  {command.exists ? "matches this checkout" : "missing here"}
                </span>
                <span className="ml-2 font-mono text-xs text-muted-foreground">
                  {command.file}:{command.line}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <details className="border-t border-border py-6">
        <summary className="cursor-pointer text-sm">Markdown briefing</summary>
        <pre className="mt-4 overflow-x-auto whitespace-pre-wrap font-mono text-xs leading-5 text-muted-foreground">
          {markdown}
        </pre>
      </details>
      <details className="border-t border-border py-6">
        <summary className="cursor-pointer text-sm">What was read</summary>
        <ul className="mt-4 columns-1 gap-8 font-mono text-xs leading-6 text-muted-foreground sm:columns-2">
          {brief.evidence.map((file) => (
            <li key={file}>{file}</li>
          ))}
        </ul>
      </details>
    </article>
  );
}

function FindingRow({ finding, index }: { finding: Finding; index: number }) {
  return (
    <article
      className={`border-l-2 py-1 pl-4 ${SEVERITY_CLASS[finding.severity]}`}
      data-testid="finding"
      data-severity={finding.severity}
    >
      <p className="kicker">
        {String(index).padStart(2, "0")} {SEVERITY_LABEL[finding.severity]}
      </p>
      <h3 className="mt-1 text-base font-medium leading-6">{finding.title}</h3>
      <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">{finding.detail}</p>
      {finding.files.length > 0 ? (
        <p className="mt-2 font-mono text-xs text-muted-foreground">{finding.files.join("  ·  ")}</p>
      ) : null}
    </article>
  );
}

function Section({
  index,
  title,
  children,
}: {
  index: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-border py-8">
      <div className="grid gap-4 md:grid-cols-[11rem_1fr] md:gap-8">
        <div>
          <p className="kicker">{index}</p>
          <h2 className="mt-1 font-heading text-2xl tracking-tight">{title}</h2>
        </div>
        <div>{children}</div>
      </div>
    </section>
  );
}
