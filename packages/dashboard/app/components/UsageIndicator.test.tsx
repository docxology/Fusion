import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { UsageIndicator } from "./UsageIndicator";
import * as useUsageDataModule from "../hooks/useUsageData";
import type { ProviderUsage } from "../api";

// Mock the useUsageData hook
vi.mock("../hooks/useUsageData", () => ({
  useUsageData: vi.fn(),
}));

const mockUseUsageData = vi.mocked(useUsageDataModule.useUsageData);

describe("UsageIndicator", () => {
  const mockOnClose = vi.fn();
  const mockRefresh = vi.fn();

  const mockProviders: ProviderUsage[] = [
    {
      name: "Anthropic",
      icon: "🅰️",
      status: "ok",
      plan: "Pro",
      email: "user@example.com",
      windows: [
        {
          label: "Session (5h)",
          percentUsed: 45,
          percentLeft: 55,
          resetText: "resets in 2h 15m",
          resetMs: 8100000,
        },
        {
          label: "Weekly",
          percentUsed: 30,
          percentLeft: 70,
          resetText: "resets in 3d",
          resetMs: 259200000,
        },
      ],
    },
    {
      name: "OpenAI",
      icon: "🤖",
      status: "ok",
      windows: [
        {
          label: "Hourly",
          percentUsed: 75,
          percentLeft: 25,
          resetText: "resets in 45m",
          resetMs: 2700000,
        },
      ],
    },
    {
      name: "Google",
      icon: "🔍",
      status: "no-auth",
      windows: [],
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders nothing when isOpen is false", () => {
    mockUseUsageData.mockReturnValue({
      providers: [],
      loading: false,
      error: null,
      lastUpdated: null,
      refresh: mockRefresh,
    });

    const { container } = render(
      <UsageIndicator isOpen={false} onClose={mockOnClose} />
    );

    expect(container.firstChild).toBeNull();
  });

  it("renders loading skeleton when loading and no providers", () => {
    mockUseUsageData.mockReturnValue({
      providers: [],
      loading: true,
      error: null,
      lastUpdated: null,
      refresh: mockRefresh,
    });

    render(<UsageIndicator isOpen={true} onClose={mockOnClose} />);

    // Check for skeleton elements
    const skeletonElements = document.querySelectorAll(".usage-skeleton");
    expect(skeletonElements.length).toBeGreaterThan(0);
  });

  it("renders providers with usage data", () => {
    mockUseUsageData.mockReturnValue({
      providers: mockProviders,
      loading: false,
      error: null,
      lastUpdated: new Date(),
      refresh: mockRefresh,
    });

    render(<UsageIndicator isOpen={true} onClose={mockOnClose} />);

    // Check for provider names
    expect(screen.getByText("Anthropic")).toBeInTheDocument();
    expect(screen.getByText("OpenAI")).toBeInTheDocument();
    expect(screen.getByText("Google")).toBeInTheDocument();

    // Check for status badges
    expect(screen.getByText("Connected")).toBeInTheDocument();
    expect(screen.getByText("Not configured")).toBeInTheDocument();

    // Check for usage windows
    expect(screen.getByText("Session (5h)")).toBeInTheDocument();
    expect(screen.getByText("Weekly")).toBeInTheDocument();
    expect(screen.getByText("Hourly")).toBeInTheDocument();
  });

  it("displays correct percentage and progress bars", () => {
    mockUseUsageData.mockReturnValue({
      providers: mockProviders,
      loading: false,
      error: null,
      lastUpdated: new Date(),
      refresh: mockRefresh,
    });

    render(<UsageIndicator isOpen={true} onClose={mockOnClose} />);

    // Check for percentage text
    expect(screen.getByText("45% used")).toBeInTheDocument();
    expect(screen.getByText("55% left")).toBeInTheDocument();
    expect(screen.getByText("75% used")).toBeInTheDocument();

    // Check progress bars have correct widths
    const progressBars = document.querySelectorAll(".usage-progress-fill");
    expect(progressBars.length).toBe(3);

    // Check the width style for the first progress bar (45%)
    const firstBar = progressBars[0] as HTMLElement;
    expect(firstBar.style.width).toBe("45%");
  });

  it("applies correct color classes for usage levels", () => {
    const providersWithDifferentUsage: ProviderUsage[] = [
      {
        name: "LowUsage",
        icon: "✅",
        status: "ok",
        windows: [
          { label: "Low", percentUsed: 50, percentLeft: 50, resetText: null },
        ],
      },
      {
        name: "MediumUsage",
        icon: "⚠️",
        status: "ok",
        windows: [
          { label: "Medium", percentUsed: 80, percentLeft: 20, resetText: null },
        ],
      },
      {
        name: "HighUsage",
        icon: "🚨",
        status: "ok",
        windows: [
          { label: "High", percentUsed: 95, percentLeft: 5, resetText: null },
        ],
      },
    ];

    mockUseUsageData.mockReturnValue({
      providers: providersWithDifferentUsage,
      loading: false,
      error: null,
      lastUpdated: new Date(),
      refresh: mockRefresh,
    });

    render(<UsageIndicator isOpen={true} onClose={mockOnClose} />);

    const progressBars = document.querySelectorAll(".usage-progress-fill");
    expect(progressBars.length).toBe(3);

    // Check color classes
    expect(progressBars[0]).toHaveClass("usage-progress-fill--low");
    expect(progressBars[1]).toHaveClass("usage-progress-fill--medium");
    expect(progressBars[2]).toHaveClass("usage-progress-fill--high");
  });

  it("displays error state when error occurs and no providers", () => {
    mockUseUsageData.mockReturnValue({
      providers: [],
      loading: false,
      error: "Failed to fetch",
      lastUpdated: null,
      refresh: mockRefresh,
    });

    render(<UsageIndicator isOpen={true} onClose={mockOnClose} />);

    expect(screen.getByText("Failed to load usage data")).toBeInTheDocument();
    expect(screen.getByText("Failed to fetch")).toBeInTheDocument();
    expect(screen.getByText("Retry")).toBeInTheDocument();
  });

  it("displays empty state when no providers configured", () => {
    mockUseUsageData.mockReturnValue({
      providers: [],
      loading: false,
      error: null,
      lastUpdated: null,
      refresh: mockRefresh,
    });

    render(<UsageIndicator isOpen={true} onClose={mockOnClose} />);

    expect(screen.getByText("No AI providers configured")).toBeInTheDocument();
    expect(
      screen.getByText("Configure authentication in Settings to see usage data.")
    ).toBeInTheDocument();
  });

  it("calls refresh when refresh button clicked", async () => {
    mockUseUsageData.mockReturnValue({
      providers: mockProviders,
      loading: false,
      error: null,
      lastUpdated: new Date(),
      refresh: mockRefresh,
    });

    render(<UsageIndicator isOpen={true} onClose={mockOnClose} />);

    const refreshBtn = screen.getByTestId("usage-refresh-btn");
    fireEvent.click(refreshBtn);

    await waitFor(() => {
      expect(mockRefresh).toHaveBeenCalledTimes(1);
    });
  });

  it("calls onClose when close button clicked", () => {
    mockUseUsageData.mockReturnValue({
      providers: mockProviders,
      loading: false,
      error: null,
      lastUpdated: new Date(),
      refresh: mockRefresh,
    });

    render(<UsageIndicator isOpen={true} onClose={mockOnClose} />);

    const closeBtn = screen.getByTestId("usage-modal-close");
    fireEvent.click(closeBtn);

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when overlay clicked", () => {
    mockUseUsageData.mockReturnValue({
      providers: mockProviders,
      loading: false,
      error: null,
      lastUpdated: new Date(),
      refresh: mockRefresh,
    });

    render(<UsageIndicator isOpen={true} onClose={mockOnClose} />);

    const overlay = screen.getByTestId("usage-modal-overlay");
    fireEvent.click(overlay);

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when Escape key pressed", () => {
    mockUseUsageData.mockReturnValue({
      providers: mockProviders,
      loading: false,
      error: null,
      lastUpdated: new Date(),
      refresh: mockRefresh,
    });

    render(<UsageIndicator isOpen={true} onClose={mockOnClose} />);

    fireEvent.keyDown(document, { key: "Escape" });

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it("displays last updated time", () => {
    const lastUpdated = new Date("2024-01-15T10:30:00");

    mockUseUsageData.mockReturnValue({
      providers: mockProviders,
      loading: false,
      error: null,
      lastUpdated,
      refresh: mockRefresh,
    });

    render(<UsageIndicator isOpen={true} onClose={mockOnClose} />);

    expect(screen.getByText(/Last updated:/)).toBeInTheDocument();
  });

  it("displays provider error messages", () => {
    const providersWithError: ProviderUsage[] = [
      {
        name: "ErrorProvider",
        icon: "❌",
        status: "error",
        error: "Authentication expired",
        windows: [],
      },
    ];

    mockUseUsageData.mockReturnValue({
      providers: providersWithError,
      loading: false,
      error: null,
      lastUpdated: new Date(),
      refresh: mockRefresh,
    });

    render(<UsageIndicator isOpen={true} onClose={mockOnClose} />);

    expect(screen.getByText("Error")).toBeInTheDocument();
    expect(screen.getByText("Authentication expired")).toBeInTheDocument();
  });

  it("displays provider plan and email info", () => {
    mockUseUsageData.mockReturnValue({
      providers: mockProviders,
      loading: false,
      error: null,
      lastUpdated: new Date(),
      refresh: mockRefresh,
    });

    render(<UsageIndicator isOpen={true} onClose={mockOnClose} />);

    expect(screen.getByText("Pro")).toBeInTheDocument();
    expect(screen.getByText("user@example.com")).toBeInTheDocument();
  });

  it("displays reset timer text", () => {
    mockUseUsageData.mockReturnValue({
      providers: mockProviders,
      loading: false,
      error: null,
      lastUpdated: new Date(),
      refresh: mockRefresh,
    });

    render(<UsageIndicator isOpen={true} onClose={mockOnClose} />);

    expect(screen.getByText("resets in 2h 15m")).toBeInTheDocument();
    expect(screen.getByText("resets in 3d")).toBeInTheDocument();
    expect(screen.getByText("resets in 45m")).toBeInTheDocument();
  });

  it("displays 'no usage data' message for connected provider without windows", () => {
    const providerWithoutWindows: ProviderUsage[] = [
      {
        name: "EmptyProvider",
        icon: "📊",
        status: "ok",
        windows: [],
      },
    ];

    mockUseUsageData.mockReturnValue({
      providers: providerWithoutWindows,
      loading: false,
      error: null,
      lastUpdated: new Date(),
      refresh: mockRefresh,
    });

    render(<UsageIndicator isOpen={true} onClose={mockOnClose} />);

    expect(screen.getByText("No usage data available")).toBeInTheDocument();
  });

  it("passes autoRefresh option based on isOpen prop", () => {
    mockUseUsageData.mockReturnValue({
      providers: [],
      loading: false,
      error: null,
      lastUpdated: null,
      refresh: mockRefresh,
    });

    // When isOpen is true, autoRefresh should be true
    const { unmount } = render(<UsageIndicator isOpen={true} onClose={mockOnClose} />);

    expect(mockUseUsageData).toHaveBeenCalledWith({ autoRefresh: true });

    unmount();

    // Reset mock
    mockUseUsageData.mockClear();

    // Component not rendered when isOpen is false, so this is the important case
    render(<UsageIndicator isOpen={false} onClose={mockOnClose} />);

    // When isOpen is false, the hook should not be called at all
    // because the component returns null before the hook
    expect(mockUseUsageData).not.toHaveBeenCalled();
  });

  it("disables refresh button when loading", () => {
    mockUseUsageData.mockReturnValue({
      providers: mockProviders,
      loading: true,
      error: null,
      lastUpdated: new Date(),
      refresh: mockRefresh,
    });

    render(<UsageIndicator isOpen={true} onClose={mockOnClose} />);

    const refreshBtn = screen.getByTestId("usage-refresh-btn");
    expect(refreshBtn).toBeDisabled();
  });

  it("renders with correct ARIA attributes", () => {
    mockUseUsageData.mockReturnValue({
      providers: mockProviders,
      loading: false,
      error: null,
      lastUpdated: new Date(),
      refresh: mockRefresh,
    });

    render(<UsageIndicator isOpen={true} onClose={mockOnClose} />);

    // Check for progressbar role
    const progressBars = screen.getAllByRole("progressbar");
    expect(progressBars.length).toBeGreaterThan(0);

    // Check first progressbar has correct aria attributes
    const firstBar = progressBars[0];
    expect(firstBar).toHaveAttribute("aria-valuenow", "45");
    expect(firstBar).toHaveAttribute("aria-valuemin", "0");
    expect(firstBar).toHaveAttribute("aria-valuemax", "100");
    expect(firstBar).toHaveAttribute("aria-label");
  });
});
