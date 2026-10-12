const port = process.env.PORT ?? "8080";

export function ledgerLabel(id: string): string {
  return `ld_${id}@${port}`;
}
