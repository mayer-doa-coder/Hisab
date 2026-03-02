import { create } from "zustand";
import { dbReady } from "../services/database";
import { toMessage } from "../services/errors";
import { productService } from "../services/productService";
import {
    ProductAnalysis,
    Suggestion,
    runSuggestionEngine,
} from "../services/suggestionEngine";
import { Product, WeeklySale } from "../types";

export interface SuggestionState {
  suggestions: Suggestion[];
  analyses: ProductAnalysis[];
  isLoading: boolean;
  error: string | null;
  lastUpdated: string | null;
  load: () => Promise<void>;
  clearError: () => void;
}

export const useSuggestionStore = create<SuggestionState>((set, get) => ({
  suggestions: [],
  analyses: [],
  isLoading: false,
  error: null,
  lastUpdated: null,

  async load() {
    if (get().isLoading) return;
    set({ isLoading: true, error: null });
    try {
      await dbReady;
      const products: Product[] = productService.getProducts();
      const weeklySales: WeeklySale[] = productService.getWeeklySales();
      const { suggestions, analyses } = runSuggestionEngine(
        products,
        weeklySales,
      );
      set({
        suggestions,
        analyses,
        isLoading: false,
        lastUpdated: new Date().toISOString(),
      });
    } catch (err) {
      set({ isLoading: false, error: toMessage(err) });
    }
  },

  clearError() {
    set({ error: null });
  },
}));
