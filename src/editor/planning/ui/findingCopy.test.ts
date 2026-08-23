import { describe, expect, it } from 'vitest';
import {
  classifyProposalOutcome,
  presentFinding,
  presentScore,
} from './findingCopy';
import type { PlanProposal, PlanningFinding } from '../contracts';

const proposal = (moves: PlanProposal['moves'], findings: PlanProposal['findings'], before = 50, after = 50): PlanProposal => ({
  moves,
  scoreBefore: { total: before },
  scoreAfter: { total: after },
  findings,
});

const finding = (code: string, severity: PlanningFinding['severity'] = 'info'): PlanningFinding => ({
  ruleId: 'r',
  code,
  severity,
});

describe('classifyProposalOutcome', () => {
  it('returns improved for a non-empty move list', () => {
    const p = proposal(
      [{ instanceId: 'sofa-main', position: { x: 0, z: 0 }, rotationY: 0 }],
      [finding('good-tv-orientation', 'positive')],
    );
    const outcome = classifyProposalOutcome(p);
    expect(outcome.outcome).toBe('improved');
    expect(outcome.hasPreview).toBe(true);
    expect(outcome.title).toMatch(/Можно улучшить/);
    expect(outcome.summary).toMatch(/одного предмета/);
  });

  it('returns alreadyGood when no moves and layout-already-good is present', () => {
    const p = proposal([], [finding('layout-already-good', 'positive')]);
    const outcome = classifyProposalOutcome(p);
    expect(outcome.outcome).toBe('alreadyGood');
    expect(outcome.hasPreview).toBe(false);
    expect(outcome.title).toMatch(/уже выглядит удачно/);
  });

  it('returns improvementTooSmall when no moves and that finding is present', () => {
    const p = proposal([], [finding('layout-improvement-too-small', 'info')]);
    const outcome = classifyProposalOutcome(p);
    expect(outcome.outcome).toBe('improvementTooSmall');
    expect(outcome.hasPreview).toBe(false);
    expect(outcome.title).toMatch(/незначительно/);
  });

  it('returns noValidPlan when no moves and that finding is present', () => {
    const p = proposal([], [finding('layout-no-valid-plan', 'info')]);
    const outcome = classifyProposalOutcome(p);
    expect(outcome.outcome).toBe('noValidPlan');
    expect(outcome.hasPreview).toBe(false);
    expect(outcome.title).toMatch(/не нашлось/);
    // CRITICAL: must NOT be presented as "ничего менять не нужно"
    expect(outcome.summary).not.toMatch(/не найдено/);
    expect(outcome.title).not.toMatch(/уже выглядит удачно/);
  });

  it('prefers noValidPlan over improvementTooSmall when both are present (no moves)', () => {
    const p = proposal([], [finding('layout-no-valid-plan', 'info'), finding('layout-improvement-too-small', 'info')]);
    expect(classifyProposalOutcome(p).outcome).toBe('noValidPlan');
  });

  it('prefers improvementTooSmall over alreadyGood when both are present', () => {
    const p = proposal([], [finding('layout-improvement-too-small', 'info'), finding('layout-already-good', 'positive')]);
    expect(classifyProposalOutcome(p).outcome).toBe('improvementTooSmall');
  });

  it('does NOT classify a zero-move proposal as alreadyGood without an explicit finding', () => {
    const p = proposal([], [finding('brand-new-unknown-future-code', 'info')]);
    const outcome = classifyProposalOutcome(p);
    // Zero-move without an explicit confirmation must not produce alreadyGood.
    expect(outcome.outcome).not.toBe('alreadyGood');
    expect(outcome.hasPreview).toBe(false);
    expect(outcome.title).not.toMatch(/уже выглядит удачно/);
    expect(outcome.summary).not.toMatch(/Существенных улучшений не найдено/);
    // Falls through to the safe noValidPlan default.
    expect(outcome.outcome).toBe('noValidPlan');
  });

  it('explicit layout-already-good finding produces alreadyGood regardless of finding severity', () => {
    const p = proposal([], [finding('layout-already-good', 'info')]);
    expect(classifyProposalOutcome(p).outcome).toBe('alreadyGood');
  });

  it('summary pluralises the move count correctly', () => {
    const single = proposal(
      [{ instanceId: 'sofa-main', position: { x: 0, z: 0 }, rotationY: 0 }],
      [finding('good-tv-orientation', 'positive')],
    );
    const triple = proposal(
      [
        { instanceId: 'a', position: { x: 0, z: 0 }, rotationY: 0 },
        { instanceId: 'b', position: { x: 0, z: 0 }, rotationY: 0 },
        { instanceId: 'c', position: { x: 0, z: 0 }, rotationY: 0 },
      ],
      [finding('good-tv-orientation', 'positive')],
    );
    expect(classifyProposalOutcome(single).summary).toMatch(/одного предмета/);
    expect(classifyProposalOutcome(triple).summary).toMatch(/3 предметов/);
  });
});

describe('presentFinding covers real Track A codes', () => {
  it.each([
    ['good-orientation'],
    ['circulation-improved'],
    ['rear-boundary-proximity-improved'],
    ['layout-improved'],
    ['layout-improvement-too-small'],
    ['layout-no-valid-plan'],
  ])('maps code %s to Russian copy', (code) => {
    const out = presentFinding({
      ruleId: 'r',
      code,
      severity: code === 'layout-no-valid-plan' || code === 'layout-improvement-too-small' ? 'info' : 'positive',
    });
    expect(out.copy.title).toMatch(/[А-Яа-яЁё]/);
    expect(out.copy.title.length).toBeGreaterThan(0);
  });

  it('recognizes positive findings without scoreImpact', () => {
    expect(presentFinding({ ruleId: 'r', code: 'good-orientation', severity: 'positive' }).isImprovement).toBe(true);
  });

  it('does not claim circulation unless the circulation finding is present', () => {
    const layout = presentFinding({ ruleId: 'layout.selection', code: 'layout-improved', severity: 'positive' });
    const circulation = presentFinding({ ruleId: 'room.circulation', code: 'circulation-improved', severity: 'positive' });
    expect(layout.copy.detail).not.toMatch(/проход/i);
    expect(circulation.copy.title).toMatch(/проход/i);
  });

  it('falls back gracefully for unknown codes', () => {
    const out = presentFinding({ ruleId: 'r', code: 'brand-new-future-code', severity: 'warning' });
    expect(out.severity).toBe('warning');
    expect(out.copy.title.length).toBeGreaterThan(0);
  });
});

describe('presentScore', () => {
  it('rounds floating-point totals to integers', () => {
    expect(presentScore(83.72)).toBe(84);
    expect(presentScore(83.42)).toBe(83);
    expect(presentScore(86)).toBe(86);
    expect(presentScore(0)).toBe(0);
  });

  it('does not expose raw floating-point precision', () => {
    const rounded = presentScore(42.49);
    expect(Number.isInteger(rounded)).toBe(true);
  });
});
