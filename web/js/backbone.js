/** Reference-list UI and tab-local storage. Relationship logic is in checklist.js. */
import { build, nameCount, lookup, MODES } from './checklist.js';
import { bindFileInput } from './file-input.js';
import { el, esc, table } from './dom.js';
import { loadResources } from './resources.js';
export { build, nameCount, lookup, reverseSynonyms, reportColumns } from './checklist.js';

const STORE_KEY = 'chigualen.backbones';
let loaded = null;
let included = {};
export async function initialize() { included = await loadResources(); }

function read() {
  if (loaded) return loaded;
  loaded = {};
  try { loaded = JSON.parse(sessionStorage.getItem(STORE_KEY) || '{}'); }
  catch { /* Storage unavailable: lists can still live in memory. */ }
  return loaded;
}

function write() {
  try { sessionStorage.setItem(STORE_KEY, JSON.stringify(loaded)); return true; }
  catch {
    // Do not resurrect an older snapshot after a failed write/removal.
    try { sessionStorage.removeItem(STORE_KEY); } catch { /* unavailable */ }
    return false;
  }
}

export const registered = () => ({ ...included, ...read() });
export const includedResources = () => Object.values(included);
export const count = () => Object.keys(registered()).length;
export function unregister(id) { delete read()[id]; write(); }
export function register(bb) {
  if (Object.hasOwn(included, bb.id)) throw new Error('This identifier belongs to an included resource.');
  read()[bb.id] = bb; return write();
}
export const slugify = label =>
  label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'checklist';

function nextId(label) {
  const base = 'custom_' + slugify(label);
  let id = base, n = 2;
  while (Object.hasOwn(read(), id)) id = `${base}_${n++}`;
  return id;
}

export function verdictsFor(binomial) {
  return Object.fromEntries(Object.entries(registered()).map(([id, bb]) => [id, lookup(bb, binomial)]));
}

export function suggestions(query, limit = 12) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const names = new Set();
  for (const bb of Object.values(registered())) {
    for (const entry of Object.values(bb.entries)) {
      if (entry.name.toLowerCase().includes(q)) names.add(entry.name);
    }
  }
  return [...names].map(name => ({ name, kind: 3, canonical: '',
    tier: name.toLowerCase() === q ? 0 : 1 }))
    .sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name)).slice(0, limit);
}

const NONE = '— (none) —';
const MODE_LABEL = { names: 'Names only', trade: 'Trade-name associations', taxonomic: 'Taxonomic checklist' };

export function resourceCards() {
  return includedResources().map(bb => `<div class="panel">
    <h3>${esc(bb.label)}</h3>
    <p>${esc(bb.resource.description)}</p>
    <p><b>Source:</b> ${esc(bb.resource.origin)}<br>
      <b>Edition:</b> ${esc(bb.resource.edition)}<br>
      <b>Terms of use:</b> ${esc(bb.resource.licence)}</p>
    ${bb.resource.citation ? `<p><b>Citation:</b> <a href="${esc(bb.resource.citationUrl)}"
      target="_blank" rel="noopener noreferrer">${esc(bb.resource.citation)}</a></p>` : ''}
    ${bb.resource.homepage ? `<p><a href="${esc(bb.resource.homepage)}" target="_blank"
      rel="noopener noreferrer">Visit the source database</a></p>` : ''}
    <p>${nameCount(bb).toLocaleString()} searchable names from ${bb.nRows.toLocaleString()} rows.
      ${bb.nUnparseable ? `${bb.nUnparseable.toLocaleString()} name cells could not be indexed, including unsupported names and placeholders.` : ''}
      ${bb.nSkippedRows ? `${bb.nSkippedRows.toLocaleString()} rows have no usable reference name.` : ''}
      ${bb.nAmbiguous ? `${bb.nAmbiguous.toLocaleString()} names have multiple taxonomic outcomes; all are retained.` : ''}</p>
    <p class="muted">${esc(bb.resource.notes)}</p>
    <p><a href="resources/${esc(bb.resource.file)}" download>Download supplied reference data (CSV)</a></p>
  </div>`).join('');
}

