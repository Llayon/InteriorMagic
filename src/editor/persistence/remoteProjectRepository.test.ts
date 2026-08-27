import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDefaultProject, type RoomProject } from '@/editor/model/types';
import { serializeRoomProjectCanonical } from '@/editor/serialization/projectDocument';
import { createRemoteProject, fetchRemoteProject, updateRemoteProject } from './remoteProjectRepository';

const BASE = 'https://api.test';
const PROJECT_ID = '11111111-2222-4333-8444-555555555555';
const project = (): RoomProject => createDefaultProject();
const metadata = { id: PROJECT_ID, schemaVersion: 1, revision: 1, createdAt: 1, updatedAt: 1 };

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createRemoteProject', () => {
  it('sends exact wire shape with credentials include and never a userId', async () => {
    const calls: Array<[string, RequestInit | undefined]> = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push([String(input), init]);
      return jsonResponse({ ok: true, metadata });
    }));
    const result = await createRemoteProject(BASE, PROJECT_ID, project());
    expect(result).toEqual({ kind: 'ok', data: metadata });
    expect(calls[0]![0]).toBe(`${BASE}/projects`);
    expect(calls[0]![1]?.credentials).toBe('include');
    const parsedBody = JSON.parse(String(calls[0]![1]?.body)) as Record<string, unknown>;
    expect(Object.keys(parsedBody).sort()).toEqual(['id', 'project']);
    expect(parsedBody['id']).toBe(PROJECT_ID);
  });

  it('maps controlled failures to failure kinds', async () => {
    const responses: Array<Response> = [
      jsonResponse({ ok: false, error: { code: 'project_id_conflict' } }, 409),
      jsonResponse({ ok: false, error: { code: 'unauthenticated' } }, 401),
      jsonResponse({ ok: false, error: { code: 'internal_error' } }, 500),
    ];
    for (const response of responses) {
      vi.stubGlobal('fetch', vi.fn(async () => response));
      const result = await createRemoteProject(BASE, PROJECT_ID, project());
      expect(result.kind).toBe('failure');
    }
  });

  it('network failure and malformed success fail closed', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('fetch failed');
    }));
    expect((await createRemoteProject(BASE, PROJECT_ID, project())).kind).toBe('failure');
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"ok":true,"metadata":{"id":2}}', { status: 200 })));
    expect((await createRemoteProject(BASE, PROJECT_ID, project())).kind).toBe('failure');
  });
});

describe('updateRemoteProject', () => {
  it('distinguishes stale revision from id conflict', async () => {
    const stub = (response: Response) => vi.stubGlobal('fetch', vi.fn(async () => response));
    stub(jsonResponse({ ok: false, error: { code: 'stale_revision' } }, 409));
    let result = await updateRemoteProject(BASE, PROJECT_ID, 3, project());
    expect(result.kind).toBe('failure');
    stub(jsonResponse({ ok: false, error: { code: 'project_id_conflict' } }, 409));
    result = await updateRemoteProject(BASE, PROJECT_ID, 3, project());
    expect((result as { reason?: string }).reason).toBe('conflict_id');
    stub(jsonResponse({ ok: true, metadata: { ...metadata, revision: 4 } }));
    result = await updateRemoteProject(BASE, PROJECT_ID, 3, project());
    expect((result as { data?: { revision: number } }).data?.revision).toBe(4);
  });

  it('serializes the full document including finishes', async () => {
    let capturedBody = '';
    vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      capturedBody = String(init?.body);
      return jsonResponse({ ok: true, metadata: { ...metadata, revision: 7 } });
    }));
    await updateRemoteProject(BASE, PROJECT_ID, 6, project());
    expect(capturedBody).toContain('"expectedRevision":6');
    expect(capturedBody).toContain(serializeRoomProjectCanonical(project()));
  });
});

describe('fetchRemoteProject', () => {
  it('returns strictly parsed project with metadata', async () => {
    const doc = project();
    vi.stubGlobal('fetch', vi.fn(async () =>
      jsonResponse({ ok: true, metadata, project: JSON.parse(serializeRoomProjectCanonical(doc)) }),
    ));
    const result = await fetchRemoteProject(BASE, PROJECT_ID);
    expect(result).toEqual({ kind: 'ok', data: { metadata, project: doc } });
  });

  it('rejects malformed remote documents instead of hydrating them', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      jsonResponse({
        ok: true,
        metadata,
        project: { version: 1, room: { width: -1, depth: 5, height: 2.7 }, finishes: {}, objects: [] },
      }),
    ));
    const result = await fetchRemoteProject(BASE, PROJECT_ID);
    expect((result as { reason?: string }).reason).toBe('malformed');
  });

  it('maps 404 to not_found', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ ok: false, error: { code: 'project_not_found' } }, 404)));
    const result = await fetchRemoteProject(BASE, PROJECT_ID);
    expect((result as { reason?: string }).reason).toBe('not_found');
  });
});
