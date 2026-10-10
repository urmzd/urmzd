#!/usr/bin/env python3
"""Generate the profile README from public GitHub data.

Projects are ranked by how much the owner committed to them recently, so the
page follows the work without being edited by hand.

Usage: GH_TOKEN=... python3 scripts/generate_readme.py [--check]
"""

from __future__ import annotations

import datetime as dt
import json
import math
import os
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


def render(config: dict, repos: list[dict]) -> str:
    excluded = set(config.get("exclude", []))
    repos = [r for r in repos if not r["isArchived"] and r["name"] not in excluded]
    ranked = sorted(repos, key=lambda r: (-score(r), r["name"]))
    background = set(config.get("background", []))
    active = [r for r in ranked if commits(r, "recent") > 0 and r["name"] not in background]
    active = active[: config.get("active_count", 5)]
    active_names = {r["name"] for r in active}

    out = [f"# {config['name']}", "", f"**{config['title']}.** {config['bio']}", ""]
    badges = [
        f"[![{b['label']}](https://img.shields.io/badge/{b['badge']}?style=flat&logo={b['logo']}&logoColor=white)]({b['url']})"
        for b in config.get("links", [])
    ]
    if badges:
        out += [" ".join(badges), ""]

    if active:
        out += ["## Working on now", ""]
        out += ["| Project | What it is | Commits, 30 days |", "|---|---|---|"]
        for repo in active:
            out.append(f"| **{link(repo)}** | {summary(repo['description'])} | {commits(repo, 'recent')} |")
        out.append("")

    rest = [r for r in ranked if r["name"] not in active_names]
    if rest:
        out += ["<details>", f"<summary>{len(rest)} more projects</summary>", ""]
        out += ["| Project | What it is | Language | Stars |", "|---|---|---|---|"]
        for repo in rest:
            language = (repo.get("primaryLanguage") or {}).get("name", "")
            stars = repo["stargazerCount"] or ""
            out.append(f"| {link(repo)} | {summary(repo['description'])} | {language} | {stars} |")
        out += ["", "</details>", ""]

    return "\n".join(out)


def main() -> None:
    token = os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN")
    if not token:
        raise SystemExit("Set GH_TOKEN or GITHUB_TOKEN.")
    config = tomllib.loads(CONFIG.read_text())
    today = dt.datetime.now(dt.timezone.utc).date()
    readme = render(config, fetch_repos(token, config["login"], today))
    if "--check" in sys.argv:
        sys.stdout.write(readme)
        return
    README.write_text(readme)


if __name__ == "__main__":
    main()
