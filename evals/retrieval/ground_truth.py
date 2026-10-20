"""Turn the relevance specs in topics.jsonl into sets of chunk ids.

A topic lists where its answer lives in one corpus document. Two kinds of spec:

  {"section": "7.4 > Chemiosmosis"}
      Every chunk whose section_hierarchy contains these heading names in a row. A name that
      is only a number ("7.4") matches any heading that starts with it ("7.4 Oxidative
      Phosphorylation"). With "self_only": true the chunk's own heading must be the last
      name, so the sub-headings below it do not count.

  {"chunk_range": [53, 59]}
      Chunks 53 to 59 of the document, inclusive (chunk_index). Used where the PDF's heading
      detection hangs text under the wrong heading, e.g. the text after a "LINK TO LEARNING"
      box that belongs to the section around it. The ranges depend on the chunker, so
      corpus.json records a fingerprint of the chunk structure and the harness warns when it
      changes.
"""
import re
from typing import Dict, Iterable, List, Optional, Sequence, Set

HIERARCHY_SEPARATOR = " > "
NUMBER_LABEL = re.compile(r"^\d+(?:\.\d+)*$")


def split_hierarchy(hierarchy: Optional[str]) -> List[str]:
    if not hierarchy:
        return []
    return [part.strip() for part in hierarchy.split(HIERARCHY_SEPARATOR)]


def _component_matches(wanted: str, actual: str) -> bool:
    if wanted.casefold() == actual.casefold():
        return True
    return bool(NUMBER_LABEL.match(wanted)) and actual.startswith(wanted + " ")


def path_matches(path: Sequence[str], hierarchy: Optional[str], self_only: bool = False) -> bool:
    """True when `path` is a run of consecutive headings in `hierarchy`."""
    parts = split_hierarchy(hierarchy)
    width = len(path)
    if width == 0 or width > len(parts):
        return False
    starts = [len(parts) - width] if self_only else range(len(parts) - width + 1)
    return any(
        all(_component_matches(path[offset], parts[start + offset]) for offset in range(width))
        for start in starts
    )


def parse_section(section: str) -> List[str]:
    return [part.strip() for part in section.split(">") if part.strip()]


def resolve_relevant(relevant_specs: Iterable[dict], chunks: Sequence[dict]) -> Set[str]:
    """Ids of the chunks the specs select. `chunks` are one document's chunks, each with
    id, chunk_index and section_hierarchy."""
    ids: Set[str] = set()
    for spec in relevant_specs:
        if "chunk_range" in spec:
            low, high = spec["chunk_range"]
            ids.update(c["id"] for c in chunks if low <= c["chunk_index"] <= high)
        elif "section" in spec:
            path = parse_section(spec["section"])
            self_only = bool(spec.get("self_only", False))
            ids.update(
                c["id"] for c in chunks if path_matches(path, c["section_hierarchy"], self_only)
            )
        else:
            raise ValueError(f"relevance spec needs 'section' or 'chunk_range': {spec}")
    return ids


def resolve_topics(topics: Sequence[dict], chunks_by_document: Dict[str, Sequence[dict]]) -> Dict[str, Set[str]]:
    """Relevant chunk ids per topic id. A topic that selects nothing is an error: it means
    the chunker or the spec changed."""
    resolved: Dict[str, Set[str]] = {}
    for topic in topics:
        ids = resolve_relevant(topic["relevant"], chunks_by_document[topic["document"]])
        if not ids:
            raise ValueError(f"topic {topic['id']} selects no chunks; check its relevance specs")
        resolved[topic["id"]] = ids
    return resolved
