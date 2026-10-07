// CSV is data: preserve quoting/newlines and neutralize spreadsheet formulas on export.
export function encodeCsv(rows: unknown[][]): string {
  return rows
    .map((row) =>
      row
        .map((value) => {
          let s = String(value ?? "");
          if (/^[\s\uFEFF]*[=+@-]/.test(s) || /^[\t\r]/.test(s)) s = "'" + s;
          return '"' + s.replaceAll('"', '""') + '"';
        })
        .join(","),
    )
    .join("\r\n");
}
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false,
    closed = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else cell += c;
    } else if (c === '"') {
      if (cell || closed) throw Error("Quote inside unquoted cell");
      quoted = true;
    } else if (c === "," || c === "\n" || c === "\r") {
      row.push(cell);
      cell = "";
      closed = false;
      if (c !== ",") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        rows.push(row);
        row = [];
        if (rows.length > 101) throw Error("At most 100 user rows");
      }
    } else {
      if (closed) throw Error("Unexpected characters after quoted cell");
      cell += c;
    }
  }
  if (quoted) throw Error("Unclosed quoted cell");
  if (cell || closed || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}
