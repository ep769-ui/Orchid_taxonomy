/** User-supplied name lists. These never change the consolidated taxonomy.
 * Trade associations retain the source's grouping without asserting synonymy.
 */
import { STATUS, normalizeQuery } from './data.js';

export const MODES = { TAXONOMIC: 'taxonomic', TRADE: 'trade', NAMES: 'names' };
const ACCEPTED = new Set(['accepted', 'accepted name', 'valid', 'current', 'a', 'yes', '1', 'true', 'nome_aceito']);
const SYNONYM = new Set(['synonym', 'syn', 'synonym of', 's', 'heterotypic', 'homotypic',
  'heterotypic synonym', 'homotypic synonym', 'not accepted', 'sinonimo']);
const unique = (items) => [...new Set(items)].sort();
const speciesTarget = raw => /^\p{Lu}[\p{L}-]*\s+\p{Ll}[\p{L}-]*(?:\s|$)/u.test(raw)
  && !/^\S+\s+\S+\s+(?:subsp|ssp|var|f|forma|nothosubsp)\.?\s/i.test(raw);

// Reject damaged or placeholder names instead of indexing a truncated binomial.
// Author citations after a valid binomial can still be removed by normalizeQuery.
function listName(raw) {
  const name = normalizeQuery(raw);
  return /^[\p{L}][\p{L}-]* [\p{L}][\p{L}-]*$/u.test(name) ? name : '';
}

function classify(rawStatus, name, acceptedName, hasStatus = false) {
  const word = rawStatus.trim().toLowerCase();
  if (acceptedName && acceptedName.toLowerCase() !== name.toLowerCase()) {
    return { status: STATUS.SYNONYM, acceptedName };
  }
  if (SYNONYM.has(word)) return { status: STATUS.SYNONYM, acceptedName: '' };
  if ((!word && !hasStatus) || ACCEPTED.has(word)) return { status: STATUS.ACCEPTED, acceptedName: name };
  return { status: 'unrecognized_status', acceptedName: '' };
}

export function build(id, label, records, nameCol, statusCol, acceptedCol, options = {}) {
  const mode = options.mode || MODES.TAXONOMIC; // compatibility with existing callers
  if (!Object.values(MODES).includes(mode)) throw new Error('Choose a valid relationship type.');
  const aliasCols = unique(options.aliasCols || []).filter(c => c !== nameCol && c !== acceptedCol);
  const targets = new Map();
  const bb = { id, label, mode, entries: Object.create(null), nRows: records.length,
    nUnparseable: 0, nSkippedRows: 0, nMultipleReferences: 0, nAmbiguous: 0,
    hasStatus: mode === MODES.TAXONOMIC && Boolean(statusCol),
    hasAccepted: mode === MODES.TAXONOMIC && Boolean(acceptedCol), aliasCols };

  const add = (name, reference, group, claim, rawStatus = '', distribution = '') => {
    const key = name.toLowerCase();
    const entry = bb.entries[key] ||= { name, referenceNames: [], linkedNames: [], claims: [], rawStatuses: [], distributions: [] };
    if (mode !== MODES.NAMES) {
      entry.referenceNames = unique([...entry.referenceNames, reference]);
      entry.linkedNames = unique([...entry.linkedNames, ...group.filter(n => n.toLowerCase() !== key)]);
    }
    if (claim && !entry.claims.some(c => c.status === claim.status &&
      c.acceptedName.toLowerCase() === claim.acceptedName.toLowerCase())) entry.claims.push(claim);
    if (rawStatus) entry.rawStatuses = unique([...entry.rawStatuses, rawStatus]);
    if (distribution) entry.distributions = unique([...entry.distributions, distribution]);
  };

  for (const row of records) {
    const reference = listName(String(row[nameCol] ?? ''));
    if (!reference) { bb.nUnparseable++; bb.nSkippedRows++; continue; }
    const aliases = [];
    for (const col of aliasCols) {
      const raw = String(row[col] ?? '').trim();
      if (!raw) continue;
      for (const value of options.aliasSeparator ? raw.split(options.aliasSeparator) : [raw]) {
        if (!value.trim()) continue;
        const name = listName(value);
        if (name) aliases.push(name); else bb.nUnparseable++;
      }
    }
    const group = unique([reference, ...aliases]);
    const rawStatus = bb.hasStatus ? String(row[statusCol] ?? '').trim() : '';
    const acceptedRaw = bb.hasAccepted ? String(row[acceptedCol] ?? '').trim() : '';
    const unsupportedTarget = acceptedRaw && options.speciesTargetsOnly && !speciesTarget(acceptedRaw);
    const accepted = acceptedRaw && !unsupportedTarget ? listName(acceptedRaw) : '';
    const distribution = options.distributionCol ? String(row[options.distributionCol] ?? '').trim() : '';
    const claim = mode === MODES.TAXONOMIC ? classify(rawStatus, reference, accepted, bb.hasStatus) : null;
    if (claim && acceptedRaw && !accepted && !unsupportedTarget) {
      bb.nUnparseable++;
      claim.status = 'unrecognized_status';
      claim.acceptedName = '';
    }
    const notes = [
      rawStatus || (bb.hasStatus ? 'No taxonomic status supplied by this list.' : ''),
      options.showAcceptedUsage && acceptedRaw ? `Accepted name as supplied: ${acceptedRaw}` : '',
      unsupportedTarget ? 'Target is outside the supported species-name format.'
        : acceptedRaw && !accepted ? 'Accepted-name cell could not be parsed.' : '',
      options.nomenclaturalStatusCol && row[options.nomenclaturalStatusCol]
        ? `Nomenclatural status: ${row[options.nomenclaturalStatusCol]}` : '',
    ];
    add(reference, reference, group, claim, notes.filter(Boolean).join('; '), distribution);
    if (options.inferAcceptedTargets && claim?.status === STATUS.SYNONYM && accepted) {
      targets.set(accepted.toLowerCase(), accepted);
    }
    for (const alias of group.filter(n => n.toLowerCase() !== reference.toLowerCase())) {
      add(alias, reference, group, mode === MODES.TAXONOMIC
        ? { status: acceptedRaw && !accepted ? 'unrecognized_status' : STATUS.SYNONYM,
          acceptedName: acceptedRaw && !accepted ? '' : accepted || reference } : null, '', distribution);
    }
  }
  // An accepted-name column can supply a target even if the file has no
  // standalone row for it. Explicit rows retain their own claims.
  for (const [key, target] of targets) {
    if (!bb.entries[key]) add(target, target, [target], { status: STATUS.ACCEPTED, acceptedName: target },
      'Listed as an accepted-name target in this database.');
  }
  for (const entry of Object.values(bb.entries)) {
    if (entry.referenceNames.length > 1) bb.nMultipleReferences++;
    if (entry.claims.length > 1) bb.nAmbiguous++;
  }
  return bb;
}

