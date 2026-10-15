#!/usr/bin/env python3
"""Generate D2 and themed SVG maps from profile.toml. Requires D2 0.7.1."""
import subprocess
import tomllib
from pathlib import Path

from profile_maps import d2_source, validate

ROOT = Path(__file__).resolve().parent.parent


def main():
    config = tomllib.loads((ROOT / "profile.toml").read_text())
    validate(config)
    assets = ROOT / "assets"
    for key in config["diagrams"]:
        (assets / f"{key}.d2").write_text(d2_source(config, key))
        for scheme in ("light", "dark"):
            subprocess.run(
                ["d2", "--layout", "elk", "--elk-nodeNodeBetweenLayers", "56", "--pad", "20", "-", f"{key}-{scheme}.svg"],
                input=f"...@{scheme}\n...@style\n...@{key}\n", text=True, cwd=assets, check=True,
            )


if __name__ == "__main__":
    main()
