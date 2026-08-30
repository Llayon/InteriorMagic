import {
  usePlannerStore,
  presentFinding,
  presentScore,
  classifyProposalOutcome,
  type PlannerOrchestrator,
  type ProposalOutcome,
} from '@/editor/planning/ui';
import type { PlanProposal } from '@/editor/planning/contracts';

/**
 * Planner panel content rendered inside the existing workspace bottom-sheet
 * when `workspacePanel === 'planner'`.
 *
 * Pure presentation; never touches the editor store. Analysis is driven by
 * a generic orchestrator (fixture or real planner) which already
 * owns the supersession token and the target-existence resolver.
 */
export function PlannerPanel({
  orchestrator,
  onExit,
  onApplied,
}: {
  orchestrator: PlannerOrchestrator;
  onExit: () => void;
  onApplied: () => void;
}) {
  const status = usePlannerStore((state) => state.status);
  const proposal = usePlannerStore((state) => state.proposal);
  const error = usePlannerStore((state) => state.error);
  const applyFailure = usePlannerStore((state) => state.applyFailure);
  const isPreviewing = usePlannerStore((state) => state.isPreviewing);
  return (
    <div className="planner-panel" data-testid="planner-panel" data-planner-status={status} data-planner-preview={isPreviewing ? 'on' : 'off'}>
      <div className="sheet-title">
        <div>
          <small>ПЛАНИРОВЩИК</small>
          <strong>{titleFor(status, proposal, applyFailure !== null)}</strong>
        </div>
        <button className="planner-exit" type="button" data-testid="planner-exit" aria-label="Закрыть планировщик" onClick={onExit}>×</button>
      </div>

      {status === 'loading' && <PlannerLoading />}
      {status === 'ready' && proposal && (
        <PlannerReady
          proposal={proposal}
          orchestrator={orchestrator}
          onApplied={onApplied}
        />
      )}
      {status === 'error' && (
        <PlannerError
          message={applyFailure ? applyFailureCopy(applyFailure) : error ?? 'Не удалось проанализировать расстановку.'}
          orchestrator={orchestrator}
          onExit={onExit}
          applyError={applyFailure !== null}
        />
      )}
    </div>
  );
}

const titleFor = (
  status: ReturnType<typeof usePlannerStore.getState>['status'],
  proposal: PlanProposal | null,
  applyError: boolean,
): string => {
  if (status === 'loading') return 'Анализируем расстановку…';
  if (status === 'ready' && proposal) return classifyProposalOutcome(proposal).title;
  if (status === 'error') return applyError ? 'Не удалось применить' : 'Не удалось проанализировать';
  return 'Планировщик';
};

function PlannerLoading() {
  return (
    <div className="planner-loading" data-testid="planner-loading">
      <div className="planner-spinner" aria-hidden="true" />
      <p>Оцениваем расстановку мебели…</p>
    </div>
  );
}

