#!/usr/bin/env bash
set -euo pipefail

OUT="/tmp/a6_tr.pdf"
HDR="/tmp/a6_tr.headers"
BASE="${BASE:-http://localhost:3000}"

curl -s -X POST "$BASE/api/labels/render-a6"   -H 'Content-Type: application/json'   -d '{"variant":"a6_trk24_nosig_v1","orderId":"ORD-2002","tiles":{"left":"X14","right":"S32"},"recipient":{"lines":["Ben Pope","26 Cheviot Way","Verwood","DORSET","BH31 6UG"]},"top_ref_text":"11-100 505 8C8","mid_ref_text":"MZ 3610 0004 7GB","customer_ref":"2461","price_text":"£3.60","post_by_date":"2025-04-30"}'   -D "$HDR" -o "$OUT"

echo -n "Magic: "; head -c 5 "$OUT"; echo
grep -Ei '^content-type|^content-disposition' "$HDR" || true
wc -c "$OUT"
