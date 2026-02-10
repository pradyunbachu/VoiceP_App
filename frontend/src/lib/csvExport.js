/**
 * CSV Export utilities for voxal App
 * Handles RFC 4180 compliant CSV generation and download
 */

/**
 * Escape a value for CSV per RFC 4180.
 * Wraps in quotes if the value contains commas, quotes, or newlines.
 */
export function escapeCsvValue(value) {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes('"') || str.includes(",") || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Convert an array of objects to a CSV string.
 * @param {Array} data - Array of row objects
 * @param {Array} columns - Column definitions: { header, key, transform? }
 * @returns {string} CSV string
 */
export function arrayToCsv(data, columns) {
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

/**
 * Trigger a CSV file download in the browser.
 */
export function downloadCsv(csvString, filename) {
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

function getDateSuffix() {
  return new Date().toISOString().split("T")[0];
}

/**
 * Export expenses to CSV and trigger download.
 */
export function exportExpensesCsv(expenses) {
  const columns = [
    { header: "Date", key: "date" },
    { header: "Store", key: "store" },
    { header: "Items", key: "items" },
    { header: "Category", key: "category" },
    { header: "Amount", key: "amount", transform: (row) => row.amount ? parseFloat(row.amount).toFixed(2) : "" },
    { header: "Recurring", key: "recurring", transform: (row) => row.recurring ? "Yes" : "No" },
  ];
  const csv = arrayToCsv(expenses, columns);
  downloadCsv(csv, `voxal-expenses-${getDateSuffix()}.csv`);
}

/**
 * Export budgets to CSV and trigger download.
 */
export function exportBudgetsCsv(budgets) {
  const columns = [
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

/**
 * Export pantry items to CSV and trigger download.
 */
export function exportPantryCsv(items) {
  const statusLabels = { full: "In Stock", low: "Low", out_of_stock: "Out of Stock" };
  const columns = [
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
