// ── Effectful data fetching ─────────────────────────────────────────────────
// All network I/O lives here. Token and username are passed as arguments.

const MANIFEST_FILES = [
  "package.json",
  "Cargo.toml",
  "go.mod",
  "pyproject.toml",
  "requirements.txt",
];

export const graphql = async (token, query, variables = {}) => {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data;
};

export const fetchAllRepoData = async (token, username) => {
  const data = await graphql(token, `{
    user(login: "${username}") {
      repositories(first: 100, orderBy: {field: STARGAZERS, direction: DESC}, ownerAffiliations: OWNER, privacy: PUBLIC) {
        nodes {
          name
          description
          url
          stargazerCount
          diskUsage
          primaryLanguage { name color }
          isArchived
          isFork
          repositoryTopics(first: 20) {
            nodes { topic { name } }
          }
          languages(first: 20, orderBy: {field: SIZE, direction: DESC}) {
            totalSize
            edges { size node { name color } }
          }
        }
      }
    }
  }`);

  return data.user.repositories.nodes.filter(
    (r) => !r.isArchived && !r.isFork
  );
};

export const fetchManifestsForRepos = async (token, username, repos) => {
  const manifests = new Map();
  const batchSize = 10;

  for (let i = 0; i < repos.length; i += batchSize) {
    const batch = repos.slice(i, i + batchSize);
    const aliases = batch
      .map((repo, idx) => {
        const alias = `repo_${idx}`;
        const fileQueries = MANIFEST_FILES
          .map((file) => {
            const fieldName = file.replace(/[.\-]/g, "_");
            return `${fieldName}: object(expression: "HEAD:${file}") { ... on Blob { text } }`;
          })
          .join("\n            ");
        return `${alias}: repository(owner: "${username}", name: "${repo.name}") {
            ${fileQueries}
          }`;
      })
      .join("\n      ");

    try {
      const data = await graphql(token, `{ ${aliases} }`);
      batch.forEach((repo, idx) => {
        const repoData = data[`repo_${idx}`];
        if (!repoData) return;
        const files = {};
        for (const file of MANIFEST_FILES) {
          const fieldName = file.replace(/[.\-]/g, "_");
          if (repoData[fieldName]?.text) {
            files[file] = repoData[fieldName].text;
          }
        }
        if (Object.keys(files).length > 0) {
          manifests.set(repo.name, files);
        }
      });
    } catch (err) {
      console.warn(`Warning: manifest batch fetch failed: ${err.message}`);
    }
  }

  return manifests;
};

export const fetchContributionData = async (token, username) => {
  try {
    const now = new Date();
    const from = new Date(now);
    from.setFullYear(from.getFullYear() - 1);

    const data = await graphql(
      token,
      `query($from: DateTime!, $to: DateTime!) {
        user(login: "${username}") {
          contributionsCollection(from: $from, to: $to) {
            totalCommitContributions
            totalPullRequestContributions
            totalPullRequestReviewContributions
            totalIssueContributions
            totalRepositoriesWithContributedCommits
            restrictedContributionsCount
            commitContributionsByRepository(maxRepositories: 25) {
              repository { nameWithOwner stargazerCount primaryLanguage { name } isPrivate }
              contributions { totalCount }
            }
          }
          repositoriesContributedTo(first: 50, includeUserRepositories: false, contributionTypes: [COMMIT, PULL_REQUEST]) {
            totalCount
            nodes { nameWithOwner url stargazerCount description primaryLanguage { name } }
          }
          pullRequests(first: 100, orderBy: {field: CREATED_AT, direction: DESC}, states: [MERGED]) {
            totalCount
            nodes {
              title mergedAt additions deletions
              repository { nameWithOwner owner { login } stargazerCount }
            }
          }
        }
      }`,
      { from: from.toISOString(), to: now.toISOString() }
    );

    const user = data.user;
    return {
      contributions: user.contributionsCollection,
      externalRepos: user.repositoriesContributedTo,
      mergedPRs: user.pullRequests,
    };
  } catch (err) {
    console.warn(`Contribution data fetch failed (non-fatal): ${err.message}`);
    return {
      contributions: {
        totalCommitContributions: 0,
        totalPullRequestContributions: 0,
        totalPullRequestReviewContributions: 0,
        totalIssueContributions: 0,
        totalRepositoriesWithContributedCommits: 0,
        restrictedContributionsCount: 0,
        commitContributionsByRepository: [],
      },
      externalRepos: { totalCount: 0, nodes: [] },
      mergedPRs: { totalCount: 0, nodes: [] },
    };
  }
};

export const fetchTrendingAnalysis = async (token, languages, frameworks, tools) => {
  try {
    const prompt = `Given this developer's technology usage from their GitHub repos, identify which are currently trending or rapidly growing in industry adoption (as of 2025-2026). Return ONLY a JSON array of names that are trending.

Languages: ${languages.map((l) => l.name).join(", ")}
Frameworks: ${frameworks.map((f) => f.name).join(", ")}
Tools: ${tools.map((t) => t.name).join(", ")}

Reply with raw JSON only: {"trending": ["name1", "name2", ...]}`;

    const res = await fetch(
      "https://models.github.ai/inference/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.1,
        }),
      }
    );

    if (!res.ok) {
      console.warn(`GitHub Models API error: ${res.status}`);
      return new Set();
    }

    const json = await res.json();
    const content = json.choices?.[0]?.message?.content || "{}";
    const parsed = JSON.parse(content.replace(/```json?\n?|\n?```/g, ""));
    return new Set((parsed.trending || []).map((s) => s.toLowerCase()));
  } catch (err) {
    console.warn(`Trending analysis failed (non-fatal): ${err.message}`);
    return new Set();
  }
};
