import { describe, expect, it } from 'vitest';
import { PlanningError } from '@/editor/planning/errors';
import { resolveSingleTvFocalId } from '@/editor/planning/tv';
import { projectPlanningScene } from './projectPlanningScene';
import { createIntegrationProject, integrationAssetDefinitions, resolveIntegrationAsset, roomObject } from './testFixtures';

describe('projectPlanningScene', () => {
  it('derives deterministic roles, provenance, masks, and empty structural zones', () => {
    const project = createIntegrationProject();
    const snapshot = structuredClone(project);
    const scene = projectPlanningScene(project, resolveIntegrationAsset);
    expect(scene.room).toEqual({ width: 6, depth: 6 });
    expect(resolveSingleTvFocalId(scene)).toBe('room-object:tv');
    expect(scene.entities.find((entity) => entity.id === 'room-object:sofa')).toMatchObject({ role: 'sofa', source: { kind: 'roomObject', instanceId: 'sofa' } });
    expect(scene.entities.find((entity) => entity.id === 'room-object:cabinet')).toMatchObject({ role: 'console', collision: { group: 1, mask: 5 } });
    expect(scene.entities.find((entity) => entity.id === 'room-object:rug')).toMatchObject({ role: 'rug', collision: { group: 2, mask: 2 } });
    expect(scene.immediateOpeningZones).toEqual([]);
    expect(scene.circulationZones).toEqual([]);
    expect(project).toEqual(snapshot);
  });

  it('never guesses semantics from an asset or instance name', () => {
    const project = createIntegrationProject();
    project.objects.push(roomObject('obvious-tv-sofa', 'suspiciousName', 2.5, 2.5));
    const scene = projectPlanningScene(project, resolveIntegrationAsset);
    expect(scene.entities.find((entity) => entity.source.kind === 'roomObject' && entity.source.instanceId === 'obvious-tv-sofa')?.role).toBe('obstacle');
  });

  it('reports zero and ambiguous authoritative TVs without guessing', () => {
    expect(() => resolveSingleTvFocalId(projectPlanningScene(createIntegrationProject({ tv: false }), resolveIntegrationAsset)))
      .toThrowError(expect.objectContaining<Partial<PlanningError>>({ code: 'FOCAL_NOT_FOUND' }));
    expect(() => resolveSingleTvFocalId(projectPlanningScene(createIntegrationProject({ secondTv: true }), resolveIntegrationAsset)))
      .toThrowError(expect.objectContaining<Partial<PlanningError>>({ code: 'FOCAL_AMBIGUOUS' }));
  });

  it('does not enforce TV topology while projecting factual entities', () => {
    const project = createIntegrationProject();
    project.objects.push(roomObject('second-sofa', 'sofaMeta', 2, 2));
    project.objects.push(roomObject('second-table', 'tableMeta', -2, 2));
    const scene = projectPlanningScene(project, resolveIntegrationAsset);
    expect(scene.entities.filter((entity) => entity.role === 'sofa')).toHaveLength(2);
    expect(scene.entities.filter((entity) => entity.role === 'coffeeTable')).toHaveLength(2);
  });

  it('rejects unsupported placement semantics safely', () => {
    const project = createIntegrationProject();
    const bad = { ...integrationAssetDefinitions.sofaMeta!, placement: { anchor: 'ceiling' as const } };
    expect(() => projectPlanningScene(project, (id) => id === 'sofaMeta' ? bad : resolveIntegrationAsset(id)))
      .toThrowError(expect.objectContaining<Partial<PlanningError>>({ code: 'UNSUPPORTED_PLACEMENT' }));
  });
});
