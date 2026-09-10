import { describe, expect, it } from 'vitest';
import {
  isM1AQualityTier,
  M1A_QUALITY_TIERS,
  resolveExperimentalM1AQualityTier,
  resolveProductionM1AExperimentalTier,
} from './m1aQualityTier';

describe('resolveExperimentalM1AQualityTier', () => {
  it('returns "high" in production regardless of query string (invariant #3)', () => {
    expect(resolveExperimentalM1AQualityTier({ search: '?m1aQuality=medium', isDev: false })).toBe('high');
    expect(resolveExperimentalM1AQualityTier({ search: '?m1aQuality=low', isDev: false })).toBe('high');
    expect(resolveExperimentalM1AQualityTier({ search: '?m1aQuality=garbage', isDev: false })).toBe('high');
    expect(resolveExperimentalM1AQualityTier({ search: null, isDev: false })).toBe('high');
  });

  it('resolves "medium" only in dev (invariant #1)', () => {
    // In dev: medium is honored.
    expect(resolveExperimentalM1AQualityTier({ search: '?m1aQuality=medium', isDev: true })).toBe('medium');
    expect(resolveExperimentalM1AQualityTier({ search: '?showcase=1&deviceQa=1&m1aQuality=medium', isDev: true })).toBe('medium');
    // In production: medium is collapsed to high.
    expect(resolveExperimentalM1AQualityTier({ search: '?m1aQuality=medium', isDev: false })).toBe('high');
  });

  it('resolves "low" only in dev (invariant #2)', () => {
    expect(resolveExperimentalM1AQualityTier({ search: '?m1aQuality=low', isDev: true })).toBe('low');
    expect(resolveExperimentalM1AQualityTier({ search: '?m1aQuality=low', isDev: false })).toBe('high');
  });

  it('keeps ordinary showcase URL unchanged: missing param + invalid value + empty search → high (invariant #4)', () => {
    expect(resolveExperimentalM1AQualityTier({ search: '?showcase=1&deviceQa=1', isDev: true })).toBe('high');
    expect(resolveExperimentalM1AQualityTier({ search: '?m1aQuality=invalid', isDev: true })).toBe('high');
    expect(resolveExperimentalM1AQualityTier({ search: '?m1aQuality=HIGH', isDev: true })).toBe('high');
    expect(resolveExperimentalM1AQualityTier({ search: '?m1aQuality=', isDev: true })).toBe('high');
    expect(resolveExperimentalM1AQualityTier({ search: '', isDev: true })).toBe('high');
    expect(resolveExperimentalM1AQualityTier({ search: null, isDev: true })).toBe('high');
    expect(resolveExperimentalM1AQualityTier({ search: undefined, isDev: true })).toBe('high');
  });

  it('does not mutate showcase/v1 and never throws on malformed search strings (invariant #5)', () => {
    // No filesystem access in this module — but ensure the resolver is a
    // pure function and never attempts to read the network or filesystem.
    // The Vite middleware (separate module) is the only place that touches
    // .agent-data/safari-gpu-investigation/.
    //
    // URLSearchParams is lenient: bytes with invalid percent-encoded UTF-8
    // sequences are skipped, but the remaining well-formed params are
    // honored. We verify two properties: (a) the function does not throw
    // on a partially-malformed search; (b) it does not throw on a wholly
    // garbage string. The exact value depends on which params survived the
    // lenient parse — what we care about is the no-throw guarantee.
    const partiallyMalformed = '?%E0%A4%A&m1aQuality=medium';
    const result = resolveExperimentalM1AQualityTier({ search: partiallyMalformed, isDev: true });
    expect(typeof result).toBe('string');
    expect(['high', 'medium', 'low']).toContain(result);

    const whollyGarbage = '?????&&&&%ZZ%ZZ';
    expect(() => resolveExperimentalM1AQualityTier({ search: whollyGarbage, isDev: true })).not.toThrow();
    expect(resolveExperimentalM1AQualityTier({ search: whollyGarbage, isDev: true })).toBe('high');
  });

  it('is a pure function: same input → same output, no observable side effects', () => {
    const args = { search: '?m1aQuality=low', isDev: true };
    const out1 = resolveExperimentalM1AQualityTier(args);
    const out2 = resolveExperimentalM1AQualityTier(args);
    expect(out1).toBe(out2);
    expect(out1).toBe('low');
  });

  it('the tier list and type-guard are consistent with the resolver', () => {
    for (const tier of M1A_QUALITY_TIERS) {
      expect(isM1AQualityTier(tier)).toBe(true);
      expect(resolveExperimentalM1AQualityTier({ search: `?m1aQuality=${tier}`, isDev: true })).toBe(tier);
    }
    expect(isM1AQualityTier('ultralow')).toBe(false);
    expect(isM1AQualityTier(null)).toBe(false);
    expect(isM1AQualityTier(undefined)).toBe(false);
    expect(isM1AQualityTier(123)).toBe(false);
  });
});

