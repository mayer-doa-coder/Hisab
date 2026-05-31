/**
 * networkMonitor.js — Connectivity detection and quality classification.
 *
 * The React Native equivalent of the browser's Background Sync API and
 * online/offline events. Responsibilities:
 *
 *  1. Detect transitions between online ↔ offline.
 *  2. Classify connection quality (WiFi / 4G / 3G / 2G) so the sync
 *     engine can throttle heavy payloads on slow links.
 *  3. Implement the Circuit Breaker pattern: if the backend returns
 *     repeated errors, the circuit opens and all sync attempts are
 *     suppressed for a cooldown period, preventing battery drain and
 *     spam against a degraded server.
 *  4. Notify registered listeners on state changes so MainDataShell
 *     can trigger a sync flush the moment connectivity is restored.
 *
 * Uses expo-network (lightweight, no native linking required).
 */

import * as Network from 'expo-network';

// ── Connection quality tiers ──────────────────────────────────────────────────

export const CONNECTION_QUALITY = Object.freeze({
  NONE:   'none',   // No network
  LOW:    'low',    // 2G / cellular edge — sync small batches only
  MEDIUM: 'medium', // 3G / weak 4G — normal batches, no large uploads
  HIGH:   'high',   // 4G / WiFi — full sync, images, voice packs
});

// expo-network NetworkStateType values
const NT = Network.NetworkStateType;

const classifyQuality = (state) => {
  if (!state?.isConnected || !state?.isInternetReachable) return CONNECTION_QUALITY.NONE;
  switch (state.type) {
    case NT.WIFI:
    case NT.ETHERNET:
      return CONNECTION_QUALITY.HIGH;
    case NT.CELLULAR: {
      // expo-network doesn't expose 2G/3G/4G subtypes on all platforms;
      // fall back to MEDIUM which is safe for normal sync.
      return CONNECTION_QUALITY.MEDIUM;
    }
    case NT.NONE:
    case NT.UNKNOWN:
    default:
      return CONNECTION_QUALITY.NONE;
  }
};

// ── Circuit breaker ───────────────────────────────────────────────────────────

const CIRCUIT = Object.freeze({
  CLOSED:    'closed',    // Normal operation
  OPEN:      'open',      // Suppressing requests — backend is unhealthy
  HALF_OPEN: 'half_open', // Probing with one request to test recovery
});

const CIRCUIT_CONFIG = Object.freeze({
  failureThreshold: 4,          // Open after 4 consecutive failures
  openDurationMs:  60_000,      // Stay open for 1 minute
  halfOpenTimeoutMs: 10_000,    // Half-open probe times out after 10s
});

// ── Monitor state ─────────────────────────────────────────────────────────────

let _state = {
  isOnline:   false,
  quality:    CONNECTION_QUALITY.NONE,
  circuit:    CIRCUIT.CLOSED,
  failCount:  0,
  openedAt:   null,
};

const _listeners = new Set();

const notify = () => {
  for (const fn of _listeners) {
    try { fn({ ..._state }); } catch {}
  }
};

// ── Public API ────────────────────────────────────────────────────────────────

/** Returns a snapshot of the current network state. */
export const getNetworkState = () => ({ ..._state });

/** Returns true if sync should proceed (online + circuit closed/half-open). */
export const isSyncAllowed = () => {
  if (!_state.isOnline) return false;
  if (_state.circuit === CIRCUIT.OPEN) return false;
  return true;
};

/** Returns true if only lightweight (small payload) syncs should run. */
export const isLowBandwidth = () =>
  _state.quality === CONNECTION_QUALITY.LOW;

/**
 * Register a listener called on every state change.
 * Returns an unsubscribe function.
 *
 * @param {(state: object) => void} fn
 * @returns {() => void}
 */
export const subscribe = (fn) => {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
};

// ── Circuit breaker controls ──────────────────────────────────────────────────

/** Called by the sync engine after a successful server response. */
export const recordSuccess = () => {
  if (_state.circuit === CIRCUIT.HALF_OPEN || _state.failCount > 0) {
    _state = { ..._state, circuit: CIRCUIT.CLOSED, failCount: 0, openedAt: null };
    notify();
  }
};

/** Called by the sync engine after a non-retryable server failure. */
export const recordFailure = () => {
  const nextFail = _state.failCount + 1;
  if (nextFail >= CIRCUIT_CONFIG.failureThreshold) {
    _state = { ..._state, circuit: CIRCUIT.OPEN, failCount: nextFail, openedAt: Date.now() };
    console.warn('[networkMonitor] Circuit OPENED — suppressing sync for', CIRCUIT_CONFIG.openDurationMs / 1000, 's');
  } else {
    _state = { ..._state, failCount: nextFail };
  }
  notify();
};

/** Periodic check: transition OPEN → HALF_OPEN when cooldown expires. */
const tickCircuit = () => {
  if (_state.circuit !== CIRCUIT.OPEN) return;
  if (!_state.openedAt) return;
  const elapsed = Date.now() - _state.openedAt;
  if (elapsed >= CIRCUIT_CONFIG.openDurationMs) {
    _state = { ..._state, circuit: CIRCUIT.HALF_OPEN };
    console.info('[networkMonitor] Circuit HALF_OPEN — probing backend');
    notify();
  }
};

// ── Initialisation ────────────────────────────────────────────────────────────

let _unsubscribe = null;
let _tickInterval = null;
let _initialized = false;

/**
 * Start monitoring network connectivity.
 * Safe to call multiple times — subsequent calls are no-ops.
 *
 * @param {(state: object) => void} [onStateChange] — optional immediate listener
 * @returns {() => void} cleanup function
 */
export const startNetworkMonitor = (onStateChange) => {
  if (_initialized) {
    if (onStateChange) subscribe(onStateChange);
    return () => {};
  }
  _initialized = true;

  // Fetch current state immediately
  Network.getNetworkStateAsync().then((networkState) => {
    const quality = classifyQuality(networkState);
    _state = {
      ..._state,
      isOnline: quality !== CONNECTION_QUALITY.NONE,
      quality,
    };
    notify();
  });

  // Subscribe to changes
  _unsubscribe = Network.addNetworkStateListener((networkState) => {
    const quality = classifyQuality(networkState);
    const wasOnline = _state.isOnline;
    const isOnline = quality !== CONNECTION_QUALITY.NONE;

    _state = { ..._state, isOnline, quality };

    if (!wasOnline && isOnline) {
      // Just came online — reset fail count and allow half-open probe
      _state = { ..._state, failCount: 0, circuit: CIRCUIT.CLOSED };
      console.info('[networkMonitor] Back online —', quality);
    } else if (wasOnline && !isOnline) {
      console.info('[networkMonitor] Went offline');
    }

    notify();
  });

  // Circuit breaker tick — check every 30 seconds
  _tickInterval = setInterval(tickCircuit, 30_000);

  if (onStateChange) subscribe(onStateChange);

  return () => {
    _unsubscribe?.remove?.();
    clearInterval(_tickInterval);
    _initialized = false;
  };
};
