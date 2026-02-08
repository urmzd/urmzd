# Initialize: ensure Node.js and gh CLI are available
init:
    @command -v node >/dev/null || (echo "Node.js is required" && exit 1)
    @command -v gh >/dev/null || (echo "GitHub CLI (gh) is required" && exit 1)
    @gh auth status >/dev/null 2>&1 || (echo "Run 'gh auth login' first" && exit 1)
    @echo "Ready."

# Generate all metrics SVGs locally
generate:
    GITHUB_TOKEN=$(gh auth token) node .github/scripts/generate-metrics.mjs
