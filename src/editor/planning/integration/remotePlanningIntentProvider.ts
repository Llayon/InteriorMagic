import type {
  PlanningIntentProvider,
  PlanningIntentProviderRequest,
} from '@/editor/planning/intent';
import { PLANNING_INTENT_CONTRACT_VERSION } from '@/editor/planning/intent';

export type RemotePlanningIntentProviderOptions = {
  endpoint: string;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const createRemotePlanningIntentProvider = ({
  endpoint,
  signal,
  fetchImpl = fetch.bind(globalThis),
}: RemotePlanningIntentProviderOptions): PlanningIntentProvider => ({
  async interpret(request: PlanningIntentProviderRequest): Promise<unknown> {
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contractVersion: PLANNING_INTENT_CONTRACT_VERSION,
        text: request.userText,
        focals: request.focalPoints.map((focal) => ({ ...focal })),
      }),
      signal,
    });
    let payload: unknown;
    try {
      payload = await response.json() as unknown;
    } catch {
      throw new Error('Planning intent server returned an invalid response');
    }
    if (!response.ok || !isRecord(payload) || payload['ok'] !== true
      || payload['contractVersion'] !== PLANNING_INTENT_CONTRACT_VERSION || !('output' in payload)) {
      const error = isRecord(payload) && isRecord(payload['error']) && typeof payload['error']['code'] === 'string'
        ? payload['error']['code']
        : `http-${response.status}`;
      throw new Error(`Planning intent provider failed: ${error}`);
    }
    return payload['output'];
  },
});
