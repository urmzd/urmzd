import { writeFileSync, mkdirSync } from "fs";

const TOKEN = process.env.GITHUB_TOKEN;
const USERNAME = "urmzd";

if (!TOKEN) {
  console.error("GITHUB_TOKEN is required");
  process.exit(1);
}

// ── CONSTANTS ───────────────────────────────────────────────────────────────

const THEME = {
  bg: "#0d1117",
  cardBg: "#161b22",
  border: "#30363d",
  link: "#58a6ff",
  text: "#c9d1d9",
  secondary: "#8b949e",
  muted: "#6e7681",
};

const FONT =
  "-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif";

const LAYOUT = {
  width: 808,
  padX: 24,
  padY: 24,
  sectionGap: 30,
  barLabelWidth: 150,
  barHeight: 18,
  barRowHeight: 28,
  barMaxWidth: 500,
};

const BAR_COLORS = [
  "#58a6ff",
  "#3fb950",
  "#d29922",
  "#f85149",
  "#bc8cff",
  "#39d2c0",
  "#db61a2",
  "#79c0ff",
];

const EXCLUDED_LANGUAGES = new Set(["Jupyter Notebook"]);

// ── CATEGORY MAPS ───────────────────────────────────────────────────────────

const FRAMEWORK_TOPICS = new Set([
  "react",
  "nextjs",
  "next-js",
  "vue",
  "vuejs",
  "angular",
  "svelte",
  "sveltekit",
  "astro",
  "remix",
  "gatsby",
  "nuxt",
  "fastapi",
  "django",
  "flask",
  "express",
  "nestjs",
  "spring",
  "spring-boot",
  "rails",
  "ruby-on-rails",
  "laravel",
  "pytorch",
  "tensorflow",
  "keras",
  "scikit-learn",
  "huggingface",
  "langchain",
  "axum",
  "actix",
  "rocket",
  "gin",
  "fiber",
  "echo",
]);

const FRAMEWORK_DEPS = new Set([
  "react",
  "react-dom",
  "next",
  "vue",
  "angular",
  "svelte",
  "@sveltejs/kit",
  "astro",
  "remix",
  "gatsby",
  "nuxt",
  "fastapi",
  "django",
  "flask",
  "express",
  "nestjs",
  "@nestjs/core",
  "torch",
  "pytorch",
  "tensorflow",
  "tf",
  "keras",
  "scikit-learn",
  "sklearn",
  "transformers",
  "langchain",
  "axum",
  "actix-web",
  "rocket",
  "gin",
  "fiber",
  "echo",
  "hono",
  "elysia",
  "solid-js",
  "qwik",
  "htmx",
]);

const DB_INFRA_TOPICS = new Set([
  "postgresql",
  "postgres",
  "mysql",
  "mongodb",
  "redis",
  "sqlite",
  "dynamodb",
  "cassandra",
  "elasticsearch",
  "docker",
  "kubernetes",
  "k8s",
  "aws",
  "gcp",
  "azure",
  "terraform",
  "ansible",
  "nginx",
  "graphql",
  "grpc",
  "kafka",
  "rabbitmq",
  "supabase",
  "firebase",
  "vercel",
  "netlify",
]);

const DB_INFRA_DEPS = new Set([
  "pg",
  "mysql2",
  "mongoose",
  "mongodb",
  "redis",
  "ioredis",
  "prisma",
  "@prisma/client",
  "typeorm",
  "sequelize",
  "knex",
  "drizzle-orm",
  "sqlx",
  "diesel",
  "sea-orm",
  "sqlalchemy",
  "psycopg2",
  "pymongo",
  "boto3",
  "docker",
  "docker-compose",
  "supabase",
  "@supabase/supabase-js",
  "firebase",
  "firebase-admin",
  "@google-cloud/storage",
  "aws-sdk",
  "@aws-sdk/client-s3",
  "graphql",
  "apollo-server",
  "@apollo/client",
  "grpc",
  "tonic",
]);

// ── SUB-CLASSIFICATION ──────────────────────────────────────────────────────

const ML_AI_NAMES = new Set([
  "pytorch", "torch", "tensorflow", "tf", "keras", "scikit-learn", "sklearn",
  "huggingface", "transformers", "langchain",
]);

