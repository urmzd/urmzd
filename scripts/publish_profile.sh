#!/usr/bin/env bash
# Runs only in the disposable Actions checkout. Never force-push generated output.
set -euo pipefail
if [[ "${GITHUB_ACTIONS:-}" != "true" ]]; then
  echo "Publishing must run in GitHub Actions; generate locally with scripts/render_diagrams.sh."
  exit 1
fi
: "${GH_TOKEN:?Set GH_TOKEN for public repository metadata.}"
git config user.name "sr-releaser[bot]"
git config user.email "sr-releaser[bot]@users.noreply.github.com"

# If main advances during generation, discard only this run's generated commit,
# check out the new remote head, and regenerate instead of rebasing stale output.
for attempt in 1 2 3; do
  git fetch origin main
  base=$(git rev-parse origin/main)
  git switch --detach "$base"
  bash scripts/render_diagrams.sh
  python3 -m unittest discover -s tests
  python3 scripts/generate_readme.py
  git add -- README.md assets/
  git diff --cached --check
  if git diff --cached --quiet; then
    echo "Profile and diagrams are up to date."
    exit 0
  fi
  git commit -m "chore: regenerate profile and diagrams"
  if git push origin HEAD:main; then
    exit 0
  fi
  git fetch origin main
  if [[ "$(git rev-parse origin/main)" == "$base" ]]; then
    echo "Push failed without a concurrent update; check app permissions and branch rules."
    exit 1
  fi
  echo "Main advanced during generation; retrying ($attempt/3)."
done
echo "Main kept advancing; no generated update was pushed. Rerun the workflow."
exit 1
