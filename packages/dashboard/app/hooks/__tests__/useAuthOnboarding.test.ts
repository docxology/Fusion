import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useAuthOnboarding } from "../useAuthOnboarding";
import * as api from "../../api";

vi.mock("../../api", () => ({
  fetchAuthStatus: vi.fn(),
  fetchGlobalSettings: vi.fn(),
}));

const mockFetchAuthStatus = vi.mocked(api.fetchAuthStatus);
const mockFetchGlobalSettings = vi.mocked(api.fetchGlobalSettings);

describe("useAuthOnboarding", () => {
  const openModelOnboarding = vi.fn();
  const openSettings = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("opens onboarding when no providers are authenticated and onboarding is incomplete", async () => {
    mockFetchAuthStatus.mockResolvedValue({
      providers: [{ id: "openai", name: "OpenAI", authenticated: false }],
    });
    mockFetchGlobalSettings.mockResolvedValue({
      modelOnboardingComplete: false,
      defaultProvider: undefined,
      defaultModelId: undefined,
    } as never);

    renderHook(() =>
      useAuthOnboarding({
        projectId: "proj_123",
        openModelOnboarding,
        openSettings,
      }),
    );

    await waitFor(() => {
      expect(openModelOnboarding).toHaveBeenCalledTimes(1);
    });

    expect(openSettings).not.toHaveBeenCalled();
  });

  it("opens authentication settings when onboarding is complete but no providers are authenticated", async () => {
    mockFetchAuthStatus.mockResolvedValue({
      providers: [{ id: "anthropic", name: "Anthropic", authenticated: false }],
    });
    mockFetchGlobalSettings.mockResolvedValue({
      modelOnboardingComplete: true,
      defaultProvider: "anthropic",
      defaultModelId: "claude-sonnet-4-5",
    } as never);

    renderHook(() =>
      useAuthOnboarding({
        projectId: "proj_123",
        openModelOnboarding,
        openSettings,
      }),
    );

    await waitFor(() => {
      expect(openSettings).toHaveBeenCalledWith("authentication");
    });

    expect(openModelOnboarding).not.toHaveBeenCalled();
  });

  it("opens onboarding when providers are authenticated but default model is missing", async () => {
    mockFetchAuthStatus.mockResolvedValue({
      providers: [{ id: "anthropic", name: "Anthropic", authenticated: true }],
    });
    mockFetchGlobalSettings.mockResolvedValue({
      modelOnboardingComplete: false,
      defaultProvider: undefined,
      defaultModelId: undefined,
    } as never);

    renderHook(() =>
      useAuthOnboarding({
        projectId: "proj_123",
        openModelOnboarding,
        openSettings,
      }),
    );

    await waitFor(() => {
      expect(openModelOnboarding).toHaveBeenCalledTimes(1);
    });

    expect(openSettings).not.toHaveBeenCalled();
  });

  it("does nothing when auth status fetch fails", async () => {
    mockFetchAuthStatus.mockRejectedValueOnce(new Error("network"));

    renderHook(() =>
      useAuthOnboarding({
        projectId: "proj_123",
        openModelOnboarding,
        openSettings,
      }),
    );

    await waitFor(() => {
      expect(mockFetchAuthStatus).toHaveBeenCalledTimes(1);
    });

    expect(openModelOnboarding).not.toHaveBeenCalled();
    expect(openSettings).not.toHaveBeenCalled();
    expect(mockFetchGlobalSettings).not.toHaveBeenCalled();
  });
});
