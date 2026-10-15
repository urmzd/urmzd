"""Shared, validated map metadata for the README and D2 renderer."""
import json
import re
import tomllib


def validate(config):
    projects = config.get("projects", {})
    excluded = set(config.get("exclude", []))
    for key, spec in config.get("diagrams", {}).items():
        if not re.fullmatch(r"[a-z_]+", key):
            raise ValueError(f"Invalid diagram name: {key}")
        nodes = spec["nodes"]
        ids = [node["id"] for node in nodes]
        if len(ids) != len(set(ids)) or any(not re.fullmatch(r"[a-z_]+", id) for id in ids):
            raise ValueError(f"Invalid or duplicate node IDs in {key}")
        if spec["direction"] not in ("right", "down"):
            raise ValueError(f"Invalid direction in {key}")
        for node in nodes:
            if "project" in node:
                name = node["project"]
                if name not in projects or name in excluded:
                    raise ValueError(f"Unknown or excluded project: {name}")
            elif not node.get("label"):
                raise ValueError(f"Missing label in {key}")
        for edge in spec["edges"]:
            if edge["from"] not in ids or edge["to"] not in ids:
                raise ValueError(f"Unknown edge endpoint in {key}")
            if edge["kind"] not in ("guide", "dependency"):
                raise ValueError(f"Unknown edge kind in {key}")
            if edge["kind"] == "dependency" and not edge.get("evidence"):
                raise ValueError(f"Dependency missing evidence in {key}")


def project_names(spec):
    return [node["project"] for node in spec["nodes"] if "project" in node]


def caption(spec):
    kinds = {edge["kind"] for edge in spec["edges"]}
    legend = []
    if "guide" in kinds:
        legend.append("Dashed arrows suggest where to start.")
    if "dependency" in kinds:
        legend.append("Solid arrows point from a project to a dependency.")
    return " ".join([spec["intro"], *legend])


def alt(spec):
    names = {node["id"]: node.get("project", node.get("label")) for node in spec["nodes"]}
    return " ".join(f"{names[edge['from']]} to {names[edge['to']]}: {edge['label']}." for edge in spec["edges"])


def d2_source(config, key):
    spec = config["diagrams"][key]
    quote = json.dumps
    out = ["# Generated from profile.toml. Do not edit by hand.", f"direction: {spec['direction']}"]
    for node in spec["nodes"]:
        project = node.get("project")
        label = f"{project}\n{config['projects'][project]['role']}" if project else node["label"]
        style = "project" if project else "goal"
        out.append(f"{node['id']}: {quote(label)} {{class: {style}}}")
    for edge in spec["edges"]:
        out.append(f"{edge['from']} -> {edge['to']}: {quote(edge['label'])} {{class: {edge['kind']}}}")
    return "\n".join(out) + "\n"


def validate_dependencies(config, read_manifest):
    """Check every declared dependency against its source manifest before publishing."""
    manifests = {}
    for spec in config.get("diagrams", {}).values():
        nodes = {node["id"]: node for node in spec["nodes"]}
        for edge in spec["edges"]:
            if edge["kind"] != "dependency":
                continue
            source = nodes[edge["from"]]["project"]
            target = nodes[edge["to"]]["project"]
            evidence = edge["evidence"]
            if not evidence.startswith(source + "/"):
                raise ValueError(f"Evidence does not belong to {source}: {evidence}")
            if evidence not in manifests:
                manifests[evidence] = read_manifest(evidence)
            content = manifests[evidence]
            if evidence.endswith("go.mod"):
                module = re.escape(f"github.com/{config['login']}/{target}")
                found = any(re.match(rf"\s*{module}\s+v", line) and "// indirect" not in line
                            for line in content.splitlines())
            elif evidence.endswith("Cargo.toml"):
                manifest = tomllib.loads(content)
                found = target in manifest.get("dependencies", {})
                if edge.get("feature"):
                    found = found and "dep:" + target in manifest.get("features", {}).get(edge["feature"], [])
            else:
                raise ValueError(f"Unsupported dependency evidence: {evidence}")
            if not found:
                raise ValueError(f"Dependency no longer supported by {evidence}: {source} -> {target}")
