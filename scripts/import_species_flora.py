"""Extract taxonomic fields from the supplied Flora do Brasil workbook."""
from __future__ import annotations

import argparse
from hashlib import sha256
from pathlib import Path

import pandas as pd


FIELDS = [
    "taxonID", "acceptedNameUsageID", "originalNameUsageID", "scientificName",
    "acceptedNameUsage", "taxonRank", "taxonomicStatus", "nomenclaturalStatus",
    "namePublishedInYear",
]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    frame = pd.read_excel(args.source, sheet_name="Hoja1", dtype=str, keep_default_na=False)
    missing = set([*FIELDS, "family"]) - set(frame.columns)
    if missing:
        raise ValueError(f"Missing fields: {', '.join(sorted(missing))}")
    orchids = frame.loc[frame.family.eq("Orchidaceae"), FIELDS]
    if orchids.empty or not orchids.scientificName.str.strip().all() or not orchids.acceptedNameUsage.str.strip().all():
        raise ValueError("Expected Orchidaceae rows with scientific and accepted usage names.")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    orchids.to_csv(args.output, index=False, encoding="utf-8", lineterminator="\n")
    print(f"Extracted {len(orchids)} rows by rank: {orchids.taxonRank.value_counts().to_dict()}")
    print(f"Workbook SHA-256: {sha256(args.source.read_bytes()).hexdigest()}")
    print(f"CSV SHA-256: {sha256(args.output.read_bytes()).hexdigest()}")


if __name__ == "__main__":
    main()
