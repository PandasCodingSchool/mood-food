"""Build (or rebuild) the cached dish embedding matrix.

Usage:
    cd intelligence && python scripts/build_dish_embeddings.py [--force]

Requires OPENAI_API_KEY in the environment / .env. One-time cost per
dishes.json change — the matrix is cached keyed by the file's hash.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv

load_dotenv()

from app.learning import embeddings  # noqa: E402


def main() -> int:
    force = "--force" in sys.argv
    if embeddings.build_dish_matrix(force=force):
        matrix, ids = embeddings.load_dish_matrix()
        print(f"OK: {len(ids)} dishes embedded, dim {matrix.shape[1]} ({embeddings.MODEL_VERSION})")
        return 0
    print("FAILED: could not build embeddings (is OPENAI_API_KEY set?)")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
