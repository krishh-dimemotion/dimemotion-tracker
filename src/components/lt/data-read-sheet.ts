// Spreadsheet reading (CSV / TSV / Excel, multi-sheet) for the import wizard.

export const ALL_SHEETS = "All sheets (combined)";

export type ReadSheetResult = { sheetNames: string[]; sheetName: string; headers: string[]; rows: string[][] };

export function parseDelimited(text: string, delimiter = ","): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let i = 0;
  const len = text.length;
  while (i < len) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i++;
        continue;
      }
      cell += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      quoted = true;
      i++;
      continue;
    }
    if (ch === delimiter) {
      row.push(cell);
      cell = "";
      i++;
      continue;
    }
    if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      i++;
      continue;
    }
    cell += ch;
    i++;
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.length !== 1 || r[0] !== "");
}

/** Finds the header row (first row with 2+ filled cells within the first 20) and trims empty trailing columns. */
export function extractTable(grid: string[][]): { headers: string[]; rows: string[][] } {
  let headerIdx = 0;
  let found = false;
  for (let r = 0; r < Math.min(grid.length, 20); r++)
    if ((grid[r] ?? []).filter((c) => (c ?? "").trim()).length >= 2) {
      headerIdx = r;
      found = true;
      break;
    }
  if (!found && grid.length > 0) {
    for (let r = 0; r < Math.min(grid.length, 20); r++)
      if ((grid[r] ?? []).filter((c) => (c ?? "").trim()).length >= 1) {
        headerIdx = r;
        break;
      }
  }
  const headers = (grid[headerIdx] ?? []).map((c) => (c ?? "").toString());
  const body = grid.slice(headerIdx + 1);
  let width = headers.length;
  while (width > 0) {
    const col = width - 1;
    const headerEmpty = !(headers[col] ?? "").trim();
    const colEmpty = body.every((r) => !(r[col] ?? "").toString().trim());
    if (headerEmpty && colEmpty) width--;
    else break;
  }
  const rows = body
    .map((r) => Array.from({ length: width }, (_, i) => (r[i] ?? "").toString()))
    .filter((r) => r.some((c) => c.trim()));
  return { headers: headers.slice(0, width), rows };
}

export async function readSpreadsheet(file: File | null, sheet?: string): Promise<ReadSheetResult> {
  if (!file) throw Error("No file was provided.");
  if (file.size === 0) throw Error("The selected file is empty (0 bytes).");
  if (!/\.(xlsx|xls|xlsm)$/i.test(file.name)) {
    const text = await file.text();
    const first = text.split(/\r?\n/, 1)[0] ?? "";
    const tab = /\.tsv$/i.test(file.name) || (first.includes("\t") && !first.includes(","));
    const { headers, rows } = extractTable(parseDelimited(text, tab ? "\t" : ","));
    return { sheetNames: [], sheetName: "", headers, rows };
  }
  let XLSX: typeof import("xlsx");
  try {
    XLSX = await import("xlsx");
  } catch {
    throw Error("Failed to load spreadsheet processor. Please check your network connection and try again.");
  }
  let wb: import("xlsx").WorkBook;
  try {
    const buf = await file.arrayBuffer();
    wb = XLSX.read(buf, { type: "array", cellDates: true });
  } catch (err) {
    try {
      const text = await file.text();
      if (text.trim().length > 0) {
        const first = text.split(/\r?\n/, 1)[0] ?? "";
        const { headers, rows } = extractTable(parseDelimited(text, first.includes("\t") && !first.includes(",") ? "\t" : ","));
        if (headers.length > 0 || rows.length > 0) return { sheetNames: [], sheetName: "", headers, rows };
      }
    } catch {
      /* ignore */
    }
    const msg = err instanceof Error ? err.message : "Invalid or corrupt Excel spreadsheet";
    throw Error(`Could not parse Excel file: ${msg}`);
  }
  const toGrid = (ws: import("xlsx").WorkSheet | undefined) =>
    (ws ? (XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "", blankrows: false }) as unknown[][]) : []).map((r) =>
      (r ?? []).map((c) => (c ?? "").toString()),
    );
  const names = wb.SheetNames ?? [];
  if (names.length === 0) return { sheetNames: [], sheetName: "", headers: [], rows: [] };
  if (names.length === 1) {
    const name = names[0] ?? "";
    const { headers, rows } = extractTable(toGrid(wb.Sheets[name]));
    return { sheetNames: names, sheetName: name, headers, rows };
  }
  const options = [ALL_SHEETS, ...names];
  const chosen = sheet && options.includes(sheet) ? sheet : ALL_SHEETS;
  if (chosen !== ALL_SHEETS) {
    const { headers, rows } = extractTable(toGrid(wb.Sheets[chosen]));
    return { sheetNames: options, sheetName: chosen, headers, rows };
  }
  const tables: { name: string; headers: string[]; rows: string[][] }[] = [];
  const allHeaders: string[] = [];
  const seen = new Set<string>();
  for (const name of names) {
    const ws = wb.Sheets[name];
    if (!ws) continue;
    const t = extractTable(toGrid(ws));
    if (t.headers.length > 0 || t.rows.length > 0) {
      tables.push({ name, headers: t.headers, rows: t.rows });
      for (const h of t.headers) {
        const trimmed = h.trim();
        const lower = trimmed.toLowerCase();
        if (trimmed && !seen.has(lower)) {
          seen.add(lower);
          allHeaders.push(trimmed);
        }
      }
    }
  }
  const combined: string[][] = [];
  for (const t of tables) {
    const idx = t.headers.map((h) => {
      const lower = h.trim().toLowerCase();
      return allHeaders.findIndex((x) => x.trim().toLowerCase() === lower);
    });
    for (const r of t.rows) {
      const out = Array(allHeaders.length).fill("") as string[];
      for (let c = 0; c < r.length; c++) {
        const target = idx[c];
        if (target !== undefined && target >= 0) out[target] = r[c] ?? "";
      }
      if (out.some((c) => (c ?? "").trim())) combined.push(out);
    }
  }
  return { sheetNames: options, sheetName: ALL_SHEETS, headers: allHeaders, rows: combined };
}
