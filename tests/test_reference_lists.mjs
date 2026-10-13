import test from 'node:test';
import assert from 'node:assert/strict';
import { build, lookup, reverseSynonyms, reportColumns, nameCount } from '../web/js/checklist.js';
import { parseCsv } from '../web/js/csv.js';
import { readTables } from '../web/js/file-input.js';
import { utils, write } from '../web/vendor/sheetjs/xlsx.mjs';
import { buildResource } from '../web/js/resources.js';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const wide = [
  { preferred: 'Acampe rigida', alias1: 'Acampe longifolia', alias2: 'Acampe pachyglossa' },
  { preferred: 'Acampe praemorsa', alias1: 'Acampe longifolia', alias2: '' },
];
const tradeList = () => build('custom_trade', 'Trade list', wide, 'preferred', null, null,
  { mode: 'trade', aliasCols: ['alias1', 'alias2'] });

test('wide trade associations preserve every reference without asserting taxonomy', () => {
  const bb = tradeList();
  assert.equal(nameCount(bb), 4);
  const v = lookup(bb, 'Acampe longifolia');
  assert.equal(v.status, 'trade_association');
  assert.equal(v.acceptedName, '');
  assert.deepEqual(v.referenceNames, ['Acampe praemorsa', 'Acampe rigida']);
  assert.deepEqual(v.linkedNames, ['Acampe pachyglossa', 'Acampe praemorsa', 'Acampe rigida']);
  assert.equal(bb.nMultipleReferences, 1);
  assert.deepEqual(reverseSynonyms(bb, 'Acampe rigida'), []);
  assert.equal(lookup(bb, 'Acampe rigida').acceptedName, '');
  assert.equal(lookup(bb, 'Absent orchid').status, 'not_in_source');
});

test('names-only lists assert presence even when extra columns are mapped', () => {
  const bb = build('custom_names', 'Names', wide, 'preferred', null, null,
    { mode: 'names', aliasCols: ['alias1', 'alias2'] });
  assert.equal(lookup(bb, 'Acampe longifolia').status, 'listed');
  assert.equal(lookup(bb, 'Acampe longifolia').acceptedName, '');
  assert.deepEqual(lookup(bb, 'Acampe longifolia').linkedNames, []);
});

test('conflicting taxonomic mappings retain all outcomes instead of first row winning', () => {
  const bb = build('custom_taxa', 'Taxa', wide, 'preferred', null, null,
    { mode: 'taxonomic', aliasCols: ['alias1', 'alias2'] });
  const v = lookup(bb, 'Acampe longifolia');
  assert.equal(v.status, 'ambiguous_in_list');
  assert.equal(v.acceptedName, '');
  assert.match(v.detail, /Acampe praemorsa/);
  assert.match(v.detail, /Acampe rigida/);
  assert.deepEqual(reverseSynonyms(bb, 'Acampe rigida'), ['Acampe pachyglossa']);
  assert.equal(bb.nAmbiguous, 1);
});

test('flat taxonomy supports explicit parents, duplicates and unknown status vocabulary', () => {
  const rows = [
    { name: 'Anathallis ariasii (Luer) Pridgeon', status: 'synonym', parent: 'Stelis ariasii' },
    { name: 'Anathallis ariasii', status: 'synonym', parent: 'Stelis ariasii' },
    { name: 'Vanda falcata', status: 'needs checking', parent: '' },
    { name: '', status: 'accepted', parent: '' },
  ];
  const bb = build('custom_taxa', 'Taxa', rows, 'name', 'status', 'parent');
  assert.equal(lookup(bb, 'Anathallis ariasii').acceptedName, 'Stelis ariasii');
  assert.equal(lookup(bb, 'Vanda falcata').status, 'unrecognized_status');
  assert.equal(lookup(bb, 'Vanda falcata').acceptedName, '');
  assert.equal(bb.nAmbiguous, 0);
  assert.equal(bb.nSkippedRows, 1);
});

test('trade export explicitly separates association names from accepted taxa', () => {
  const columns = reportColumns(tradeList(), 'Acampe longifolia');
  assert.equal(columns.custom_trade_relationship_type, 'trade');
  assert.equal(columns.custom_trade_accepted_name, '');
  assert.equal(columns.custom_trade_reference_names, 'Acampe praemorsa | Acampe rigida');
  assert.match(columns.custom_trade_linked_names, /Acampe pachyglossa/);
  assert.match(columns.custom_trade_notes, /no taxonomic status/);
});

