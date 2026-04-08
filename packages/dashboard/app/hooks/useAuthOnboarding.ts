import { useEffect } from "react";
import { fetchAuthStatus, fetchGlobalSettings } from "../api";
import type { SectionId } from "../components/SettingsModal";

export interface UseAuthOnboardingOptions {
  projectId?: string;
  openModelOnboarding: () => void;
  openSettings: (section?: SectionId) => void;
}

/**
 * Runs auth/onboarding checks and opens the appropriate setup modal.
 */
export function useAuthOnboarding({
  projectId,
  openModelOnboarding,
  openSettings,
}: UseAuthOnboardingOptions): void {
  useEffect(() => {
    fetchAuthStatus()
      .then(({ providers }) => {
        const hasAuthenticatedProvider = providers.some((provider) => provider.authenticated);
        const needsSetup = providers.length > 0 && !hasAuthenticatedProvider;

        if (needsSetup || (providers.length > 0 && hasAuthenticatedProvider)) {
          fetchGlobalSettings()
            .then((globalSettings) => {
              const hasDefaultModel = !!(globalSettings.defaultProvider && globalSettings.defaultModelId);
              const setupIncomplete = !hasAuthenticatedProvider || !hasDefaultModel;

              if (!globalSettings.modelOnboardingComplete && setupIncomplete) {
                openModelOnboarding();
              } else if (!hasAuthenticatedProvider) {
                openSettings("authentication");
              }
            })
            .catch(() => {
              if (!hasAuthenticatedProvider) {
                openModelOnboarding();
              }
            });
        }
      })
      .catch(() => {
        // Fail silently (preserves existing App behavior).
      });
  }, [projectId, openModelOnboarding, openSettings]);
}
