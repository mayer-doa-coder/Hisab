/**
 * suggestionEngine.ts
 *
 * Smart Suggestions core — three models:
 *
 *  1. EMA (Exponential Moving Average)
 *     Forecasts next-week demand and computes restock quantity.
 *
 *  2. Safety Reorder Model
 *     Determines WHEN to reorder using safety-stock theory
 *     (95 % service level, 3-day assumed lead time).
 *
 *  3. First-Order Markov Chain
 *     Classifies each historical week as LOW / MEDIUM / HIGH,
 *     builds per-product transition matrices, predicts next state,
 *     and finds "related products" via cosine similarity of matrices.
 */

import { DemandState, Product, WeeklySale } from "../types";

// ─── Constants ────────────────────────────────────────────────────────────────

const STATES: DemandState[] = ["LOW", "MEDIUM", "HIGH"];
const EMA_ALPHA = 0.3; // EMA smoothing factor
const LEAD_TIME_DAYS = 3; // Assumed supplier lead time in days
const SERVICE_LEVEL_Z = 1.65; // Z-score for 95 % service level
const TARGET_COVER_WEEKS = 3; // Target weeks of forward stock coverage
const RELATED_THRESHOLD = 0.7; // Min cosine similarity for "related product"
const RELATED_TOP_K = 3; // Max related products to surface

// ─── Matrix helpers ───────────────────────────────────────────────────────────

export type TransitionMatrix = Record<DemandState, Record<DemandState, number>>;

function emptyMatrix(): TransitionMatrix {
  return {
    LOW: { LOW: 0, MEDIUM: 0, HIGH: 0 },
    MEDIUM: { LOW: 0, MEDIUM: 0, HIGH: 0 },
    HIGH: { LOW: 0, MEDIUM: 0, HIGH: 0 },
  };
}

// ─── Statistical helpers ──────────────────────────────────────────────────────

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function sampleStd(arr: number[]): number {
  if (arr.length <= 1) return 0;
  const m = mean(arr);
  const variance = arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(variance);
}

