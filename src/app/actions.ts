"use server";

import path from "path";
import { ScanError, scanRepository } from "@/lib/brief/scan";
import type { ScanState } from "@/lib/brief/types";
import { localScanAllowed } from "@/server/access";
import { SAMPLES, isSampleId } from "@/server/samples";

export async function scanAction(prev: ScanState, formData: FormData): Promise<ScanState> {
  const fixture = String(formData.get("fixture") ?? "");
  if (isSampleId(fixture)) {
    try {
      const brief = scanRepository(path.join(process.cwd(), "samples", fixture), {
        checkout: SAMPLES[fixture],
        location: null,
      });
      return { brief, error: null, active: fixture };
    } catch (error) {
      return { ...prev, error: messageOf(error) };
    }
  }

  if (!localScanAllowed()) {
    return {
      ...prev,
      error: "This copy only opens the two samples. Run Foyer on your machine to brief a checkout on disk.",
    };
  }

  const raw = String(formData.get("path") ?? "").trim();
  if (!raw) {
    return { ...prev, error: "Enter the absolute path of a checkout." };
  }

  try {
    const root = path.resolve(raw);
    const directory = requireAbsolute(root, raw);
    const brief = scanRepository(directory, {
      checkout: path.basename(directory),
      location: directory,
    });
    return { brief, error: null, active: "path" };
  } catch (error) {
    return { ...prev, error: messageOf(error) };
  }
}

function requireAbsolute(resolved: string, raw: string): string {
  if (!path.isAbsolute(raw)) {
    throw new ScanError("Use an absolute path, such as /absolute/path/to/checkout.");
  }
  return resolved;
}

function messageOf(error: unknown): string {
  if (error instanceof ScanError) return error.message;
  return "Foyer could not read that checkout.";
}
