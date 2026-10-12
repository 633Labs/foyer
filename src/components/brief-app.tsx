"use client";

import { useActionState, useState } from "react";
import { scanAction } from "@/app/actions";
import { BriefView } from "@/components/brief-view";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toMarkdown } from "@/lib/brief/markdown";
import type { Brief, ScanState } from "@/lib/brief/types";

export function BriefApp({
  initial,
  allowLocal,
}: {
  initial: Brief;
  allowLocal: boolean;
}) {
  const [state, formAction, pending] = useActionState(scanAction, {
    brief: initial,
    error: null,
    active: "harbor-api",
  } satisfies ScanState);
  const [copied, setCopied] = useState(false);

  async function copyBriefing() {
    const markdown = toMarkdown(state.brief);
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
      <p className="kicker">After clone</p>
      <p className="mt-3 max-w-2xl font-heading text-3xl leading-tight tracking-tight sm:text-4xl">
        A briefing from the files in a checkout.
      </p>
      <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
        Run commands, environment names, runtime pins, and the README, compared on the
        machine where Foyer is running. Nothing is installed, and values from env files
        are never copied into the briefing.
      </p>

      <form action={formAction} className="mt-8 border border-border bg-card p-4 sm:p-5" aria-busy={pending}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="kicker">Samples</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                type="submit"
                name="fixture"
                value="harbor-api"
                variant={state.active === "harbor-api" ? "default" : "outline"}
                className="h-10 px-3"
                disabled={pending}
              >
                Harbor API
              </Button>
              <Button
                type="submit"
                name="fixture"
                value="tidy-lib"
                variant={state.active === "tidy-lib" ? "default" : "outline"}
                className="h-10 px-3"
                disabled={pending}
              >
                Tidy Lib
              </Button>
            </div>
            <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
              Harbor is a payments service whose files disagree. Tidy Lib is the same
              kind of checkout after the disagreements are gone.
            </p>
          </div>
          <div className="w-full lg:max-w-md">
            <label htmlFor="checkout-path" className="kicker">
              Local checkout
            </label>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <Input
                id="checkout-path"
                name="path"
                placeholder="/absolute/path/to/checkout"
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                autoComplete="off"
                disabled={!allowLocal || pending}
                className="h-10 bg-background font-mono text-sm"
              />
              <Button type="submit" className="h-10 px-4" disabled={!allowLocal || pending}>
                {pending ? "Reading…" : "Scan checkout"}
              </Button>
            </div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {allowLocal
                ? "Absolute path on this machine. The two samples work without one."
                : "This copy only opens the two samples. Run Foyer locally to brief a checkout on disk."}
            </p>
          </div>
        </div>
      </form>

      {state.error ? (
        <p
          role="alert"
          data-testid="scan-error"
          className="mt-4 border-l-2 border-rust py-1 pl-4 text-sm leading-6"
        >
          {state.error}
        </p>
      ) : null}

      <div className="mt-6 flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {pending ? "Reading the checkout…" : copied ? "Briefing copied." : ""}
        </p>
        <Button type="button" variant="outline" className="h-10 px-3" onClick={copyBriefing}>
          Copy briefing
        </Button>
      </div>

      <BriefView brief={state.brief} />
    </main>
  );
}
