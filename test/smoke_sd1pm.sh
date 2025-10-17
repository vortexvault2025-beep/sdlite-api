#!/usr/bin/env bash
set -euo pipefail

OUT="/tmp/a6_sd.pdf"
HDR="/tmp/a6_sd.headers"
BASE="${BASE:-http://localhost:3000}"

curl -s -X POST "$BASE/api/labels/render-a6"   -H 'Content-Type: application/json'   -d '{"variant":"a6_sd_1pm_v1","orderId":"ORD-2001","tiles":{"left":"R39","right":"T1"},"recipient":{"lines":["Karl Peterfield","50 Heathfield Gardens","ROBERTSBRIDGE","TN32 5BG"]},"top_ref_text":"11-100 505 42B","mid_ref_text":"SE 2570 0659 8GB","customer_ref":"2128","price_text":"£8.15","post_by_date":"2024-08-19"}'   -D "$HDR" -o "$OUT"

echo -n "Magic: "; head -c 5 "$OUT"; echo
grep -Ei '^content-type|^content-disposition' "$HDR" || true
wc -c "$OUT"
