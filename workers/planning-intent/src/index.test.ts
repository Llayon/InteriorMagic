import { describe, expect, it, vi } from 'vitest';
import { planningIntentSystemPrompt } from '../../../src/editor/planning/intent';
import { buildQwenOutputShapeHint, GROQ_INTENT_MODEL, GROQ_TIMEOUT_MS } from './groq';
import { createPlanningIntentHandler } from './index';

const wire = (text = 'Сделай просмотр телевизора удобнее') => ({
  contractVersion: 2,
  text,
  focals: [{ id: 'room-object:tv', kind: 'tv' }],
});

const groqResponse = (content: string, status = 200): Response => Response.json({
  choices: [{ message: { content } }],
}, { status });

const allowedOrigin = 'https://example.invalid' as const;
const defaultEnv = { GROQ_API_KEY: 'test-secret', ALLOWED_ORIGIN: allowedOrigin };

const call = async (
  payload: unknown,
  upstream: typeof fetch,
  env = defaultEnv,
  origin?: string,
) => {
  const handler = createPlanningIntentHandler(upstream);
  return handler(new Request('https://worker.example/planning-intent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(origin === undefined ? {} : { Origin: origin }) },
    body: JSON.stringify(payload),
  }), env);
};

describe('planning intent Worker', () => {
  it.each([
    ['supported', { activity: 'watchTv', focalPointId: 'room-object:tv' }],
    ['priorities', { activity: 'watchTv', focalPointId: 'room-object:tv', priorities: ['circulation', 'viewing'] }],
    ['unsupported', { intent: 'unsupported_intent' }],
    ['ambiguous', { intent: 'ambiguous_focal' }],
    ['wrong shape', { activity: 'dance', coordinates: [1, 2] }],
  ])('passes through %s JSON as untrusted output', async (_name, output) => {
    const response = await call(wire(), vi.fn(async () => groqResponse(JSON.stringify(output))));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, contractVersion: 2, output });
  });

  it('passes non-JSON model content through as untrusted output', async () => {
    const response = await call(wire(), vi.fn(async () => groqResponse('not json')));
    expect(await response.json()).toEqual({ ok: true, contractVersion: 2, output: 'not json' });
  });

  it.each([[429, 'upstream_rate_limited'], [500, 'upstream_unavailable'], [503, 'upstream_unavailable']])(
    'sanitizes Groq HTTP %i', async (status, code) => {
      const response = await call(wire(), vi.fn(async () => new Response('secret upstream body', { status })));
      const text = await response.text();
      expect(JSON.parse(text)).toEqual({ ok: false, error: { code } });
      expect(text).not.toContain('test-secret');
    },
  );

  it('sanitizes network failures', async () => {
    const response = await call(wire(), vi.fn(async () => { throw new Error('contains test-secret'); }));
    expect(await response.json()).toEqual({ ok: false, error: { code: 'upstream_unavailable' } });
  });

  it('aborts a timed-out Groq request with a sanitized response', async () => {
    vi.useFakeTimers();
    try {
      const upstream = vi.fn((_input: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
      }));
      const pending = call(wire(), upstream);
      await vi.advanceTimersByTimeAsync(GROQ_TIMEOUT_MS);
      const response = await pending;
      expect(response.status).toBe(504);
      expect(await response.json()).toEqual({ ok: false, error: { code: 'upstream_timeout' } });
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects malformed and geometry-like transport payloads before Groq', async () => {
    const upstream = vi.fn(async () => groqResponse('{}'));
    for (const payload of [
      {},
      { ...wire(), room: { width: 4 } },
      { ...wire(), focals: [{ id: 'room-object:tv', kind: 'tv', position: { x: 1 } }] },
      { text: 'x', focals: [] },
      { ...wire(), contractVersion: 1 },
      { ...wire(), focals: [{ id: '', kind: 'tv' }] },
      { ...wire(), focals: [{ id: 'x', kind: 'sofa' }] },
      { ...wire(), text: 'x'.repeat(2001) },
      { ...wire(), focals: Array.from({ length: 9 }, (_, index) => ({ id: `tv-${index}`, kind: 'tv' })) },
    ]) {
      const response = await call(payload, upstream);
      expect(response.status).toBe(400);
    }
    expect(upstream).not.toHaveBeenCalled();
  });

  it('accepts zero TV focals for Conversation classification', async () => {
    const response = await call(
      { ...wire('Make this better for conversation'), focals: [] },
      vi.fn(async () => groqResponse('{"activity":"conversation"}')),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true, contractVersion: 2, output: { activity: 'conversation' },
    });
  });

  it('accepts the shared maximum of eight TV focals', async () => {
    const response = await call(
      {
        ...wire('Classify this request'),
        focals: Array.from({ length: 8 }, (_, index) => ({ id: `tv-${index}`, kind: 'tv' })),
      },
      vi.fn(async () => groqResponse('{"activity":"conversation"}')),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true, contractVersion: 2, output: { activity: 'conversation' },
    });
  });

  it('packages the canonical prompt, minimal context and proven Qwen hint', async () => {
    const bodies: Record<string, unknown>[] = [];
    const upstream = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return groqResponse('{"activity":"watchTv","focalPointId":"room-object:tv"}');
    });
    await call(wire('  Главное — проход  '), upstream);
    const body = bodies[0]!;
    expect(body).toMatchObject({
      model: GROQ_INTENT_MODEL,
      response_format: { type: 'json_object' },
      reasoning_effort: 'none', temperature: 0.2, max_completion_tokens: 200, stream: false,
    });
    const serialized = JSON.stringify(body);
    const messages = body?.['messages'];
    expect(Array.isArray(messages) ? messages : []).toEqual([
      { role: 'system', content: planningIntentSystemPrompt },
      expect.objectContaining({ role: 'user' }),
    ]);
    const user = Array.isArray(messages) ? messages[1] : null;
    const userContent = typeof user === 'object' && user !== null && 'content' in user
      ? (user as Record<string, unknown>)['content']
      : '';
    expect(userContent).toContain(buildQwenOutputShapeHint(1));
    expect(serialized).toContain('Главное — проход');
    expect(serialized).toContain('room-object:tv');
    for (const forbidden of ['position', 'rotation', 'footprint', 'room dimensions', 'collision']) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it.each([
    [0, false, false],
    [1, true, false],
    [2, true, true],
  ])('advertises only cardinality-valid output shapes for %i TV focals', async (count, hasTv, hasAmbiguous) => {
    const bodies: Record<string, unknown>[] = [];
    const upstream = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return groqResponse('{"activity":"conversation"}');
    });
    await call({
      ...wire('Classify this request'),
      focals: Array.from({ length: count }, (_, index) => ({ id: `tv-${index}`, kind: 'tv' })),
    }, upstream);
    const messages = bodies[0]?.['messages'];
    const user = Array.isArray(messages) ? messages[1] : null;
    const content = typeof user === 'object' && user !== null && 'content' in user
      ? String((user as Record<string, unknown>)['content'])
      : '';
    expect(content.includes('TV success:')).toBe(hasTv);
    expect(content.includes('Ambiguous:')).toBe(hasAmbiguous);
  });

  it('fails closed without the server secret and never echoes it', async () => {
    const response = await call(wire(), vi.fn(), { ...defaultEnv, GROQ_API_KEY: '' });
    const text = await response.text();
    expect(response.status).toBe(503);
    expect(text).toContain('server_misconfigured');
    expect(text).not.toContain('test-secret');
  });

  it('allows the exact configured browser origin', async () => {
    const upstream = vi.fn(async () => groqResponse('{"intent":"unsupported_intent"}'));
    const response = await call(wire(), upstream, defaultEnv, allowedOrigin);
    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe(allowedOrigin);
    expect(response.headers.get('vary')).toBe('Origin');
    expect(upstream).toHaveBeenCalledOnce();
  });

  it('rejects a foreign browser origin before reading from Groq', async () => {
    const upstream = vi.fn(async () => groqResponse('{}'));
    const response = await call(wire(), upstream, defaultEnv, 'https://foreign.example');
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ ok: false, error: { code: 'origin_forbidden' } });
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
    expect(upstream).not.toHaveBeenCalled();
  });

  it('allows preflight only from the exact configured origin', async () => {
    const handler = createPlanningIntentHandler(vi.fn());
    const preflight = (origin?: string) => handler(new Request('https://worker.example/planning-intent', {
      method: 'OPTIONS',
      headers: origin === undefined ? {} : { Origin: origin },
    }), defaultEnv);
    const allowed = await preflight(allowedOrigin);
    expect(allowed.status).toBe(204);
    expect(allowed.headers.get('access-control-allow-origin')).toBe(allowedOrigin);
    expect((await preflight('https://foreign.example')).status).toBe(403);
    expect((await preflight()).status).toBe(403);
  });

  it('does not log user text or provider output', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const response = await call(
        wire('private user prompt'),
        vi.fn(async () => groqResponse('{"private":"provider output"}')),
        defaultEnv,
        allowedOrigin,
      );
      expect(response.status).toBe(200);
      expect(log).not.toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
      error.mockRestore();
    }
  });
});
