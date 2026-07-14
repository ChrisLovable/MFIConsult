import ExcelJS from "exceljs";

export interface ExcelBillingRow {
  reference: string;
  doctor: string;
  practice: string;
  practiceNumber: string;
  patientReference: string;
  patientName: string;
  consultationDate: string;
  consultationTime: string;
  consultationType: string;
  durationMinutes: string;
  placeOfService: string;
  diagnosis: string;
  icd10: string;
  tariffCode: string;
  tariffDescription: string;
  procedure: string;
  quantity: string;
  rate: string;
  amount: string;
  medicalAid: string;
  authorisation: string;
  confirmedAt: string;
}

interface WorkbookInput {
  reference: string;
  doctor: string;
  practice: string;
  patientReference: string;
  rows: ExcelBillingRow[];
}

const columns: Array<{
  header: string;
  key: keyof ExcelBillingRow;
  width: number;
}> = [
  { header: "Reference", key: "reference", width: 24 },
  { header: "Doctor", key: "doctor", width: 20 },
  { header: "Practice", key: "practice", width: 22 },
  { header: "Practice Number", key: "practiceNumber", width: 18 },
  { header: "Patient Reference", key: "patientReference", width: 18 },
  { header: "Patient Name", key: "patientName", width: 20 },
  { header: "Date", key: "consultationDate", width: 13 },
  { header: "Time", key: "consultationTime", width: 11 },
  { header: "Consultation Type", key: "consultationType", width: 30 },
  { header: "Duration Minutes", key: "durationMinutes", width: 16 },
  { header: "Place of Service", key: "placeOfService", width: 22 },
  { header: "Diagnosis", key: "diagnosis", width: 28 },
  { header: "ICD-10", key: "icd10", width: 14 },
  { header: "Tariff Code", key: "tariffCode", width: 15 },
  { header: "Tariff Description", key: "tariffDescription", width: 28 },
  { header: "Procedure", key: "procedure", width: 26 },
  { header: "Quantity", key: "quantity", width: 11 },
  { header: "Rate", key: "rate", width: 14 },
  { header: "Amount", key: "amount", width: 14 },
  { header: "Medical Aid", key: "medicalAid", width: 18 },
  { header: "Authorisation", key: "authorisation", width: 18 },
  { header: "Confirmed At", key: "confirmedAt", width: 22 },
];

function parseNumber(value: string): number | null {
  const cleaned = value.trim().replace(/[^\d.-]/g, "");

  if (!cleaned) {
    return null;
  }

  const result = Number(cleaned);
  return Number.isFinite(result) ? result : null;
}

function parseDate(value: string): Date | string {
  const trimmed = value.trim();

  if (!trimmed) {
    return "";
  }

  const parsed = new Date(`${trimmed}T00:00:00`);

  if (Number.isNaN(parsed.getTime())) {
    return trimmed;
  }

  return parsed;
}

export async function buildBillingWorkbook(
  input: WorkbookInput,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();

  workbook.creator = "MFI Consult";
  workbook.company = "MFI";
  workbook.subject = "Consultation billing instruction";
  workbook.title = input.reference;
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(
    "Billing Instruction",
    {
      views: [
        {
          state: "frozen",
          ySplit: 8,
        },
      ],
      pageSetup: {
        orientation: "landscape",
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        paperSize: 9,
      },
    },
  );

  sheet.mergeCells("A1:V1");
  const title = sheet.getCell("A1");
  title.value = "MFI Consultation Billing Instruction";
  title.font = {
    bold: true,
    size: 16,
    color: { argb: "FFFFFFFF" },
  };
  title.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF0F172A" },
  };
  title.alignment = {
    vertical: "middle",
    horizontal: "left",
  };
  sheet.getRow(1).height = 30;

  const summary = [
    ["Reference", input.reference],
    ["Doctor", input.doctor],
    ["Practice", input.practice],
    ["Patient Reference", input.patientReference],
  ];

  summary.forEach((item, index) => {
    const rowNumber = index + 3;
    const labelCell = sheet.getCell(rowNumber, 1);
    const valueCell = sheet.getCell(rowNumber, 2);

    labelCell.value = item[0];
    valueCell.value = item[1];

    labelCell.font = { bold: true };
    labelCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE2E8F0" },
    };

    [labelCell, valueCell].forEach((cell) => {
      cell.border = {
        top: { style: "thin", color: { argb: "FFCBD5E1" } },
        bottom: { style: "thin", color: { argb: "FFCBD5E1" } },
        left: { style: "thin", color: { argb: "FFCBD5E1" } },
        right: { style: "thin", color: { argb: "FFCBD5E1" } },
      };
    });
  });

  const headerRowNumber = 8;
  const headerRow = sheet.getRow(headerRowNumber);

  columns.forEach((column, index) => {
    const cell = headerRow.getCell(index + 1);

    cell.value = column.header;
    cell.font = {
      bold: true,
      color: { argb: "FFFFFFFF" },
    };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1E293B" },
    };
    cell.alignment = {
      horizontal: "center",
      vertical: "middle",
      wrapText: true,
    };

    sheet.getColumn(index + 1).width = column.width;
  });

  headerRow.height = 38;

  input.rows.forEach((billingRow, rowIndex) => {
    const excelRowNumber = headerRowNumber + rowIndex + 1;
    const row = sheet.getRow(excelRowNumber);

    columns.forEach((column, columnIndex) => {
      const cell = row.getCell(columnIndex + 1);
      const raw = billingRow[column.key];

      if (column.key === "consultationDate") {
        cell.value = parseDate(raw);
        cell.numFmt = "yyyy-mm-dd";
      } else if (
        column.key === "durationMinutes" ||
        column.key === "quantity" ||
        column.key === "rate"
      ) {
        cell.value = parseNumber(raw) ?? raw;
      } else if (column.key === "amount") {
        const quantityCell = `Q${excelRowNumber}`;
        const rateCell = `R${excelRowNumber}`;

        cell.value = {
          formula:
            `IF(OR(${quantityCell}="",${rateCell}=""),"",${quantityCell}*${rateCell})`,
        };
        cell.numFmt = '"R" #,##0.00';
      } else {
        cell.value = raw;
      }

      cell.alignment = {
        vertical: "top",
        wrapText: true,
      };

      cell.border = {
        top: { style: "thin", color: { argb: "FFCBD5E1" } },
        bottom: { style: "thin", color: { argb: "FFCBD5E1" } },
        left: { style: "thin", color: { argb: "FFCBD5E1" } },
        right: { style: "thin", color: { argb: "FFCBD5E1" } },
      };
    });
  });

  const lastRow = Math.max(
    headerRowNumber + input.rows.length,
    headerRowNumber + 1,
  );

  sheet.autoFilter = {
    from: {
      row: headerRowNumber,
      column: 1,
    },
    to: {
      row: lastRow,
      column: columns.length,
    },
  };

  sheet.getColumn(18).numFmt = '"R" #,##0.00';
  sheet.getColumn(19).numFmt = '"R" #,##0.00';

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber > headerRowNumber) {
      row.height = 34;
    }
  });

  sheet.pageSetup.printTitlesRow = `${headerRowNumber}:${headerRowNumber}`;
  sheet.pageSetup.margins = {
    left: 0.25,
    right: 0.25,
    top: 0.5,
    bottom: 0.5,
    header: 0.2,
    footer: 0.2,
  };

  const result = await workbook.xlsx.writeBuffer();

  return Buffer.from(result);
}
