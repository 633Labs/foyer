export function localScanAllowed(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.FOYER_ALLOW_LOCAL_SCAN === "1";
}