const DATABASE_NAMES = new Set([
  "postgresql", "postgres", "mysql", "mongodb", "redis", "sqlite", "dynamodb",
  "cassandra", "elasticsearch", "pg", "mysql2", "mongoose", "prisma",
  "typeorm", "sequelize", "knex", "drizzle-orm", "sqlx",
  "diesel", "sea-orm", "sqlalchemy", "psycopg2", "pymongo", "ioredis",
]);

// ── API LAYER ───────────────────────────────────────────────────────────────

async function graphql(query, variables = {}) {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data;
}

async function fetchAllRepoData() {
  const data = await graphql(`{
    user(login: "${USERNAME}") {
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
}

async function fetchManifestsForRepos(repos) {
  const manifests = new Map();
  const manifestFiles = [
    "package.json",
    "Cargo.toml",
    "go.mod",
    "pyproject.toml",
    "requirements.txt",
  ];

  // Batch repos into groups of 10
  const batchSize = 10;
  for (let i = 0; i < repos.length; i += batchSize) {
    const batch = repos.slice(i, i + batchSize);
    const aliases = batch
      .map((repo, idx) => {
        const alias = `repo_${idx}`;
        const fileQueries = manifestFiles
          .map((file) => {
            const fieldName = file.replace(/[.\-]/g, "_");
            return `${fieldName}: object(expression: "HEAD:${file}") { ... on Blob { text } }`;
          })
          .join("\n            ");
        return `${alias}: repository(owner: "${USERNAME}", name: "${repo.name}") {
            ${fileQueries}
          }`;
      })
      .join("\n      ");

    try {
      const data = await graphql(`{ ${aliases} }`);
      batch.forEach((repo, idx) => {
        const repoData = data[`repo_${idx}`];
        if (!repoData) return;
        const files = {};
        for (const file of manifestFiles) {
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
}

async function fetchTrendingAnalysis(languages, frameworks, tools) {
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
          Authorization: `bearer ${TOKEN}`,
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
}

async function fetchContributionData() {
  try {
    const now = new Date();
    const from = new Date(now);
    from.setFullYear(from.getFullYear() - 1);

    const data = await graphql(
      `query($from: DateTime!, $to: DateTime!) {
        user(login: "${USERNAME}") {
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
}

// ── PARSERS ─────────────────────────────────────────────────────────────────

function parsePackageJson(text) {
  try {
    const pkg = JSON.parse(text);
    return [
      ...Object.keys(pkg.dependencies || {}),
      ...Object.keys(pkg.devDependencies || {}),
    ];
  } catch {
    console.warn("Warning: failed to parse package.json");
    return [];
  }
}

function parseCargoToml(text) {
  try {
    const deps = [];
    let inDeps = false;
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (
        trimmed === "[dependencies]" ||
        trimmed === "[dev-dependencies]" ||
        trimmed === "[build-dependencies]"
      ) {
        inDeps = true;
        continue;
      }
      if (trimmed.startsWith("[")) {
        inDeps = false;
        continue;
      }
      if (inDeps && trimmed.includes("=")) {
        const name = trimmed.split("=")[0].trim();
        if (name && !name.startsWith("#")) deps.push(name);
      }
    }
    return deps;
  } catch {
    console.warn("Warning: failed to parse Cargo.toml");
    return [];
  }
}

function parseGoMod(text) {
  try {
    const deps = [];
    let inRequire = false;
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (trimmed.startsWith("require (")) {
        inRequire = true;
        continue;
      }
      if (trimmed === ")") {
        inRequire = false;
        continue;
      }
      if (inRequire && trimmed && !trimmed.startsWith("//")) {
        const modulePath = trimmed.split(/\s/)[0];
        const segments = modulePath.split("/");
        deps.push(segments[segments.length - 1]);
      }
    }
    return deps;
  } catch {
    console.warn("Warning: failed to parse go.mod");
    return [];
  }
}

function parsePyprojectToml(text) {
  try {
    const deps = [];
    // Match dependencies = [...] under [project] or [tool.poetry.dependencies]
    const depArrayMatch = text.match(
      /dependencies\s*=\s*\[([\s\S]*?)\]/
    );
    if (depArrayMatch) {
      const items = depArrayMatch[1].matchAll(/"([^"]+)"|'([^']+)'/g);
      for (const m of items) {
        const raw = m[1] || m[2];
        // Strip version specifiers
        const name = raw.split(/[>=<!~;\s\[]/)[0].trim();
        if (name) deps.push(name);
      }
    }
    // Also check [tool.poetry.dependencies] section
    const poetryMatch = text.match(
      /\[tool\.poetry\.dependencies\]([\s\S]*?)(?:\n\[|$)/
    );
    if (poetryMatch) {
      for (const line of poetryMatch[1].split("\n")) {
        const trimmed = line.trim();
        if (trimmed.includes("=") && !trimmed.startsWith("#") && !trimmed.startsWith("[")) {
          const name = trimmed.split("=")[0].trim();
          if (name && name !== "python") deps.push(name);
        }
      }
    }
    return deps;
  } catch {
    console.warn("Warning: failed to parse pyproject.toml");
    return [];
  }
}

function parseRequirementsTxt(text) {
  try {
    return text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && !line.startsWith("-"))
      .map((line) => line.split(/[>=<!~;\s\[]/)[0].trim())
      .filter(Boolean);
  } catch {
    console.warn("Warning: failed to parse requirements.txt");
    return [];
  }
}

// ── AGGREGATION ─────────────────────────────────────────────────────────────

function aggregateLanguages(repos) {
  const langBytes = new Map();
  const langColors = new Map();

  for (const repo of repos) {
    for (const edge of repo.languages?.edges || []) {
      const name = edge.node.name;
      if (EXCLUDED_LANGUAGES.has(name)) continue;
      langBytes.set(name, (langBytes.get(name) || 0) + edge.size);
      if (!langColors.has(name)) langColors.set(name, edge.node.color);
    }
  }

  const total = [...langBytes.values()].reduce((a, b) => a + b, 0);
  return [...langBytes.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, bytes]) => ({
      name,
      value: bytes,
      percent: ((bytes / total) * 100).toFixed(1),
      color: langColors.get(name) || THEME.secondary,
    }));
}

