/** CSV con separador ";" y BOM para que Excel en español lo abra con tildes y columnas correctas. */
export function toCSV(rows: (string | number)[][]): string {
  const escape = (v: string | number) => {
    const s = String(v);
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + rows.map((r) => r.map(escape).join(";")).join("\r\n");
}

export function downloadFile(filename: string, content: string, type = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
