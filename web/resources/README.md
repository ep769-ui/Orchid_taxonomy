# Included reference resources

`catalog.json` declares additional public reference lists. They load automatically
in the browser and use the same relationship model as private uploaded lists.
They contribute their own search results, taxonomic verdicts and batch columns,
without changing the five-source consolidation or its `contest_class` values.

## Colombia orchid reference

`pleuro_colombia.csv` is a value-preserving UTF-8 extraction of `Hoja1` from the
owner-supplied `pleuro_colombia.xlsx`, received on 11 October 2026. It contains
2,357 rows with `species_name`, `synonyms` and `distribution` columns. The owner
requested inclusion and attributed the workbook to **Karremans et al. (2023),
Colombian Orchidaceae: A Catalogue of the Pleurothallidinae, Lankesteriana 23(2):
181–400**, [doi:10.15517/lank.v23i2.56158](https://doi.org/10.15517/lank.v23i2.56158).
The cited article is under CC BY-NC-ND 3.0. This app distributes the supplied
tabular reference, not the article, and does not claim it is a verbatim official
machine-readable supplement or a CITES nomenclatural standard.

Workbook SHA-256:
`1de156e7888aa138348cefde4097425df427761cae3b8ec9a3b857c0cd76711a`

CSV SHA-256:
`8c1d9bc3a68a73cc1f04e308d4444fccfe49833f4e80ad52412f51e684480f31`

To extract a replacement workbook, install pandas and openpyxl and run:

```bash
python scripts/import_reference_workbook.py /path/to/pleuro_colombia.xlsx web/resources/pleuro_colombia.csv --sheet Hoja1
```

Review the replacement and update both checksums and snapshot metadata in the
catalog before committing. The hosted build uses the CSV and does not need the
workbook or openpyxl. `.gitattributes` preserves LF line endings for stable hashes.

The app strips whitespace, splits synonyms at semicolons and compares binomials.
Repeated rows merge their names and distribution strings. Conflicting taxonomic
claims remain ambiguous. Botanical accents are retained. `NA` placeholders and
hybrid names containing a multiplication sign cannot be resolved by the existing
binomial matcher and are counted and excluded from lookups. The source CSV retains these records for
review. Distribution strings are not merged into the core species taxonomy and
their symbols and codes are not interpreted.

## Flora e Funga do Brasil (orchids)

`flora_brasil.csv` contains all **Orchidaceae, Species** rows from the consolidated
fixed release **393.432**, downloaded on 11 October 2026. The bulk file is the
already-merged snapshot offered by
[`florabr` 1.4.0](https://cran.r-project.org/web/packages/florabr/refman/florabr.html)
with `get_fixed_version = TRUE`; no web scraping or R installation is required.

Attribution: **Flora e Funga do Brasil. Jardim Botânico do Rio de Janeiro.**
The fixed snapshot is distributed at [Zenodo record 23084491](https://doi.org/10.5281/zenodo.23084491),
published 1 October 2026, with **CC BY 4.0** terms. The upstream database is
[Flora e Funga do Brasil](https://floradobrasil.jbrj.gov.br/consulta/).
The florabr package's GPL code is not bundled.

The extract has **11,182 rows and 11,103 distinct species strings**:
3,301 `Accepted` rows, 7,729 `Synonym` rows and 152 rows with blank taxonomic
status. This pinned snapshot differs from earlier estimates. All duplicate rows
are retained; contradictory outcomes are shown as ambiguous. Missing statuses
are not promoted to accepted. The 330 synonym records without accepted-name
targets retain empty targets. Accepted records include 2,380 native, 283 exotic
and 638 unspecified origins; this is not a native-only checklist.

The extract preserves 12 fields without altering their values: taxon ID,
species, full scientific name, taxonomic and nomenclatural status, accepted-name
ID and name, states, biome, origin, endemism and publication year. Lookups use
`species`, `taxonomicStatus`, `acceptedName` and the original `states` string.
Other attributes remain available in the downloadable CSV. No distributions
are inferred from accepted-name targets. All 39 upstream fields remain available
in the full Zenodo download.

Bulk download:
`https://zenodo.org/records/23084491/files/CompleteBrazilianFlora.gz?download=1`

Published bulk MD5: `f73751178516ebcf6ad78a5e0ac3fa17`

Bulk SHA-256:
`f36156d8e7a0e71e7acfba8da517f294bab815f1aa5b5f4d690019d7f3cc50d2`

Extract SHA-256:
`3b4210a3963c29078e510217445f308689fde5a38daf5e098614db99f11da5af`

To regenerate from the verified bulk download:

```bash
python scripts/import_flora_brasil.py /path/to/CompleteBrazilianFlora.gz web/resources/flora_brasil.csv
```

The converter checks the published MD5 before extracting. Review the data and
metadata together when updating to a new release. Public builds read the committed
CSV without needing access to Zenodo.

Private WISIA data is not bundled with this app. Both regional references are
additional comparisons; neither changes the core five-source conflict classes.
