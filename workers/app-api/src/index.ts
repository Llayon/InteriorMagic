import { getOrCreateUserId } from './db';
import {
  ProjectDocumentError,
  parseRoomProjectDocument,
  serializeRoomProjectCanonical,
} from './projectContract';
import { createProject, getProject, updateProjectCas } from './projects';
import {
  buildExpiredCookieHeader,
  buildSetCookieHeader,
  createSession,
  deleteSessionByTokenHash,
  getSessionByTokenHash,
  hashToken,
  parseCookieHeader,
  parseSessionTtlEnv,
  sessionCookiePolicy,
} from './session';
import { parseMaxAgeEnv, TelegramVerificationError, verifyTelegramInitData } from './telegram';

export const MAX_WIRE_BODY_BYTES = 16 * 1024;
/** Project documents get their own bound; auth endpoints keep the tight 16 KiB. */
export const MAX_PROJECT_BODY_BYTES = 512 * 1024;

const PROJECT_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type WorkerErrorCode =
  | 'invalid_request'
  | 'origin_forbidden'
  | 'server_misconfigured'
  | 'invalid_init_data'
  | 'init_data_expired'
  | 'payload_too_large'
  | 'internal_error'
  | 'unauthenticated'
  | 'project_not_found'
  | 'stale_revision'
  | 'project_id_conflict'
  | 'invalid_project';

