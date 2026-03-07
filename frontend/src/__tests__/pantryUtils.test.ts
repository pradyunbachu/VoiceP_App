import { describe, it, expect, vi, afterEach } from "vitest";
import { isExpiringSoon, isExpired } from "../lib/pantryUtils";

describe("isExpiringSoon", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns false for null date", () => {
    expect(isExpiringSoon(null)).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isExpiringSoon("")).toBe(false);
  });

  it("returns true for date 3 days from now", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-06-01T12:00:00"));
    expect(isExpiringSoon("2025-06-04")).toBe(true);
  });

  it("returns true for date 7 days from now (boundary)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-06-01T00:00:00"));
    expect(isExpiringSoon("2025-06-08")).toBe(true);
  });

  it("returns false for date 10 days from now", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-06-01T00:00:00"));
    expect(isExpiringSoon("2025-06-11")).toBe(false);
  });

  it("returns true for today (0 days)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-06-01T12:00:00"));
    expect(isExpiringSoon("2025-06-01")).toBe(true);
  });

  it("returns false for already expired date", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-06-10T12:00:00"));
    expect(isExpiringSoon("2025-06-01")).toBe(false);
  });
});

describe("isExpired", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns false for null date", () => {
    expect(isExpired(null)).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isExpired("")).toBe(false);
  });

  it("returns true for past date", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-06-10T12:00:00"));
    expect(isExpired("2025-06-01")).toBe(true);
  });

  it("returns false for future date", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-06-01T12:00:00"));
    expect(isExpired("2025-06-10")).toBe(false);
  });
});
