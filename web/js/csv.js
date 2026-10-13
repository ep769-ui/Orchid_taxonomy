/** CSV in and out. Dependency-free so both the batch diff and the checklist
 *  loader can use it without importing each other. */

/** Minimal RFC-4180 parser: quoted fields, embedded commas and newlines,
 *  doubled quotes. The CITES listings export needs all three. */
export function parseCsv(text, sep) {
  text = text.replace(/^\uFEFF/, '');
  if (!sep) {
    // Count delimiters outside quoted fields in the first logical record.
    const counts = { ',': 0, '\t': 0, ';': 0 };
    let quoted = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (c === '"') {
        if (quoted && text[i + 1] === '"') i++; else quoted = !quoted;
      } else if (!quoted && (c === '\n' || c === '\r')) break;
      else if (!quoted && c in counts) counts[c]++;
    }
    sep = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
  }
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false; }
      else field += c;
    } else if (c === '"') { quoted = true; }
    else if (c === sep) { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') { field += c; }
  }
  if (quoted) throw new Error('A quoted field is not closed. Check the CSV quotation marks.');
  if (field || row.length) { row.push(field); rows.push(row); }
  return tableFromRows(rows);
}

export function tableFromRows(rows) {
  if (!rows.length) return { headers: [], records: [] };
  const headers = rows[0].map(h => String(h ?? '').trim());
  if (headers.some(h => !h)) throw new Error('Every data column needs a header.');
  if (new Set(headers).size !== headers.length) throw new Error('Column headers must be unique.');
  if (rows.slice(1).some(r => r.slice(headers.length).some(v => String(v ?? '').trim()))) {
    throw new Error('A row has more values than the header has columns. Check the delimiter or headers.');
  }
  const records = rows.slice(1).filter(r => r.some(v => String(v ?? '').trim()))
    .map(r => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ''])));
  return { headers, records };
}

export function downloadCsv(filename, rows) {
  if (!rows.length) return;
  const cols = Object.keys(rows[0]);
  const cell = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [cols.join(','), ...rows.map(r => cols.map(c => cell(r[c])).join(','))].join('\n');
  // A Blob URL keeps a multi-megabyte export off the address bar.
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
