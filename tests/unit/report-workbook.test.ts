import { expect, it } from "vitest";
import ExcelJS from "exceljs";
import { reportWorkbook } from "@/lib/report-workbook";
it("produces a readable workbook with numeric amounts, literal names and filter metadata", async () => {
  const bytes = await reportWorkbook("Finance", ["Campus", "Amount (minor units)"], [["=SUM(A1)", "12500"]], { Campus: "Main" });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(bytes) as never);
  expect(workbook.getWorksheet("Data")!.getCell("A2").value).toBe("=SUM(A1)");
  expect(workbook.getWorksheet("Data")!.getCell("B2").value).toBe(12500);
  expect(workbook.getWorksheet("Report details")!.getCell("B2").value).toBe("Main");
});
