import type { PlanningIntentProviderRequest } from '../../../src/editor/planning/intent';
import { GroqIntentError, requestGroqIntent } from './groq';
import {
  MAX_WIRE_BODY_BYTES,
  parsePlanningIntentWireRequest,
  readBoundedText,
} from './transport';

type WorkerErrorCode =
  | 'invalid_request'
  | 'origin_forbidden'
  | 'server_misconfigured'
  | 'upstream_rate_limited'
  | 'upstream_unavailable'
  | 'upstream_timeout'
  | 'upstream_invalid_response';

const corsHeaders = (origin: string) => ({
  'Access-Control-Allow-Origin': origin,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  Vary: 'Origin',
});

const json = (payload: unknown, status = 200, origin?: string): Response => Response.json(payload, {
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

export const createPlanningIntentHandler = (fetchImpl: typeof fetch = fetch.bind(globalThis)) =>
  async (request: Request, env: PlanningIntentWorkerEnv): Promise<Response> => {
    const url = new URL(request.url);
    if (url.pathname !== '/planning-intent') return errorResponse('invalid_request', 404);
    const allowedOrigin = configuredOrigin(env.ALLOWED_ORIGIN);
    if (allowedOrigin === null) return errorResponse('server_misconfigured', 503);
    const requestOrigin = request.headers.get('origin');
    if (requestOrigin !== null && requestOrigin !== allowedOrigin) {
      return errorResponse('origin_forbidden', 403);
    }
    if (request.method === 'OPTIONS') {
      if (requestOrigin === null) return errorResponse('origin_forbidden', 403);
      return new Response(null, { status: 204, headers: corsHeaders(allowedOrigin) });
    }
    const responseOrigin = requestOrigin === allowedOrigin ? allowedOrigin : undefined;
    if (request.method !== 'POST') return errorResponse('invalid_request', 405, responseOrigin);
    const contentLength = request.headers.get('content-length');
    if (contentLength !== null && Number(contentLength) > MAX_WIRE_BODY_BYTES) {
      return errorResponse('invalid_request', 400, responseOrigin);
    }

    let parsed: { text: string; context: { focalPoints: PlanningIntentProviderRequest['focalPoints'] } };
    try {
      const text = await readBoundedText(request.body, MAX_WIRE_BODY_BYTES);
      parsed = parsePlanningIntentWireRequest(JSON.parse(text) as unknown);
    } catch {
      return errorResponse('invalid_request', 400, responseOrigin);
    }
    if (typeof env.GROQ_API_KEY !== 'string' || env.GROQ_API_KEY.trim().length === 0) {
      return errorResponse('server_misconfigured', 503, responseOrigin);
    }

    try {
      const providerRequest: PlanningIntentProviderRequest = {
        userText: parsed.text,
        focalPoints: parsed.context.focalPoints.map((focal) => ({ ...focal })),
      };
      const output = await requestGroqIntent(providerRequest, env.GROQ_API_KEY, fetchImpl);
      return json({ ok: true, output }, 200, responseOrigin);
    } catch (cause) {
      if (cause instanceof GroqIntentError) {
        const status = cause.code === 'upstream_rate_limited' ? 429 : cause.code === 'upstream_timeout' ? 504 : 502;
        return errorResponse(cause.code, status, responseOrigin);
      }
      return errorResponse('upstream_unavailable', 502, responseOrigin);
    }
  };

export default {
  fetch: createPlanningIntentHandler(),
} satisfies ExportedHandler<PlanningIntentWorkerEnv>;
