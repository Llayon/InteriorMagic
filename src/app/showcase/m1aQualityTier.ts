// src/app/showcase/m1aQualityTier.ts
//
// Production-AND-dev experimental quality tier for the M1A private-showcase
// assets. Two distinct resolvers are exported:
//
//   resolveExperimentalM1AQualityTier     — DEV-only (isDev=false collapses to 'high')
//   resolveProductionM1AExperimentalTier   — production-gated by env var
//
// Both are pure functions with no DOM, no filesystem, no network access.
// They never throw on malformed input.
//
// In the default production build (env var unset), the production resolver
// returns null and the caller falls through to the existing showcase/v1
// path. Only an explicit `VITE_M1A_EXPERIMENTAL_QUALITY_TIER=1` build
// activates the production experiment — that build is itself a temporary
// delivery for the Safari iOS context-loss investigation.

export type M1AQualityTier = 'high' | 'medium' | 'low';

export const M1A_QUALITY_TIERS: readonly M1AQualityTier[] = ['high', 'medium', 'low'];

export const isM1AQualityTier = (value: unknown): value is M1AQualityTier =>
  typeof value === 'string' && (M1A_QUALITY_TIERS as readonly string[]).includes(value);

export interface ResolveM1AQualityTierOptions {
  /** The raw URL search string (window.location.search) or any other source
   *  of query-string-like input. Provided as a parameter so the resolver is
   *  fully testable without a DOM. */
  search?: string | null;
  /**
   * True iff running in a non-production build (Vite's import.meta.env.DEV
   * or Vitest's MODE === 'test'). The resolver is a no-op in production.
   */
  isDev: boolean;
}

/**
 * DEV-ONLY: resolves ?m1aQuality=high|medium|low in dev/test mode.
 * In production, always returns 'high' so the caller falls through to the
 * existing showcase/v1 path.
 *
 * Kept for backward compatibility with the prior dev-only experiment.
 * New code should prefer `resolveProductionM1AExperimentalTier` with the
 * explicit env-var gate.
 */
export const resolveExperimentalM1AQualityTier = ({
  search,
  isDev,
}: ResolveM1AQualityTierOptions): M1AQualityTier => {
  if (!isDev) return 'high';
  if (!search) return 'high';
  let params: URLSearchParams;
  try {
    const cleaned = search.startsWith('?') ? search : `?${search}`;
    params = new URLSearchParams(cleaned);
  } catch {
    return 'high';
  }
  const raw = params.get('m1aQuality');
  return isM1AQualityTier(raw) ? raw : 'high';
};

export interface ResolveProductionM1AExperimentalTierOptions {
  /** URL search string. */
  search?: string | null;
  /**
   * Whether the production experiment is enabled in this build. Controlled
   * by the `VITE_M1A_EXPERIMENTAL_QUALITY_TIER=1` env var. When false, the
   * resolver always returns null and the caller falls through to showcase/v1.
   * When true, only an EXPLICIT valid `?m1aQuality=high|medium|low` produces
   * a non-null result. Missing or invalid values still return null.
   */
  enabled: boolean;
  /**
   * Optional user-agent string. The resolver never reads this value —
   * the production tier selection is EXPLICIT QUERY ONLY and never
   * depends on browser classification. The argument exists purely so
   * callers cannot accidentally pass a UA and have it silently affect
   * the result; the resolver treats it as untrusted metadata.
   */
  userAgent?: string;
}

/**
 * Production-gated resolver. Strictly opt-in: when `enabled` is false (the
 * default production build), returns null and the caller uses showcase/v1.
 * When `enabled` is true, only an EXPLICIT valid ?m1aQuality produces a
 * non-null tier. Missing or invalid params return null. This guarantees:
 *
 *   - ordinary visitor with no query     → null → showcase/v1 (unchanged)
 *   - visitor with invalid value         → null → showcase/v1 (safe default)
 *   - visitor with explicit valid value  → tier → experimental prefix
 *
 * It is the caller's job to interpret null as "use the ordinary path".
 * No browser/UA sniffing happens here.
 */
export const resolveProductionM1AExperimentalTier = ({
  search,
  enabled,
}: ResolveProductionM1AExperimentalTierOptions): M1AQualityTier | null => {
  if (!enabled) return null;
  if (!search) return null;
  let params: URLSearchParams;
  try {
    const cleaned = search.startsWith('?') ? search : `?${search}`;
    params = new URLSearchParams(cleaned);
  } catch {
    return null;
  }
  const raw = params.get('m1aQuality');
  return isM1AQualityTier(raw) ? raw : null;
};
