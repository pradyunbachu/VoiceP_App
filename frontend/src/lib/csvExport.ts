import type { Expense, Budget, PantryItem, CsvColumn } from "../types";

export function escapeCsvValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes('"') || str.includes(",") || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function arrayToCsv<T>(data: T[], columns: CsvColumn<T>[]): string {
  const headerRow = columns.map((col) => escapeCsvValue(col.header)).join(",");
  const dataRows = data.map((row) =>
    columns
      .map((col) => {
        const value = col.transform ? col.transform(row) : row[col.key];
        return escapeCsvValue(value);
      })
      .join(",")
  );
  return [headerRow, ...dataRows].join("\r\n");
}

export function downloadCsv(csvString: string, filename: string): void {
  const blob = new Blob([csvString], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function getDateSuffix(): string {
  return new Date().toISOString().split("T")[0];
}

export function exportExpensesCsv(expenses: Expense[]): void {
  const columns: CsvColumn<Expense>[] = [
    { header: "Date", key: "date" },
    { header: "Store", key: "store" },
    { header: "Items", key: "items" },
    { header: "Category", key: "category" },
    { header: "Amount", key: "amount", transform: (row) => row.amount ? parseFloat(String(row.amount)).toFixed(2) : "" },
    { header: "Recurring", key: "recurring", transform: (row) => row.recurring ? "Yes" : "No" },
  ];
  const csv = arrayToCsv(expenses, columns);
  downloadCsv(csv, `voxal-expenses-${getDateSuffix()}.csv`);
}

export function exportBudgetsCsv(budgets: Budget[]): void {
  const columns: CsvColumn<Budget>[] = [
    { header: "Category", key: "category" },
    { header: "Budget Amount", key: "amount", transform: (row) => row.amount?.toFixed(2) ?? "" },
    { header: "Amount Spent", key: "actual_spending", transform: (row) => row.actual_spending?.toFixed(2) ?? "0.00" },
    { header: "Remaining", key: "remaining", transform: (row) => row.remaining?.toFixed(2) ?? row.amount?.toFixed(2) ?? "" },
    { header: "% Used", key: "percentage_used", transform: (row) => row.percentage_used?.toFixed(1) ?? "0.0" },
    { header: "Month", key: "month" },
    { header: "Year", key: "year" },
  ];
  const csv = arrayToCsv(budgets, columns);
  downloadCsv(csv, `voxal-budgets-${getDateSuffix()}.csv`);
}

export function exportPantryCsv(items: PantryItem[]): void {
  const statusLabels: Record<string, string> = { full: "In Stock", low: "Low", out_of_stock: "Out of Stock" };
  const columns: CsvColumn<PantryItem>[] = [
    { header: "Name", key: "name" },
    { header: "Quantity", key: "quantity" },
    { header: "Unit", key: "unit" },
    { header: "Category", key: "category" },
    { header: "Stock Status", key: "stock_status", transform: (row) => statusLabels[row.stock_status] || row.stock_status || "" },
    { header: "Expiration Date", key: "expiration_date" },
    { header: "Notes", key: "notes" },
  ];
  const csv = arrayToCsv(items, columns);
  downloadCsv(csv, `voxal-pantry-${getDateSuffix()}.csv`);
}