const corsHeaders = (origin: string) => ({
  'Access-Control-Allow-Origin': origin,
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Credentials': 'true',
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const hasExactKeys = (record: Record<string, unknown>, allowed: readonly string[]): boolean => {
  const expected = new Set(allowed);
  const present = new Set(Object.keys(record));
  if (present.size !== expected.size) return false;
  for (const key of present) if (!expected.has(key)) return false;
  return true;
};

const isExactJson = (request: Request): boolean =>
  request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() === 'application/json';

const contentLengthExceeds = (request: Request, maxBytes: number): boolean => {
  const header = request.headers.get('content-length');
  return header !== null && Number(header) > maxBytes;
};

/** Reads a strictly bounded JSON body; throws Error('payload_too_large') on overflow. */
const readBoundedJson = async (request: Request, maxBytes: number): Promise<unknown> => {
  const text = await readBoundedText(request.body, maxBytes);
  return JSON.parse(text);
};

export async function requireSession(request: Request, env: AppApiWorkerEnv, now: number = Date.now()): Promise<string | null> {
  const policy = sessionCookiePolicy(env);
  if (!policy) return null;
  const cookieHeader = request.headers.get('cookie');
  const rawToken = parseCookieHeader(cookieHeader, policy.name);
  if (!rawToken) return null;
  if (!env.DB) return null;
  const hash = await hashToken(rawToken);
  const row = await getSessionByTokenHash(env.DB, hash, now);
  if (!row) return null;
  return row.user_id;
}

export const createAppApiHandler = () =>
  async (request: Request, env: AppApiWorkerEnv): Promise<Response> => {
    const url = new URL(request.url);

    const allowedOrigin = configuredOrigin(env.ALLOWED_ORIGIN);
    if (allowedOrigin === null) return errorResponse('server_misconfigured', 503);

    const requestOrigin = request.headers.get('origin');

    // Helper for same-origin GET
    const isOriginAllowedForGet = (): boolean => {
      if (requestOrigin === allowedOrigin) return true;
      if (requestOrigin === null && new URL(request.url).origin === allowedOrigin) return true;
      return false;
    };
    const isOriginAllowedForMutating = (): boolean => requestOrigin === allowedOrigin;

    if (request.method === 'OPTIONS') {
      if (requestOrigin !== allowedOrigin) return errorResponse('origin_forbidden', 403);
      return new Response(null, { status: 204, headers: corsHeaders(allowedOrigin) });
    }

    // GET /session — check existing cookie session (no Telegram config needed)
    if (url.pathname === '/session') {
      if (request.method !== 'GET') return errorResponse('invalid_request', 405, allowedOrigin);
      // For GET, allow same-origin without Origin, otherwise require exact Origin
      if (!isOriginAllowedForGet()) return errorResponse('origin_forbidden', 403);
      if (!env.DB) return errorResponse('server_misconfigured', 503, allowedOrigin);
      const policy = sessionCookiePolicy(env);
      if (!policy) return errorResponse('server_misconfigured', 503, allowedOrigin);
      const originForCors = requestOrigin === allowedOrigin ? allowedOrigin : undefined;
      const cookieHeader = request.headers.get('cookie');
      const rawToken = parseCookieHeader(cookieHeader, policy.name);
      if (!rawToken) return errorResponse('unauthenticated', 401, originForCors);
      const hash = await hashToken(rawToken);
      const session = await getSessionByTokenHash(env.DB, hash, Date.now());
      if (!session) return errorResponse('unauthenticated', 401, originForCors);
      return json({ authenticated: true, user: { id: session.user_id } }, 200, originForCors);
    }

    // POST /logout — idempotent, hash and delete, expire cookie (no Telegram config)
    if (url.pathname === '/logout') {
      if (request.method !== 'POST') return errorResponse('invalid_request', 405, allowedOrigin);
      if (!isOriginAllowedForMutating()) return errorResponse('origin_forbidden', 403);
      const policy = sessionCookiePolicy(env);
      if (!policy) return errorResponse('server_misconfigured', 503, allowedOrigin);
      if (!env.DB) return errorResponse('server_misconfigured', 503, allowedOrigin);
      // Zero-body contract: bounded read, any non-whitespace body → 400
      const contentLength = request.headers.get('content-length');
      if (contentLength !== null && Number(contentLength) > MAX_WIRE_BODY_BYTES) {
        return errorResponse('payload_too_large', 413, allowedOrigin);
      }
      if (request.body) {
        try {
          const text = await readBoundedText(request.body, MAX_WIRE_BODY_BYTES);
          if (text.trim().length > 0) {
            return errorResponse('invalid_request', 400, allowedOrigin);
          }
        } catch (e) {
          if (e instanceof Error && e.message === 'payload_too_large') return errorResponse('payload_too_large', 413, allowedOrigin);
          return errorResponse('invalid_request', 400, allowedOrigin);
        }
      }
      const cookieHeader = request.headers.get('cookie');
      const rawToken = parseCookieHeader(cookieHeader, policy.name);
      if (rawToken) {
        const hash = await hashToken(rawToken);
        await deleteSessionByTokenHash(env.DB, hash);
      }
      const headers = { ...corsHeaders(allowedOrigin), 'Cache-Control': 'no-store' } as Record<string, string>;
      headers['Set-Cookie'] = buildExpiredCookieHeader(policy);
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...headers, 'Content-Type': 'application/json' } });
    }

    // H3B project routes — ownership always derives from requireSession().
    const projectIdFromPath = (): string | null => {
      if (!url.pathname.startsWith('/projects/')) return null;
      try {
        return decodeURIComponent(url.pathname.slice('/projects/'.length));
      } catch {
        return '';
      }
    };

    if (url.pathname === '/projects') {
      if (request.method !== 'POST') return errorResponse('invalid_request', 405, allowedOrigin);
      if (!isOriginAllowedForMutating()) return errorResponse('origin_forbidden', 403);
      if (!isExactJson(request)) return errorResponse('invalid_request', 415, allowedOrigin);
      if (contentLengthExceeds(request, MAX_PROJECT_BODY_BYTES)) {
        return errorResponse('payload_too_large', 413, allowedOrigin);
      }
      if (!env.DB) return errorResponse('server_misconfigured', 503, allowedOrigin);
      const userId = await requireSession(request, env);
      if (userId === null) return errorResponse('unauthenticated', 401, allowedOrigin);

      let payload: { id: string; canonical: string; schemaVersion: number };
      try {
        const parsed: unknown = await readBoundedJson(request, MAX_PROJECT_BODY_BYTES);
        if (!isRecord(parsed) || !hasExactKeys(parsed, ['id', 'project'])) throw new Error('shape');
        const id = parsed['id'];
        if (typeof id !== 'string' || !PROJECT_UUID_PATTERN.test(id)) throw new Error('uuid');
        const document = parseRoomProjectDocument(parsed['project']);
        payload = { id, canonical: serializeRoomProjectCanonical(document), schemaVersion: document.version };
      } catch (e) {
        if (e instanceof Error && e.message === 'payload_too_large') return errorResponse('payload_too_large', 413, allowedOrigin);
        if (e instanceof ProjectDocumentError) return errorResponse('invalid_project', 400, allowedOrigin);
        return errorResponse('invalid_request', 400, allowedOrigin);
      }

      try {
        const result = await createProject(env.DB, userId, payload.id, payload.schemaVersion, payload.canonical, Date.now());
        if (result.kind === 'conflict') return errorResponse('project_id_conflict', 409, allowedOrigin);
        return json({ ok: true, metadata: result.metadata }, 200, allowedOrigin);
      } catch {
        return errorResponse('internal_error', 500, allowedOrigin);
      }
    }

    const pathProjectId = projectIdFromPath();
    if (pathProjectId !== null) {
      const originForCors = requestOrigin === allowedOrigin ? allowedOrigin : undefined;
      if (request.method === 'GET') {
        if (!isOriginAllowedForGet()) return errorResponse('origin_forbidden', 403);
        if (!PROJECT_UUID_PATTERN.test(pathProjectId)) return errorResponse('invalid_request', 400, originForCors);
        if (!env.DB) return errorResponse('server_misconfigured', 503, allowedOrigin);
        const userId = await requireSession(request, env);
        if (userId === null) return errorResponse('unauthenticated', 401, originForCors);
        let row: Awaited<ReturnType<typeof getProject>>;
        try {
          row = await getProject(env.DB, userId, pathProjectId);
        } catch {
          return errorResponse('internal_error', 500, originForCors);
        }
        if (row === null) return errorResponse('project_not_found', 404, originForCors);
        let document: unknown;
        try {
          document = parseRoomProjectDocument(JSON.parse(row.project_json));
        } catch {
          return errorResponse('internal_error', 500, originForCors);
        }
        return json(
          {
            ok: true,
            metadata: { id: row.id, schemaVersion: row.schema_version, revision: row.revision, createdAt: row.created_at, updatedAt: row.updated_at },
            project: document,
          },
          200,
          originForCors,
        );
      }

      if (request.method === 'PUT') {
        if (!isOriginAllowedForMutating()) return errorResponse('origin_forbidden', 403);
        if (!isExactJson(request)) return errorResponse('invalid_request', 415, allowedOrigin);
        if (contentLengthExceeds(request, MAX_PROJECT_BODY_BYTES)) {
          return errorResponse('payload_too_large', 413, allowedOrigin);
        }
        if (!PROJECT_UUID_PATTERN.test(pathProjectId)) return errorResponse('invalid_request', 400, allowedOrigin);
        if (!env.DB) return errorResponse('server_misconfigured', 503, allowedOrigin);
        const userId = await requireSession(request, env);
        if (userId === null) return errorResponse('unauthenticated', 401, allowedOrigin);

        let canonical: string;
        let schemaVersion: number;
        let expectedRevision: number;
        try {
          const parsed: unknown = await readBoundedJson(request, MAX_PROJECT_BODY_BYTES);
          if (!isRecord(parsed) || !hasExactKeys(parsed, ['expectedRevision', 'project'])) throw new Error('shape');
          const revision = parsed['expectedRevision'];
          if (typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision < 1) throw new Error('revision');
          const document = parseRoomProjectDocument(parsed['project']);
          expectedRevision = revision;
          schemaVersion = document.version;
          canonical = serializeRoomProjectCanonical(document);
        } catch (e) {
          if (e instanceof Error && e.message === 'payload_too_large') return errorResponse('payload_too_large', 413, allowedOrigin);
          if (e instanceof ProjectDocumentError) return errorResponse('invalid_project', 400, allowedOrigin);
          return errorResponse('invalid_request', 400, allowedOrigin);
        }

        try {
          const result = await updateProjectCas(env.DB, userId, pathProjectId, expectedRevision, schemaVersion, canonical, Date.now());
          if (result.kind === 'stale_revision') return errorResponse('stale_revision', 409, allowedOrigin);
          if (result.kind === 'not_found') return errorResponse('project_not_found', 404, allowedOrigin);
          return json({ ok: true, metadata: result.metadata }, 200, allowedOrigin);
        } catch {
          return errorResponse('internal_error', 500, allowedOrigin);
        }
      }

      return errorResponse('invalid_request', 405, allowedOrigin);
    }

    // POST /auth/telegram — Telegram bootstrap, creates first-party session + Set-Cookie
    if (url.pathname !== '/auth/telegram') return errorResponse('invalid_request', 404);

    if (request.method !== 'POST') return errorResponse('invalid_request', 405, allowedOrigin);
    if (!isOriginAllowedForMutating()) return errorResponse('origin_forbidden', 403);

    const contentType = request.headers.get('content-type');
    const mediaType = contentType?.split(';', 1)[0]?.trim().toLowerCase();
    if (mediaType !== 'application/json') {
      return errorResponse('invalid_request', 415, allowedOrigin);
    }

    const contentLength = request.headers.get('content-length');
    if (contentLength !== null && Number(contentLength) > MAX_WIRE_BODY_BYTES) {
      return errorResponse('payload_too_large', 413, allowedOrigin);
    }

    // Route-specific config: Telegram + TTL only for auth bootstrap
    const maxAge = parseMaxAgeEnv(env.TELEGRAM_INIT_DATA_MAX_AGE_SECONDS);
    if (maxAge === null) return errorResponse('server_misconfigured', 503, allowedOrigin);
    const ttl = parseSessionTtlEnv(env.SESSION_TTL_SECONDS);
    if (ttl === null) return errorResponse('server_misconfigured', 503, allowedOrigin);
    const policy = sessionCookiePolicy(env);
    if (!policy) return errorResponse('server_misconfigured', 503, allowedOrigin);

    if (!env.DB) return errorResponse('server_misconfigured', 503, allowedOrigin);

    const rawTokenSecret = (env as unknown as { TELEGRAM_BOT_TOKEN?: unknown }).TELEGRAM_BOT_TOKEN;
    if (typeof rawTokenSecret !== 'string' || rawTokenSecret.trim().length === 0) return errorResponse('server_misconfigured', 503, allowedOrigin);
    const botToken = rawTokenSecret.trim();

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
      const now = Date.now();
      const { rawToken } = await createSession(env.DB, userId, now, ttl);
      const setCookie = buildSetCookieHeader(policy, rawToken, ttl);
      const headers = { ...corsHeaders(allowedOrigin), 'Cache-Control': 'no-store', 'Set-Cookie': setCookie } as Record<string, string>;
      return new Response(JSON.stringify({ user: { id: userId }, identity: { provider: 'telegram' } }), {
        status: 200,
        headers: { ...headers, 'Content-Type': 'application/json' },
      });
    } catch {
      return errorResponse('internal_error', 500, allowedOrigin);
    }
  };

export default {
  fetch: createAppApiHandler(),
} satisfies ExportedHandler<AppApiWorkerEnv>;
