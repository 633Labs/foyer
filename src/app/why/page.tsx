import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: "Why this exists",
  description:
    "Why a local briefing for a fresh checkout is still a thin spot in developer tooling.",
};

export default function WhyPage() {
  return (
    <>
      <SiteHeader current="why" />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6 sm:py-14">
        <p className="kicker">Market notes · October 2026</p>
        <h1 className="mt-3 font-heading text-4xl tracking-tight sm:text-5xl">
          The first hour after clone is still a pile of separate checks.
        </h1>
        <div className="mt-8 flex flex-col gap-6 text-base leading-8 text-foreground/90">
          <p>
            Someone joins a repository. The README says how to start it. CI installs a
            different runtime. The Dockerfile installs a third. A variable the code reads
            is missing from <code className="font-mono text-[0.92em]">.env.example</code>.
            A command in the README points at a script that was renamed last quarter.
            The person who knows which of those is real is on another team.
          </p>
          <p>
            That hour is well described and thinly served as a single artifact. The
            tools around it each settle a narrower question.
          </p>
        </div>

        <div className="mt-10 overflow-x-auto border border-border">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <thead className="bg-muted/60 text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">What people reach for</th>
                <th className="px-4 py-3 font-medium">What it settles</th>
                <th className="px-4 py-3 font-medium">What it leaves open</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              <tr>
                <td className="px-4 py-3 align-top">Internal portals such as Backstage</td>
                <td className="px-4 py-3 align-top">A catalog, owners, and links for a platform team</td>
                <td className="px-4 py-3 align-top">A small repo still depends on a portal somebody has to run</td>
              </tr>
              <tr>
                <td className="px-4 py-3 align-top">Dev Containers, mise, asdf</td>
                <td className="px-4 py-3 align-top">Rebuilding the toolchain from a pin file</td>
                <td className="px-4 py-3 align-top">The pin file can disagree with CI and the image, quietly</td>
              </tr>
              <tr>
                <td className="px-4 py-3 align-top">
                  Single-check CLIs: node-drift, toolchain-version-doctor, envsniff,
                  driftguard, ignorewhy
                </td>
                <td className="px-4 py-3 align-top">One disagreement, as a pass or fail</td>
                <td className="px-4 py-3 align-top">You already have to know which question to ask</td>
              </tr>
              <tr>
                <td className="px-4 py-3 align-top">A generated tour of the repo</td>
                <td className="px-4 py-3 align-top">A fluent summary</td>
                <td className="px-4 py-3 align-top">The summary is hard to check against a file and a line</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="mt-10 flex flex-col gap-6 text-base leading-8">
          <p>
            The 2025–2026 wave of drift checkers is evidence the pain is real. node-drift
            compares Node pins across <code className="font-mono text-[0.92em]">.nvmrc</code>,
            engines, Dockerfiles, and Actions. envsniff and driftguard compare code to{" "}
            <code className="font-mono text-[0.92em]">.env.example</code>. ignorewhy
            compares gitignore with dockerignore and npm pack. Each one is a useful exit
            code. None of them is the page you hand someone on Monday morning.
          </p>
          <h2 className="font-heading text-3xl tracking-tight">The proposal</h2>
          <p>
            Foyer writes that page from the checkout. It is a local static read: scripts,
            Make targets, Compose services, environment names, runtime declarations, GitHub
            Actions jobs, and commands in the README. Where those files disagree, the
            briefing says so, with the path attached.
          </p>
          <p>
            Harbor API, included in this repo, is a small payments service with the
            ordinary mess: Node 18 in the image, 20 in <code className="font-mono text-[0.92em]">.nvmrc</code>,
            22 in CI, a webhook secret the example file forgot, and a README that still
            runs <code className="font-mono text-[0.92em]">make seed</code>. Tidy Lib is
            the same shape of project once those files agree. The contrast is the product
            demo.
          </p>
          <h2 className="font-heading text-3xl tracking-tight">What a briefing will not claim</h2>
          <ul className="list-disc space-y-2 pl-5">
            <li>It does not install dependencies, boot the app, or prove the tests pass.</li>
            <li>
              <code className="font-mono text-[0.92em]">process.env[name]</code> and other
              dynamic lookups stay invisible.
            </li>
            <li>
              Version comparison understands majors, ranges, and a few image tags. It
              leaves LTS codenames uncompared and says so.
            </li>
            <li>
              Ignore matching covers the patterns that leak <code className="font-mono text-[0.92em]">.env</code>{" "}
              and <code className="font-mono text-[0.92em]">node_modules</code>. It is
              smaller than git&apos;s full matcher.
            </li>
            <li>Env file values are never copied into the briefing or the markdown export.</li>
          </ul>
          <p>
            The CLI is the same engine:{" "}
            <code className="font-mono text-[0.92em]">npm run brief -- /absolute/path/to/checkout</code>.
            It exits 1 when a finding needs attention, so a workflow can run it. The page
            is for reading.
          </p>
          <p>
            <Link href="/" className="underline decoration-rust decoration-2 underline-offset-4">
              Open the Harbor briefing
            </Link>
            .
          </p>
        </div>
      </main>
    </>
  );
}