describe('resolveProductionM1AExperimentalTier', () => {
  // ── Default production build (experiment disabled) ──
  it('A. ordinary showcase URL with no m1aQuality → null (use showcase/v1)', () => {
    expect(resolveProductionM1AExperimentalTier({ search: '?showcase=1&deviceQa=1', enabled: false })).toBeNull();
    expect(resolveProductionM1AExperimentalTier({ search: null, enabled: false })).toBeNull();
    expect(resolveProductionM1AExperimentalTier({ search: '', enabled: false })).toBeNull();
  });

  it('returns null in disabled mode even with explicit m1aQuality=high', () => {
    // Operator forgot to set the env var. The default production build
    // must never serve the experimental prefix — only the canonical
    // showcase/v1. This is the critical "default safe" invariant.
    expect(resolveProductionM1AExperimentalTier({ search: '?m1aQuality=high', enabled: false })).toBeNull();
    expect(resolveProductionM1AExperimentalTier({ search: '?m1aQuality=medium', enabled: false })).toBeNull();
    expect(resolveProductionM1AExperimentalTier({ search: '?m1aQuality=low', enabled: false })).toBeNull();
  });

  // ── Experiment-enabled build (operator flipped the env var) ──
  it('B. enabled + ?m1aQuality=high → "high"', () => {
    expect(resolveProductionM1AExperimentalTier({ search: '?m1aQuality=high', enabled: true })).toBe('high');
    expect(resolveProductionM1AExperimentalTier({ search: '?showcase=1&deviceQa=1&m1aQuality=high', enabled: true })).toBe('high');
  });

  it('C. enabled + ?m1aQuality=medium → "medium"', () => {
    expect(resolveProductionM1AExperimentalTier({ search: '?m1aQuality=medium', enabled: true })).toBe('medium');
  });

  it('D. enabled + ?m1aQuality=low → "low"', () => {
    expect(resolveProductionM1AExperimentalTier({ search: '?m1aQuality=low', enabled: true })).toBe('low');
  });

  it('E. enabled + invalid m1aQuality → null (safe default: showcase/v1)', () => {
    expect(resolveProductionM1AExperimentalTier({ search: '?m1aQuality=garbage', enabled: true })).toBeNull();
    expect(resolveProductionM1AExperimentalTier({ search: '?m1aQuality=HIGH', enabled: true })).toBeNull();
    expect(resolveProductionM1AExperimentalTier({ search: '?m1aQuality=', enabled: true })).toBeNull();
    expect(resolveProductionM1AExperimentalTier({ search: '?m1aQuality=ultralow', enabled: true })).toBeNull();
  });

  it('E. enabled + missing m1aQuality → null (safe default)', () => {
    expect(resolveProductionM1AExperimentalTier({ search: '?showcase=1&deviceQa=1', enabled: true })).toBeNull();
    expect(resolveProductionM1AExperimentalTier({ search: null, enabled: true })).toBeNull();
    expect(resolveProductionM1AExperimentalTier({ search: undefined, enabled: true })).toBeNull();
  });

  it('F. enabled but no UA/browser selection — only the query string matters', () => {
    // No matter what the UA looks like, the resolver only ever looks at
    // the m1aQuality query parameter. This test guards against accidental
    // browser sniffing ever creeping in. (userAgent is accepted as an
    // arg purely so callers cannot accidentally pass a UA and have it
    // silently influence the result; the resolver itself never reads it.)
    const safariUA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15';
    const chromeUA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.0.0';
    const firefoxUA = 'Mozilla/5.0 (X11; Linux x86_64; rv:130.0)';
    for (const ua of [safariUA, chromeUA, firefoxUA, 'random string']) {
      expect(resolveProductionM1AExperimentalTier({ search: '?m1aQuality=medium', enabled: true, userAgent: ua })).toBe('medium');
      expect(resolveProductionM1AExperimentalTier({ search: null, enabled: true, userAgent: ua })).toBeNull();
    }
  });

  it('never throws on malformed search strings', () => {
    const cases = ['?????&&&&%ZZ%ZZ', '?%E0%A4%A&m1aQuality=medium', null, undefined, '', '\x00\x01\x02'];
    for (const c of cases) {
      expect(() => resolveProductionM1AExperimentalTier({ search: c as string | null | undefined, enabled: true })).not.toThrow();
    }
  });
});
