# Convex Migration (Legacy Data)

This project migrates legacy database data into Convex using the Convex CLI.
Follow the Convex data import docs for supported formats and limits.

## Export legacy data

Export tables from the legacy database into JSONL files:

```bash
LEGACY_DATABASE_URL="postgres://user:pass@host:5432/dbname" \
bun run scripts/export-legacy-data.ts
```

The export writes JSONL files to `data/legacy-export/` by default.
Override with `LEGACY_EXPORT_DIR` or filter tables with `LEGACY_TABLES` (comma-separated).

## Import into Convex

Use the Convex CLI to import each table:

```bash
npx convex import --table ideas data/legacy-export/ideas.jsonl
```

For larger datasets, prefer JSONL over JSON arrays (JSON arrays have size limits).
Use `--append` to append into an existing table or `--replace` to overwrite.

## Notes

- Run `npx convex dev` to create a dev deployment and populate `.env.local`.
- Ensure `CONVEX_URL` is set for backend and service access.
- After import, validate counts via the Convex dashboard data view.
