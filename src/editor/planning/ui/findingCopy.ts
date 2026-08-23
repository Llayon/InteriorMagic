import type { PlanProposal, PlanningFinding } from '../contracts';
import { parsePlanningGoal } from '../contracts/parsePlanningGoal';

/**
 * Presentation copy for canonical Contract v1 finding codes.
 *
 * Small, specific mapping for codes used by the canonical Contract v1
 * fixtures plus the real Track A planner codes. Unknown codes fall back to
 * a polite generic message so the UX never surfaces a raw `code` string.
 *
 * Outcome classification (`classifyProposalOutcome`) is intentionally
 * separate from per-finding copy: a panel-level outcome drives the title,
 * summary, and available actions; individual findings remain localized
 * below it.
 */

export type FindingSeverity = PlanningFinding['severity'];

export interface FindingCopy {
  /** Short headline (1 short clause). */
  title: string;
  /** Optional longer explanation (1 sentence). */
  detail?: string;
}

export interface FindingPresentation {
  severity: FindingSeverity;
  copy: FindingCopy;
  /** True when this finding represents a genuine improvement (positive deltas). */
  isImprovement: boolean;
}

const FALLBACK: Record<FindingSeverity, FindingCopy> = {
  positive: { title: 'Расстановка выглядит удачно' },
  info: { title: 'Полезное наблюдение' },
  warning: { title: 'Есть компромисс' },
};

const FORMATTERS: Record<string, (finding: PlanningFinding) => FindingCopy> = {
  'good-tv-orientation': (finding) => {
    const angle = typeof finding.params?.angleDegrees === 'number' ? finding.params.angleDegrees : null;
    return {
      title: 'Диван лучше ориентирован к телевизору',
      detail: angle !== null && angle <= 8
        ? 'Теперь взгляд направлен прямо на экран.'
        : 'Ось дивана приблизилась к линии телевизора.',
    };
  },
  'insufficient-front-clearance': (finding) => {
    const available = typeof finding.params?.availableMeters === 'number' ? finding.params.availableMeters : null;
    const recommended = typeof finding.params?.recommendedMeters === 'number' ? finding.params.recommendedMeters : null;
    const sentence = available !== null && recommended !== null
      ? `Свободно ${available.toFixed(2)} м, удобно от ${recommended.toFixed(2)} м.`
      : 'Проход немного уже, чем было бы удобно.';
    return {
      title: 'Перед креслом всё ещё тесновато',
      detail: sentence,
    };
  },
  'layout-already-good': () => ({
    title: 'Расстановка уже выглядит удачно',
    detail: 'Существенных улучшений не найдено.',
  }),
  // Real Track A codes.
  'good-orientation': () => ({
    title: 'Ориентация стала лучше',
    detail: 'Мебель смотрит в сторону главной точки внимания.',
  }),
  'circulation-improved': () => ({
    title: 'Проход стал свободнее',
    detail: 'Между предметами стало удобнее ходить.',
  }),
  'rear-boundary-proximity-improved': () => ({
    title: 'За диваном стало меньше пустого пространства',
    detail: 'Диван расположен ближе задней стороной к границе комнаты.',
  }),
  'layout-improved': () => ({
    title: 'Расстановка стала удачнее',
    detail: 'Учтены ориентация мебели и положение относительно границ комнаты.',
  }),
  'layout-improvement-too-small': () => ({
    title: 'Улучшения слишком незначительны',
    detail: 'Предложение есть, но выигрыш минимален — менять не обязательно.',
  }),
  'layout-no-valid-plan': () => ({
    title: 'Подходящего варианта не нашлось',
    detail: 'Планировщик перебрал доступные варианты и не нашёл ни одного, который проходит все правила.',
  }),
};

export const presentFinding = (finding: PlanningFinding): FindingPresentation => {
  const formatter = FORMATTERS[finding.code];
  const copy = formatter ? formatter(finding) : FALLBACK[finding.severity];
  return {
    severity: finding.severity,
    copy,
    isImprovement: finding.severity === 'positive',
  };
};

/**
 * Classify a PlanProposal into a panel-level outcome. Drives the planner
 * panel's title, summary copy, and available actions.
 *
 * Order of precedence (most specific first):
 *   1. Explicit failure findings (`layout-no-valid-plan`) — planner said it
 *      could not find a valid arrangement.
 *   2. Explicit too-small improvement (`layout-improvement-too-small`) —
 *      planner has a suggestion but it's not worth applying.
 *   3. Explicit already-good confirmation (`layout-already-good`) — only
 *      when the planner explicitly states the layout is already good.
 *   4. Non-empty moves — propose the improved arrangement.
 *   5. Zero-move fallback — when the planner did not explicitly confirm any
 *      state, treat the result as "no valid plan" rather than presenting
 *      silence as a positive claim. A planner failure mode (unknown future
 *      code with no moves) must NOT be presented as "уже выглядит удачно".
 */
export type ProposalOutcome =
  | 'improved'
  | 'alreadyGood'
  | 'improvementTooSmall'
  | 'noValidPlan';

export interface ProposalOutcomePresentation {
  outcome: ProposalOutcome;
  /** Panel title. */
  title: string;
  /** Short summary sentence. */
  summary: string;
  /** True when a Preview action is meaningful for this outcome. */
  hasPreview: boolean;
}

const hasFinding = (proposal: PlanProposal, code: string): boolean =>
  proposal.findings.some((finding) => finding.code === code);

export const classifyProposalOutcome = (proposal: PlanProposal): ProposalOutcomePresentation => {
  if (hasFinding(proposal, 'layout-no-valid-plan')) {
    return {
      outcome: 'noValidPlan',
      title: 'Подходящего варианта не нашлось',
      summary: 'Перебрали доступные расстановки — ни одна не проходит все правила.',
      hasPreview: false,
    };
  }
  if (hasFinding(proposal, 'layout-improvement-too-small')) {
    return {
      outcome: 'improvementTooSmall',
      title: 'Улучшение слишком незначительно',
      summary: 'Есть небольшие предложения, но менять расстановку необязательно.',
      hasPreview: false,
    };
  }
  if (hasFinding(proposal, 'layout-already-good')) {
    return {
      outcome: 'alreadyGood',
      title: 'Расстановка уже выглядит удачно',
      summary: 'Существенных улучшений не найдено.',
      hasPreview: false,
    };
  }
  if (proposal.moves.length > 0) {
    return {
      outcome: 'improved',
      title: 'Можно улучшить',
      summary: `Предлагаем слегка изменить положение ${proposal.moves.length === 1 ? 'одного предмета' : `${proposal.moves.length} предметов`}, чтобы расстановка стала удобнее.`,
      hasPreview: true,
    };
  }
  // Zero-move fallback: the planner did not explicitly confirm anything.
  // Treat as "no valid plan" — never present silence as a positive claim.
  return {
    outcome: 'noValidPlan',
    title: 'Подходящего варианта не нашлось',
    summary: 'Перебрали доступные расстановки — ни одна не проходит все правила.',
    hasPreview: false,
  };
};

/**
 * Round a planner score for presentation. The contract stores a raw `total`
 * number which in Track A can be a floating-point value; we do not want to
 * show "83.72 / 100" precision the planner does not actually have.
 */
export const presentScore = (total: number): number => Math.round(total);

/**
 * Parse a fixture code defensively. Exists so tests can verify copy without
 * importing the planning-goal parse helpers.
 */
export const parseFixtureGoal = parsePlanningGoal;