export function render(container) {
  container.innerHTML = '';
  const root = el(`<div>
    <h1>Your reference lists</h1>
    <p class="lede">Compare your authority's name lists alongside the five built-in
      sources in individual searches and batch reports.</p>
    <p>Choose what the links in your list mean. A trade database may connect names
      for administrative purposes without making a taxonomic statement.</p>
    <p class="muted">Files are read in this tab and never sent to a server. Loaded
      lists are kept in this tab's session storage; remove them below when finished.
      They do not change the shared database or its conflict classifications.</p>
    <div class="section">Included resources</div>
    ${resourceCards()}
    <div id="loaded"></div>
    <div class="section">Add a list</div>
    <p class="section-intro">Excel (.xlsx), CSV or TSV with a header row. Use one
      name per row, or a reference name followed by several linked-name columns.
      You can load several lists or historical editions separately.</p>
    <label for="bbfile">Choose a reference-list file</label>
    <input type="file" id="bbfile" accept=".xlsx,.csv,.tsv,.txt">
    <div id="bbmap"></div>
  </div>`);
  container.appendChild(root);
  paintLoaded(root.querySelector('#loaded'), container);
  bindFileInput(root.querySelector('#bbfile'), root.querySelector('#bbmap'),
    ({ headers, records }, file, mapEl) => {
      const guessName = Math.max(0, headers.findIndex(h =>
        /scientific|species_name|taxon|name|wissenschaftlich|nombre|nom_|espece|especie/i.test(h)));
      const aliasCols = headers.filter((h, i) => i !== guessName &&
        /^(synonyms?|alias|aliases|associated|linked|synonymes?)(\s*\d+)?$/i.test(h));
      const guessDistribution = headers.findIndex(h => /^(distribution|range|verbreitung)$/i.test(h));
      const guessSeparator = aliasCols.some(col => records.some(row => String(row[col] ?? '').includes(';')));
      const guessStatus = headers.findIndex(h => /^(status|statut|estado)$/i.test(h));
      const guessAccepted = headers.findIndex((h, i) => i !== guessName &&
        /accepted|current|valid|akzept|g(ü|ue)ltig|correct|aceptado|accept/i.test(h));
      const opts = selected => [NONE, ...headers].map((h, i) =>
        `<option${i === selected + 1 ? ' selected' : ''}>${esc(h)}</option>`).join('');
      mapEl.innerHTML = `<div class="panel">
        <label for="bblabel">Name for this list or edition</label>
        <input type="text" id="bblabel" value="${esc(file.name.replace(/\.[^.]+$/, ''))}">
        <label for="bbmode">What do the relationships mean?</label>
        <select id="bbmode">
          <option value="names">Names only (presence, no taxonomic judgement)</option>
          <option value="trade"${aliasCols.length ? ' selected' : ''}>Trade-name associations (no taxonomic synonymy)</option>
          <option value="taxonomic">Taxonomic checklist (accepted names and synonyms)</option>
        </select>
        <p id="bbmode-help" class="muted"></p>
        <label for="bbname">Reference name column (required)</label>
        <select id="bbname">${opts(guessName)}</select>
        <fieldset><legend>Additional name columns (optional)</legend>
          ${headers.map((h, i) => `<label class="column-choice"><input type="checkbox"
            name="bbalias" value="${i}"${aliasCols.includes(h) ? ' checked' : ''}> ${esc(h)}</label>`).join('')}
        </fieldset>
        <label for="bbseparator">Names in each additional-name cell</label>
        <select id="bbseparator"><option value="">One name per cell</option>
          <option value=";"${guessSeparator ? ' selected' : ''}>Several names separated by semicolons</option></select>
        <label for="bbdistribution">Distribution column (optional, kept as supplied)</label>
        <select id="bbdistribution">${opts(guessDistribution)}</select>
        <div id="bb-taxonomic" hidden>
          <label for="bbstatus">Status column (optional)</label>
          <select id="bbstatus">${opts(guessStatus)}</select>
          <label for="bbaccepted">Accepted-name column for synonyms (optional)</label>
          <select id="bbaccepted">${opts(guessAccepted)}</select>
        </div>
        <p class="muted">Matching is at species rank. Author citations and
          infraspecific endings are removed for comparison. Damaged or
          unparseable names are counted in the import notes.</p>
        <p><button class="primary" id="bbgo">Load reference list</button></p>
        <div id="bbresult" role="status"></div>
      </div>`;
      const modeInput = mapEl.querySelector('#bbmode');
      const updateMode = () => {
        mapEl.querySelector('#bb-taxonomic').hidden = modeInput.value !== MODES.TAXONOMIC;
        mapEl.querySelector('#bbmode-help').textContent = {
          names: 'All selected names are recorded as present. No accepted name or relationship is inferred.',
          trade: 'Linked names retain their reference-name grouping. They are shown as trade associations, never as taxonomic synonyms or conflicts.',
          taxonomic: 'Additional names are synonyms of the reference name (or its mapped accepted name). Use this only for lists that explicitly assert taxonomic relationships.',
        }[modeInput.value];
      };
      modeInput.addEventListener('change', updateMode);
      updateMode();
      mapEl.querySelector('#bbgo').addEventListener('click', () => {
        const pick = id => {
          const value = mapEl.querySelector(id).value;
          return value === NONE ? null : value;
        };
        const nameCol = pick('#bbname');
        const result = mapEl.querySelector('#bbresult');
        if (!nameCol) { result.innerHTML = '<p>Choose a reference name column.</p>'; return; }
        const mode = modeInput.value;
        const selectedAliases = [...mapEl.querySelectorAll('[name="bbalias"]:checked')]
          .map(input => headers[Number(input.value)]).filter(h => h !== nameCol);
        const statusCol = mode === MODES.TAXONOMIC ? pick('#bbstatus') : null;
        const acceptedCol = mode === MODES.TAXONOMIC ? pick('#bbaccepted') : null;
        if (statusCol && (statusCol === nameCol || statusCol === acceptedCol || selectedAliases.includes(statusCol))) {
          result.innerHTML = '<p>The status column must be separate from the name columns.</p>'; return;
        }
        const label = mapEl.querySelector('#bblabel').value.trim() || 'checklist';
        const bb = build(nextId(label), label, records, nameCol, statusCol, acceptedCol,
          { mode, aliasCols: selectedAliases, aliasSeparator: mapEl.querySelector('#bbseparator').value,
            distributionCol: pick('#bbdistribution') });
        if (!nameCount(bb)) { result.innerHTML = '<p>No usable species names were found in the selected columns.</p>'; return; }
        const persisted = register(bb);
        mapEl.innerHTML = '';
        root.querySelector('#bbfile').value = '';
        paintLoaded(root.querySelector('#loaded'), container);
        root.querySelector('#loaded').insertAdjacentHTML('afterbegin',
          `<div class="banner info">Loaded <b>${esc(bb.label)}</b> as
            <b>${MODE_LABEL[mode]}</b>: ${nameCount(bb).toLocaleString()} names.
            ${persisted ? '' : 'Session storage is full or unavailable. Lists are available for this page view only; reload will discard them.'}</div>`);
      });
    });
}

