import { connection } from "next/server";
import { Suspense } from "react";
import { BriefApp } from "@/components/brief-app";
import { SiteHeader } from "@/components/site-header";
import { localScanAllowed } from "@/server/access";
import { loadSampleBrief } from "@/server/samples";

export default function Page() {
  return (
    <>
      <SiteHeader current="brief" />
      <Suspense fallback={<OpeningSample />}>
        <LoadedBrief />
      </Suspense>
    </>
  );
}

async function LoadedBrief() {
  await connection();
  const brief = await loadSampleBrief("harbor-api");
  return <BriefApp initial={brief} allowLocal={localScanAllowed()} />;
}

function OpeningSample() {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">
      <p className="kicker">Opening the sample</p>
      <h1 className="mt-3 font-heading text-4xl tracking-tight">Harbor API</h1>
      <p className="mt-3 max-w-xl text-muted-foreground">
        Reading the checkout that ships with Foyer.
      </p>
    </main>
  );
}
