export function reportDates(from?: string, to?: string) {
  const parse = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Use YYYY-MM-DD dates.");
    const date = new Date(`${value}T00:00:00.000Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error("Invalid date.");
    return date;
  };
  const start = from ? parse(from) : undefined;
  const end = to ? parse(to) : undefined;
  if (start && end && start > end) throw new Error("End date must follow start date.");
  return { ...(start ? { gte: start } : {}), ...(end ? { lt: new Date(end.getTime() + 86400000) } : {}) };
}

export function reportCsv(rows: string[][]) {
  return '\uFEFF' + rows.map(row => row.map(value => {
    const safe = /^[\s]*[=+@-]/.test(value) ? `'${value}` : value;
    return `"${safe.replace(/"/g, '""')}"`;
  }).join(",")).join("\r\n") + "\r\n";
}
