export function toCsv(headers: string[], rows: string[][]): string {
  const escape = (value: string) =>
    /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  return [headers, ...rows].map((row) => row.map(escape).join(",")).join("\r\n");
}