function percentile(sortedArr: number[], p: number): number {
  if (sortedArr.length === 0) return 0;
  const idx = (p / 100) * (sortedArr.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedArr[lo];
  return sortedArr[lo] + (sortedArr[hi] - sortedArr[lo]) * (idx - lo);
}

// ─── EMA ─────────────────────────────────────────────────────────────────────

/**
 * Compute Exponential Moving Average over a time-series.
 * Returns the next-period forecast (the last EMA value).
 *
 *   EMA_t = α × x_t + (1 − α) × EMA_{t−1}
 */
export function computeEMA(values: number[], alpha = EMA_ALPHA): number {
  if (values.length === 0) return 0;
  let ema = values[0];
  for (let i = 1; i < values.length; i++) {
    ema = alpha * values[i] + (1 - alpha) * ema;
  }
  return ema;
}

// ─── Safety reorder model ─────────────────────────────────────────────────────

export interface SafetyStockResult {
  avg_weekly_demand: number;
  demand_std: number;
  safety_stock: number; // σ units to buffer against demand variability
  reorder_point: number; // Trigger reorder when stock ≤ reorder_point
}

/**
 * Compute safety stock and reorder point from weekly demand history.
 *
 *   safety_stock  = Z × σ_demand × √(lead_time_weeks)
 *   reorder_point = avg_demand × lead_time_weeks + safety_stock
 */
export function computeSafetyStockModel(
  weeklyDemandHistory: number[],
  leadTimeDays = LEAD_TIME_DAYS,
): SafetyStockResult {
  const avg = mean(weeklyDemandHistory);
  const std = sampleStd(weeklyDemandHistory);
  const leadTimeWeeks = leadTimeDays / 7;
  const safety = Math.ceil(SERVICE_LEVEL_Z * std * Math.sqrt(leadTimeWeeks));
  const rop = Math.ceil(avg * leadTimeWeeks + safety);
  return {
    avg_weekly_demand: Math.round(avg * 10) / 10,
    demand_std: Math.round(std * 10) / 10,
    safety_stock: Math.max(0, safety),
    reorder_point: Math.max(0, rop),
  };
}

// ─── Demand state classification ─────────────────────────────────────────────

/**
 * Classify weekly unit counts into LOW / MEDIUM / HIGH using
 * per-product tercile thresholds (p33 / p67).
 */
export function classifyDemandStates(weeklySales: WeeklySale[]): DemandState[] {
  if (weeklySales.length === 0) return [];
  const units = weeklySales.map((w) => w.units_sold);
  const sorted = [...units].sort((a, b) => a - b);
  const p33 = percentile(sorted, 33);
  const p67 = percentile(sorted, 67);
  return units.map((u): DemandState => {
    if (u <= p33) return "LOW";
    if (u >= p67) return "HIGH";
    return "MEDIUM";
  });
}

// ─── Markov chain ─────────────────────────────────────────────────────────────

/**
 * Build a first-order Markov transition probability matrix
 * from a sequence of demand states.
 * If a state has no outgoing observations, a uniform prior (1/3) is used.
 */
export function buildMarkovMatrix(states: DemandState[]): TransitionMatrix {
  const counts = emptyMatrix();
  const rowTotals: Record<DemandState, number> = { LOW: 0, MEDIUM: 0, HIGH: 0 };

  for (let i = 0; i < states.length - 1; i++) {
    const from = states[i];
    const to = states[i + 1];
    counts[from][to]++;
    rowTotals[from]++;
  }

  const matrix = emptyMatrix();
  for (const from of STATES) {
    const total = rowTotals[from];
    if (total === 0) {
      matrix[from] = { LOW: 1 / 3, MEDIUM: 1 / 3, HIGH: 1 / 3 };
    } else {
      for (const to of STATES) {
        matrix[from][to] = counts[from][to] / total;
      }
    }
  }
  return matrix;
}

/**
 * Predict the next state from current state using the Markov matrix.
 * Returns the most-probable next state and its probability.
 */
export function predictNextState(
  currentState: DemandState,
  matrix: TransitionMatrix,
): { state: DemandState; probability: number } {
  const row = matrix[currentState];
  let bestState: DemandState = "MEDIUM";
  let bestProb = -1;
  for (const s of STATES) {
    if (row[s] > bestProb) {
      bestProb = row[s];
      bestState = s;
    }
  }
  return { state: bestState, probability: bestProb };
}

// ─── Related products (Markov matrix cosine similarity) ──────────────────────

function flattenMatrix(m: TransitionMatrix): number[] {
  return STATES.flatMap((r) => STATES.map((c) => m[r][c]));
}

function cosineSimilarity(a: number[], b: number[]): number {
  const dot = a.reduce((s, v, i) => s + v * b[i], 0);
  const normA = Math.sqrt(a.reduce((s, v) => s + v * v, 0));
  const normB = Math.sqrt(b.reduce((s, v) => s + v * v, 0));
  if (normA === 0 || normB === 0) return 0;
  return dot / (normA * normB);
}

/**
 * Return the IDs of products whose Markov transition matrices are
 * most similar to the target product (first-order Markov similarity).
 *
 * "When restocking product A, also consider these products — their
 *  demand moves in the same pattern."
 */
export function findRelatedProducts(
  targetId: number,
  pool: { product_id: number; transition_matrix: TransitionMatrix }[],
  topK = RELATED_TOP_K,
  minSimilarity = RELATED_THRESHOLD,
): number[] {
  const target = pool.find((a) => a.product_id === targetId);
  if (!target) return [];
  const targetVec = flattenMatrix(target.transition_matrix);

  return pool
    .filter((a) => a.product_id !== targetId)
    .map((a) => ({
      id: a.product_id,
      sim: cosineSimilarity(targetVec, flattenMatrix(a.transition_matrix)),
    }))
    .filter((x) => x.sim >= minSimilarity)
    .sort((a, b) => b.sim - a.sim)
    .slice(0, topK)
    .map((x) => x.id);
}

// ─── ProductAnalysis ──────────────────────────────────────────────────────────

export interface ProductAnalysis {
  product_id: number;
  product_name: string;
  current_stock: number;
  low_stock_threshold: number;
  price: number;
  cost_price: number | null;

  // EMA
  ema_weekly_demand: number; // EMA-smoothed weekly demand forecast
  restock_qty: number; // Units to order (EMA × cover_weeks − stock)

  // Safety reorder model
  avg_weekly_demand: number;
  demand_std: number;
  safety_stock: number;
  reorder_point: number;
  should_reorder: boolean; // stock ≤ reorder_point
  days_of_stock_left: number; // stock / daily_avg (≈ stock / (avg/7))

  // Markov
  classified_states: DemandState[];
  current_state: DemandState | null;
  predicted_state: DemandState | null;
  transition_matrix: TransitionMatrix;
  conviction: number; // P(predicted_state | current_state)

  // Related products
  related_product_ids: number[];
}

function analyseProduct(
  product: Product,
  history: WeeklySale[], // sorted oldest → newest
): Omit<ProductAnalysis, "related_product_ids"> {
  const units = history.map((w) => w.units_sold);

  // EMA
  const ema = computeEMA(units);

  // Safety stock
  const sm = computeSafetyStockModel(units);

  // When there is no sales history yet, fall back to the user-set
  // low_stock_threshold as the effective reorder point so that
  // products already below threshold always surface a suggestion.
  const effectiveROP = Math.max(sm.reorder_point, product.low_stock_threshold);

  // When EMA has no history use threshold-based restock target instead.
  const effectiveRestockQty =
    ema > 0
      ? Math.max(0, Math.ceil(ema * TARGET_COVER_WEEKS) - product.stock)
      : Math.max(0, product.low_stock_threshold * 2 - product.stock);

  const daysLeft =
    sm.avg_weekly_demand > 0
      ? Math.round((product.stock / sm.avg_weekly_demand) * 7)
      : 999;

  // Markov
  const classifiedStates = classifyDemandStates(history);
  const matrix = buildMarkovMatrix(classifiedStates);
  const currentState =
    classifiedStates.length > 0
      ? classifiedStates[classifiedStates.length - 1]
      : null;
  const prediction = currentState
    ? predictNextState(currentState, matrix)
    : null;

  return {
    product_id: product.id,
    product_name: product.name,
    current_stock: product.stock,
    low_stock_threshold: product.low_stock_threshold,
    price: product.price,
    cost_price: product.cost_price,
    ema_weekly_demand: Math.round(ema * 10) / 10,
    restock_qty: effectiveRestockQty,
    avg_weekly_demand: sm.avg_weekly_demand,
    demand_std: sm.demand_std,
    safety_stock: sm.safety_stock,
    reorder_point: effectiveROP,
    should_reorder: product.stock <= effectiveROP,
    days_of_stock_left: daysLeft,
    classified_states: classifiedStates,
    current_state: currentState,
    predicted_state: prediction?.state ?? null,
    transition_matrix: matrix,
    conviction: Math.round((prediction?.probability ?? 0) * 100) / 100,
  };
}

// ─── Suggestion types ─────────────────────────────────────────────────────────

export type SuggestionKind =
  | "critical_restock" // Reorder NOW: stock low AND demand rising/high
  | "restock" // Reorder soon: stock ≤ reorder_point
  | "trending" // Predicted HIGH next week, plan ahead
  | "slow_mover" // Demand LOW→LOW, avoid over-stocking
  | "price_review"; // High demand + thin margin

export interface Suggestion {
  product_id: number;
  product_name: string;
  kind: SuggestionKind;
  priority: number; // higher = first in list
  title_bn: string;
  title_en: string;
  detail: string;
  restock_qty: number;
  days_of_stock_left: number;
  reorder_point: number;
  current_stock: number;
  safety_stock: number;
  ema_demand: number;
  predicted_state: DemandState | null;
  conviction: number;
  related_product_ids: number[];
  related_product_names: string[];
}

function buildSuggestions(
  analyses: ProductAnalysis[],
  nameMap: Map<number, string>,
): Suggestion[] {
  const list: Suggestion[] = [];

  for (const a of analyses) {
    const relatedNames = a.related_product_ids.map(
      (id) => nameMap.get(id) ?? `#${id}`,
    );

    const isCritical =
      a.should_reorder &&
      (a.predicted_state === "HIGH" || a.days_of_stock_left <= 3);

    if (isCritical) {
      list.push({
        product_id: a.product_id,
        product_name: a.product_name,
        kind: "critical_restock",
        priority: 100 - Math.min(a.days_of_stock_left, 99),
        title_bn: "জরুরি স্টক করুন",
        title_en: "Critical Restock",
        detail:
          `${a.days_of_stock_left} দিনের স্টক বাকি। ` +
          (a.predicted_state
            ? `পূর্বাভাস: ${a.predicted_state} চাহিদা (${Math.round(a.conviction * 100)}%)। `
            : "") +
          `${a.restock_qty} ইউনিট অর্ডার দেওয়ার পরামর্শ।`,
        restock_qty: a.restock_qty,
        days_of_stock_left: a.days_of_stock_left,
        reorder_point: a.reorder_point,
        current_stock: a.current_stock,
        safety_stock: a.safety_stock,
        ema_demand: a.ema_weekly_demand,
        predicted_state: a.predicted_state,
        conviction: a.conviction,
        related_product_ids: a.related_product_ids,
        related_product_names: relatedNames,
      });
    } else if (a.should_reorder) {
      list.push({
        product_id: a.product_id,
        product_name: a.product_name,
        kind: "restock",
        priority: 50 - Math.min(a.days_of_stock_left, 49),
        title_bn: "স্টক কম",
        title_en: "Restock Soon",
        detail:
          `রি-অর্ডার পয়েন্টে পৌঁছেছে (বর্তমান: ${a.current_stock}, সীমা: ${a.reorder_point})। ` +
          (a.ema_weekly_demand > 0
            ? `EMA সাপ্তাহিক চাহিদা ~${a.ema_weekly_demand} ইউনিট। `
            : "") +
          `${a.restock_qty} ইউনিট অর্ডার করুন।`,
        restock_qty: a.restock_qty,
        days_of_stock_left: a.days_of_stock_left,
        reorder_point: a.reorder_point,
        current_stock: a.current_stock,
        safety_stock: a.safety_stock,
        ema_demand: a.ema_weekly_demand,
        predicted_state: a.predicted_state,
        conviction: a.conviction,
        related_product_ids: a.related_product_ids,
        related_product_names: relatedNames,
      });
    } else if (a.predicted_state === "HIGH" && a.conviction >= 0.55) {
      list.push({
        product_id: a.product_id,
        product_name: a.product_name,
        kind: "trending",
        priority: 30,
        title_bn: "চাহিদা বাড়ছে",
        title_en: "Demand Trending Up",
        detail:
          `মার্কভ মডেল: আগামী সপ্তাহে বেশি চাহিদার সম্ভাবনা ${Math.round(a.conviction * 100)}%। ` +
          `আগাম ${a.restock_qty} ইউনিট স্টক রাখার পরামর্শ।`,
        restock_qty: a.restock_qty,
        days_of_stock_left: a.days_of_stock_left,
        reorder_point: a.reorder_point,
        current_stock: a.current_stock,
        safety_stock: a.safety_stock,
        ema_demand: a.ema_weekly_demand,
        predicted_state: a.predicted_state,
        conviction: a.conviction,
        related_product_ids: a.related_product_ids,
        related_product_names: relatedNames,
      });
    } else if (
      a.predicted_state === "LOW" &&
      a.current_state === "LOW" &&
      a.conviction >= 0.6
    ) {
      list.push({
        product_id: a.product_id,
        product_name: a.product_name,
        kind: "slow_mover",
        priority: 10,
        title_bn: "ধীর বিক্রয়",
        title_en: "Slow Mover",
        detail:
          `চাহিদা কম এবং পরবর্তী সপ্তাহেও কম থাকার সম্ভাবনা ${Math.round(a.conviction * 100)}%। ` +
          `অতিরিক্ত স্টক কেনা এড়িয়ে চলুন।`,
        restock_qty: 0,
        days_of_stock_left: a.days_of_stock_left,
        reorder_point: a.reorder_point,
        current_stock: a.current_stock,
        safety_stock: a.safety_stock,
        ema_demand: a.ema_weekly_demand,
        predicted_state: a.predicted_state,
        conviction: a.conviction,
        related_product_ids: a.related_product_ids,
        related_product_names: relatedNames,
      });
    }

    // Price review: high demand + thin margin (<10 %)
    if (
      a.cost_price !== null &&
      a.price > 0 &&
      (a.price - a.cost_price) / a.price < 0.1 &&
      (a.predicted_state === "HIGH" || a.current_state === "HIGH")
    ) {
      const marginPct = Math.round(
        ((a.price - (a.cost_price ?? 0)) / a.price) * 100,
      );
      list.push({
        product_id: a.product_id,
        product_name: a.product_name,
        kind: "price_review",
        priority: 20,
        title_bn: "দাম পর্যালোচনা",
        title_en: "Price Review",
        detail:
          `চাহিদা বেশি কিন্তু মার্জিন মাত্র ${marginPct}%। ` +
          `বিক্রয় মূল্য বাড়ানো বিবেচনা করুন।`,
        restock_qty: 0,
        days_of_stock_left: a.days_of_stock_left,
        reorder_point: a.reorder_point,
        current_stock: a.current_stock,
        safety_stock: a.safety_stock,
        ema_demand: a.ema_weekly_demand,
        predicted_state: a.predicted_state,
        conviction: a.conviction,
        related_product_ids: a.related_product_ids,
        related_product_names: relatedNames,
      });
    }
  }

  return list.sort((a, b) => b.priority - a.priority);
}

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * Run the full Smart Suggestions pipeline.
 *
 * @param products       All products (from productService.getProducts)
 * @param allWeeklySales All rows from weekly_sales (any product)
 */
export function runSuggestionEngine(
  products: Product[],
  allWeeklySales: WeeklySale[],
): { suggestions: Suggestion[]; analyses: ProductAnalysis[] } {
  if (products.length === 0) return { suggestions: [], analyses: [] };

  // Group weekly history per product, oldest → newest
  const byProduct = new Map<number, WeeklySale[]>();
  for (const ws of allWeeklySales) {
    if (!byProduct.has(ws.product_id)) byProduct.set(ws.product_id, []);
    byProduct.get(ws.product_id)!.push(ws);
  }
  for (const arr of byProduct.values()) {
    arr.sort((a, b) => a.week_start.localeCompare(b.week_start));
  }

  // Phase 1 — per-product analysis (without related products)
  const partial = products.map((p) =>
    analyseProduct(p, byProduct.get(p.id) ?? []),
  );

  // Phase 2 — related products via Markov similarity
  const nameMap = new Map(products.map((p) => [p.id, p.name]));
  const analyses: ProductAnalysis[] = partial.map((a) => ({
    ...a,
    related_product_ids: findRelatedProducts(a.product_id, partial),
  }));

  const suggestions = buildSuggestions(analyses, nameMap);
  return { suggestions, analyses };
}
