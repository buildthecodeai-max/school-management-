import ExcelJS from "exceljs";

export async function reportWorkbook(title: string, columns: string[], rows: string[][], filters: Record<string, string>) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "School Management";
  const info = workbook.addWorksheet("Report details");
  info.addRow(["Report", title]);
  Object.entries(filters).forEach(pair => info.addRow(pair));
  info.addRow(["Generated (UTC)", new Date().toISOString()]);
  info.addRow(["Amounts", "Minor units; 100 = 1 currency unit. No currency conversion."]);
  info.getColumn(1).width = 25;
  info.getColumn(2).width = 75;
  const sheet = workbook.addWorksheet("Data", { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.addRow(columns);
  for (const row of rows) {
    sheet.addRow(row.map((value, index) => {
      const numeric = /minor units|Entries|Payslips|Enrollments/.test(columns[index]);
      return numeric && /^-?\d+$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : value;
    }));
  }
  columns.forEach((column, index) => { sheet.getColumn(index + 1).width = Math.min(55, Math.max(18, column.length + 3)); });
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF334155" } };
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, rows.length + 1), column: columns.length } };
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}
