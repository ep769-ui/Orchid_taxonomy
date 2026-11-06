/** Local-only CSV/TSV/Excel imports shared by both list workflows. */
import { parseCsv, tableFromRows } from './csv.js';
import { esc, table } from './dom.js';

export async function readTables(file) {
  if (!/\.(xlsx?|csv|tsv|txt)$/i.test(file.name)) throw new Error('Choose an .xls, .xlsx, .csv, .tsv or .txt file.');
  if (file.size > 20 * 1024 * 1024) throw new Error('Choose a file no larger than 20 MB.');
  if (!/\.xlsx?$/i.test(file.name)) return [{ name: '', ...parseCsv(await file.text()) }];
  // Vendored and loaded only on demand. No workbook bytes leave the browser.
  const { read, utils } = await import('../vendor/sheetjs/xlsx.mjs');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const startsWith = signature => signature.every((byte, i) => bytes[i] === byte);
  const xlsx = /\.xlsx$/i.test(file.name);
  const zip = startsWith([0x50, 0x4b, 3, 4]);
  const compound = startsWith([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  const biff = [0, 2, 4, 8].some(version => startsWith([9, version]));
  if (xlsx ? !zip : !(compound || biff)) {
    throw new Error(`This is not an unencrypted ${xlsx ? '.xlsx' : '.xls'} workbook. Save it as Excel or CSV and try again.`);
  }
  const workbook = read(bytes, {
    type: 'array', dense: true, cellFormula: false, cellHTML: false, cellStyles: false,
  });
  return workbook.SheetNames.map(name => {
    const sheet = workbook.Sheets[name];
    if (!sheet['!ref']) return { name, headers: [], records: [] };
    const range = utils.decode_range(sheet['!ref']);
    if (range.e.r - range.s.r > 200000 || range.e.c - range.s.c >= 256) {
      return { name, error: 'This sheet exceeds 200,000 rows or 256 columns.' };
    }
    try {
      return { name, ...tableFromRows(utils.sheet_to_json(sheet,
        { header: 1, raw: false, defval: '', blankrows: false })) };
    } catch (error) { return { name, error: error.message }; }
  });
}

/** Worksheet selection and a bounded preview. Returns an invalidator so a slow
 * parse of an earlier selection cannot replace the latest file's mapping. */
export function bindFileInput(input, host, onTable) {
  let revision = 0;
  input.addEventListener('change', async () => {
    const current = ++revision;
    const file = input.files?.[0];
    host.innerHTML = '';
    if (!file) return;
    host.innerHTML = '<p class="muted">Reading file locally…</p>';
    try {
      const sheets = await readTables(file);
      if (current !== revision) return;
      if (!sheets.length) throw new Error('The workbook has no worksheets.');
      host.innerHTML = `<div class="panel"><b>${esc(file.name)}</b>
        ${sheets.length > 1 ? `<label for="sheet">Worksheet</label><select id="sheet">${
          sheets.map((s, i) => `<option value="${i}">${esc(s.name)}</option>`).join('')}</select>` : ''}
        <div id="file-preview"></div></div><div id="file-mapping"></div>`;
      const paint = index => {
        const sheet = sheets[index];
        const mapping = host.querySelector('#file-mapping');
        mapping.innerHTML = '';
        const preview = host.querySelector('#file-preview');
        if (sheet.error) { preview.innerHTML = `<div class="banner error">${esc(sheet.error)}</div>`; return; }
        if (!sheet.records.length) { preview.innerHTML = '<p>There are no data rows in this sheet.</p>'; return; }
        preview.innerHTML = `<p class="muted">${sheet.records.length.toLocaleString()} rows,
          ${sheet.headers.length} columns. Preview of the first five rows:</p>${table(
          sheet.headers.map(esc), sheet.records.slice(0, 5).map(r => sheet.headers.map(h => esc(r[h]))))}`;
        onTable(sheet, file, mapping);
      };
      const initial = Math.max(0, sheets.findIndex(s => s.records?.length));
      const selector = host.querySelector('#sheet');
      if (selector) { selector.value = String(initial); selector.addEventListener('change', () => paint(Number(selector.value))); }
      paint(initial);
    } catch (error) {
      if (current === revision) host.innerHTML = `<div class="banner error">Could not read file: ${esc(error.message)}</div>`;
    }
  });
}
