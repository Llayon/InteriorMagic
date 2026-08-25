import {
  planningIntentSystemPrompt,
  type PlanningIntentProviderRequest,
} from '../../../src/editor/planning/intent';
import { PlanningIntentTransportError, readBoundedText } from './transport';

export const GROQ_INTENT_MODEL = 'qwen/qwen3.6-27b';
export const GROQ_CHAT_COMPLETIONS_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
export const GROQ_TIMEOUT_MS = 15_000;
const MAX_GROQ_RESPONSE_BYTES = 64 * 1024;

export const QWEN_OUTPUT_SHAPE_HINT = [
  'Allowed output shapes (output exactly one JSON object and nothing else):',
  'TV success: {"activity":"watchTv","focalPointId":"<one supplied ID>"}',
  'Conversation success: {"activity":"conversation"}',
  'Unsupported: {"intent":"unsupported_intent"}',
  'Ambiguous: {"intent":"ambiguous_focal"}',
  'Successful goals use the key "activity", NEVER "intent".',
  'The key "intent" is reserved ONLY for unsupported_intent / ambiguous_focal.',
].join('\n');

export type GroqFailureCode =
  | 'upstream_rate_limited'
  | 'upstream_unavailable'
  | 'upstream_timeout'
  | 'upstream_invalid_response';

export class GroqIntentError extends Error {
  constructor(public readonly code: GroqFailureCode) {
    super(code);
    this.name = 'GroqIntentError';
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const userMessage = (request: PlanningIntentProviderRequest): string => {
  const focals = request.focalPoints.map((focal) =>
    focal.label === undefined
      ? `- ${focal.id} (${focal.kind})`
      : `- ${focal.id} (${focal.kind}): ${focal.label}`,
  ).join('\n');
  return [
    'User request:', request.userText, '',
    'Allowed TV focal points:', focals.length === 0 ? '(none)' : focals,
    '', QWEN_OUTPUT_SHAPE_HINT,
  ].join('\n');
};

export const buildGroqIntentRequest = (request: PlanningIntentProviderRequest) => ({
  model: GROQ_INTENT_MODEL,
  messages: [
    { role: 'system', content: planningIntentSystemPrompt },
    { role: 'user', content: userMessage(request) },
  ],
  response_format: { type: 'json_object' },
  reasoning_effort: 'none',
  temperature: 0.2,
  max_completion_tokens: 200,
  stream: false,
});

const completionContent = (payload: unknown): string | null => {
  if (!isRecord(payload) || !Array.isArray(payload['choices'])) return null;
  const first = payload['choices'][0];
  if (!isRecord(first) || !isRecord(first['message'])) return null;
  const content = first['message']['content'];
  return typeof content === 'string' && content.trim().length > 0 ? content : null;
};

export const requestGroqIntent = async (
  request: PlanningIntentProviderRequest,
  apiKey: string,
  fetchImpl: typeof fetch,
): Promise<unknown> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GROQ_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetchImpl(GROQ_CHAT_COMPLETIONS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(buildGroqIntentRequest(request)),
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
      throw new GroqIntentError('upstream_timeout');
    }
    throw new GroqIntentError('upstream_unavailable');
  } finally {
    clearTimeout(timeout);
  }

  if (response.status === 429) throw new GroqIntentError('upstream_rate_limited');
  if (!response.ok) throw new GroqIntentError('upstream_unavailable');

  let body: string;
  try {
    body = await readBoundedText(response.body, MAX_GROQ_RESPONSE_BYTES);
  } catch (error) {
    if (error instanceof PlanningIntentTransportError) throw new GroqIntentError('upstream_invalid_response');
    throw error;
  }
  let payload: unknown;
  try {
    payload = JSON.parse(body) as unknown;
  } catch {
    throw new GroqIntentError('upstream_invalid_response');
  }
  const content = completionContent(payload);
  if (content === null) throw new GroqIntentError('upstream_invalid_response');
  try {
    return JSON.parse(content) as unknown;
  } catch {
    return content;
  }
};
