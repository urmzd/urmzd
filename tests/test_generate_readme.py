import importlib.util
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("generate_readme", Path(__file__).parents[1] / "scripts/generate_readme.py")
generator = importlib.util.module_from_spec(spec)
spec.loader.exec_module(generator)


def repo(name, recent=0, archived=False):
    return dict(name=name, url=f"https://github.com/example/{name}", description="Original description",
                isArchived=archived, stargazerCount=0, primaryLanguage=None,
                defaultBranchRef={"target": {"recent": {"totalCount": recent}}})


class ReadmeTests(unittest.TestCase):
    def test_featured_projects_survive_inactivity_and_filter_unavailable(self):
        config = dict(name="Example", bio="Tools", exclude=["hidden"],
                      featured=[dict(name=name, pitch="Useful | tool") for name in ["stable", "archived", "hidden", "missing"]],
                      descriptions={"busy": "Complete pitch"})
        result = generator.render(config, [repo("stable"), repo("busy", 5), repo("archived", archived=True), repo("hidden")])
        self.assertIn("**[stable]", result)
        self.assertIn(r"Useful \| tool", result)
        self.assertIn("Complete pitch", result)
        self.assertNotIn("[archived]", result)
        self.assertNotIn("[hidden]", result)
        self.assertNotIn("[missing]", result)
        self.assertLess(result.index("## Start here"), result.index("## Working on now"))

    def test_check_detects_drift_without_writing(self):
        with tempfile.TemporaryDirectory() as directory:
            readme = Path(directory) / "README.md"
            readme.write_text("old")
            with patch.object(generator, "README", readme), patch.object(generator, "fetch_repos", return_value=[]), patch.object(generator, "stale_cards", return_value=[]), patch.object(generator, "render", return_value="new"), patch.dict(generator.os.environ, GH_TOKEN="test"), patch("sys.argv", ["generate_readme.py", "--check"]):
                with self.assertRaisesRegex(SystemExit, "out of date"):
                    generator.main()
                self.assertEqual(readme.read_text(), "old")
                readme.write_text("new")
                generator.main()


if __name__ == "__main__":
    unittest.main()
