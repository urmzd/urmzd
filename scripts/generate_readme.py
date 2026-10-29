#!/usr/bin/env python3
"""Generate the profile README from public GitHub data.

The mission, principles and featured tools come from profile.toml. Public
repository data keeps the expandable project directory current.

Usage: GH_TOKEN=... python3 scripts/generate_readme.py [--check | --preview]
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import html
import math
import os
import sys
import tomllib
import urllib.request
from pathlib import Path

from profile_maps import alt, caption, project_names, validate, validate_dependencies

ROOT = Path(__file__).resolve().parent.parent
CONFIG = ROOT / "profile.toml"
README = ROOT / "README.md"
API = "https://api.github.com/graphql"

QUERY = """
query($login: String!, $author: ID!, $recent: GitTimestamp!, $quarter: GitTimestamp!, $cursor: String) {
  user(login: $login) {
    repositories(first: 50, after: $cursor, ownerAffiliations: OWNER, privacy: PUBLIC,
                 isFork: false, orderBy: {field: PUSHED_AT, direction: DESC}) {
      pageInfo { hasNextPage endCursor }
      nodes {
        name url description stargazerCount isArchived
        primaryLanguage { name }
        defaultBranchRef {
          target {
            ... on Commit {
              recent: history(since: $recent, author: {id: $author}) { totalCount }
              quarter: history(since: $quarter, author: {id: $author}) { totalCount }
            }
          }
        }
      }
    }
  }
}
"""


def graphql(token: str, query: str, variables: dict) -> dict:
    request = urllib.request.Request(
        API,
        data=json.dumps({"query": query, "variables": variables}).encode(),
        headers={"Authorization": f"Bearer {token}", "User-Agent": "profile-readme"},
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        body = json.load(response)
    if body.get("errors"):
        raise SystemExit(f"GitHub API error: {json.dumps(body['errors'], indent=2)}")
    return body["data"]


def fetch_repos(token: str, login: str, today: dt.date) -> list[dict]:
    author = graphql(token, "query($login: String!) { user(login: $login) { id } }", {"login": login})
    variables = {
        "login": login,
        "author": author["user"]["id"],
        "recent": iso(today - dt.timedelta(days=30)),
        "quarter": iso(today - dt.timedelta(days=90)),
        "cursor": None,
    }
    repos: list[dict] = []
    while True:
        page = graphql(token, QUERY, variables)["user"]["repositories"]
        repos.extend(page["nodes"])
        if not page["pageInfo"]["hasNextPage"]:
            return repos
        variables["cursor"] = page["pageInfo"]["endCursor"]


def fetch_manifest(token: str, login: str, evidence: str) -> str:
    repo, path = evidence.split("/", 1)
    query = """query($login: String!, $repo: String!, $expression: String!) {
      repository(owner: $login, name: $repo) {
        object(expression: $expression) { ... on Blob { text } }
      }
    }"""
    result = graphql(token, query, {"login": login, "repo": repo, "expression": "HEAD:" + path})
    obj = (result.get("repository") or {}).get("object") or {}
    if not obj.get("text"):
        raise ValueError(f"Missing dependency manifest: {evidence}")
    return obj["text"]


def iso(day: dt.date) -> str:
    return f"{day.isoformat()}T00:00:00Z"


def commits(repo: dict, window: str) -> int:
    branch = repo.get("defaultBranchRef") or {}
    return ((branch.get("target") or {}).get(window) or {}).get("totalCount", 0)


def score(repo: dict) -> float:
    """Recent work counts most, the last quarter counts some, stars break ties.

    Square roots keep one busy week from burying everything else.
    """
    return (
        3 * math.sqrt(commits(repo, "recent"))
        + math.sqrt(commits(repo, "quarter"))
        + math.log1p(repo["stargazerCount"])
    )


def cell(text: str | None) -> str:
    return (text or "").replace("|", "\\|").replace("\n", " ").strip()


def summary(text: str | None, limit: int = 140) -> str:
    """The first sentence of a description, so a table row stays on a few lines."""
    text = cell(text)
    first = text.split(". ")[0].rstrip(".")
    if len(first) <= limit:
        return first
    return first[:limit].rsplit(" ", 1)[0] + "..."


def link(repo: dict) -> str:
    return f"[{repo['name']}]({repo['url']})"


def diagram(config: dict, key: str) -> list[str]:
    """Render the same map metadata used to generate the SVG."""
    spec = config.get("diagrams", {}).get(key)
    if not spec:
        return []
    light, dark = (f"assets/{key}-{scheme}.svg" for scheme in ("light", "dark"))
    if not ((ROOT / light).exists() and (ROOT / dark).exists()):
        raise ValueError(f"Missing diagram '{key}'; run scripts/render_diagrams.sh")
    links = " · ".join(f"[{name}](https://github.com/{config['login']}/{name})" for name in project_names(spec))
    evidence = sorted({edge["evidence"] for edge in spec["edges"] if edge.get("evidence")})
    sources = []
    for path in evidence:
        repo, file = path.split("/", 1)
        sources.append(f"[{path}](https://github.com/{config['login']}/{repo}/blob/HEAD/{file})")
    out = [
        f"## {spec['title']}", "", caption(spec), "", "<picture>",
        f'  <source media="(prefers-color-scheme: dark)" srcset="{dark}">',
        f'  <img src="{light}" alt="{html.escape(alt(spec), quote=True)}" width="100%">',
        "</picture>", "", links, "",
    ]
    if sources:
        out += ["Dependency sources: " + ", ".join(sources) + ".", ""]
    return out


def stale_cards(config: dict, repos: list[dict]) -> list[str]:
    """Reject map references that cannot be found in the public repository data."""
    live = {repo["name"] for repo in repos if not repo["isArchived"]}
    drawn = {name for spec in config.get("diagrams", {}).values() for name in project_names(spec)}
    return sorted(drawn - live)


def render(config: dict, repos: list[dict]) -> str:
    excluded = set(config.get("exclude", []))
    repos = [r for r in repos if not r["isArchived"] and r["name"] not in excluded]
    if config.get("layout") == "compact":
        navigation = " · ".join(
            f'<a href="{html.escape(item["url"], quote=True)}">{html.escape(item["label"])}</a>'
            for item in config.get("links", [])
        )
        out = ['<p align="center">', f"  <samp>{navigation}</samp>", "</p>", "", config["bio"], ""]
        available = {repo["name"]: repo for repo in repos}
        featured = [item for item in config.get("featured", []) if item["name"] in available]
        if featured:
            out += ["### Find your starting point", "", "```mermaid", "mindmap", "  root((Start here))"]
            for index, item in enumerate(featured):
                label = item.get("start", item["name"])
                out.append(f"    project_{index}[{json.dumps(label)}]")
            out += ["```", "", "### Projects", ""]
        for item in featured:
            out.append(f"- **{link(available[item['name']])}**: {cell(item['pitch'])}")
        out += ["", f"[More projects](https://github.com/{config['login']}?tab=repositories)", ""]
        return "\n".join(out)
    ranked = sorted(repos, key=lambda r: (-score(r), r["name"]))
    background = set(config.get("background", []))
    active = [r for r in ranked if commits(r, "recent") > 0 and r["name"] not in background]
    active = active[: config.get("active_count", 5)]
    active_names = {r["name"] for r in active}

    out = [f"# {config['name']}", ""]
    if config.get("title"):
        out += [config["title"], ""]
    out += [config["bio"], ""]
    badges = [
        f"[![{b['label']}](https://img.shields.io/badge/{b['badge']}?style=flat&logo={b['logo']}&logoColor=white)]({b['url']})"
        for b in config.get("links", [])
    ]
    if badges:
        out += [" ".join(badges), ""]
    principles = config.get("principles", [])
    if principles:
        out += ["## How I build", ""]
        out += [f"- **{item['name']}**. {item['text']}" for item in principles]
        out.append("")
    collapsed_maps = config.get("collapse_diagrams", False)
    if not collapsed_maps:
        out += diagram(config, "finder")
    by_name = {repo["name"]: repo for repo in repos}
    featured = [item for item in config.get("featured", []) if item["name"] in by_name]
    if featured and (collapsed_maps or "finder" not in config.get("diagrams", {})):
        out += [f"## {config.get('featured_title', 'Start here')}", "", "| Project | What you can do |", "|---|---|"]
        for item in featured:
            out.append(f"| **{link(by_name[item['name']])}** | {cell(item['pitch'])} |")
        out += ["", "Explore a repository for setup instructions, examples, and ways to contribute.", ""]

    descriptions = config.get("descriptions", {})

    def describe(repo: dict) -> str:
        return cell(descriptions[repo["name"]]) if repo["name"] in descriptions else summary(repo["description"])

    if active:
        out += ["## Working on now", ""]
        out += ["| Project | What you can do | Commits, 30 days |", "|---|---|---|"]
        for repo in active:
            out.append(f"| **{link(repo)}** | {describe(repo)} | {commits(repo, 'recent')} |")
        out.append("")

    if collapsed_maps and config.get("diagrams"):
        out += ["<details>", "<summary>How the tools and research fit together</summary>", ""]
        out += diagram(config, "finder")
    out += diagram(config, "stack")
    out += diagram(config, "research")
    if collapsed_maps and config.get("diagrams"):
        out += ["</details>", ""]

    featured_names = {item["name"] for item in featured}
    rest = [r for r in ranked if r["name"] not in active_names | featured_names]
    if rest:
        out += ["<details>", f"<summary>{len(rest)} more projects</summary>", ""]
        out += ["| Project | What it is | Language | Stars |", "|---|---|---|---|"]
        for repo in rest:
            language = (repo.get("primaryLanguage") or {}).get("name", "")
            stars = repo["stargazerCount"] or ""
            out.append(f"| {link(repo)} | {describe(repo)} | {language} | {stars} |")
        out += ["", "</details>", ""]

    return "\n".join(out)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--check", action="store_true", help="Exit nonzero if README needs updating")
    mode.add_argument("--preview", action="store_true", help="Print generated Markdown without writing")
    args = parser.parse_args()
    token = os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN")
    if not token:
        raise SystemExit("Set GH_TOKEN or GITHUB_TOKEN.")
    config = tomllib.loads(CONFIG.read_text())
    validate(config)
    today = dt.datetime.now(dt.timezone.utc).date()
    repos = fetch_repos(token, config["login"], today)
    if config.get("layout") != "compact":
        stale = stale_cards(config, repos)
        if stale:
            raise SystemExit("Maps reference unavailable repositories: " + ", ".join(stale))
        validate_dependencies(config, lambda evidence: fetch_manifest(token, config["login"], evidence))
    readme = render(config, repos)
    if args.preview:
        sys.stdout.write(readme)
        return
    if args.check:
        if not README.exists() or README.read_text() != readme:
            raise SystemExit("README.md is out of date. Run scripts/generate_readme.py.")
        return
    README.write_text(readme)


if __name__ == "__main__":
    main()
