const port = process.env.PORT ?? "3000";
const databaseUrl = process.env.DATABASE_URL;
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

if (!databaseUrl || !webhookSecret) {
  throw new Error("Harbor is missing database or webhook configuration.");
}

export function listen(): string {
  return `Harbor listening on ${port}`;
}
