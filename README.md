# tv-goldviewfx

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run index.ts
```

## Extract TradingView ideas -> Postgres/Supabase

1) Create the table:

```bash
# Postgres or Supabase SQL editor
psql "$DATABASE_URL" -f schema.sql
```

2) Run the extractor against your saved HTML:

```bash
# Uses tradingview.html by default
DATABASE_URL="postgresql://user:pass@host:5432/dbname?sslmode=require" bun run index.ts
```

Optional flags/env:

- `--html <path>` or `TRADINGVIEW_HTML_PATH` to point to a different HTML file
- `--table <name>` or `TV_TABLE` to change the target table
- `--dry-run` or `DRY_RUN=1` to skip DB writes
- `--json` or `OUTPUT_JSON=1` to write `articles.json` for inspection
- `--fetch-full` or `FETCH_FULL=1` to fetch each idea page and store full content
- `--include-updates` or `INCLUDE_UPDATES=1` to include timeline updates in `content`
- `--store-updates` or `STORE_UPDATES=1` to store each timeline update as a row in `tradingview_idea_updates`
- `--concurrency <n>` or `FETCH_CONCURRENCY` to control fetch parallelism (default 3)
- `--delay-ms <n>` or `FETCH_DELAY_MS` to add delay before each fetch

Notes:

- For Supabase, use the project’s Postgres connection string and include `?sslmode=require`.
- The TradingView profile page only includes the truncated idea text. Use `--fetch-full` to hydrate full text from each idea URL.
- If you enable `--store-updates`, run `schema.sql` again to create the `tradingview_idea_updates` table.

This project was created using `bun init` in bun v1.3.1. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