function PlannerReady({ proposal, orchestrator, onApplied }: {
  proposal: PlanProposal;
  orchestrator: PlannerOrchestrator;
  onApplied: () => void;
}) {
  const outcome = classifyProposalOutcome(proposal);
  const isPreviewing = usePlannerStore((state) => state.isPreviewing);
  const enterPreview = usePlannerStore((state) => state.enterPreview);
  const exitPreview = usePlannerStore((state) => state.exitPreview);
  const beginAnalysis = () => {
    void orchestrator.beginAnalysis();
  };
  return (
    <div className="planner-ready" data-testid="planner-ready" data-planner-outcome={outcome.outcome}>
      <div className="planner-content-scroll" data-testid="planner-content-scroll">
        <ScoreDelta before={proposal.scoreBefore.total} after={proposal.scoreAfter.total} />
        <p className="planner-summary" data-testid="planner-summary">{outcome.summary}</p>
        <ul className="planner-findings" data-testid="planner-findings">
          {proposal.findings.map((finding, index) => {
            const presentation = presentFinding(finding);
            return (
              <li
                key={`${finding.ruleId}-${index}`}
                className={`planner-finding severity-${presentation.severity}`}
                data-severity={presentation.severity}
                data-finding-code={finding.code}
              >
                <span className="planner-finding-icon" aria-hidden="true">
                  {presentation.severity === 'positive' ? '✓' : presentation.severity === 'warning' ? '!' : 'i'}
                </span>
                <div>
                  <strong>{presentation.copy.title}</strong>
                  {presentation.copy.detail && <p>{presentation.copy.detail}</p>}
                </div>
              </li>
            );
          })}
        </ul>
        {isPreviewing && (
          <p className="planner-preview-banner" data-testid="planner-preview-banner">
            Просмотр варианта. Изменения временные и не сохраняются.
          </p>
        )}
        {!outcome.hasPreview && <NoopOutcomeNote outcome={outcome.outcome} />}
      </div>
      <div className="planner-actions">
        {outcome.hasPreview && !isPreviewing && (
          <button
            className="planner-primary"
            data-testid="planner-preview-button"
            aria-label="Показать вариант"
            onClick={enterPreview}
          >
            Показать вариант
          </button>
        )}
        {outcome.hasPreview && isPreviewing && (
          <>
            {orchestrator.applyCurrentProposal && proposal.moves.length > 0 && (
              <button
                className="planner-primary"
                data-testid="planner-apply"
                aria-label="Применить"
                onClick={() => {
                  const result = orchestrator.applyCurrentProposal!();
                  if (result.ok) onApplied();
                  else usePlannerStore.getState().failApply(result.reason);
                }}
              >Применить</button>
            )}
            <button
              className="planner-secondary"
              data-testid="planner-cancel-preview"
              aria-label="Закрыть просмотр"
              onClick={exitPreview}
            >
              Закрыть просмотр
            </button>
          </>
        )}
        <button
          className="planner-tertiary"
          type="button"
          data-testid="planner-reanalyze"
          aria-label="Проанализировать заново"
          onClick={beginAnalysis}
        >
          Проанализировать заново
        </button>
      </div>
    </div>
  );
}

function NoopOutcomeNote({ outcome }: { outcome: ProposalOutcome }) {
  const message = outcome === 'noValidPlan'
    ? 'Никакой вариант, который проходит все правила, не найден.'
    : outcome === 'improvementTooSmall'
      ? 'Предлагаемое изменение слишком незначительно.'
      : 'Менять расстановку не требуется.';
  return <span className="planner-noop-note" data-testid="planner-noop-note">{message}</span>;
}

function ScoreDelta({ before, after }: { before: number; after: number }) {
  const improved = after > before;
  return (
    <div className="planner-score" aria-label={improved ? 'Расстановка улучшена' : 'Без изменений'}>
      <span className="planner-score-label">Было</span>
      <span className="planner-score-value">{presentScore(before)}</span>
      <span className="planner-score-arrow" aria-hidden="true">→</span>
      <span className="planner-score-label">Стало</span>
      <span className="planner-score-value">{presentScore(after)}</span>
    </div>
  );
}

const applyFailureCopy = (reason: NonNullable<ReturnType<typeof usePlannerStore.getState>['applyFailure']>): string => {
  if (reason === 'stale') return 'Комната изменилась. Пересчитайте вариант.';
  if (reason === 'missing-target') return 'Один из предметов больше недоступен. Пересчитайте вариант.';
  if (reason === 'invalid-final-layout') return 'Вариант больше нельзя безопасно разместить. Пересчитайте расстановку.';
  return 'Не удалось применить вариант. Пересчитайте расстановку.';
};

function PlannerError({ message, orchestrator, onExit, applyError }: {
  message: string;
  orchestrator: PlannerOrchestrator;
  onExit: () => void;
  applyError: boolean;
}) {
  const retry = () => {
    void orchestrator.beginAnalysis();
  };
  return (
    <div className="planner-error" data-testid="planner-error">
      <strong>{applyError ? 'Не удалось применить вариант' : 'Не удалось проанализировать расстановку'}</strong>
      <p>{message}</p>
      <div className="planner-actions">
        <button className="planner-primary" data-testid="planner-retry" aria-label="Попробовать снова" onClick={retry}>Попробовать снова</button>
        <button className="planner-secondary" data-testid="planner-error-dismiss" aria-label="Закрыть" onClick={onExit}>Закрыть</button>
      </div>
    </div>
  );
}
