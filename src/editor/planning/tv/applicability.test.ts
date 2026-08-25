import { describe, expect, it } from 'vitest';
import { PlanningError } from '@/editor/planning/errors';
import type { PlanningEntity, PlanningScene } from './PlanningScene';
import { resolveSingleTvFocalId, validateTvApplicability } from './applicability';

const entity = (
  id: string,
  role: PlanningEntity['role'],
  source: PlanningEntity['source'] = { kind: 'roomObject', instanceId: id },
  placementType: PlanningEntity['placementType'] = role === 'tv' ? 'wall' : 'floor',
): PlanningEntity => ({
  id,
  source,
  role,
  placementType,
  footprint: { width: 1, depth: 1 },
  collision: { group: 1, mask: 1 },
  transform: { position: { x: 0, z: 0 }, rotationY: 0 },
});

const scene = (entities: PlanningEntity[]): PlanningScene => ({
  room: { width: 6, depth: 6 },
  immediateOpeningZones: [],
  circulationZones: [],
  entities,
});

describe('TV applicability', () => {
  it('requires one authoritative TV focal', () => {
    expect(() => resolveSingleTvFocalId(scene([entity('sofa', 'sofa')]))).toThrowError(
      expect.objectContaining<Partial<PlanningError>>({ code: 'FOCAL_NOT_FOUND' }),
    );
    expect(() => resolveSingleTvFocalId(scene([entity('tv-1', 'tv'), entity('tv-2', 'tv')]))).toThrowError(
      expect.objectContaining<Partial<PlanningError>>({ code: 'FOCAL_AMBIGUOUS' }),
    );
  });

  it('keeps TV topology in the scenario policy', () => {
    expect(() => validateTvApplicability(scene([
      entity('tv', 'tv'),
      entity('sofa', 'sofa'),
      entity('chair-1', 'armchair'),
      entity('chair-2', 'armchair'),
      entity('chair-3', 'armchair'),
    ]))).toThrowError(expect.objectContaining<Partial<PlanningError>>({ code: 'UNSUPPORTED_LAYOUT' }));
  });

  it.each(['sofa', 'armchair', 'coffeeTable'] as const)('rejects wall-mounted %s as a movable TV entity', (role) => {
    expect(() => validateTvApplicability(scene([
      entity('tv', 'tv'),
      ...(role === 'sofa' ? [] : [entity('sofa', 'sofa')]),
      entity('movable', role, undefined, 'wall'),
    ]))).toThrowError(expect.objectContaining<Partial<PlanningError>>({ code: 'UNSUPPORTED_PLACEMENT' }));
  });

  it.each([
    { kind: 'derived' as const },
    { kind: 'roomStructure' as const, structuralId: 'structure-sofa' },
  ])('rejects non-roomObject movable provenance: $kind', (source) => {
    expect(() => validateTvApplicability(scene([
      entity('tv', 'tv'),
      entity('sofa', 'sofa', source),
    ]))).toThrowError(expect.objectContaining<Partial<PlanningError>>({ code: 'INVALID_ACTIVE_GROUP' }));
  });
});
