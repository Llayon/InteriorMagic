import { getOrCreateUserId } from './db';
import { parseMaxAgeEnv, TelegramVerificationError, verifyTelegramInitData } from './telegram';

export const MAX_WIRE_BODY_BYTES = 16 * 1024;

export type WorkerErrorCode =
  | 'invalid_request'
  | 'origin_forbidden'
  | 'server_misconfigured'
  | 'invalid_init_data'
  | 'init_data_expired'
  | 'payload_too_large'
  | 'internal_error';

const corsHeaders = (origin: string) => ({
  'Access-Control-Allow-Origin': origin,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  Vary: 'Origin',
});

const json = (payload: unknown, status = 200, origin?: string): Response =>
  Response.json(payload, {
    status,
    headers: {
      ...(origin === undefined ? {} : corsHeaders(origin)),
      'Cache-Control': 'no-store',
    },
  });

const errorResponse = (code: WorkerErrorCode, status: number, origin?: string): Response =>
  json({ ok: false, error: { code } }, status, origin);

const configuredOrigin = (value: unknown): string | null => {
  if (typeof value !== 'string' || value.trim() !== value || value.length === 0) return null;
  try {
    const url = new URL(value);
    return url.origin === value ? value : null;
  } catch {
    return null;
  }
};

const readBoundedText = async (body: ReadableStream<Uint8Array> | null, maxBytes: number): Promise<string> => {
  if (!body) return '';
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let result = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) throw new Error('payload_too_large');
      result += decoder.decode(value, { stream: true });
    }
    return result + decoder.decode();
  } finally {
    reader.releaseLock();
  }
};

const parseBody = (text: string): { initData: string } => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new TelegramVerificationError('invalid_init_data', 'invalid json');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new TelegramVerificationError('invalid_init_data');
  const record = parsed as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length !== 1 || keys[0] !== 'initData') throw new TelegramVerificationError('invalid_init_data');
  const initData = record['initData'];
  if (typeof initData !== 'string' || initData.length === 0) throw new TelegramVerificationError('invalid_init_data');
  return { initData };
};

export const createAppApiHandler = () =>
  async (request: Request, env: AppApiWorkerEnv): Promise<Response> => {
    const url = new URL(request.url);
    if (url.pathname !== '/auth/telegram') return errorResponse('invalid_request', 404);

    const allowedOrigin = configuredOrigin(env.ALLOWED_ORIGIN);
    if (allowedOrigin === null) return errorResponse('server_misconfigured', 503);

    const maxAge = parseMaxAgeEnv(env.TELEGRAM_INIT_DATA_MAX_AGE_SECONDS);
    if (maxAge === null) return errorResponse('server_misconfigured', 503);

    const requestOrigin = request.headers.get('origin');
    if (requestOrigin !== allowedOrigin) return errorResponse('origin_forbidden', 403);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(allowedOrigin) });
    }

    if (request.method !== 'POST') return errorResponse('invalid_request', 405, allowedOrigin);

    const contentType = request.headers.get('content-type');
    if (contentType === null || !contentType.toLowerCase().startsWith('application/json')) {
      return errorResponse('invalid_request', 415, allowedOrigin);
    }

    const contentLength = request.headers.get('content-length');
    if (contentLength !== null && Number(contentLength) > MAX_WIRE_BODY_BYTES) {
      return errorResponse('payload_too_large', 413, allowedOrigin);
    }

    if (!env.DB) return errorResponse('server_misconfigured', 503, allowedOrigin);

    const rawToken = (env as unknown as { TELEGRAM_BOT_TOKEN?: unknown }).TELEGRAM_BOT_TOKEN;
    if (typeof rawToken !== 'string' || rawToken.trim().length === 0) return errorResponse('server_misconfigured', 503, allowedOrigin);
    const botToken = rawToken.trim();

    let initData: string;
    try {
      const text = await readBoundedText(request.body, MAX_WIRE_BODY_BYTES);
      if (text.length > MAX_WIRE_BODY_BYTES) return errorResponse('payload_too_large', 413, allowedOrigin);
      const parsed = parseBody(text);
      initData = parsed.initData;
    } catch (e) {
      if (e instanceof Error && e.message === 'payload_too_large') return errorResponse('payload_too_large', 413, allowedOrigin);
      return errorResponse('invalid_request', 400, allowedOrigin);
    }

    let providerSubject: string;
    try {
      const result = await verifyTelegramInitData(initData, botToken, maxAge);
      providerSubject = result.providerSubject;
    } catch (err) {
      if (err instanceof TelegramVerificationError) {
        if (err.code === 'init_data_expired') return errorResponse('init_data_expired', 401, allowedOrigin);
        if (err.code === 'invalid_init_data') return errorResponse('invalid_init_data', 401, allowedOrigin);
        if (err.code === 'server_misconfigured') return errorResponse('server_misconfigured', 503, allowedOrigin);
      }
      return errorResponse('invalid_init_data', 401, allowedOrigin);
    }

    try {
      const userId = await getOrCreateUserId(env.DB, 'telegram', providerSubject);
      return json({ user: { id: userId }, identity: { provider: 'telegram' } }, 200, allowedOrigin);
    } catch {
      return errorResponse('internal_error', 500, allowedOrigin);
    }
  };

export default {
  fetch: createAppApiHandler(),
} satisfies ExportedHandler<AppApiWorkerEnv>;
