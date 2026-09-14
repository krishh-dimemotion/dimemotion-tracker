import { parseCsv } from "@/components/leads/csv";

export type SheetData = {
  sheetNames: string[];
  sheetName: string;
  headers: string[];
  rows: string[][];
};

function trimGrid(grid: string[][]): { headers: string[]; rows: string[][] } {
  // drop fully blank leading rows, then take the first row with 2+ non-empty cells as header
  let headerIndex = 0;
  for (let i = 0; i < Math.min(grid.length, 20); i++) {
    const filled = (grid[i] ?? []).filter((c) => (c ?? "").trim()).length;
    if (filled >= 2) {
      headerIndex = i;
      break;
    }
  }
  const headers = (grid[headerIndex] ?? []).map((h) => (h ?? "").toString());
  const body = grid.slice(headerIndex + 1);

  // drop trailing columns that are blank in both header and every row
  let width = headers.length;
  while (width > 0) {
    const idx = width - 1;
    const headerBlank = !(headers[idx] ?? "").trim();
    const colBlank = body.every((r) => !((r[idx] ?? "").toString().trim()));
    if (headerBlank && colBlank) width--;
    else break;
  }

  const rows = body
    .map((r) => Array.from({ length: width }, (_, i) => (r[i] ?? "").toString()))
    .filter((r) => r.some((c) => c.trim()));

  return { headers: headers.slice(0, width), rows };
}

export async function readSpreadsheet(file: File, sheetName?: string): Promise<SheetData> {
  const isExcel = /\.(xlsx|xls|xlsm)$/i.test(file.name);
  if (!isExcel) {
    const text = await file.text();
    const grid = parseCsv(text);
    const { headers, rows } = trimGrid(grid);
    return { sheetNames: [], sheetName: "", headers, rows };
  }

  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array", cellDates: true });
  const names = wb.SheetNames;
  const active = sheetName && names.includes(sheetName) ? sheetName : (names[0] ?? "");
  const sheet = wb.Sheets[active];
  const grid: string[][] = sheet
    ? (XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "", blankrows: false }) as string[][])
    : [];
  const { headers, rows } = trimGrid(grid.map((r) => (r ?? []).map((c) => (c ?? "").toString())));
  return { sheetNames: names, sheetName: active, headers, rows };
}
