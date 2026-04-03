import { describe, it, expect } from "vitest";
import { getFriendlyError } from "../lib/friendlyError";

describe("getFriendlyError", () => {
  it("returns generic message for undefined", () => {
    expect(getFriendlyError(undefined)).toBe("Something went wrong. Please try again.");
  });

  it("returns generic message for empty string", () => {
    expect(getFriendlyError("")).toBe("Something went wrong. Please try again.");
  });

  it("handles empty message errors", () => {
    expect(getFriendlyError("Empty message received")).toContain("couldn't catch");
  });

  it("handles rate limit / 429 errors", () => {
    expect(getFriendlyError("Error 429: Too many requests")).toContain("lot of requests");
    expect(getFriendlyError("Quota exceeded")).toContain("lot of requests");
    expect(getFriendlyError("Rate limit hit")).toContain("lot of requests");
  });

  it("handles network errors", () => {
    expect(getFriendlyError("Failed to fetch")).toContain("trouble connecting");
    expect(getFriendlyError("Network error occurred")).toContain("trouble connecting");
  });

  it("handles transcription errors", () => {
    expect(getFriendlyError("Deepgram transcription failed")).toContain("couldn't catch");
    expect(getFriendlyError("Transcription failed: timeout")).toContain("couldn't catch");
  });

  it("handles microphone errors", () => {
    expect(getFriendlyError("Microphone access denied")).toContain("Microphone access");
    expect(getFriendlyError("Permission denied")).toContain("Microphone access");
  });

  it("handles auth errors", () => {
    expect(getFriendlyError("401 Unauthorized")).toContain("session has expired");
    expect(getFriendlyError("Session expired")).toContain("session has expired");
  });

  it("returns generic message for unrecognized errors", () => {
    expect(getFriendlyError("Internal server error 500")).toBe("Something went wrong. Please try again.");
  });

  // Status code-based tests
  it("handles 429 status code even without message", () => {
    expect(getFriendlyError(undefined, 429)).toContain("lot of requests");
    expect(getFriendlyError("", 429)).toContain("lot of requests");
  });

  it("handles 401 status code", () => {
    expect(getFriendlyError(undefined, 401)).toContain("session has expired");
  });

  it("handles 403 status code", () => {
    expect(getFriendlyError(undefined, 403)).toContain("session has expired");
  });

  it("handles 413 status code", () => {
    expect(getFriendlyError(undefined, 413)).toContain("too large");
  });

  it("handles 422 status code", () => {
    expect(getFriendlyError(undefined, 422)).toContain("check your input");
  });

  it("handles validation error messages", () => {
    expect(getFriendlyError("Validation error: quantity must be >= 0")).toContain("check your input");
    expect(getFriendlyError("Invalid date format")).toContain("check your input");
  });

  it("prioritizes status code over message", () => {
    // 429 status code should match even if message says something else
    expect(getFriendlyError("some random error", 429)).toContain("lot of requests");
  });
});
