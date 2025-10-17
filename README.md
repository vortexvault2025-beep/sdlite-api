

## DataPack Importer
Endpoint: `POST /api/data-packs/upload` — Accepts `.xlsx` (sheets per table) or `.zip` (CSV per table).
Env: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE`, `MAX_UPLOAD_MB` (default 10).

Example:
```bash
BASE=http://localhost:3000 curl -s -X POST "$BASE/api/data-packs/upload"       -H "X-Api-Key: $X_API_KEY"       -F "file=@SD-Lite_DataPack_v1.zip"
```