function classifyDependencies(repos, manifests) {
  const frameworks = new Map(); // name -> Set of repo names
  const dbInfra = new Map();
  const tools = new Map();

  for (const repo of repos) {
    // From topics
    const topics = (repo.repositoryTopics?.nodes || []).map(
      (n) => n.topic.name
    );
    for (const topic of topics) {
      if (FRAMEWORK_TOPICS.has(topic)) {
        if (!frameworks.has(topic)) frameworks.set(topic, new Set());
        frameworks.get(topic).add(repo.name);
      } else if (DB_INFRA_TOPICS.has(topic)) {
        if (!dbInfra.has(topic)) dbInfra.set(topic, new Set());
        dbInfra.get(topic).add(repo.name);
      }
    }

    // From manifests
    const files = manifests.get(repo.name) || {};
    const allDeps = [];
    if (files["package.json"]) allDeps.push(...parsePackageJson(files["package.json"]));
    if (files["Cargo.toml"]) allDeps.push(...parseCargoToml(files["Cargo.toml"]));
    if (files["go.mod"]) allDeps.push(...parseGoMod(files["go.mod"]));
    if (files["pyproject.toml"]) allDeps.push(...parsePyprojectToml(files["pyproject.toml"]));
    if (files["requirements.txt"]) allDeps.push(...parseRequirementsTxt(files["requirements.txt"]));

    const seen = new Set();
    for (const raw of allDeps) {
      // Normalize: strip @scope/ prefix for display
      const dep = raw.startsWith("@") ? raw.split("/").pop() : raw;
      const lower = dep.toLowerCase();
      if (seen.has(lower)) continue;
      seen.add(lower);

      if (FRAMEWORK_DEPS.has(lower)) {
        if (!frameworks.has(dep)) frameworks.set(dep, new Set());
        frameworks.get(dep).add(repo.name);
      } else if (DB_INFRA_DEPS.has(lower)) {
        if (!dbInfra.has(dep)) dbInfra.set(dep, new Set());
        dbInfra.get(dep).add(repo.name);
      } else {
        if (!tools.has(dep)) tools.set(dep, new Set());
        tools.get(dep).add(repo.name);
      }
    }
  }

  const toSorted = (map) =>
    [...map.entries()]
      .map(([name, repos]) => ({ name, value: repos.size }))
      .sort((a, b) => b.value - a.value);

  return {
    frameworks: toSorted(frameworks).slice(0, 10),
    dbInfra: toSorted(dbInfra).slice(0, 10),
    tools: toSorted(tools)
      .filter((t) => t.value >= 2)
      .slice(0, 10),
  };
}

