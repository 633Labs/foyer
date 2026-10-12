import Link from "next/link";

export function SiteHeader({ current }: { current: "brief" | "why" }) {
  return (
    <header className="border-b border-border bg-background/90">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <Link href="/" className="font-heading text-[1.7rem] leading-none tracking-tight text-foreground">
          Foyer
        </Link>
        <nav className="flex items-center gap-5 text-sm">
          <Link
            href="/"
            aria-current={current === "brief" ? "page" : undefined}
            className={navClass(current === "brief")}
          >
            Briefing
          </Link>
          <Link
            href="/why"
            aria-current={current === "why" ? "page" : undefined}
            className={navClass(current === "why")}
          >
            Why this exists
          </Link>
        </nav>
      </div>
    </header>
  );
}

function navClass(active: boolean): string {
  return active
    ? "text-foreground underline decoration-rust decoration-2 underline-offset-4"
    : "text-muted-foreground hover:text-foreground";
}