test('blank mapped statuses remain unknown while an explicit target can establish synonymy', () => {
  const bb = build('blank', 'Blank status', [
    { name: 'Anathallis stictophylla', status: '', target: '' },
    { name: 'Acianthera alligatorifera', status: '', target: 'Pabstiella alligatorifera' },
  ], 'name', 'status', 'target');
  assert.equal(lookup(bb, 'Anathallis stictophylla').status, 'unrecognized_status');
  assert.equal(lookup(bb, 'Anathallis stictophylla').acceptedName, '');
  assert.match(lookup(bb, 'Anathallis stictophylla').detail, /No taxonomic status/);
  assert.equal(lookup(bb, 'Acianthera alligatorifera').acceptedName, 'Pabstiella alligatorifera');
});

test('legacy lists saved in the same tab can still be looked up', () => {
  const bb = { entries: { 'vanda falcata': { name: 'Vanda falcata', status: 'accepted',
    acceptedName: 'Vanda falcata', rawStatus: '' } } };
  assert.equal(lookup(bb, 'Vanda falcata').acceptedName, 'Vanda falcata');
});

test('semicolon lists preserve each synonym and source distribution across repeated rows', () => {
  const rows = [
    { species: 'Acianthera aberrans', synonyms: 'Aberrantia aberrans; Pleurothallis aberrans', range: 'COL ECU' },
    { species: 'Acianthera aberrans', synonyms: 'Pleurothallis aberrans', range: '*COL' },
  ];
  const bb = build('regional', 'Regional', rows, 'species', null, null,
    { mode: 'taxonomic', aliasCols: ['synonyms'], aliasSeparator: ';', distributionCol: 'range' });
  assert.equal(nameCount(bb), 3);
  assert.equal(lookup(bb, 'Pleurothallis aberrans').acceptedName, 'Acianthera aberrans');
  assert.equal(lookup(bb, 'Aberrantia aberrans').distribution, 'COL ECU');
  assert.equal(lookup(bb, 'Pleurothallis aberrans').distribution, '*COL | COL ECU');
  assert.equal(reportColumns(bb, 'Pleurothallis aberrans').regional_distribution, '*COL | COL ECU');
});

test('damaged names and invalid accepted targets never create false taxonomic matches', () => {
  const rows = [
    { species: 'Dracula alcitho\uFFFD', synonyms: 'Valid orchid', parent: '' },
    { species: 'Valid orchid', synonyms: 'Broken \uFFFD; NA; Apoda-prorepentia hirtzii', parent: 'Damaged \uFFFD' },
  ];
  const bb = build('damaged', 'Damaged', rows, 'species', null, 'parent',
    { mode: 'taxonomic', aliasCols: ['synonyms'], aliasSeparator: ';' });
  assert.equal(bb.nSkippedRows, 1);
  assert.equal(lookup(bb, 'Dracula alcitho\uFFFD').status, 'not_in_source');
  assert.equal(lookup(bb, 'Valid orchid').status, 'unrecognized_status');
  assert.equal(lookup(bb, 'Apoda-prorepentia hirtzii').acceptedName, '');
  assert.match(lookup(bb, 'Valid orchid').detail, /could not be parsed/);
});

test('included Colombian resource has reproducible bytes and resolves its own claims', () => {
  const specs = JSON.parse(readFileSync(new URL('../web/resources/catalog.json', import.meta.url), 'utf8'));
  const spec = specs.find(s => s.id === 'pleuro_colombia');
  const bytes = readFileSync(new URL('../web/resources/' + spec.file, import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), spec.sha256);
  const bb = buildResource(spec, bytes.toString('utf8'));
  assert.equal(bb.nRows, 2357);
  assert.equal(bb.bundled, true);
  assert.equal(lookup(bb, 'Acianthera aberrans').status, 'accepted');
  assert.equal(lookup(bb, 'Pleurothallis aberrans').acceptedName, 'Acianthera aberrans');
  assert.equal(lookup(bb, 'Pleurothallis aberrans').distribution, 'COL COS ECU PAN');
  assert.equal(lookup(bb, 'Dracula alcitho\uFFFD').status, 'not_in_source');
  assert.ok(bb.nUnparseable > 0);
  assert.equal(lookup(bb, 'Dracula alcithoë').status, 'accepted');
  assert.equal(lookup(bb, 'Vanda falcata').status, 'not_in_source');
  assert.throws(() => buildResource({ ...spec, nameColumn: 'missing' }, bytes.toString('utf8')), /missing column/);
});

