/** Exercise actual resource loading and batch export against the generated core data. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { relative, isAbsolute } from 'node:path';
import * as data from '../web/js/data.js';
import * as backbone from '../web/js/backbone.js';
import { buildReport } from '../web/js/ingest.js';

const webRoot = new URL('../web/', import.meta.url);
globalThis.sessionStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.fetch = async input => {
  const url = new URL(String(input), webRoot);
  url.search = '';
  const inside = relative(fileURLToPath(webRoot), fileURLToPath(url));
  assert.ok(!inside.startsWith('..') && !isAbsolute(inside), 'fetch stays within web data');
  const bytes = await readFile(url);
  return new Response(bytes, { headers: { 'content-length': String(bytes.length) } });
};

test('batch reports include both regional references while preserving core verdicts', async () => {
  await data.load();
  await backbone.initialize();
  const names = ['Pleurothallis aberrans', 'Pabstiella alligatorifera',
    'Acianthera alligatorifera', 'Anathallis stictophylla', 'Anathallis ariasii'];
  const report = await buildReport(names.map(name => ({ name, permit_id: '0017' })), 'name');
  assert.equal(report.length, names.length);
  assert.equal(report[0].permit_id, '0017');
  assert.equal(report[0].pleuro_colombia_status, 'synonym');
  assert.equal(report[0].pleuro_colombia_accepted_name, 'Acianthera aberrans');
  assert.equal(report[0].pleuro_colombia_distribution, 'COL COS ECU PAN');
  assert.equal(report[1].flora_brasil_status, 'accepted');
  assert.equal(report[1].flora_brasil_distribution, 'MG;PR;RJ;RS;SC;SP');
  assert.equal(report[2].flora_brasil_accepted_name, 'Pabstiella alligatorifera');
  assert.equal(report[3].flora_brasil_status, 'unrecognized_status');
  assert.equal(report[3].flora_brasil_accepted_name, '');
  for (const row of report) {
    const core = await data.resolveFull(row.name);
    assert.equal(row.contest_class, core.contestClass);
    assert.equal(row.matched_accepted_name, core.acceptedName);
    assert.equal(row.description_year, core.descriptionYear);
    for (const source of data.index().sources) {
      assert.equal(row[`${source}_status`], core.perSource[source].status);
      assert.equal(row[`${source}_accepted_name`], core.perSource[source].acceptedName);
    }
    for (const id of ['pleuro_colombia', 'flora_brasil']) {
      for (const field of ['status', 'accepted_name', 'relationship_type', 'reference_names',
        'linked_names', 'notes', 'distribution']) assert.ok(Object.hasOwn(row, `${id}_${field}`));
    }
  }
});
