#!/usr/bin/env bash
# Rebuilds the bundled Material Symbols Rounded subsets (outlined + filled) and
# src/glyphs.ts from scripts/icons.txt. Needs python3 with fonttools (pip install fonttools).
set -euo pipefail
cd "$(dirname "$0")/.."
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

curl -sf -o "$TMP/codepoints.txt" \
  "https://raw.githubusercontent.com/google/material-design-icons/master/variablefont/MaterialSymbolsRounded%5BFILL%2CGRAD%2Copsz%2Cwght%5D.codepoints"
FILLED_URL=$(curl -sf -A "Mozilla/4.0" \
  "https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@24,400,1,0" \
  | grep -o 'https://[^)]*' | head -1)
curl -sf -o "$TMP/filled.ttf" "$FILLED_URL"
OUTLINED=$(node -p "require.resolve('@expo-google-fonts/material-symbols-rounded/400Regular/MaterialSymbolsRounded_400Regular.ttf')")

python3 - "$TMP" <<'PY'
import json, sys
tmp = sys.argv[1]
cp = {}
for line in open(f"{tmp}/codepoints.txt"):
    n, c = line.split(); cp.setdefault(n, c)
names = sorted({l.strip() for l in open("scripts/icons.txt") if l.strip()})
missing = [n for n in names if n not in cp]
if missing: sys.exit(f"unknown icons: {missing}")
open(f"{tmp}/unicodes.txt", "w").write("\n".join("U+" + cp[n] for n in names))
body = "\n".join(f"  {n}: 0x{cp[n]}," for n in names)
src = open("src/glyphs.ts").read()
head = src[: src.index("export const glyphs")]
open("src/glyphs.ts", "w").write(head + "export const glyphs = {\n" + body + "\n} as const;\n\nexport type IconName = keyof typeof glyphs;\n")
PY

python3 -m fontTools.subset "$OUTLINED" --unicodes-file="$TMP/unicodes.txt" \
  --output-file=assets/fonts/MaterialSymbolsRounded-Outlined.ttf
python3 -m fontTools.subset "$TMP/filled.ttf" --unicodes-file="$TMP/unicodes.txt" \
  --output-file=assets/fonts/MaterialSymbolsRounded-Filled.ttf
echo "Subset $(wc -l < scripts/icons.txt) icons."
