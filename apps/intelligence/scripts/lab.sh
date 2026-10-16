#!/usr/bin/env bash
# Intelligence Lab: the service (lab routes on) on :8010 and the Streamlit UI on :8510 (8000/8501 are often taken).
#   apps/intelligence$ scripts/lab.sh
# Needs: .venv with requirements.txt + requirements-lab.txt.
set -euo pipefail
cd "$(dirname "$0")/.."
PY=.venv/bin/python
"$PY" -c "import streamlit" 2>/dev/null || { echo "Install lab deps: uv pip install --python $PY -r requirements-lab.txt (or .venv/bin/pip install -r requirements-lab.txt)"; exit 1; }

LAB_ENABLED=true "$PY" -m uvicorn app.main:app --reload --port "${LAB_API_PORT:-8010}" &
API_PID=$!
trap 'kill $API_PID 2>/dev/null' EXIT
LAB_API_URL="http://localhost:${LAB_API_PORT:-8010}" "$PY" -m streamlit run lab/Home.py \
  --server.port "${LAB_UI_PORT:-8510}" --server.headless true --browser.gatherUsageStats false
