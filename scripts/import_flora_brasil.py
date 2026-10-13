"""Prepare the Orchidaceae species extract from florabr's fixed bulk dataset.

Download CompleteBrazilianFlora.gz from Zenodo record 23084491 (version 393.432)
and pass its local path. The checksum is the one published by florabr 1.4.0.
All rows at family Orchidaceae and rank Species are kept. Selected taxonomic and
distribution fields retain their original values; the full source is on Zenodo.
"""
from __future__ import annotations

import argparse
import hashlib
from pathlib import Path

import pandas as pd

EXPECTED_MD5 = "f73751178516ebcf6ad78a5e0ac3fa17"
FIELDS = ["taxonID", "species", "scientificName", "taxonomicStatus", "nomenclaturalStatus",
          "acceptedNameUsageID", "acceptedName", "states", "biome", "origin", "endemism",
          "namePublishedInYear"]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    raw = args.source.read_bytes()
    if hashlib.md5(raw).hexdigest() != EXPECTED_MD5:
        raise ValueError("The source does not match the published fixed-version checksum.")
    frame = pd.read_csv(args.source, dtype=str, keep_default_na=False, compression="gzip")
    required = {"family", "taxonRank", "species", "taxonomicStatus", "acceptedName", "states"}
    if not required.issubset(frame.columns):
        raise ValueError("Missing expected Flora e Funga do Brasil columns.")
    orchids = frame[(frame.family == "Orchidaceae") & (frame.taxonRank == "Species")]
    if orchids.empty:
        raise ValueError("No Orchidaceae species records found.")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    orchids[FIELDS].to_csv(args.output, index=False, encoding="utf-8", lineterminator="\n")
    print(f"Extracted {len(orchids)} rows, {orchids.species.nunique()} unique names")
    print(f"Rows by taxonomic status: {orchids.taxonomicStatus.value_counts().to_dict()}")
    print(f"Source SHA-256: {hashlib.sha256(raw).hexdigest()}")
    print(f"CSV SHA-256: {hashlib.sha256(args.output.read_bytes()).hexdigest()}")


if __name__ == "__main__":
    main()
