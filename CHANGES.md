# Orchid Taxonomy changes

This version imports Projecto Chigualen at `bb85eae` and preserves both projects'
Git history. The original repository and its deployment are separate.

## Included improvements

- Colombia orchid reference, attributed to Karremans et al. (2023), with all
  2,357 supplied rows retained and searchable species/synonym relationships.
- Flora e Funga do Brasil Orchidaceae species extract from the consolidated
  fixed release 393.432: 11,182 source records, including 3,301 Accepted,
  7,729 Synonym and 152 records with blank taxonomic status.
- Citations, editions, provenance, checksums and CSV downloads for both
  references, displayed under Data sources and Your reference lists.
- Both regional references contribute separate verdicts, accepted names,
  relationships, linked names, notes and supplied distributions in searches
  and batch exports. Uncertain or contradictory records remain explicit.
- Excel, CSV and TSV imports with worksheet selection and previews. Custom
  lists distinguish taxonomic synonymy, trade associations and presence only.
  WISIA data can be loaded privately; it is not distributed with this project.
- Existing per-source explanations, conflict reasons, publication years,
  corrected species metadata and disputed-synonym backlinks from Chigualen
  are retained. Additional references do not rewrite the core conflict classes.

Machine-readable CITES nomenclatural editions can be loaded as distinct custom
taxonomic lists when supplied. They have not been bundled because those files
are not yet available in this project.

## Validate a fresh checkout

```bash
pip install -r requirements-web.txt
python scripts/10_export_web.py
node --test tests/test_reference_lists.mjs tests/test_web_report.mjs
python tests/test_consolidation.py
python scripts/serve_web.py 8612
```

Use a recent Node.js with the built-in test runner and File/Response APIs
(Node.js 22 or newer). Visit `/parity/` to compare the browser resolver against
the archived Python implementation's 1,213 fixtures.

## Deploy this copy separately

Create a **new** Netlify project connected to `ep769-ui/Orchid_taxonomy`, branch
`main`. The committed `netlify.toml` supplies these settings:

- Build: `pip install -r requirements-web.txt && python3 scripts/10_export_web.py`
- Publish directory: `web`
- Python: `3.11`

The generated `web/data`, build identifier and source colours are produced on
each build. No private uploaded checklists or local workbooks are needed by the
host. Keep the original project's hosting connection unchanged; future pushes
to this repository belong to its own deployment.
