#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
import xml.etree.ElementTree as ET
from pathlib import Path


def _pct(value: str | None) -> float:
    try:
        return float(value or "0") * 100
    except ValueError:
        return 0.0


def _load_class_metrics(xml_path: Path) -> tuple[dict[str, dict[str, float]], dict[str, float]]:
    root = ET.parse(xml_path).getroot()
    global_metrics = {
        "lines": _pct(root.attrib.get("line-rate")),
        "branches": _pct(root.attrib.get("branch-rate")),
    }
    by_file: dict[str, dict[str, float]] = {}
    for class_node in root.findall(".//class"):
        filename = class_node.attrib.get("filename")
        if not filename:
            continue
        by_file[filename] = {
            "lines": _pct(class_node.attrib.get("line-rate")),
            "branches": _pct(class_node.attrib.get("branch-rate")),
        }
    return by_file, global_metrics


def main() -> int:
    if len(sys.argv) != 3:
        print(
            "Usage: python scripts/check_critical_coverage.py <coverage.xml> <thresholds.json>",
            file=sys.stderr,
        )
        return 2

    xml_path = Path(sys.argv[1])
    thresholds_path = Path(sys.argv[2])
    thresholds = json.loads(thresholds_path.read_text())
    by_file, global_metrics = _load_class_metrics(xml_path)

    failures: list[str] = []

    global_thresholds = thresholds.get("global", {})
    min_global_lines = float(global_thresholds.get("minLines", 0))
    min_global_branches = float(global_thresholds.get("minBranches", 0))
    if global_metrics["lines"] + 1e-9 < min_global_lines:
        failures.append(
            f"global lines {global_metrics['lines']:.2f}% < required {min_global_lines:.2f}%"
        )
    if global_metrics["branches"] + 1e-9 < min_global_branches:
        failures.append(
            f"global branches {global_metrics['branches']:.2f}% < required {min_global_branches:.2f}%"
        )
    print(
        f"[coverage] global lines {global_metrics['lines']:.2f}% branches {global_metrics['branches']:.2f}%"
    )

    for item in thresholds.get("files", []):
        path = item["path"]
        metric = by_file.get(path)
        if not metric:
            failures.append(f"{path}: missing from coverage report")
            continue
        min_lines = float(item.get("minLines", 0))
        min_branches = float(item.get("minBranches", 0))
        if metric["lines"] + 1e-9 < min_lines:
            failures.append(
                f"{path}: line coverage {metric['lines']:.2f}% < required {min_lines:.2f}%"
            )
        if metric["branches"] + 1e-9 < min_branches:
            failures.append(
                f"{path}: branch coverage {metric['branches']:.2f}% < required {min_branches:.2f}%"
            )
        print(
            f"[coverage] {path} lines {metric['lines']:.2f}% branches {metric['branches']:.2f}%"
        )

    if failures:
        print("\nCritical RL coverage gate failed:", file=sys.stderr)
        for failure in failures:
            print(f"- {failure}", file=sys.stderr)
        return 1

    print("\nCritical RL coverage gate passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
