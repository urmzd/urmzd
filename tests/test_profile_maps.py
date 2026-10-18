import copy
import sys
import tomllib
import unittest
from pathlib import Path

ROOT = Path(__file__).parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from profile_maps import alt, caption, d2_source, validate, validate_dependencies
from generate_readme import stale_cards


class MapTests(unittest.TestCase):
    def setUp(self):
        self.config = tomllib.loads((ROOT / "profile.toml").read_text())

    def test_all_maps_and_generated_sources_match(self):
        validate(self.config)
        for key, spec in self.config["diagrams"].items():
            self.assertEqual((ROOT / "assets" / f"{key}.d2").read_text(), d2_source(self.config, key))
            self.assertTrue(alt(spec))
            self.assertTrue(caption(spec))
            for node in spec["nodes"]:
                self.assertIn(node.get("project", node.get("label")), alt(spec))

    def test_invalid_references_and_missing_evidence_fail(self):
        for mutation in ("project", "endpoint", "evidence"):
            config = copy.deepcopy(self.config)
            spec = config["diagrams"]["stack"]
            if mutation == "project":
                spec["nodes"][0]["project"] = "missing"
            elif mutation == "endpoint":
                spec["edges"][0]["to"] = "missing"
            else:
                del spec["edges"][0]["evidence"]
            with self.assertRaises(ValueError):
                validate(config)

    def test_archived_and_missing_projects_are_stale(self):
        repos = [dict(name=name, isArchived=name == "saige") for name in self.config["projects"] if name != "sr"]
        self.assertEqual(stale_cards(self.config, repos), ["saige", "sr"])

    def test_dependency_removal_blocks_publish(self):
        manifests = {
            "warp/go.mod": "require (\n github.com/urmzd/fiber v1.0.0\n github.com/urmzd/saige v1.0.0\n github.com/urmzd/playscape v1.0.0\n github.com/urmzd/anchor v1.0.0\n)",
            "fiber/go.mod": "require (\n github.com/urmzd/playscape v1.0.0\n github.com/urmzd/saige v1.0.0\n github.com/urmzd/anchor v1.0.0\n)",
            "saige/go.mod": "require (\n github.com/urmzd/anchor v1.0.0\n)",
            "linear-gp/crates/lgp/Cargo.toml": '[dependencies]\ngymnasia = { version = "3", optional = true }\n[features]\ngym = ["dep:gymnasia"]',
        }
        validate_dependencies(self.config, manifests.__getitem__)
        manifests["saige/go.mod"] = "module github.com/urmzd/saige"
        with self.assertRaisesRegex(ValueError, "no longer supported"):
            validate_dependencies(self.config, manifests.__getitem__)
