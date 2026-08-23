import type { PlanningIntentProviderRequest } from '../../../src/editor/planning/intent';
import { GroqIntentError, requestGroqIntent } from './groq';
import {
  MAX_WIRE_BODY_BYTES,
  parsePlanningIntentWireRequest,
  readBoundedText,
} from './transport';

type WorkerErrorCode =
  | 'invalid_request'
  | 'server_misconfigured'
  | 'upstream_rate_limited'
  | 'upstream_unavailable'
  | 'upstream_timeout'
  | 'upstream_invalid_response';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const json = (payload: unknown, status = 200): Response => Response.json(payload, {
  status,
  headers: { ...corsHeaders, 'Cache-Control': 'no-store' },
});

const errorResponse = (code: WorkerErrorCode, status: number): Response =>
  json({ ok: false, error: { code } }, status);

export const createPlanningIntentHandler = (fetchImpl: typeof fetch = fetch.bind(globalThis)) =>
  async (request: Request, env: PlanningIntentWorkerEnv): Promise<Response> => {
    const url = new URL(request.url);
    if (url.pathname !== '/planning-intent') return errorResponse('invalid_request', 404);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
    if (request.method !== 'POST') return errorResponse('invalid_request', 405);
    const contentLength = request.headers.get('content-length');
    if (contentLength !== null && Number(contentLength) > MAX_WIRE_BODY_BYTES) {
      return errorResponse('invalid_request', 400);
    }

    let parsed: { text: string; context: { focalPoints: PlanningIntentProviderRequest['focalPoints'] } };
    try {
      const text = await readBoundedText(request.body, MAX_WIRE_BODY_BYTES);
      parsed = parsePlanningIntentWireRequest(JSON.parse(text) as unknown);
    } catch {
      return errorResponse('invalid_request', 400);
    }
    if (typeof env.GROQ_API_KEY !== 'string' || env.GROQ_API_KEY.trim().length === 0) {
      return errorResponse('server_misconfigured', 503);
    }

    try {
      const providerRequest: PlanningIntentProviderRequest = {
        userText: parsed.text,
        focalPoints: parsed.context.focalPoints.map((focal) => ({ ...focal })),
      };
      const output = await requestGroqIntent(providerRequest, env.GROQ_API_KEY, fetchImpl);
      return json({ ok: true, output });
    } catch (cause) {
      if (cause instanceof GroqIntentError) {
        const status = cause.code === 'upstream_rate_limited' ? 429 : cause.code === 'upstream_timeout' ? 504 : 502;
        return errorResponse(cause.code, status);
      }
      return errorResponse('upstream_unavailable', 502);
    }
  };

export default {
  fetch: createPlanningIntentHandler(),
} satisfies ExportedHandler<PlanningIntentWorkerEnv>;
