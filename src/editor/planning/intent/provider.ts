import type { PlanningIntentFocalPoint } from './types';

/** Version of the planning-intent contract carried by the browser/worker transport. */
export const PLANNING_INTENT_CONTRACT_VERSION = 2 as const;

/**
 * Minimal payload handed to the provider. Contains ONLY the trimmed user text
 * and the allowed focal IDs/kinds/labels — never RoomProject, PlanningScene,
 * geometry, coordinates, catalog assets or editor state.
 */
export type PlanningIntentProviderRequest = {
  userText: string;
  focalPoints: PlanningIntentFocalPoint[];
};

/**
 * Track B owns this tiny internal provider-response protocol. A well-behaved
 * provider replies either with a structured PlanningGoalV2-like object or with
 * exactly one of these sentinels. Anything else is treated as untrusted
 * external input and must survive parsePlanningGoalV2() + contextual validation.
 */
export type PlanningIntentSentinelName = 'unsupported_intent' | 'ambiguous_focal';

export type PlanningIntentProviderSentinel = {
  intent: PlanningIntentSentinelName;
};

/**
 * Provider-neutral boundary. Track B core never depends on a concrete vendor
 * (OpenAI/Gemini/Anthropic/etc.); a real transport adapter can be attached
 * later behind this interface from a server-side endpoint.
 */
export interface PlanningIntentProvider {
  interpret(request: PlanningIntentProviderRequest): Promise<unknown>;
}
