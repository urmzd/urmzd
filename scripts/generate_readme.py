#!/usr/bin/env python3
"""Generate the profile README from public GitHub data.

Projects are ranked by how much the owner committed to them recently, so the
page follows the work without being edited by hand.

Usage: GH_TOKEN=... python3 scripts/generate_readme.py [--check | --preview]
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import math
import os
import re
import sys
import tomllib
import urllib.request
from pathlib import Path

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
    """A d2 diagram from assets/, one render per GitHub colour scheme."""
    spec = config.get("diagrams", {}).get(key)
    if not spec:
        return []
    light, dark = (f"assets/{key}-{scheme}.svg" for scheme in ("light", "dark"))
    if not ((ROOT / light).exists() and (ROOT / dark).exists()):
        print(f"warning: diagram '{key}' is not rendered, run scripts/render_diagrams.sh", file=sys.stderr)
        return []
    return [
        f"## {spec['title']}",
        "",
        spec["caption"],
        "",
        "<picture>",
        f'  <source media="(prefers-color-scheme: dark)" srcset="{dark}">',
        f'  <img src="{light}" alt="{spec["alt"]}" width="100%">',
        "</picture>",
        "",
    ]


def stale_cards(config: dict, repos: list[dict]) -> list[str]:
    """Projects drawn in a diagram that are no longer public, unarchived repositories."""
    live = {r["name"] for r in repos if not r["isArchived"]}
    drawn: set[str] = set()
    for key in config.get("diagrams", {}):
        source = ROOT / "assets" / f"{key}.d2"
        if source.exists():
            drawn.update(re.findall(r'name: "([^"]+)" \{class: name\}', source.read_text()))
    return sorted(drawn - live)


def render(config: dict, repos: list[dict]) -> str:
    excluded = set(config.get("exclude", []))
    repos = [r for r in repos if not r["isArchived"] and r["name"] not in excluded]
    ranked = sorted(repos, key=lambda r: (-score(r), r["name"]))
    background = set(config.get("background", []))
    active = [r for r in ranked if commits(r, "recent") > 0 and r["name"] not in background]
    active = active[: config.get("active_count", 5)]
    active_names = {r["name"] for r in active}

    lead = f"**{config['title']}** " if config.get("title") else ""
    out = [f"# {config['name']}", "", f"{lead}{config['bio']}", ""]
    badges = [
        f"[![{b['label']}](https://img.shields.io/badge/{b['badge']}?style=flat&logo={b['logo']}&logoColor=white)]({b['url']})"
        for b in config.get("links", [])
    ]
    if badges:
        out += [" ".join(badges), ""]
    by_name = {repo["name"]: repo for repo in repos}
    featured = [item for item in config.get("featured", []) if item["name"] in by_name]
    if featured:
        out += ["## Start here", "", "| Project | What you can do |", "|---|---|"]
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

    out += diagram(config, "stack")
    out += diagram(config, "map")

    rest = [r for r in ranked if r["name"] not in active_names]
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
    today = dt.datetime.now(dt.timezone.utc).date()
    repos = fetch_repos(token, config["login"], today)
    for name in stale_cards(config, repos):
        print(f"warning: '{name}' is drawn in a diagram but is not a public, unarchived repository", file=sys.stderr)
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
