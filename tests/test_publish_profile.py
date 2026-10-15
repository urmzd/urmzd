"""Exercise the publishing script against local bare remotes, without credentials."""
import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).parents[1]


class PublishTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.remote = self.root / "remote.git"
        self.work = self.root / "work"
        self.env = dict(os.environ, GITHUB_ACTIONS="true", GH_TOKEN="fixture",
                        GIT_CONFIG_GLOBAL=os.devnull, GIT_CONFIG_NOSYSTEM="1",
                        GIT_AUTHOR_NAME="Test", GIT_AUTHOR_EMAIL="test@example.com",
                        GIT_COMMITTER_NAME="Test", GIT_COMMITTER_EMAIL="test@example.com")
        self.run_git(self.root, "init", "--bare", str(self.remote))
        self.run_git(self.root, "clone", str(self.remote), str(self.work))
        self.run_git(self.work, "checkout", "-b", "main")
        (self.work / "scripts").mkdir()
        (self.work / "tests").mkdir()
        (self.work / "tests/test_fixture.py").write_text("import unittest\nclass Fixture(unittest.TestCase):\n    def test_fixture(self):\n        self.assertTrue(True)\n")
        (self.work / "assets").mkdir()
        (self.work / "source.txt").write_text("original")
        (self.work / "README.md").write_text("old")
        (self.work / "scripts/generate_readme.py").write_text(
            "from pathlib import Path\nPath('README.md').write_text(Path('source.txt').read_text())\n")
        (self.work / "scripts/render_diagrams.sh").write_text("mkdir -p assets\ncp source.txt assets/test.svg\n")
        shutil.copy(ROOT / "scripts/publish_profile.sh", self.work / "scripts/publish_profile.sh")
        self.run_git(self.work, "add", ".")
        self.run_git(self.work, "commit", "-m", "initial")
        self.run_git(self.work, "push", "origin", "main")

    def run_git(self, cwd, *args):
        return subprocess.run(["git", *args], cwd=cwd, env=self.env, text=True,
                              capture_output=True, check=True).stdout.strip()

    def publish(self):
        return subprocess.run(["bash", "scripts/publish_profile.sh"], cwd=self.work,
                              env=self.env, text=True, capture_output=True)

    def test_publish_includes_assets_and_repeat_is_noop(self):
        result = self.publish()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(self.run_git(self.remote, "show", "main:assets/test.svg"), "original")
        head = self.run_git(self.remote, "rev-parse", "main")
        result = self.publish()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(self.run_git(self.remote, "rev-parse", "main"), head)
        self.assertIn("up to date", result.stdout)

    def test_racing_push_regenerates_on_latest_main(self):
        racer = self.root / "racer"
        self.run_git(self.root, "clone", "--branch", "main", str(self.remote), str(racer))
        # This hook advances the remote after generation but before the first push.
        hook = self.work / ".git/hooks/pre-push"
        hook.write_text(f'''#!/bin/sh
if [ ! -f '{self.root}/raced' ]; then
  touch '{self.root}/raced'
  unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_PREFIX
  cd '{racer}' || exit 1
  echo updated > source.txt
  git add source.txt
  git commit -m concurrent
  git push origin main
fi
''')
        hook.chmod(0o755)
        result = self.publish()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("retrying", result.stdout)
        self.assertEqual(self.run_git(self.remote, "show", "main:README.md"), "updated")
        self.assertEqual(self.run_git(self.remote, "show", "main:assets/test.svg"), "updated")

    def test_rejected_push_fails_without_retry_loop(self):
        hook = self.remote / "hooks/pre-receive"
        hook.write_text("#!/bin/sh\necho 'fixture: branch rule rejection' >&2\nexit 1\n")
        hook.chmod(0o755)
        result = self.publish()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("check app permissions and branch rules", result.stdout)
        self.assertNotIn("retrying", result.stdout)
