import { describe, expect, it } from 'vitest';
import { PlanningError } from '@/editor/planning/errors';
import { planTvViewing } from '@/editor/planning/tv';
import { createIntegrationProject, integrationAssetDefinitions, resolveIntegrationAsset, roomObject } from './testFixtures';
import { projectPlanningScene } from './projectPlanningScene';
import { resolveTvPlannerCapability } from './tvPlannerCapability';

describe('resolveTvPlannerCapability', () => {
  it('returns the deterministic opaque focal ID for exactly one authoritative TV', () => {
    expect(resolveTvPlannerCapability(createIntegrationProject(), resolveIntegrationAsset))
      .toEqual({ available: true, focalPointId: 'room-object:tv' });
  });

  it('is unavailable with zero authoritative TVs', () => {
    expect(resolveTvPlannerCapability(createIntegrationProject({ tv: false }), resolveIntegrationAsset)).toEqual({ available: false });
  });

  it('is unavailable with multiple authoritative TVs', () => {
    expect(resolveTvPlannerCapability(createIntegrationProject({ secondTv: true }), resolveIntegrationAsset)).toEqual({ available: false });
  });

  it('does not infer a TV from an obvious instance or asset name', () => {
    const project = createIntegrationProject({ tv: false });
    project.objects.push(roomObject('obvious-tv-screen', 'suspiciousName', 0, 0));
    expect(resolveTvPlannerCapability(project, resolveIntegrationAsset)).toEqual({ available: false });
  });

  it('fails closed for unsupported TV placement metadata', () => {
    const unsupported = { ...integrationAssetDefinitions.tvMeta!, placement: { anchor: 'ceiling' as const } };
    expect(resolveTvPlannerCapability(createIntegrationProject(), (id) => id === 'tvMeta' ? unsupported : resolveIntegrationAsset(id)))
      .toEqual({ available: false });
  });

  it.each(['sofaMeta', 'chairMeta', 'tableMeta'] as const)('keeps %s factual in projection but rejects it for TV planning when wall-mounted', (assetId) => {
    const project = createIntegrationProject();
    const wallAsset = { ...integrationAssetDefinitions[assetId]!, placement: { anchor: 'wall' as const } };
    const resolveAsset = (id: string) => id === assetId ? wallAsset : resolveIntegrationAsset(id);
    const scene = projectPlanningScene(project, resolveAsset);
    expect(scene.entities.find((entity) => entity.source.kind === 'roomObject' && entity.source.instanceId === assetId.replace('Meta', ''))).toMatchObject({ placementType: 'wall' });
    expect(resolveTvPlannerCapability(project, resolveAsset)).toEqual({ available: false });
    expect(() => planTvViewing(scene, { activity: 'watchTv', focalPointId: 'room-object:tv' })).toThrowError(
      expect.objectContaining<Partial<PlanningError>>({ code: 'UNSUPPORTED_PLACEMENT' }),
    );
  });

  it('fails closed when asset metadata cannot be resolved', () => {
    expect(resolveTvPlannerCapability(createIntegrationProject(), () => { throw new Error('broken metadata'); }))
      .toEqual({ available: false });
  });

  it('never mutates the source project', () => {
    const project = createIntegrationProject();
    const snapshot = structuredClone(project);
    resolveTvPlannerCapability(project, resolveIntegrationAsset);
    expect(project).toEqual(snapshot);
  });
});
