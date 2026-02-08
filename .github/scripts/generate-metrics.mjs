// ── Entry point: orchestration + I/O ────────────────────────────────────────

import { writeFileSync, mkdirSync } from "fs";
import {
  fetchAllRepoData,
  fetchManifestsForRepos,
  fetchContributionData,
  fetchTrendingAnalysis,
} from "./lib/api.mjs";
import {
  aggregateLanguages,
  classifyDependencies,
  computeComplexityScores,
  subClassify,
  markTrending,
  buildSections,
} from "./lib/metrics.mjs";
import {
  renderSection,
  renderContributionCards,
  wrapSectionSvg,
  generateFullSvg,
} from "./lib/render.mjs";

const TOKEN = process.env.GITHUB_TOKEN;
const USERNAME = "urmzd";

if (!TOKEN) {
  console.error("GITHUB_TOKEN is required");
  process.exit(1);
}

async function main() {
  // ── Fetch (effects) ─────────────────────────────────────────────────────
  console.log("Fetching repo data...");
  const repos = await fetchAllRepoData(TOKEN, USERNAME);
  console.log(`Found ${repos.length} public repos`);

  console.log("Fetching dependency manifests...");
  const manifests = await fetchManifestsForRepos(TOKEN, USERNAME, repos);
  console.log(`Fetched manifests for ${manifests.size} repos`);

  console.log("Fetching contribution data...");
  const contributionData = await fetchContributionData(TOKEN, USERNAME);
  console.log(`Contributions: ${contributionData.contributions.totalCommitContributions} commits, ${contributionData.contributions.totalPullRequestContributions} PRs, ${contributionData.contributions.totalPullRequestReviewContributions} reviews`);

  // ── Transform (pure) ───────────────────────────────────────────────────
  const languages = aggregateLanguages(repos);
  console.log("Top languages:", languages.map((l) => `${l.name} (${l.percent}%)`));

  const categories = classifyDependencies(repos, manifests);
  console.log("Frameworks:", categories.frameworks.map((f) => f.name));
  console.log("DB/Infra:", categories.dbInfra.map((d) => d.name));
  console.log("Re-used tools:", categories.tools.map((t) => `${t.name} (${t.value})`));

  const complexity = computeComplexityScores(repos);
  console.log("Complex projects:", complexity.map((c) => `${c.name} (${c.value})`));

  // ── Enrich (effect + pure) ─────────────────────────────────────────────
  console.log("Fetching trending analysis from GitHub Models...");
  const trendingSet = await fetchTrendingAnalysis(
    TOKEN,
    languages,
    categories.frameworks,
    categories.tools
  );
  console.log(`Trending technologies: ${[...trendingSet].join(", ") || "(none)"}`);

  markTrending(
    [languages, categories.frameworks, categories.dbInfra, categories.tools, complexity],
    trendingSet
  );

  // ── Define (pure) ──────────────────────────────────────────────────────
  const { webFrameworks, mlAi, databases, cloudInfra } = subClassify(
    categories.frameworks,
    categories.dbInfra
  );
  console.log("Web Frameworks:", webFrameworks.map((f) => f.name));
  console.log("ML & AI:", mlAi.map((f) => f.name));
  console.log("Databases:", databases.map((d) => d.name));
  console.log("Cloud & Infra:", cloudInfra.map((d) => d.name));

  const sectionDefs = buildSections({
    languages,
    webFrameworks,
    mlAi,
    databases,
    cloudInfra,
    complexity,
    tools: categories.tools,
    contributionData,
    renderContributionCards,
  });

  const activeSections = sectionDefs.filter(
    (s) => s.renderBody || (s.items && s.items.length > 0)
  );

  // ── Render + Write (effects) ───────────────────────────────────────────
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

  const combinedSvg = generateFullSvg(activeSections);
  writeFileSync("metrics/index.svg", combinedSvg);
  console.log("Wrote metrics/index.svg");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
