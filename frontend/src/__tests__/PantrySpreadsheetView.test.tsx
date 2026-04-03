import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import PantrySpreadsheetView from "../components/PantrySpreadsheetView";
import type { PantryItem, StockStatus } from "../types/index";

const makeItem = (overrides: Partial<PantryItem> = {}): PantryItem => ({
  id: 1,
  name: "Milk",
  quantity: 2,
  unit: "gal",
  category: "Dairy",
  expiration_date: "2026-05-01",
  purchase_date: "2026-04-01",
  stock_status: "full" as StockStatus,
  notes: "Whole milk",
  ...overrides,
});

const defaultProps = () => ({
  items: [
    makeItem({ id: 1, name: "Milk", category: "Dairy", quantity: 2 }),
    makeItem({ id: 2, name: "Apples", category: "Produce", quantity: 5, unit: "lb" }),
    makeItem({ id: 3, name: "Chicken", category: "Meat & Seafood", quantity: 1, unit: "lb", stock_status: "low" as StockStatus }),
  ],
  editingId: null,
  editForm: {
    name: "",
    quantity: 1,
    unit: "",
    category: "Other",
    expiration_date: "",
    purchase_date: "",
    stock_status: "full" as StockStatus,
    notes: "",
  },
  isSelectMode: false,
  selectedItems: new Set<number>(),
  onEditFormChange: vi.fn(),
  onStartEdit: vi.fn(),
  onSaveEdit: vi.fn(),
  onCancelEdit: vi.fn(),
  onDelete: vi.fn(),
  onStatusChange: vi.fn(),
  onQuantityChange: vi.fn(),
  onToggleSelect: vi.fn(),
  updatePending: false,
  deletePending: false,
});

