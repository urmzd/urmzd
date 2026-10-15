#!/usr/bin/env bash
# Generate maps from profile.toml. Requires Python 3.11+ and D2 0.7.1.
set -euo pipefail
cd "$(dirname "$0")/.."
python3 scripts/generate_diagrams.py
