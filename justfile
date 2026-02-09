# Initialize: ensure gh CLI is available
init:
    @command -v gh >/dev/null || (echo "GitHub CLI (gh) is required" && exit 1)
    @gh auth status >/dev/null 2>&1 || (echo "Run 'gh auth login' first" && exit 1)
    @echo "Ready."

# Generate all metrics SVGs locally (requires github-metrics repo cloned as sibling)
generate:
    cd ../github-metrics && GITHUB_TOKEN=$(gh auth token) INPUT_USERNAME=urmzd INPUT_OUTPUT_DIR=$(pwd)/../urmzd/metrics INPUT_COMMIT_PUSH=false npx tsx src/index.ts
