import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { tvGoalFixture } from './fixtures/tv-goal.fixture';
import { tvProposalImprovedFixture } from './fixtures/tv-proposal-improved.fixture';
import { tvProposalNoopFixture } from './fixtures/tv-proposal-noop.fixture';
import { parsePlanningGoal } from './parsePlanningGoal';

describe('PlanningGoal contract validation', () => {
  it('accepts the canonical TV goal and preserves ordered relative priorities', () => {
    const parsed = parsePlanningGoal(tvGoalFixture);
    expect(parsed).toEqual(tvGoalFixture);
    expect(parsed.priorities).toEqual(['circulation', 'viewing', 'conversation']);
  });

  it('accepts omitted priorities as deterministic rule-pack defaults', () => {
    expect(parsePlanningGoal({ activity: 'watchTv', focalPointId: 'tv-1' })).toEqual({
      activity: 'watchTv',
      focalPointId: 'tv-1',
    });
  });

  it('treats focalPointId as an opaque non-empty planning entity ID', () => {
    expect(parsePlanningGoal({ activity: 'watchTv', focalPointId: 'derived:view-zone' }).focalPointId)
      .toBe('derived:view-zone');
    expect(parsePlanningGoal({ activity: 'watchTv', focalPointId: 'tv-1' }).focalPointId).toBe('tv-1');
  });

  it('rejects missing and blank focal point IDs without contextual lookup', () => {
    expect(() => parsePlanningGoal({ activity: 'watchTv' })).toThrow('focalPointId');
    expect(() => parsePlanningGoal({ activity: 'watchTv', focalPointId: '' })).toThrow('focalPointId');
    expect(() => parsePlanningGoal({ activity: 'watchTv', focalPointId: '   ' })).toThrow('focalPointId');
  });

  it('rejects empty, duplicate, unknown, and malformed priorities', () => {
    expect(() => parsePlanningGoal({ activity: 'watchTv', focalPointId: 'tv-1', priorities: [] })).toThrow('non-empty array');
    expect(() => parsePlanningGoal({ activity: 'watchTv', focalPointId: 'tv-1', priorities: ['viewing', 'viewing'] })).toThrow('Duplicate');
    expect(() => parsePlanningGoal({ activity: 'watchTv', focalPointId: 'tv-1', priorities: ['magic'] })).toThrow('Unknown');
    expect(() => parsePlanningGoal({ activity: 'watchTv', focalPointId: 'tv-1', priorities: 'viewing' })).toThrow('non-empty array');
    expect(() => parsePlanningGoal({ activity: 'watchTv', focalPointId: 'tv-1', priorities: [1] })).toThrow('Unknown');
  });

  it('rejects unknown activities, unknown fields, and malformed roots', () => {
    expect(() => parsePlanningGoal({ activity: 'somethingElse', focalPointId: 'tv-1' })).toThrow('activity');
    expect(() => parsePlanningGoal({ activity: 'watchTv', focalPointId: 'tv-1', weights: { viewing: 1 } })).toThrow('Unknown PlanningGoal field');
    expect(() => parsePlanningGoal(null)).toThrow('must be an object');
    expect(() => parsePlanningGoal([])).toThrow('must be an object');
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
