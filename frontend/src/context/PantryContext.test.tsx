import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { PantryProvider, usePantrySelection } from "./PantryContext";

const STORAGE_KEY = "voxal_selected_pantry";

// The test environment's localStorage lacks working Storage methods, so install
// a minimal in-memory implementation the context can exercise.
const store = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
});

let setter: (id: number | null) => void;

function Probe() {
  const { selectedGroupId, setSelectedGroupId } = usePantrySelection();
  setter = setSelectedGroupId;
  return <span data-testid="value">{selectedGroupId === null ? "null" : String(selectedGroupId)}</span>;
}

function renderProvider() {
  return render(
    <PantryProvider>
      <Probe />
    </PantryProvider>
  );
}

describe("PantryContext", () => {
  beforeEach(() => {
    localStorage.removeItem(STORAGE_KEY);
  });

  it("defaults to null when nothing is stored", () => {
    renderProvider();
    expect(screen.getByTestId("value").textContent).toBe("null");
  });

  it("persists a selected group id to localStorage", () => {
    renderProvider();
    act(() => setter(42));
    expect(screen.getByTestId("value").textContent).toBe("42");
    expect(localStorage.getItem(STORAGE_KEY)).toBe("42");
  });

  it("re-hydrates a stored group id on mount", () => {
    localStorage.setItem(STORAGE_KEY, "7");
    renderProvider();
    expect(screen.getByTestId("value").textContent).toBe("7");
  });

  it("hydrates null for the stored 'null' sentinel", () => {
    localStorage.setItem(STORAGE_KEY, "null");
    renderProvider();
    expect(screen.getByTestId("value").textContent).toBe("null");
  });

  it("throws when used outside the provider", () => {
    expect(() => render(<Probe />)).toThrow(/usePantrySelection must be used within PantryProvider/);
  });
});