function paintLoaded(host, container) {
  const lists = Object.values(read());
  if (!lists.length) { host.innerHTML = ''; return; }
  host.innerHTML = `<div class="section">Loaded lists</div>${table(
    ['List', 'Meaning', 'Report prefix', 'Names / rows', 'Import notes', ''],
    lists.map(bb => [
      `<b>${esc(bb.label)}</b>`, MODE_LABEL[bb.mode || 'taxonomic'], `<code>${esc(bb.id)}</code>`,
      `${nameCount(bb).toLocaleString()} names / ${bb.nRows.toLocaleString()} rows`,
      [bb.nUnparseable ? `${bb.nUnparseable.toLocaleString()} name cells could not be parsed` : '',
        bb.nSkippedRows ? `${bb.nSkippedRows.toLocaleString()} rows skipped (no reference name)` : '',
        bb.nAmbiguous ? `${bb.nAmbiguous.toLocaleString()} names have multiple taxonomic outcomes; all retained` : '',
        bb.mode === 'trade' && bb.nMultipleReferences ? `${bb.nMultipleReferences.toLocaleString()} names belong to several reference records; all retained` : '']
        .filter(Boolean).join('<br>') || 'No import issues',
      `<button class="linkish" data-rm="${esc(bb.id)}">remove</button>`,
    ]))}`;
  host.querySelectorAll('[data-rm]').forEach(button => button.addEventListener('click', () => {
    unregister(button.dataset.rm); render(container);
  }));
}
