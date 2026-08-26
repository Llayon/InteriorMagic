import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { tvGoalFixture } from './fixtures/tv-goal.fixture';
import { tvProposalImprovedFixture } from './fixtures/tv-proposal-improved.fixture';
import { tvProposalNoopFixture } from './fixtures/tv-proposal-noop.fixture';
import { parsePlanningGoalV1, parsePlanningGoalV2 } from './parsePlanningGoal';

describe('PlanningGoalV1 compatibility validation', () => {
  it('accepts the canonical TV goal and preserves ordered relative priorities', () => {
    const parsed = parsePlanningGoalV1(tvGoalFixture);
    expect(parsed).toEqual(tvGoalFixture);
    expect(parsed.priorities).toEqual(['circulation', 'viewing', 'conversation']);
  });

  it('accepts omitted priorities as deterministic rule-pack defaults', () => {
    expect(parsePlanningGoalV1({ activity: 'watchTv', focalPointId: 'tv-1' })).toEqual({
      activity: 'watchTv',
      focalPointId: 'tv-1',
    });
  });

  it('treats focalPointId as an opaque non-empty planning entity ID', () => {
    expect(parsePlanningGoalV1({ activity: 'watchTv', focalPointId: 'derived:view-zone' }).focalPointId)
      .toBe('derived:view-zone');
    expect(parsePlanningGoalV1({ activity: 'watchTv', focalPointId: 'tv-1' }).focalPointId).toBe('tv-1');
  });

  it('rejects missing and blank focal point IDs without contextual lookup', () => {
    expect(() => parsePlanningGoalV1({ activity: 'watchTv' })).toThrow('focalPointId');
    expect(() => parsePlanningGoalV1({ activity: 'watchTv', focalPointId: '' })).toThrow('focalPointId');
    expect(() => parsePlanningGoalV1({ activity: 'watchTv', focalPointId: '   ' })).toThrow('focalPointId');
  });

  it('rejects empty, duplicate, unknown, and malformed priorities', () => {
    expect(() => parsePlanningGoalV1({ activity: 'watchTv', focalPointId: 'tv-1', priorities: [] })).toThrow('non-empty array');
    expect(() => parsePlanningGoalV1({ activity: 'watchTv', focalPointId: 'tv-1', priorities: ['viewing', 'viewing'] })).toThrow('Duplicate');
    expect(() => parsePlanningGoalV1({ activity: 'watchTv', focalPointId: 'tv-1', priorities: ['magic'] })).toThrow('Unknown');
    expect(() => parsePlanningGoalV1({ activity: 'watchTv', focalPointId: 'tv-1', priorities: 'viewing' })).toThrow('non-empty array');
    expect(() => parsePlanningGoalV1({ activity: 'watchTv', focalPointId: 'tv-1', priorities: [1] })).toThrow('Unknown');
  });

  it('rejects unknown activities, unknown fields, and malformed roots', () => {
    expect(() => parsePlanningGoalV1({ activity: 'somethingElse', focalPointId: 'tv-1' })).toThrow('activity');
    expect(() => parsePlanningGoalV1({ activity: 'watchTv', focalPointId: 'tv-1', weights: { viewing: 1 } })).toThrow('Unknown PlanningGoalV1 field');
    expect(() => parsePlanningGoalV1(null)).toThrow('must be an object');
    expect(() => parsePlanningGoalV1([])).toThrow('must be an object');
  });
});

describe('PlanningGoalV2 strict activity union', () => {
  it('accepts exact watchTv and conversation goals', () => {
    expect(parsePlanningGoalV2({ activity: 'watchTv', focalPointId: 'tv-1' })).toEqual({ activity: 'watchTv', focalPointId: 'tv-1' });
    expect(parsePlanningGoalV2({ activity: 'conversation' })).toEqual({ activity: 'conversation' });
  });

  it.each([
    {},
    { activity: 'watchTv' },
    { activity: 'watchTv', focalPointId: '' },
    { activity: 'watchTv', focalPointId: 1 },
    { activity: 'watchTv', focalPointId: 'tv-1', priorities: ['viewing'] },
    { activity: 'watchTv', focalPointId: 'tv-1', coordinates: { x: 0, z: 0 } },
    { activity: 'watchTv', focalPointId: 'tv-1', weights: {} },
    { activity: 'watchTv', focalPointId: 'tv-1', candidates: [] },
    { activity: 'watchTv', focalPointId: 'tv-1', searchLimits: { maxEvaluations: 1 } },
    { activity: 'conversation', focalPointId: 'tv-1' },
    { activity: 'conversation', priorities: ['conversation'] },
    { activity: 'conversation', coordinates: {} },
    { activity: 'conversation', weights: {} },
    { activity: 'conversation', candidates: [] },
    { activity: 'conversation', searchLimits: {} },
    { activity: 'openSpace' },
    null,
    [],
  ])('rejects malformed or activity-incompatible value %#', (value) => {
    expect(() => parsePlanningGoalV2(value)).toThrow();
  });
});

describe('canonical planning fixtures', () => {
  it('represents an improved proposal with structured findings', () => {
    expect(tvProposalImprovedFixture.moves).toHaveLength(2);
    expect(tvProposalImprovedFixture.scoreAfter.total).toBeGreaterThan(tvProposalImprovedFixture.scoreBefore.total);
    expect(tvProposalImprovedFixture.findings.map((finding) => finding.severity)).toContain('positive');
    expect(tvProposalImprovedFixture.findings.map((finding) => finding.severity)).toContain('warning');
  });

  it('allows an already-good proposal to contain no moves', () => {
    expect(tvProposalNoopFixture.moves).toEqual([]);
    expect(tvProposalNoopFixture.scoreAfter).toEqual(tvProposalNoopFixture.scoreBefore);
    expect(tvProposalNoopFixture.findings.map((finding) => finding.code)).toContain('layout-already-good');
  });

  it('keeps contract and fixture source independent from UI and rendering libraries', () => {
    const sources = [
      './types.ts',
      './parsePlanningGoal.ts',
      './index.ts',
      './fixtures/tv-goal.fixture.ts',
      './fixtures/tv-proposal-improved.fixture.ts',
      './fixtures/tv-proposal-noop.fixture.ts',
    ].map((path) => readFileSync(new URL(path, import.meta.url), 'utf8'));
    const forbiddenImport = /(?:from\s+|import\s*\()['"](?:react|three|zustand|@react-three\/)/;
    for (const source of sources) expect(source).not.toMatch(forbiddenImport);
  });
});