function computeComplexityScores(repos) {
  return repos
    .map((repo) => {
      const langCount = (repo.languages?.edges || []).filter(
        (e) => !EXCLUDED_LANGUAGES.has(e.node.name)
      ).length;
      const diskKB = Math.max(repo.diskUsage || 1, 1);
      const codeBytes = Math.max(repo.languages?.totalSize || 1, 1);
      const depCount = (repo.languages?.edges || []).length; // proxy

      const score =
        langCount * 15 +
        Math.log10(diskKB) * 20 +
        Math.log10(codeBytes) * 15 +
        Math.min(depCount, 50);

      return { name: repo.name, url: repo.url, value: Math.round(score) };
    })
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);
}

// ── SVG RENDERERS ───────────────────────────────────────────────────────────

function escapeXml(str) {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function truncate(str, max) {
  if (!str) return "";
  return str.length > max ? str.slice(0, max - 1) + "\u2026" : str;
}

function wrapText(text, maxChars) {
  const words = text.split(/\s+/);
  const lines = [];
  let current = "";
  for (const word of words) {
    if (current && (current + " " + word).length > maxChars) {
      lines.push(current);
      current = word;
    } else {
      current = current ? current + " " + word : word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function renderTextBlock(lines, x, y, { fontSize = 12, color = THEME.text, lineHeight = 18 } = {}) {
  let svg = "";
  for (let i = 0; i < lines.length; i++) {
    svg += `\n  <text x="${x}" y="${y + i * lineHeight}" fill="${color}" font-size="${fontSize}" font-family="${FONT}">${escapeXml(lines[i])}</text>`;
  }
  return { svg, height: lines.length * lineHeight };
}

function renderBulletList(items, x, y, { fontSize = 12, color = THEME.text, lineHeight = 22 } = {}) {
  let svg = "";
  for (let i = 0; i < items.length; i++) {
    svg += `\n  <text x="${x}" y="${y + i * lineHeight}" fill="${color}" font-size="${fontSize}" font-family="${FONT}">\u2022  ${escapeXml(items[i])}</text>`;
  }
  return { svg, height: items.length * lineHeight };
}

function renderDivider(y) {
  const { padX } = LAYOUT;
  const svg = `\n  <line x1="${padX}" y1="${y}" x2="${padX + 760}" y2="${y}" stroke="${THEME.border}" stroke-opacity="0.6" stroke-width="1"/>`;
  return { svg, height: 1 };
}

function renderSubHeader(text, y) {
  const { padX } = LAYOUT;
  const svg = `\n  <text x="${padX}" y="${y + 11}" fill="${THEME.secondary}" font-size="11" font-family="${FONT}" letter-spacing="1" font-weight="600">${escapeXml(text.toUpperCase())}</text>`;
  return { svg, height: 14 };
}

function renderStatCards(stats, y) {
  const { padX } = LAYOUT;
  const cardW = 140;
  const cardH = 72;
  const gap = 15;
  const colors = [BAR_COLORS[0], BAR_COLORS[1], BAR_COLORS[2], BAR_COLORS[4], BAR_COLORS[5]];
  let svg = "";

  for (let i = 0; i < stats.length; i++) {
    const cx = padX + i * (cardW + gap);
    const cy = y;
    const color = colors[i % colors.length];

    // Card background
    svg += `\n  <rect x="${cx}" y="${cy}" width="${cardW}" height="${cardH}" rx="8" fill="${THEME.cardBg}" stroke="${THEME.border}" stroke-width="1"/>`;
    // Accent dot
    svg += `\n  <circle cx="${cx + 14}" cy="${cy + 16}" r="4" fill="${color}"/>`;
    // Label
    svg += `\n  <text x="${cx + 24}" y="${cy + 20}" fill="${THEME.secondary}" font-size="10" font-family="${FONT}" font-weight="600">${escapeXml(stats[i].label)}</text>`;
    // Value
    svg += `\n  <text x="${cx + cardW / 2}" y="${cy + 52}" fill="${color}" font-size="22" font-family="${FONT}" font-weight="700" text-anchor="middle">${escapeXml(String(stats[i].value))}</text>`;
  }

  return { svg, height: cardH };
}

function renderPillBadges(items, y) {
  const { padX } = LAYOUT;
  const maxWidth = 760;
  const pillH = 28;
  const gapX = 10;
  const gapY = 10;
  let svg = "";
  let cx = padX;
  let cy = y;
  let maxRowY = cy + pillH;

  for (let i = 0; i < items.length; i++) {
    const text = truncate(items[i], 30);
    const pillW = Math.ceil(text.length * 6.5) + 28;
    const color = BAR_COLORS[i % BAR_COLORS.length];

    // Wrap to next row if exceeding usable width
    if (cx + pillW > padX + maxWidth && cx > padX) {
      cx = padX;
      cy += pillH + gapY;
      maxRowY = cy + pillH;
    }

    // Pill background
    svg += `\n  <rect x="${cx}" y="${cy}" width="${pillW}" height="${pillH}" rx="14" fill="${color}" fill-opacity="0.15" stroke="${color}" stroke-opacity="0.4" stroke-width="1"/>`;
    // Pill text
    svg += `\n  <text x="${cx + pillW / 2}" y="${cy + pillH / 2 + 4}" fill="${color}" font-size="11" font-family="${FONT}" font-weight="600" text-anchor="middle">${escapeXml(text)}</text>`;

    cx += pillW + gapX;
  }

  return { svg, height: maxRowY - y };
}

function renderContributionCards(highlights, y) {
  const { padX } = LAYOUT;
  const cardW = 760;
  const cardH = 44;
  const gap = 8;
  let svg = "";

  for (let i = 0; i < highlights.length; i++) {
    const cy = y + i * (cardH + gap);
    const color = BAR_COLORS[i % BAR_COLORS.length];
    const h = highlights[i];

    // Card background
    svg += `\n  <rect x="${padX}" y="${cy}" width="${cardW}" height="${cardH}" rx="6" fill="${THEME.cardBg}" stroke="${THEME.border}" stroke-width="1"/>`;
    // Left accent bar
    svg += `\n  <rect x="${padX}" y="${cy}" width="4" height="${cardH}" rx="2" fill="${color}"/>`;
    // Repo name
    svg += `\n  <text x="${padX + 16}" y="${cy + 18}" fill="${THEME.link}" font-size="12" font-family="${FONT}" font-weight="700">${escapeXml(truncate(h.project, 40))}</text>`;
    // Detail
    svg += `\n  <text x="${padX + 16}" y="${cy + 34}" fill="${THEME.secondary}" font-size="11" font-family="${FONT}">${escapeXml(truncate(h.detail, 80))}</text>`;
  }

  return { svg, height: highlights.length * (cardH + gap) - (highlights.length > 0 ? gap : 0) };
}

function renderSectionHeader(title, subtitle, y) {
  let svg = `<text x="${LAYOUT.padX}" y="${y + 16}" fill="${THEME.text}" font-size="13" font-family="${FONT}" letter-spacing="1.5" font-weight="600">${escapeXml(title.toUpperCase())}</text>`;
  let height = 24;
  if (subtitle) {
    svg += `\n  <text x="${LAYOUT.padX}" y="${y + 32}" fill="${THEME.muted}" font-size="11" font-family="${FONT}">${escapeXml(subtitle)}</text>`;
    height = 42;
  }
  return { svg, height };
}

function renderBarChart(items, y, { useItemColors = false } = {}) {
  if (items.length === 0) return { svg: "", height: 0 };

  const { barLabelWidth, barHeight, barRowHeight, barMaxWidth, padX } = LAYOUT;
  const maxValue = Math.max(...items.map((d) => d.value));

  const bars = items
    .map((item, i) => {
      const ry = y + i * barRowHeight;
      const barWidth = Math.max((item.value / maxValue) * barMaxWidth, 4);
      const color = useItemColors
        ? item.color || BAR_COLORS[i % BAR_COLORS.length]
        : BAR_COLORS[i % BAR_COLORS.length];
      const label = escapeXml(truncate(item.name, 20));
      const valueLabel = item.percent
        ? `${item.percent}%`
        : String(item.value);

      const trendingSvg = item.trending
        ? `\n    <text x="${padX + barLabelWidth + barWidth + 8 + valueLabel.length * 7 + 8}" y="${ry + 14}" fill="#3fb950" font-size="11" font-family="${FONT}">↑ trending</text>`
        : "";

      return `
    <text x="${padX}" y="${ry + 14}" fill="${THEME.secondary}" font-size="12" font-family="${FONT}">${label}</text>
    <rect x="${padX + barLabelWidth}" y="${ry + 2}" width="${barWidth}" height="${barHeight}" rx="3" fill="${color}" opacity="0.85"/>
    <text x="${padX + barLabelWidth + barWidth + 8}" y="${ry + 14}" fill="${THEME.muted}" font-size="11" font-family="${FONT}">${valueLabel}</text>${trendingSvg}`;
    })
    .join("");

  return { svg: bars, height: items.length * barRowHeight };
}

function wrapSectionSvg(bodySvg, height) {
  const { width } = LAYOUT;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" rx="12" fill="${THEME.bg}"/>
  ${bodySvg}
</svg>`;
}

function renderSection(title, subtitle, itemsOrRenderBody, options = {}) {
  const { padY } = LAYOUT;
  let y = padY;
  let svg = "";

  const header = renderSectionHeader(title, subtitle, y);
  svg += header.svg;
  y += header.height;

  if (typeof itemsOrRenderBody === "function") {
    const body = itemsOrRenderBody(y);
    svg += body.svg;
    y += body.height + padY;
  } else {
    const bars = renderBarChart(itemsOrRenderBody, y, options);
    svg += bars.svg;
    y += bars.height + padY;
  }

  return { svg, height: y };
}

function generateFullSvg(sections) {
  const { width, padY, sectionGap } = LAYOUT;
  let y = padY;
  let bodySvg = "";

  for (const section of sections) {
    const header = renderSectionHeader(section.title, section.subtitle, y);
    bodySvg += header.svg;
    y += header.height;

    if (section.renderBody) {
      const body = section.renderBody(y);
      bodySvg += body.svg;
      y += body.height + sectionGap;
    } else {
      const bars = renderBarChart(section.items, y, section.options || {});
      bodySvg += bars.svg;
      y += bars.height + sectionGap;
    }
  }

  const totalHeight = y + padY;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${totalHeight}" viewBox="0 0 ${width} ${totalHeight}">
  <rect width="${width}" height="${totalHeight}" rx="12" fill="${THEME.bg}"/>
  ${bodySvg}
</svg>`;
}

// ── MAIN ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("Fetching repo data...");
  const repos = await fetchAllRepoData();
  console.log(`Found ${repos.length} public repos`);

  console.log("Fetching dependency manifests...");
  const manifests = await fetchManifestsForRepos(repos);
  console.log(`Fetched manifests for ${manifests.size} repos`);

  // Aggregate data
  const languages = aggregateLanguages(repos);
  console.log("Top languages:", languages.map((l) => `${l.name} (${l.percent}%)`));

  const categories = classifyDependencies(repos, manifests);
  console.log("Frameworks:", categories.frameworks.map((f) => f.name));
  console.log("DB/Infra:", categories.dbInfra.map((d) => d.name));
  console.log("Re-used tools:", categories.tools.map((t) => `${t.name} (${t.value})`));

  const complexity = computeComplexityScores(repos);
  console.log("Complex projects:", complexity.map((c) => `${c.name} (${c.value})`));

  // Fetch contribution data
  console.log("Fetching contribution data...");
  const contributionData = await fetchContributionData();
  console.log(`Contributions: ${contributionData.contributions.totalCommitContributions} commits, ${contributionData.contributions.totalPullRequestContributions} PRs, ${contributionData.contributions.totalPullRequestReviewContributions} reviews`);

  // Fetch AI-powered trending analysis
  console.log("Fetching trending analysis from GitHub Models...");
  const trendingSet = await fetchTrendingAnalysis(
    languages,
    categories.frameworks,
    categories.tools
  );
  console.log(`Trending technologies: ${[...trendingSet].join(", ") || "(none)"}`);

  // Mark trending items across all sections
  for (const list of [languages, categories.frameworks, categories.dbInfra, categories.tools, complexity]) {
    for (const item of list) {
      item.trending = trendingSet.has(item.name.toLowerCase());
    }
  }

  // Sub-classify frameworks and infrastructure into granular sections
  const webFrameworks = categories.frameworks.filter(
    (f) => !ML_AI_NAMES.has(f.name.toLowerCase())
  );
  const mlAi = categories.frameworks.filter(
    (f) => ML_AI_NAMES.has(f.name.toLowerCase())
  );
  const databases = categories.dbInfra.filter(
    (d) => DATABASE_NAMES.has(d.name.toLowerCase())
  );
  const cloudInfra = categories.dbInfra.filter(
    (d) => !DATABASE_NAMES.has(d.name.toLowerCase())
  );
  console.log("Web Frameworks:", webFrameworks.map((f) => f.name));
  console.log("ML & AI:", mlAi.map((f) => f.name));
  console.log("Databases:", databases.map((d) => d.name));
  console.log("Cloud & Infra:", cloudInfra.map((d) => d.name));

  // Define all sections
  const sectionDefs = [
    {
      filename: "metrics-languages.svg",
      title: "Languages",
      subtitle: "By bytes of code across all public repos",
      items: languages,
      options: { useItemColors: true },
    },
    {
      filename: "metrics-frameworks.svg",
      title: "Web Frameworks",
      subtitle: "Detected from topics and dependency manifests",
      items: webFrameworks,
    },
    {
      filename: "metrics-ml-ai.svg",
      title: "ML & AI",
      subtitle: "Detected from topics and dependency manifests",
      items: mlAi,
    },
    {
      filename: "metrics-databases.svg",
      title: "Databases",
      subtitle: "Detected from topics and dependency manifests",
      items: databases,
    },
    {
      filename: "metrics-cloud-infra.svg",
      title: "Cloud & Infrastructure",
      subtitle: "Detected from topics and dependency manifests",
      items: cloudInfra,
    },
    {
      filename: "metrics-complexity.svg",
      title: "Most Complex Projects",
      subtitle: "Composite score: languages, disk usage, code size",
      items: complexity,
    },
    {
      filename: "metrics-tools.svg",
      title: "Most Re-used Tools",
      subtitle: "Dependencies appearing in 2+ repositories",
      items: categories.tools,
    },
    ...(contributionData.externalRepos.nodes.length > 0
      ? [
          {
            filename: "metrics-contributions.svg",
            title: "Open Source Contributions",
            subtitle: "External repositories contributed to (all time)",
            renderBody: (y) => {
              const repos = contributionData.externalRepos.nodes.slice(0, 5);
              const highlights = repos.map((r) => ({
                project: r.nameWithOwner,
                detail: [
                  r.stargazerCount > 0
                    ? `\u2605 ${r.stargazerCount.toLocaleString()}`
                    : null,
                  r.primaryLanguage?.name,
                ].filter(Boolean).join(" \u00b7 "),
              }));
              return renderContributionCards(highlights, y);
            },
          },
        ]
      : []),
  ];

  // Filter to sections with data
  const activeSections = sectionDefs.filter(
    (s) => s.renderBody || (s.items && s.items.length > 0)
  );

  // Write individual section SVGs
  mkdirSync("metrics", { recursive: true });
  for (const section of activeSections) {
    const { svg, height } = renderSection(
      section.title,
      section.subtitle,
      section.renderBody || section.items,
      section.options || {}
    );
    writeFileSync(`metrics/${section.filename}`, wrapSectionSvg(svg, height));
    console.log(`Wrote metrics/${section.filename}`);
  }

  // Write combined index SVG into metrics/
  const combinedSvg = generateFullSvg(activeSections);
  writeFileSync("metrics/index.svg", combinedSvg);
  console.log("Wrote metrics/index.svg");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