export const nameCount = bb => Object.keys(bb.entries).length;

export function lookup(bb, binomial) {
  const mode = bb.mode || MODES.TAXONOMIC;
  const entry = binomial && bb.entries[binomial.toLowerCase()];
  const base = { status: STATUS.ABSENT, acceptedName: '', detail: '', mode,
    referenceNames: [], linkedNames: [], distribution: '' };
  if (!entry) return base;
  // Lists loaded before relationship types were introduced still work.
  if (!entry.claims) return { ...base, status: entry.status,
    acceptedName: entry.acceptedName, detail: entry.rawStatus };
  const result = { ...base, referenceNames: entry.referenceNames, linkedNames: entry.linkedNames,
    distribution: (entry.distributions || []).join(' | ') };
  if (mode === MODES.TRADE) return { ...result,
    status: entry.linkedNames.length ? 'trade_association' : 'listed',
    detail: 'Trade-name associations supplied by this list; no taxonomic status is asserted.' };
  if (mode === MODES.NAMES) return { ...result, status: 'listed',
    detail: 'Present in this list; no taxonomic status is asserted.' };
  if (entry.claims.length > 1) return { ...result, status: 'ambiguous_in_list',
    detail: 'Multiple outcomes in this list: ' + entry.claims.map(c =>
      c.status + (c.acceptedName ? ` (${c.acceptedName})` : '')).sort().join('; ') };
  return { ...result, ...entry.claims[0], detail: entry.rawStatuses.join('; ') };
}

const reverseIndexes = new WeakMap();

export function reverseSynonyms(bb, acceptedName) {
  if (!acceptedName || (bb.mode && bb.mode !== MODES.TAXONOMIC)) return [];
  if (!reverseIndexes.has(bb)) {
    const index = new Map();
    for (const entry of Object.values(bb.entries)) {
      const claim = !entry.claims ? entry : entry.claims.length === 1 ? entry.claims[0] : null;
      if (claim?.status !== STATUS.SYNONYM || !claim.acceptedName) continue;
      const key = claim.acceptedName.toLowerCase();
      if (!index.has(key)) index.set(key, []);
      index.get(key).push(entry.name);
    }
    for (const names of index.values()) names.sort();
    reverseIndexes.set(bb, index);
  }
  return reverseIndexes.get(bb).get(acceptedName.toLowerCase()) || [];
}

/** Extra columns preserve the distinction between taxonomy and trade grouping.
 * Existing <id>_status / <id>_accepted_name columns keep their meanings.
 */
export function reportColumns(bb, binomial) {
  const v = lookup(bb, binomial);
  return { [`${bb.id}_status`]: v.status, [`${bb.id}_accepted_name`]: v.acceptedName,
    [`${bb.id}_relationship_type`]: v.mode,
    [`${bb.id}_reference_names`]: v.referenceNames.join(' | '),
    [`${bb.id}_linked_names`]: v.linkedNames.join(' | '), [`${bb.id}_notes`]: v.detail,
    [`${bb.id}_distribution`]: v.distribution };
}
