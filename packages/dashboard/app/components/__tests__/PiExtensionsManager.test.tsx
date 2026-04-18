import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PiExtensionsManager } from "../PiExtensionsManager";

// Mock API module
const mockFetchPiSettings = vi.fn();
const mockUpdatePiSettings = vi.fn();
const mockInstallPiPackage = vi.fn();

// Mock lucide-react icons
vi.mock("lucide-react", () => ({
  Package: ({ size }: { size?: number }) => (
    <span data-testid="icon-package">Package-{size || 16}</span>
  ),
  Puzzle: ({ size }: { size?: number }) => (
    <span data-testid="icon-puzzle">Puzzle-{size || 14}</span>
  ),
  BookOpen: ({ size }: { size?: number }) => (
    <span data-testid="icon-book">BookOpen-{size || 14}</span>
  ),
  FileText: ({ size }: { size?: number }) => (
    <span data-testid="icon-file">FileText-{size || 14}</span>
  ),
  Palette: ({ size }: { size?: number }) => (
    <span data-testid="icon-palette">Palette-{size || 14}</span>
  ),
  Plus: ({ size }: { size?: number }) => (
    <span data-testid="icon-plus">Plus-{size || 14}</span>
  ),
  X: ({ size }: { size?: number }) => (
    <span data-testid="icon-x">X-{size || 12}</span>
  ),
  ChevronDown: ({ size }: { size?: number }) => (
    <span data-testid="icon-chevron-down">ChevronDown-{size || 14}</span>
  ),
  ChevronRight: ({ size }: { size?: number }) => (
    <span data-testid="icon-chevron-right">ChevronRight-{size || 14}</span>
  ),
  RefreshCw: ({ size, className }: { size?: number; className?: string }) => (
    <span data-testid="icon-refresh" className={className}>
      RefreshCw-{size || 16}
    </span>
  ),
  Trash2: ({ size }: { size?: number }) => (
    <span data-testid="icon-trash">Trash2-{size || 14}</span>
  ),
}));

vi.mock("../../api", () => ({
  fetchPiSettings: (...args: unknown[]) => mockFetchPiSettings(...args),
  updatePiSettings: (...args: unknown[]) => mockUpdatePiSettings(...args),
  installPiPackage: (...args: unknown[]) => mockInstallPiPackage(...args),
}));

const mockPiSettings = {
  packages: [
    "npm:pi-example",
    "git:https://github.com/example/extension.git",
    { source: "npm:pi-with-filters", extensions: ["ext-a", "ext-b"], skills: ["skill-1"], prompts: [], themes: [] },
  ],
  extensions: ["/path/to/extension"],
  skills: ["/path/to/skill"],
  prompts: ["/path/to/prompts"],
  themes: ["/path/to/themes"],
};

const addToast = vi.fn();

