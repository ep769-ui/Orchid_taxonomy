/** Public reference resources distributed with the app, outside the core taxonomy. */
import { build } from './checklist.js';
import { parseCsv } from './csv.js';

export function buildResource(spec, text) {
  if (!/^[a-z][a-z0-9_]*$/.test(spec.id)) throw new Error('Invalid resource identifier.');
  const { headers, records } = parseCsv(text);
  for (const column of [spec.nameColumn, ...(spec.aliasColumns || []), spec.distributionColumn,
    spec.statusColumn, spec.acceptedColumn].filter(Boolean)) {
    if (!headers.includes(column)) throw new Error(`${spec.label}: missing column ${column}.`);
  }
  const bb = build(spec.id, spec.label, records, spec.nameColumn, spec.statusColumn || null, spec.acceptedColumn || null, {
    mode: spec.mode, aliasCols: spec.aliasColumns || [], aliasSeparator: spec.aliasSeparator || '',
    distributionCol: spec.distributionColumn,
  });
  return { ...bb, bundled: true, resource: spec };
}

export async function loadResources() {
  const response = await fetch('resources/catalog.json', { cache: 'no-cache' });
  if (!response.ok) throw new Error(`Could not load reference resources (${response.status}).`);
  const catalog = await response.json();
  const lists = await Promise.all(catalog.map(async spec => {
    if (!/^[a-z0-9_]+\.csv$/.test(spec.file)) throw new Error('Invalid resource filename.');
    const file = await fetch(`resources/${spec.file}?v=${encodeURIComponent(spec.sha256)}`);
    if (!file.ok) throw new Error(`Could not load ${spec.label} (${file.status}).`);
    return buildResource(spec, await file.text());
  }));
  return Object.fromEntries(lists.map(bb => [bb.id, bb]));
}
