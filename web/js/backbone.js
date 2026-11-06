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

export function suggestMapping(headers) {
  const keys = headers.map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ''));
  const accepted = keys.findIndex(k => /^(acceptedname(?:usage)?|accepted|currentname|validname)$/.test(k));
  const scientific = keys.findIndex(k => /^(scientificname|speciesname|taxonname|binomial|name)$/.test(k));
  const reference = scientific >= 0 ? scientific : accepted >= 0 ? accepted
    : Math.max(0, headers.findIndex(h => /scientific|species_name|taxon|name|wissenschaftlich|nombre|nom_|espece|especie/i.test(h)));
  const aliasCols = headers.filter((_, i) => i !== reference &&
    /^(synonyms?|alias|aliases|associated|linked|synonymes?)\d*$/.test(keys[i]));
  return {
    reference, aliasCols,
    accepted: accepted !== reference ? accepted : -1,
    status: reference !== accepted ? keys.findIndex(k => /^(taxonomicstatus|status|statut|estado)$/.test(k)) : -1,
    distribution: keys.findIndex(k => /^(distribution|range|verbreitung)$/.test(k)),
    mode: accepted >= 0 ? MODES.TAXONOMIC : aliasCols.length ? MODES.TRADE : MODES.NAMES,
  };
}

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
    <p>${nameCount(bb).toLocaleString()} searchable names from ${bb.nRows.toLocaleString()} rows
      ${bb.nSourceRows !== bb.nRows ? `(${bb.nSourceRows.toLocaleString()} total source rows)` : ''}.
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
    <h1>User's database</h1>
    <p class="lede">Add a temporary source to compare with the built-in databases
      in individual searches and batch reports.</p>
    <div class="panel">
      <h2>Prepare your file</h2>
      <p>Use CSV or Excel (.xls or .xlsx), up to 20 MB. Put unique column headings
        on the first row and use species names with a genus and epithet. Author
        citations are optional.</p>
      ${table(['accepted_name', 'synonym'], [
        ['Pabstiella alligatorifera', 'Pleurothallis alligatorifera'],
        ['Pabstiella alligatorifera', 'Specklinia alligatorifera'],
      ])}
      <p>Use one synonym per row and repeat the accepted name as needed. Leave the
        synonym cell blank for an accepted name with no synonyms. You can also
        supply <code>scientificName</code> and <code>acceptedNameUsage</code>:
        map the first to the name to check and the second to the accepted name.</p>
      <p><a href="resources/user_database_template.csv" download>Download the CSV template</a></p>
      <p class="muted">Your file stays in this browser. Loaded databases are kept
        in this tab's session; remove them below when finished. Each database has
        its own results and does not change the shared taxonomy or CITES verdicts.</p>
    </div>
    <div class="section">Add a database</div>
    <label for="bbfile">Choose your database file</label>
    <input type="file" id="bbfile" accept=".xls,.xlsx,.csv,.tsv,.txt">
    <div id="bbmap"></div>
    <div id="loaded" aria-live="polite"></div>
  </div>`);
  container.appendChild(root);
  paintLoaded(root.querySelector('#loaded'), container);
  bindFileInput(root.querySelector('#bbfile'), root.querySelector('#bbmap'),
    ({ headers, records }, file, mapEl) => {
      const guess = suggestMapping(headers);
      const { aliasCols } = guess;
      const guessSeparator = aliasCols.some(col => records.some(row => String(row[col] ?? '').includes(';')));
      const opts = selected => [NONE, ...headers].map((h, i) =>
        `<option${i === selected + 1 ? ' selected' : ''}>${esc(h)}</option>`).join('');
      mapEl.innerHTML = `<div class="panel">
        <label for="bblabel">Name for this database or edition</label>
        <input type="text" id="bblabel" value="${esc(file.name.replace(/\.[^.]+$/, ''))}">
        <label for="bbmode">What do the relationships mean?</label>
        <select id="bbmode">
          <option value="names"${guess.mode === MODES.NAMES ? ' selected' : ''}>Names only (presence, no taxonomic judgement)</option>
          <option value="trade"${guess.mode === MODES.TRADE ? ' selected' : ''}>Trade-name associations (no taxonomic synonymy)</option>
          <option value="taxonomic"${guess.mode === MODES.TAXONOMIC ? ' selected' : ''}>Taxonomic checklist (accepted names and synonyms)</option>
        </select>
        <p id="bbmode-help" class="muted"></p>
        <label for="bbname">Name to check or reference name (required)</label>
        <select id="bbname">${opts(guess.reference)}</select>
        <fieldset><legend>Synonym or linked name columns (optional)</legend>
          ${headers.map((h, i) => `<label class="column-choice"><input type="checkbox"
            name="bbalias" value="${i}"${aliasCols.includes(h) ? ' checked' : ''}> ${esc(h)}</label>`).join('')}
        </fieldset>
        <label for="bbseparator">Names in each additional-name cell</label>
        <select id="bbseparator"><option value="">One name per cell</option>
          <option value=";"${guessSeparator ? ' selected' : ''}>Several names separated by semicolons</option></select>
        <label for="bbdistribution">Distribution column (optional, kept as supplied)</label>
        <select id="bbdistribution">${opts(guess.distribution)}</select>
        <div id="bb-taxonomic" hidden>
          <label for="bbstatus">Status column (optional)</label>
          <select id="bbstatus">${opts(guess.status)}</select>
          <label for="bbaccepted">Accepted name for the name being checked (optional)</label>
          <select id="bbaccepted">${opts(guess.accepted)}</select>
        </div>
        <p class="muted">Matching is at species rank. Author citations and
          infraspecific endings are removed for comparison. Damaged or
          unparseable names are counted in the import notes.</p>
        <p><button class="primary" id="bbgo">Load database</button></p>
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
        if (acceptedCol && (acceptedCol === nameCol || selectedAliases.includes(acceptedCol))) {
          result.innerHTML = '<p>Use a separate accepted-name column, or leave it unset when the reference name is already the accepted name.</p>'; return;
        }
        if (statusCol && (statusCol === nameCol || statusCol === acceptedCol || selectedAliases.includes(statusCol))) {
          result.innerHTML = '<p>The status column must be separate from the name columns.</p>'; return;
        }
        const label = mapEl.querySelector('#bblabel').value.trim() || 'checklist';
        const bb = build(nextId(label), label, records, nameCol, statusCol, acceptedCol,
          { mode, aliasCols: selectedAliases, aliasSeparator: mapEl.querySelector('#bbseparator').value,
            distributionCol: pick('#bbdistribution'), inferAcceptedTargets: true });
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
  host.innerHTML = `<div class="section">Loaded databases</div>${table(
    ['Database', 'Meaning', 'Report prefix', 'Names / rows', 'Import notes', ''],
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
