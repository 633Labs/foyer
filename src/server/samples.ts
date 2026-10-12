import path from "path";
import { scanRepository } from "@/lib/brief/scan";
import type { Brief } from "@/lib/brief/types";

export const SAMPLES = {
  "harbor-api": "Harbor API",
  "tidy-lib": "Tidy Lib",
} as const;

export type SampleId = keyof typeof SAMPLES;

export function isSampleId(value: string): value is SampleId {
  return Object.prototype.hasOwnProperty.call(SAMPLES, value);
}

export async function loadSampleBrief(id: SampleId): Promise<Brief> {
  "use cache";
  return scanRepository(path.join(process.cwd(), "samples", id), {
    checkout: SAMPLES[id],
    location: null,
  });
}
