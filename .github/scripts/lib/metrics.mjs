// ── What to measure ─────────────────────────────────────────────────────────
// Pure data: category maps, aggregation, classification, scoring.
// No I/O — every exported function is a pure transform.

import { parseManifest } from "./parsers.mjs";

// ── Category Sets ───────────────────────────────────────────────────────────

const EXCLUDED_LANGUAGES = new Set(["Jupyter Notebook"]);

const FRAMEWORK_TOPICS = new Set([
  "react", "nextjs", "next-js", "vue", "vuejs", "angular", "svelte",
  "sveltekit", "astro", "remix", "gatsby", "nuxt", "fastapi", "django",
  "flask", "express", "nestjs", "spring", "spring-boot", "rails",
  "ruby-on-rails", "laravel", "pytorch", "tensorflow", "keras",
  "scikit-learn", "huggingface", "langchain", "axum", "actix", "rocket",
  "gin", "fiber", "echo",
]);

const FRAMEWORK_DEPS = new Set([
  "react", "react-dom", "next", "vue", "angular", "svelte", "@sveltejs/kit",
  "astro", "remix", "gatsby", "nuxt", "fastapi", "django", "flask",
  "express", "nestjs", "@nestjs/core", "torch", "pytorch", "tensorflow",
  "tf", "keras", "scikit-learn", "sklearn", "transformers", "langchain",
  "axum", "actix-web", "rocket", "gin", "fiber", "echo", "hono", "elysia",
  "solid-js", "qwik", "htmx",
]);

const DB_INFRA_TOPICS = new Set([
  "postgresql", "postgres", "mysql", "mongodb", "redis", "sqlite",
  "dynamodb", "cassandra", "elasticsearch", "docker", "kubernetes", "k8s",
  "aws", "gcp", "azure", "terraform", "ansible", "nginx", "graphql",
  "grpc", "kafka", "rabbitmq", "supabase", "firebase", "vercel", "netlify",
]);

const DB_INFRA_DEPS = new Set([
  "pg", "mysql2", "mongoose", "mongodb", "redis", "ioredis", "prisma",
  "@prisma/client", "typeorm", "sequelize", "knex", "drizzle-orm", "sqlx",
  "diesel", "sea-orm", "sqlalchemy", "psycopg2", "pymongo", "boto3",
  "docker", "docker-compose", "supabase", "@supabase/supabase-js",
  "firebase", "firebase-admin", "@google-cloud/storage", "aws-sdk",
  "@aws-sdk/client-s3", "graphql", "apollo-server", "@apollo/client",
  "grpc", "tonic",
]);

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

// ── Aggregation ─────────────────────────────────────────────────────────────

export const aggregateLanguages = (repos) => {
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
      color: langColors.get(name) || "#8b949e",
    }));
};

// ── Classification ──────────────────────────────────────────────────────────

export const classifyDependencies = (repos, manifests) => {
  const frameworks = new Map();
  const dbInfra = new Map();
  const tools = new Map();

  for (const repo of repos) {
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

    const files = manifests.get(repo.name) || {};
    const allDeps = Object.entries(files).flatMap(
      ([filename, text]) => parseManifest(filename, text)
    );

    const seen = new Set();
    for (const raw of allDeps) {
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
};

// ── Scoring ─────────────────────────────────────────────────────────────────

export const computeComplexityScores = (repos) =>
  repos
    .map((repo) => {
      const langCount = (repo.languages?.edges || []).filter(
        (e) => !EXCLUDED_LANGUAGES.has(e.node.name)
      ).length;
      const diskKB = Math.max(repo.diskUsage || 1, 1);
      const codeBytes = Math.max(repo.languages?.totalSize || 1, 1);
      const depCount = (repo.languages?.edges || []).length;

      const score =
        langCount * 15 +
        Math.log10(diskKB) * 20 +
        Math.log10(codeBytes) * 15 +
        Math.min(depCount, 50);

      return { name: repo.name, url: repo.url, value: Math.round(score) };
    })
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

// ── Sub-classification ──────────────────────────────────────────────────────

export const subClassify = (frameworks, dbInfra) => ({
  webFrameworks: frameworks.filter(
    (f) => !ML_AI_NAMES.has(f.name.toLowerCase())
  ),
  mlAi: frameworks.filter(
    (f) => ML_AI_NAMES.has(f.name.toLowerCase())
  ),
  databases: dbInfra.filter(
    (d) => DATABASE_NAMES.has(d.name.toLowerCase())
  ),
  cloudInfra: dbInfra.filter(
    (d) => !DATABASE_NAMES.has(d.name.toLowerCase())
  ),
});

// ── Trending ────────────────────────────────────────────────────────────────

export const markTrending = (itemLists, trendingSet) => {
  for (const list of itemLists) {
    for (const item of list) {
      item.trending = trendingSet.has(item.name.toLowerCase());
    }
  }
};

// ── Section definitions ─────────────────────────────────────────────────────

export const buildSections = ({ languages, webFrameworks, mlAi, databases, cloudInfra, complexity, tools, contributionData, renderContributionCards }) => [
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
    items: tools,
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
