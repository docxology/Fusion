import { useCallback, useEffect, useState } from "react";
import { fetchModels, updateGlobalSettings, type ModelInfo } from "../api";

/**
 * Favorite model/provider state and actions consumed by the dashboard App shell.
 */
export interface UseFavoritesResult {
  availableModels: ModelInfo[];
  favoriteProviders: string[];
  favoriteModels: string[];
  toggleFavoriteProvider: (provider: string) => Promise<void>;
  toggleFavoriteModel: (modelId: string) => Promise<void>;
}

/**
 * Loads model catalog + favorites and exposes optimistic favorite toggles.
 */
export function useFavorites(): UseFavoritesResult {
  const [availableModels, setAvailableModels] = useState<ModelInfo[]>([]);
  const [favoriteProviders, setFavoriteProviders] = useState<string[]>([]);
  const [favoriteModels, setFavoriteModels] = useState<string[]>([]);

  useEffect(() => {
    fetchModels()
      .then((response) => {
        setAvailableModels(response.models);
        setFavoriteProviders(response.favoriteProviders);
        setFavoriteModels(response.favoriteModels);
      })
      .catch(() => {
        // Keep defaults on fetch failure.
      });
  }, []);

  const toggleFavoriteProvider = useCallback(async (provider: string) => {
    const currentFavorites = favoriteProviders;
    const isFavorite = currentFavorites.includes(provider);
    const nextFavorites = isFavorite
      ? currentFavorites.filter((p) => p !== provider)
      : [provider, ...currentFavorites];

    setFavoriteProviders(nextFavorites);

    try {
      await updateGlobalSettings({
        favoriteProviders: nextFavorites,
        favoriteModels,
      });
    } catch (error) {
      setFavoriteProviders(currentFavorites);
      throw error;
    }
  }, [favoriteProviders, favoriteModels]);

  const toggleFavoriteModel = useCallback(async (modelId: string) => {
    const currentFavorites = favoriteModels;
    const isFavorite = currentFavorites.includes(modelId);
    const nextFavorites = isFavorite
      ? currentFavorites.filter((id) => id !== modelId)
      : [modelId, ...currentFavorites];

    setFavoriteModels(nextFavorites);

    try {
      await updateGlobalSettings({
        favoriteProviders,
        favoriteModels: nextFavorites,
      });
    } catch (error) {
      setFavoriteModels(currentFavorites);
      throw error;
    }
  }, [favoriteModels, favoriteProviders]);

  return {
    availableModels,
    favoriteProviders,
    favoriteModels,
    toggleFavoriteProvider,
    toggleFavoriteModel,
  };
}
