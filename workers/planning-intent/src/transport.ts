import {
  MAX_PLANNING_INTENT_FOCALS,
  MAX_PLANNING_INTENT_TEXT_LENGTH,
  PLANNING_INTENT_CONTRACT_VERSION,
  validatePlanningIntentContext,
  type PlanningIntentContext,
} from '../../../src/editor/planning/intent';

export const MAX_WIRE_BODY_BYTES = 16 * 1024;
export const MAX_WIRE_FOCAL_ID_LENGTH = 256;
export const MAX_WIRE_FOCAL_LABEL_LENGTH = 120;

export class PlanningIntentTransportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PlanningIntentTransportError';
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const hasExactKeys = (record: Record<string, unknown>, allowed: readonly string[]): boolean =>
  Object.keys(record).every((key) => allowed.includes(key));

export const parsePlanningIntentWireRequest = (value: unknown): {
  text: string;
  context: PlanningIntentContext;
} => {
  if (!isRecord(value) || !hasExactKeys(value, ['contractVersion', 'text', 'focals'])) {
    throw new PlanningIntentTransportError('Request must contain only contractVersion, text and focals');
  }
  if (value['contractVersion'] !== PLANNING_INTENT_CONTRACT_VERSION) {
    throw new PlanningIntentTransportError('contractVersion is unsupported');
  }
  if (typeof value['text'] !== 'string') {
    throw new PlanningIntentTransportError('text must be a string');
  }
  const text = value['text'].trim();
  if (text.length === 0 || text.length > MAX_PLANNING_INTENT_TEXT_LENGTH) {
    throw new PlanningIntentTransportError('text length is outside the allowed range');
  }
  const entries = value['focals'];
  if (!Array.isArray(entries) || entries.length > MAX_PLANNING_INTENT_FOCALS) {
    throw new PlanningIntentTransportError('focals count is outside the allowed range');
  }

  const seenIds = new Set<string>();
  const focalPoints = entries.map((entry) => {
    if (!isRecord(entry) || !hasExactKeys(entry, ['id', 'kind', 'label'])) {
      throw new PlanningIntentTransportError('Each focal must contain only id, kind and optional label');
    }
    const id = entry['id'];
    const kind = entry['kind'];
    const label = entry['label'];
    if (typeof id !== 'string' || id.trim().length === 0 || id.length > MAX_WIRE_FOCAL_ID_LENGTH) {
      throw new PlanningIntentTransportError('Focal id is invalid');
    }
    if (seenIds.has(id)) throw new PlanningIntentTransportError('Focal ids must be unique');
    seenIds.add(id);
    if (kind !== 'tv') throw new PlanningIntentTransportError('Focal kind is unsupported');
    if (label !== undefined && (typeof label !== 'string' || label.length > MAX_WIRE_FOCAL_LABEL_LENGTH)) {
      throw new PlanningIntentTransportError('Focal label is invalid');
    }
    return label === undefined ? { id, kind: 'tv' as const } : { id, kind: 'tv' as const, label };
  });

  const context: PlanningIntentContext = { focalPoints };
  validatePlanningIntentContext(context);
  return { text, context };
};

export const readBoundedText = async (body: ReadableStream<Uint8Array> | null, maxBytes: number): Promise<string> => {
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
      if (total > maxBytes) throw new PlanningIntentTransportError('Body exceeds the allowed size');
      result += decoder.decode(value, { stream: true });
    }
    return result + decoder.decode();
  } finally {
    reader.releaseLock();
  }
};
