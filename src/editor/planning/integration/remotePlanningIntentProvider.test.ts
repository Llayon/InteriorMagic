import { describe, expect, it, vi } from 'vitest';
import { createRemotePlanningIntentProvider } from './remotePlanningIntentProvider';

const request = {
  userText: 'Главное — проход',
  focalPoints: [{ id: 'room-object:tv', kind: 'tv' as const }],
};

describe('RemotePlanningIntentProvider', () => {
  it('sends only the minimal wire context and returns output as unknown', async () => {
    const calls: RequestInit[] = [];
    const output = { activity: 'watchTv', focalPointId: 'room-object:tv' };
    const provider = createRemotePlanningIntentProvider({
      endpoint: 'https://intent.example/planning-intent',
      fetchImpl: vi.fn(async (_input, init) => {
        calls.push(init ?? {});
        return Response.json({ ok: true, output });
      }),
    });
    expect(await provider.interpret(request)).toEqual(output);
    const body = String(calls[0]?.body);
    expect(JSON.parse(body)).toEqual({
      text: request.userText,
      focals: [{ id: 'room-object:tv', kind: 'tv' }],
    });
    for (const forbidden of ['project', 'position', 'rotation', 'dimension', 'footprint', 'collision', 'history']) {
      expect(body.toLowerCase()).not.toContain(forbidden);
    }
  });

  it('does not repair malformed model output', async () => {
    const provider = createRemotePlanningIntentProvider({
      endpoint: '/planning-intent',
      fetchImpl: vi.fn(async () => Response.json({ ok: true, output: { intent: 'watchTv', focal: 'tv' } })),
    });
    expect(await provider.interpret(request)).toEqual({ intent: 'watchTv', focal: 'tv' });
  });

  it.each([
    [503, { ok: false, error: { code: 'upstream_unavailable' } }],
    [200, { ok: false, error: { code: 'upstream_timeout' } }],
  ])('maps transport envelope failure to a provider exception', async (status, payload) => {
    const provider = createRemotePlanningIntentProvider({
      endpoint: '/planning-intent', fetchImpl: vi.fn(async () => Response.json(payload, { status })),
    });
    await expect(provider.interpret(request)).rejects.toThrow(/Planning intent provider failed/);
  });

  it('forwards AbortSignal to fetch', async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      expect(init?.signal).toBe(controller.signal);
      throw new DOMException('Aborted', 'AbortError');
    });
    const provider = createRemotePlanningIntentProvider({ endpoint: '/planning-intent', signal: controller.signal, fetchImpl });
    await expect(provider.interpret(request)).rejects.toThrow();
  });
});
