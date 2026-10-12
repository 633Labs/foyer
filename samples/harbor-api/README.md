# Harbor

Harbor accepts Stripe webhooks and writes each event into Postgres.

## Run

```bash
npm install
npm run start:dev
```

The API listens on port 3000. Postgres comes up with:

```bash
docker compose up
```

## Tests

```bash
npm test
```

## Data

```bash
make seed
```