test('Brazilian bulk extract preserves statuses, unresolved targets and conflicting duplicates', () => {
  const specs = JSON.parse(readFileSync(new URL('../web/resources/catalog.json', import.meta.url), 'utf8'));
  const spec = specs.find(s => s.id === 'flora_brasil');
  const bytes = readFileSync(new URL('../web/resources/' + spec.file, import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), spec.sha256);
  const { records } = parseCsv(bytes.toString('utf8'));
  assert.equal(records.filter(r => r.taxonomicStatus === 'Accepted').length, 3301);
  assert.equal(records.filter(r => r.taxonomicStatus === 'Synonym').length, 7729);
  assert.equal(records.filter(r => !r.taxonomicStatus).length, 152);
  const bb = buildResource(spec, bytes.toString('utf8'));
  assert.equal(bb.nRows, 11182);
  assert.equal(lookup(bb, 'Acianthera alligatorifera').acceptedName, 'Pabstiella alligatorifera');
  assert.equal(lookup(bb, 'Pabstiella alligatorifera').status, 'accepted');
  assert.equal(lookup(bb, 'Pabstiella alligatorifera').distribution, 'MG;PR;RJ;RS;SC;SP');
  assert.equal(lookup(bb, 'Anathallis stictophylla').status, 'unrecognized_status');
  assert.equal(lookup(bb, 'Anathallis stictophylla').acceptedName, '');
  assert.equal(lookup(bb, 'Dictyophyllaria dietschiana').status, 'synonym');
  assert.equal(lookup(bb, 'Dictyophyllaria dietschiana').acceptedName, '');
  assert.equal(lookup(bb, 'Bifrenaria calcarata').status, 'ambiguous_in_list');
  assert.equal(lookup(bb, 'Bifrenaria calcarata').acceptedName, '');
  assert.match(lookup(bb, 'Bifrenaria calcarata').detail, /Bifrenaria tetragona/);
});

test('CSV handles BOM, European delimiters, quoted delimiters and multiline fields', () => {
  const result = parseCsv('\uFEFFname;notes\r\nVanda falcata;"comma, and semicolon;\nnext line"\r\n');
  assert.deepEqual(result.headers, ['name', 'notes']);
  assert.equal(result.records[0].notes, 'comma, and semicolon;\nnext line');
  assert.equal(parseCsv('name\tnotes\nVanda falcata\tok').records[0].notes, 'ok');
  assert.equal(parseCsv('name,notes\nVanda falcata,"a ""quote"""').records[0].notes, 'a "quote"');
});

test('malformed headers and rows fail visibly instead of dropping information', () => {
  assert.throws(() => parseCsv('name,name\na,b'), /unique/);
  assert.throws(() => parseCsv('name,\na,b'), /header/);
  assert.throws(() => parseCsv('name,notes\na,b,c'), /more values/);
  assert.throws(() => parseCsv('name,notes\na,"b'), /not closed/);
});

test('Excel importer reads multiple sheets and keeps formatted identifiers', async () => {
  const workbook = utils.book_new();
  utils.book_append_sheet(workbook, utils.aoa_to_sheet([]), 'Empty');
  const sheet = utils.aoa_to_sheet([['Valid taxon', 'Synonym 1', 'record_id'],
    ['Acampe rigida', 'Acampe longifolia', 7]]);
  sheet.C2.z = '0000';
  utils.book_append_sheet(workbook, sheet, 'Reference list');
  const file = new File([write(workbook, { type: 'array', bookType: 'xlsx' })], 'authority.xlsx');
  const sheets = await readTables(file);
  assert.equal(sheets.length, 2);
  assert.equal(sheets[0].records.length, 0);
  assert.equal(sheets[1].records[0].record_id, '0007');
  assert.equal(sheets[1].records[0]['Synonym 1'], 'Acampe longifolia');
  await assert.rejects(readTables(new File(['not an xlsx zip'], 'broken.xlsx')));
});