describe("PantrySpreadsheetView", () => {
  it("renders all items in the table", () => {
    render(<PantrySpreadsheetView {...defaultProps()} />);
    expect(screen.getByText("Milk")).toBeInTheDocument();
    expect(screen.getByText("Apples")).toBeInTheDocument();
    expect(screen.getByText("Chicken")).toBeInTheDocument();
  });

  it("renders table headers", () => {
    render(<PantrySpreadsheetView {...defaultProps()} />);
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Category")).toBeInTheDocument();
    expect(screen.getByText("Qty")).toBeInTheDocument();
    expect(screen.getByText("Status")).toBeInTheDocument();
    expect(screen.getByText("Expires")).toBeInTheDocument();
    expect(screen.getByText("Notes")).toBeInTheDocument();
  });

  it("shows category badges", () => {
    render(<PantrySpreadsheetView {...defaultProps()} />);
    expect(screen.getByText("Dairy")).toBeInTheDocument();
    expect(screen.getByText("Produce")).toBeInTheDocument();
    expect(screen.getByText("Meat & Seafood")).toBeInTheDocument();
  });

  it("shows stock status labels", () => {
    render(<PantrySpreadsheetView {...defaultProps()} />);
    // "In Stock" for full, "Low" for low
    const inStockButtons = screen.getAllByText("In Stock");
    expect(inStockButtons.length).toBe(2);
    expect(screen.getByText("Low")).toBeInTheDocument();
  });

  it("calls onDelete when delete button is clicked", () => {
    const props = defaultProps();
    render(<PantrySpreadsheetView {...props} />);
    const deleteButtons = screen.getAllByTitle("Delete");
    fireEvent.click(deleteButtons[0]);
    expect(props.onDelete).toHaveBeenCalledWith(1);
  });

  it("calls onStartEdit when edit button is clicked", () => {
    const props = defaultProps();
    render(<PantrySpreadsheetView {...props} />);
    const editButtons = screen.getAllByTitle("Edit");
    fireEvent.click(editButtons[1]);
    expect(props.onStartEdit).toHaveBeenCalledWith(props.items[1]);
  });

  it("calls onStatusChange when status button is clicked", () => {
    const props = defaultProps();
    render(<PantrySpreadsheetView {...props} />);
    // Click the "Low" status button for Chicken (id: 3, currently "low")
    fireEvent.click(screen.getByText("Low"));
    expect(props.onStatusChange).toHaveBeenCalledWith(3, "out_of_stock");
  });

  it("calls onQuantityChange when +/- buttons are clicked", () => {
    const props = defaultProps();
    render(<PantrySpreadsheetView {...props} />);
    const increaseButtons = screen.getAllByTitle("Increase");
    const decreaseButtons = screen.getAllByTitle("Decrease");
    fireEvent.click(increaseButtons[0]);
    expect(props.onQuantityChange).toHaveBeenCalledWith(1, 1);
    fireEvent.click(decreaseButtons[0]);
    expect(props.onQuantityChange).toHaveBeenCalledWith(1, -1);
  });

  it("renders inline edit form when editingId matches", () => {
    const props = defaultProps();
    props.editingId = 1;
    props.editForm = {
      name: "Milk",
      quantity: 2,
      unit: "gal",
      category: "Dairy",
      expiration_date: "2026-05-01",
      purchase_date: "2026-04-01",
      stock_status: "full",
      notes: "Whole milk",
    };
    render(<PantrySpreadsheetView {...props} />);
    // Should have save and cancel buttons
    expect(screen.getByTitle("Save")).toBeInTheDocument();
    expect(screen.getByTitle("Cancel")).toBeInTheDocument();
    // Should have input with value "Milk"
    const nameInput = screen.getByDisplayValue("Milk");
    expect(nameInput).toBeInTheDocument();
  });

  it("calls onSaveEdit when save button is clicked", () => {
    const props = defaultProps();
    props.editingId = 1;
    props.editForm = {
      name: "Milk",
      quantity: 2,
      unit: "gal",
      category: "Dairy",
      expiration_date: "2026-05-01",
      purchase_date: "2026-04-01",
      stock_status: "full",
      notes: "Whole milk",
    };
    render(<PantrySpreadsheetView {...props} />);
    fireEvent.click(screen.getByTitle("Save"));
    expect(props.onSaveEdit).toHaveBeenCalledWith(1);
  });

  it("calls onCancelEdit when cancel button is clicked", () => {
    const props = defaultProps();
    props.editingId = 1;
    props.editForm = {
      name: "Milk",
      quantity: 2,
      unit: "gal",
      category: "Dairy",
      expiration_date: "",
      purchase_date: "",
      stock_status: "full",
      notes: "",
    };
    render(<PantrySpreadsheetView {...props} />);
    fireEvent.click(screen.getByTitle("Cancel"));
    expect(props.onCancelEdit).toHaveBeenCalled();
  });

  it("shows checkboxes in select mode", () => {
    const props = defaultProps();
    props.isSelectMode = true;
    render(<PantrySpreadsheetView {...props} />);
    // There should be checkbox buttons for each row
    const checkButtons = screen.getAllByRole("button").filter((btn) =>
      btn.classList.contains("spreadsheet-check-btn")
    );
    expect(checkButtons.length).toBe(3);
  });

  it("calls onToggleSelect when checkbox is clicked", () => {
    const props = defaultProps();
    props.isSelectMode = true;
    render(<PantrySpreadsheetView {...props} />);
    const checkButtons = screen.getAllByRole("button").filter((btn) =>
      btn.classList.contains("spreadsheet-check-btn")
    );
    fireEvent.click(checkButtons[1]);
    expect(props.onToggleSelect).toHaveBeenCalledWith(2);
  });

  it("shows empty message when no items match", () => {
    const props = defaultProps();
    props.items = [];
    render(<PantrySpreadsheetView {...props} />);
    expect(screen.getByText("No items match your filters")).toBeInTheDocument();
  });

  it("sorts items by name when header is clicked", () => {
    const props = defaultProps();
    const { container } = render(<PantrySpreadsheetView {...props} />);
    // Click "Name" header to sort ascending
    fireEvent.click(screen.getByText("Name"));
    const rows = container.querySelectorAll(".spreadsheet-row");
    const names = Array.from(rows).map(
      (row) => row.querySelector(".spreadsheet-td-name")?.textContent
    );
    // Apples, Chicken, Milk (ascending)
    expect(names).toEqual(["Apples", "Chicken", "Milk"]);
  });

  it("reverses sort order on second header click", () => {
    const props = defaultProps();
    const { container } = render(<PantrySpreadsheetView {...props} />);
    // Click twice for descending
    fireEvent.click(screen.getByText("Name"));
    fireEvent.click(screen.getByText("Name"));
    const rows = container.querySelectorAll(".spreadsheet-row");
    const names = Array.from(rows).map(
      (row) => row.querySelector(".spreadsheet-td-name")?.textContent
    );
    expect(names).toEqual(["Milk", "Chicken", "Apples"]);
  });

  it("sorts items by quantity when Qty header is clicked", () => {
    const props = defaultProps();
    const { container } = render(<PantrySpreadsheetView {...props} />);
    fireEvent.click(screen.getByText("Qty"));
    const rows = container.querySelectorAll(".spreadsheet-row");
    const qtys = Array.from(rows).map((row) => {
      const qtyCell = row.querySelector(".spreadsheet-td-qty");
      return qtyCell?.querySelector(".spreadsheet-qty-value")?.textContent;
    });
    // 1, 2, 5 ascending
    expect(qtys).toEqual(["1", "2", "5"]);
  });

  it("shows notes or dash for empty notes", () => {
    const props = defaultProps();
    props.items = [
      makeItem({ id: 1, name: "Milk", notes: "Organic" }),
      makeItem({ id: 2, name: "Eggs", notes: null }),
    ];
    render(<PantrySpreadsheetView {...props} />);
    expect(screen.getByText("Organic")).toBeInTheDocument();
    // The "—" dash for null notes
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThanOrEqual(1);
  });

  it("formats dates instead of showing raw ISO strings", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-01T12:00:00"));
    const props = defaultProps();
    props.items = [makeItem({ id: 1, expiration_date: "2026-04-15", purchase_date: "2026-03-01" })];
    render(<PantrySpreadsheetView {...props} />);
    // Should NOT show raw ISO date strings
    expect(screen.queryByText("2026-04-15")).not.toBeInTheDocument();
    expect(screen.queryByText("2026-03-01")).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it("highlights expired items", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01T12:00:00"));
    const props = defaultProps();
    props.items = [makeItem({ id: 1, expiration_date: "2026-05-01" })];
    const { container } = render(<PantrySpreadsheetView {...props} />);
    const row = container.querySelector(".spreadsheet-row-expired");
    expect(row).toBeInTheDocument();
    vi.useRealTimers();
  });

  it("highlights expiring-soon items", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-28T12:00:00"));
    const props = defaultProps();
    props.items = [makeItem({ id: 1, expiration_date: "2026-05-01" })];
    const { container } = render(<PantrySpreadsheetView {...props} />);
    const row = container.querySelector(".spreadsheet-row-expiring");
    expect(row).toBeInTheDocument();
    vi.useRealTimers();
  });

  it("shows predicted indicator for AI-predicted expiration", () => {
    const props = defaultProps();
    props.items = [makeItem({ id: 1, expiration_predicted: true })];
    render(<PantrySpreadsheetView {...props} />);
    expect(screen.getByTitle("AI predicted")).toBeInTheDocument();
  });

  it("calls onEditFormChange when editing and input changes", () => {
    const props = defaultProps();
    props.editingId = 1;
    props.editForm = {
      name: "Milk",
      quantity: 2,
      unit: "gal",
      category: "Dairy",
      expiration_date: "",
      purchase_date: "",
      stock_status: "full",
      notes: "",
    };
    render(<PantrySpreadsheetView {...props} />);
    const nameInput = screen.getByDisplayValue("Milk");
    fireEvent.change(nameInput, { target: { value: "Oat Milk" } });
    expect(props.onEditFormChange).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Oat Milk" })
    );
  });

  it("disables save button when updatePending is true", () => {
    const props = defaultProps();
    props.editingId = 1;
    props.updatePending = true;
    props.editForm = {
      name: "Milk",
      quantity: 2,
      unit: "gal",
      category: "Dairy",
      expiration_date: "",
      purchase_date: "",
      stock_status: "full",
      notes: "",
    };
    render(<PantrySpreadsheetView {...props} />);
    const saveBtn = screen.getByTitle("Save");
    expect(saveBtn).toBeDisabled();
  });

  it("disables delete button when deletePending is true", () => {
    const props = defaultProps();
    props.deletePending = true;
    render(<PantrySpreadsheetView {...props} />);
    const deleteButtons = screen.getAllByTitle("Delete");
    deleteButtons.forEach((btn) => expect(btn).toBeDisabled());
  });
});
