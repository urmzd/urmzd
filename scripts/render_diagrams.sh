#!/usr/bin/env bash
# Render assets/stack.d2 and assets/map.d2 once per GitHub colour scheme.
# Needs d2 (https://d2lang.com).
set -euo pipefail
cd "$(dirname "$0")/../assets"
for diagram in stack map; do
  for scheme in light dark; do
    printf '...@%s\n...@style\n...@%s\n' "$scheme" "$diagram" |
      d2 --layout elk --elk-nodeNodeBetweenLayers 44 --pad 20 - "$diagram-$scheme.svg"
  done
done