describe("PiExtensionsManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cleanup();
  });

  describe("Rendering", () => {
    it("renders Pi Extensions header", async () => {
      mockFetchPiSettings.mockResolvedValueOnce(mockPiSettings);
      render(<PiExtensionsManager addToast={addToast} />);

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: "Pi Extensions" })).toBeTruthy();
      });
    });

    it("renders add package form", async () => {
      mockFetchPiSettings.mockResolvedValueOnce(mockPiSettings);
      render(<PiExtensionsManager addToast={addToast} />);

      await waitFor(() => {
        expect(screen.getByRole("textbox")).toBeTruthy();
        expect(screen.getByRole("button", { name: /Add/i })).toBeTruthy();
      });
    });

    it("renders package list with source badges", async () => {
      mockFetchPiSettings.mockResolvedValueOnce(mockPiSettings);
      render(<PiExtensionsManager addToast={addToast} />);

      await waitFor(() => {
        expect(screen.getAllByText("npm")).toHaveLength(2); // npm:pi-example and npm:pi-with-filters
        expect(screen.getByText("git")).toBeTruthy();
        expect(screen.getByText("pi-example")).toBeTruthy();
        expect(screen.getByText(/github\.com\/example\/extension\.git/i)).toBeTruthy();
      });
    });

    it("renders top-level resource sections", async () => {
      mockFetchPiSettings.mockResolvedValueOnce(mockPiSettings);
      render(<PiExtensionsManager addToast={addToast} />);

      await waitFor(() => {
        expect(screen.getByText("Extensions")).toBeTruthy();
        expect(screen.getByText("Skills")).toBeTruthy();
        expect(screen.getByText("Prompts")).toBeTruthy();
        expect(screen.getByText("Themes")).toBeTruthy();
      });
    });

    it("renders resource paths as removable tags", async () => {
      mockFetchPiSettings.mockResolvedValueOnce(mockPiSettings);
      render(<PiExtensionsManager addToast={addToast} />);

      await waitFor(() => {
        expect(screen.getByText("/path/to/extension")).toBeTruthy();
        expect(screen.getByText("/path/to/skill")).toBeTruthy();
        expect(screen.getByText("/path/to/prompts")).toBeTruthy();
        expect(screen.getByText("/path/to/themes")).toBeTruthy();
      });
    });
  });

  describe("Loading state", () => {
    it("shows loading state while fetching settings", async () => {
      mockFetchPiSettings.mockImplementation(() => new Promise(() => {}));
      render(<PiExtensionsManager addToast={addToast} />);

      expect(screen.getByText("Loading Pi settings…")).toBeTruthy();
    });

    it("refresh button shows spinning class while loading", async () => {
      mockFetchPiSettings.mockImplementation(() => new Promise(() => {}));
      render(<PiExtensionsManager addToast={addToast} />);

      const refreshBtn = screen.getByTestId("icon-refresh");
      expect(refreshBtn).toHaveClass("spin");
    });
  });

  describe("Empty state", () => {
    it("shows empty state when no packages configured", async () => {
      mockFetchPiSettings.mockResolvedValueOnce({ packages: [], extensions: [], skills: [], prompts: [], themes: [] });
      render(<PiExtensionsManager addToast={addToast} />);

      await waitFor(() => {
        expect(screen.getByText("No packages configured.")).toBeTruthy();
      });
      expect(screen.getByText(/Add a package source above to get started/)).toBeTruthy();
    });

    it("shows Package icon in empty state", async () => {
      mockFetchPiSettings.mockResolvedValueOnce({ packages: [], extensions: [], skills: [], prompts: [], themes: [] });
      render(<PiExtensionsManager addToast={addToast} />);

      await waitFor(() => {
        expect(screen.getByTestId("icon-package")).toBeTruthy();
      });
    });
  });

  describe("Add package form", () => {
    it("calls installPiPackage when Add button is clicked", async () => {
      mockFetchPiSettings.mockResolvedValueOnce({ packages: [], extensions: [], skills: [], prompts: [], themes: [] });
      mockInstallPiPackage.mockResolvedValueOnce({ success: true });
      // Second call to loadSettings after install completes
      mockFetchPiSettings.mockResolvedValueOnce({ packages: ["npm:new-package"], extensions: [], skills: [], prompts: [], themes: [] });

      render(<PiExtensionsManager addToast={addToast} />);

      await waitFor(() => {
        expect(screen.getByText("No packages configured.")).toBeTruthy();
      });

      await userEvent.type(screen.getByRole("textbox"), "npm:new-package");
      await userEvent.click(screen.getByRole("button", { name: /Add/i }));

      await waitFor(() => {
        expect(mockInstallPiPackage).toHaveBeenCalledWith("npm:new-package");
      });

      // Wait for refresh after install
      await waitFor(() => {
        expect(screen.queryByText("No packages configured.")).not.toBeTruthy();
      });
    });

    it("shows error toast when install fails", async () => {
      mockFetchPiSettings.mockResolvedValueOnce({ packages: [], extensions: [], skills: [], prompts: [], themes: [] });
      mockInstallPiPackage.mockRejectedValueOnce(new Error("Install failed"));

      render(<PiExtensionsManager addToast={addToast} />);

      await waitFor(() => {
        expect(screen.getByText("No packages configured.")).toBeTruthy();
      });

      await userEvent.type(screen.getByRole("textbox"), "npm:failing-package");
      await userEvent.click(screen.getByRole("button", { name: /Add/i }));

      await waitFor(() => {
        expect(addToast).toHaveBeenCalledWith("Failed to install package: Install failed", "error");
      });
    });

    it("shows loading state while installing", async () => {
      mockFetchPiSettings.mockResolvedValueOnce({ packages: [], extensions: [], skills: [], prompts: [], themes: [] });
      mockInstallPiPackage.mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve({ success: true }), 100)));

      render(<PiExtensionsManager addToast={addToast} />);

      await waitFor(() => {
        expect(screen.getByText("No packages configured.")).toBeTruthy();
      });

      await userEvent.type(screen.getByRole("textbox"), "npm:slow-package");
      await userEvent.click(screen.getByRole("button", { name: /Add/i }));

      expect(screen.getByRole("button", { name: /Installing/ })).toBeTruthy();
    });

    it("validates non-empty input — button disabled when empty", async () => {
      mockFetchPiSettings.mockResolvedValueOnce({ packages: [], extensions: [], skills: [], prompts: [], themes: [] });

      render(<PiExtensionsManager addToast={addToast} />);

      await waitFor(() => {
        expect(screen.getByText("No packages configured.")).toBeTruthy();
      });

      // Button should be disabled when input is empty
      const addBtn = screen.getByRole("button", { name: /Add/i });
      expect(addBtn).toBeDisabled();
      expect(mockInstallPiPackage).not.toHaveBeenCalled();
    });
  });

  describe("Remove package", () => {
    it("calls updatePiSettings with package removed from list", async () => {
      mockFetchPiSettings.mockResolvedValueOnce(mockPiSettings);
      mockUpdatePiSettings.mockResolvedValueOnce({ success: true });
      mockFetchPiSettings.mockResolvedValueOnce({
        packages: [mockPiSettings.packages[1], mockPiSettings.packages[2]],
        extensions: [],
        skills: [],
        prompts: [],
        themes: [],
      });

      render(<PiExtensionsManager addToast={addToast} />);

      await waitFor(() => {
        expect(screen.getByText("pi-example")).toBeTruthy();
      });

      // Find the remove button for the first package (npm:pi-example)
      const removeButtons = screen.getAllByTestId("icon-trash");
      await userEvent.click(removeButtons[0]);

      await waitFor(() => {
        expect(mockUpdatePiSettings).toHaveBeenCalledWith({
          packages: [mockPiSettings.packages[1], mockPiSettings.packages[2]],
        });
      });
    });
  });

  describe("Remove resource", () => {
    it("calls updatePiSettings to remove an extension path", async () => {
      mockFetchPiSettings.mockResolvedValueOnce(mockPiSettings);
      mockUpdatePiSettings.mockResolvedValueOnce({ success: true });
      mockFetchPiSettings.mockResolvedValueOnce({
        ...mockPiSettings,
        extensions: [],
      });

      render(<PiExtensionsManager addToast={addToast} />);

      await waitFor(() => {
        expect(screen.getByText("/path/to/extension")).toBeTruthy();
      });

      // Find the remove button for the extension
      const removeButtons = screen.getAllByTestId("icon-x");
      await userEvent.click(removeButtons[0]);

      await waitFor(() => {
        expect(mockUpdatePiSettings).toHaveBeenCalledWith({
          extensions: [],
        });
      });
    });
  });

  describe("Expand/collapse object-form packages", () => {
    it("shows filter list when package with filters is expanded", async () => {
      mockFetchPiSettings.mockResolvedValueOnce(mockPiSettings);

      render(<PiExtensionsManager addToast={addToast} />);

      await waitFor(() => {
        expect(screen.getByText("pi-with-filters")).toBeTruthy();
      });

      // Find the expand button for pi-with-filters (the 3rd package, has filter-hint)
      const filterHint = screen.getByText(/2 ext/);
      const expandBtn = filterHint.closest(".pi-ext-package-card")?.querySelector(".pi-ext-expand-btn");
      expect(expandBtn).toBeTruthy();

      await userEvent.click(expandBtn!);

      await waitFor(() => {
        expect(screen.getByText("Extensions:", { exact: false })).toBeTruthy();
      });
      await waitFor(() => {
        expect(screen.getByText("ext-a")).toBeTruthy();
      });
      expect(screen.getByText("ext-b")).toBeTruthy();
      expect(screen.getByText("skill-1")).toBeTruthy();
    });

    it("hides filter list when collapsed", async () => {
      mockFetchPiSettings.mockResolvedValueOnce(mockPiSettings);

      render(<PiExtensionsManager addToast={addToast} />);

      await waitFor(() => {
        expect(screen.getByText("pi-with-filters")).toBeTruthy();
      });

      // Expand
      const filterHint = screen.getByText(/2 ext/);
      const expandBtn = filterHint.closest(".pi-ext-package-card")?.querySelector(".pi-ext-expand-btn");
      await userEvent.click(expandBtn!);

      await waitFor(() => {
        expect(screen.getByText("ext-a")).toBeTruthy();
      });

      // Collapse
      const chevronDown = screen.getAllByTestId("icon-chevron-down")[0];
      await userEvent.click(chevronDown);

      await waitFor(() => {
        expect(screen.queryByText("ext-a")).not.toBeTruthy();
      });
    });
  });

  describe("Error handling", () => {
    it("shows error toast when fetch fails", async () => {
      mockFetchPiSettings.mockRejectedValueOnce(new Error("Network error"));
      render(<PiExtensionsManager addToast={addToast} />);

      await waitFor(() => {
        expect(addToast).toHaveBeenCalledWith("Failed to load Pi settings: Network error", "error");
      });
    });

    it("shows error toast when update fails", async () => {
      mockFetchPiSettings.mockResolvedValueOnce(mockPiSettings);
      mockUpdatePiSettings.mockRejectedValueOnce(new Error("Update failed"));

      render(<PiExtensionsManager addToast={addToast} />);

      await waitFor(() => {
        expect(screen.getByText("pi-example")).toBeTruthy();
      });

      const removeButtons = screen.getAllByTestId("icon-trash");
      await userEvent.click(removeButtons[0]);

      await waitFor(() => {
        expect(addToast).toHaveBeenCalledWith("Failed to remove package: Update failed", "error");
      });
    });
  });
});