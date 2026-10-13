"""Extract a supplied workbook sheet to UTF-8 CSV without changing its values.

This is a manual preparation step, not part of the hosted build. Reading Excel
requires pandas and openpyxl. The public app uses the resulting committed CSV.
"""
from __future__ import annotations

import argparse
import hashlib
from pathlib import Path

import pandas as pd


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--sheet", default=0)
    args = parser.parse_args()
    frame = pd.read_excel(args.source, sheet_name=args.sheet, dtype=str, keep_default_na=False)
    if frame.empty or frame.columns.duplicated().any():
        raise ValueError("The sheet must contain rows and unique column headings.")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    frame.to_csv(args.output, index=False, encoding="utf-8", lineterminator="\n")
    print(f"Extracted {len(frame)} rows, {len(frame.columns)} columns")
    print(f"Workbook SHA-256: {hashlib.sha256(args.source.read_bytes()).hexdigest()}")
    print(f"CSV SHA-256: {hashlib.sha256(args.output.read_bytes()).hexdigest()}")


if __name__ == "__main__":
    main()
