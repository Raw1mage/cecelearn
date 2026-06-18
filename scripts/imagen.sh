#!/usr/bin/env bash
# Vertex AI Imagen 生圖工具 — 燒 GCP $315「all of GCP」credit
# 計費落在 billing 0191ED (project gen-lang-client-0857568615)
# 用法:
#   ./imagen.sh "a red apple on white background"
#   ./imagen.sh -n 4 -m ultra -a 16:9 -o out "neon cyberpunk alley"
#   ./imagen.sh -m fast "quick sketch idea"
set -euo pipefail

# ---- 預設值 ----
PROJECT="${IMAGEN_PROJECT:-gen-lang-client-0857568615}"
LOCATION="${IMAGEN_LOCATION:-us-central1}"
MODEL_KEY="standard"          # standard | ultra | fast | imagen3
COUNT=1                       # 1..4 (ultra 只支援 1)
ASPECT="1:1"                  # 1:1 | 3:4 | 4:3 | 9:16 | 16:9
OUTDIR="."
PROMPT=""

usage() {
  cat <<EOF
用法: imagen.sh [選項] "<prompt>"
  -m <model>   standard(預設) | ultra | fast | imagen3
  -n <count>   生幾張 1-4 (ultra 強制 1)
  -a <ratio>   1:1(預設) 3:4 4:3 9:16 16:9
  -o <dir>     輸出資料夾 (預設當前)
  -h           顯示說明
範例: imagen.sh -m ultra -a 16:9 -o out "a serene mountain lake at dawn"
EOF
}

while getopts "m:n:a:o:h" opt; do
  case "$opt" in
    m) MODEL_KEY="$OPTARG" ;;
    n) COUNT="$OPTARG" ;;
    a) ASPECT="$OPTARG" ;;
    o) OUTDIR="$OPTARG" ;;
    h) usage; exit 0 ;;
    *) usage; exit 1 ;;
  esac
done
shift $((OPTIND - 1))
PROMPT="${*:-}"

[ -z "$PROMPT" ] && { echo "錯誤: 缺少 prompt" >&2; usage; exit 1; }

# ---- 模型映射 ----
case "$MODEL_KEY" in
  standard) MODEL="imagen-4.0-generate-001" ;;
  ultra)    MODEL="imagen-4.0-ultra-generate-001"; COUNT=1 ;;
  fast)     MODEL="imagen-4.0-fast-generate-001" ;;
  imagen3)  MODEL="imagen-3.0-generate-002" ;;
  *) echo "未知模型: $MODEL_KEY (用 standard/ultra/fast/imagen3)" >&2; exit 1 ;;
esac

command -v gcloud >/dev/null || { echo "錯誤: 找不到 gcloud" >&2; exit 1; }
command -v jq     >/dev/null || { echo "錯誤: 找不到 jq" >&2; exit 1; }

mkdir -p "$OUTDIR"
TOKEN="$(gcloud auth print-access-token 2>/dev/null)"
[ -z "$TOKEN" ] && { echo "錯誤: 無法取得 access token, 先跑 gcloud auth login" >&2; exit 1; }

ENDPOINT="https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT}/locations/${LOCATION}/publishers/google/models/${MODEL}:predict"
REQ="$(jq -n --arg p "$PROMPT" --argjson n "$COUNT" --arg ar "$ASPECT" \
  '{instances:[{prompt:$p}],parameters:{sampleCount:$n,aspectRatio:$ar}}')"

echo "→ 模型: $MODEL | 張數: $COUNT | 比例: $ASPECT"
echo "→ prompt: $PROMPT"

RESP="$(curl -sS -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" "$ENDPOINT" -d "$REQ")"

if ! echo "$RESP" | jq -e '.predictions[0].bytesBase64Encoded' >/dev/null 2>&1; then
  echo "✗ 生圖失敗:" >&2
  echo "$RESP" | jq -r '.error.message // .' 2>/dev/null | head -c 500 >&2
  echo >&2
  exit 1
fi

STAMP="$(date +%Y%m%d_%H%M%S)"
i=0
echo "$RESP" | jq -r '.predictions[].bytesBase64Encoded' | while read -r b64; do
  OUT="${OUTDIR}/imagen_${STAMP}_${i}.png"
  echo "$b64" | base64 -d > "$OUT"
  echo "✓ $OUT"
  i=$((i + 1))
done
