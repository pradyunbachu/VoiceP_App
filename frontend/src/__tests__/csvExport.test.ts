import { describe, it, expect } from "vitest";
import { escapeCsvValue, arrayToCsv } from "../lib/csvExport";

describe("escapeCsvValue", () => {
  it("returns empty string for null/undefined", () => {
    expect(escapeCsvValue(null)).toBe("");
    expect(escapeCsvValue(undefined)).toBe("");
  });

  it("returns plain string as-is", () => {
    expect(escapeCsvValue("hello")).toBe("hello");
  });

  it("wraps strings with commas in quotes", () => {
    expect(escapeCsvValue("hello, world")).toBe('"hello, world"');
  });

  it("wraps strings with quotes and escapes inner quotes", () => {
    expect(escapeCsvValue('say "hi"')).toBe('"say ""hi"""');
  });

  it("wraps strings with newlines", () => {
    expect(escapeCsvValue("line1\nline2")).toBe('"line1\nline2"');
  });

  it("converts numbers to string", () => {
    expect(escapeCsvValue(42)).toBe("42");
    expect(escapeCsvValue(3.14)).toBe("3.14");
  });

  it("converts booleans to string", () => {
    expect(escapeCsvValue(true)).toBe("true");
    expect(escapeCsvValue(false)).toBe("false");
  });
});

describe("arrayToCsv", () => {
  interface TestRow {
    name: string;
    age: number;
    city: string;
  }

  const columns = [
    { header: "Name", key: "name" as const },
    { header: "Age", key: "age" as const },
    { header: "City", key: "city" as const },
  ];

  it("generates header row", () => {
    const csv = arrayToCsv<TestRow>([], columns);
    expect(csv).toBe("Name,Age,City");
  });

  it("generates data rows", () => {
    const data: TestRow[] = [
      { name: "Alice", age: 30, city: "NYC" },
      { name: "Bob", age: 25, city: "LA" },
    ];
    const csv = arrayToCsv(data, columns);
    const lines = csv.split("\r\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe("Name,Age,City");
    expect(lines[1]).toBe("Alice,30,NYC");
    expect(lines[2]).toBe("Bob,25,LA");
  });

  it("applies transform functions", () => {
    const data: TestRow[] = [{ name: "Alice", age: 30, city: "NYC" }];
    const cols = [
      { header: "Name", key: "name" as const, transform: (row: TestRow) => row.name.toUpperCase() },
      { header: "Age", key: "age" as const },
    ];
    const csv = arrayToCsv(data, cols);
    expect(csv).toContain("ALICE");
  });

  it("escapes values with special characters", () => {
    const data: TestRow[] = [{ name: "O'Brien, Jr.", age: 40, city: "San Francisco" }];
    const csv = arrayToCsv(data, columns);
    expect(csv).toContain('"O\'Brien, Jr."');
  });
});
