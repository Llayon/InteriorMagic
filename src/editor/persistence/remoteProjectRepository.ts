/** Authenticated remote project repository (browser side of the App API
 *  project contract). Ownership is never sent: the session cookie is the only
 *  authority, so request bodies carry id/expectedRevision/project exclusively.
 *  Every call uses credentials:'include' and strict response parsing; malformed
 *  success bodies fail closed instead of being trusted. */

import type { RoomProject } from '@/editor/model/types';
import { ProjectDocumentError, parseRoomProjectDocument } from '@/editor/serialization/projectDocument';

export interface RemoteProjectMetadata {
  id: string;
  schemaVersion: number;
  revision: number;
  createdAt: number;
  updatedAt: number;
}

export type RemoteFailureKind =
  | 'network'
  | 'unauthenticated'
  | 'not_found'
  | 'conflict_stale_revision'
  | 'conflict_id'
  | 'server'
  | 'malformed'
  | 'disabled';

export type RemoteResult<T> =
  | { kind: 'ok'; data: T }
  | { kind: 'failure'; reason: RemoteFailureKind };

const failure = (reason: RemoteFailureKind): RemoteResult<never> => ({ kind: 'failure', reason });

interface MetadataShape {
  id?: unknown;
  schemaVersion?: unknown;
  revision?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
}

const parseMetadata = (value: unknown): RemoteProjectMetadata | null => {
  if (typeof value !== 'object' || value === null) return null;
  const metadata = value as MetadataShape;
  const { id, schemaVersion, revision, createdAt, updatedAt } = metadata;
  if (
    typeof id !== 'string' ||
    typeof schemaVersion !== 'number' ||
    typeof revision !== 'number' ||
    !Number.isSafeInteger(revision) ||
    revision < 1 ||
    typeof createdAt !== 'number' ||
    typeof updatedAt !== 'number'
  ) {
    return null;
  }
  return { id, schemaVersion, revision, createdAt, updatedAt };
};

const errorCodeOf = (body: unknown): unknown => {
  if (typeof body !== 'object' || body === null) return undefined;
  const error = (body as Record<string, unknown>).error;
  if (typeof error !== 'object' || error === null) return undefined;
  return (error as Record<string, unknown>).code;
};

const mapFailure = (status: number, body: unknown): RemoteResult<never> => {
  const code = errorCodeOf(body);
  if (status === 401) return failure('unauthenticated');
  if (status === 404) return failure('not_found');
  if (status === 409) return code === 'stale_revision' ? failure('conflict_stale_revision') : failure('conflict_id');
  if (status >= 500) return failure('server');
  void code;
  return failure('malformed');
};

/** Sends a credentials-included request and parses JSON defensively.
 *  Throws sentinel Errors('network'|'malformed') for controlled mapping. */
const sendJson = async (url: string, init: RequestInit): Promise<{ status: number; body: unknown }> => {
  let response: Response;
  try {
    response = await fetch(url, { credentials: 'include', ...init });
  } catch {
    throw new Error('network');
  }
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    if (response.ok) throw new Error('malformed');
  }
  return { status: response.status, body };
};

const okMetadata = (body: unknown): RemoteResult<RemoteProjectMetadata> => {
  if (typeof body !== 'object' || body === null || (body as Record<string, unknown>).ok !== true) return failure('malformed');
  const metadata = parseMetadata((body as Record<string, unknown>).metadata);
  if (metadata === null) return failure('malformed');
  return { kind: 'ok', data: metadata };
};

export const createRemoteProject = async (
  baseUrl: string,
  projectId: string,
  project: RoomProject,
): Promise<RemoteResult<RemoteProjectMetadata>> => {
  try {
    const { status, body } = await sendJson(`${baseUrl}/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: projectId, project }),
    });
    if (status === 200) return okMetadata(body);
    return mapFailure(status, body);
  } catch (cause) {
    if (cause instanceof Error && cause.message === 'network') return failure('network');
    return failure('malformed');
  }
};

export const fetchRemoteProject = async (
  baseUrl: string,
  projectId: string,
): Promise<RemoteResult<{ metadata: RemoteProjectMetadata; project: RoomProject }>> => {
  try {
    const { status, body } = await sendJson(`${baseUrl}/projects/${encodeURIComponent(projectId)}`, { method: 'GET' });
    if (status === 200) {
      if (typeof body !== 'object' || body === null || (body as Record<string, unknown>).ok !== true) return failure('malformed');
      const metadata = parseMetadata((body as Record<string, unknown>).metadata);
      if (metadata === null) return failure('malformed');
      try {
        const project = parseRoomProjectDocument((body as Record<string, unknown>).project);
        return { kind: 'ok', data: { metadata, project } };
      } catch (cause) {
        if (cause instanceof ProjectDocumentError) return failure('malformed');
        throw cause;
      }
    }
    return mapFailure(status, body);
  } catch (cause) {
    if (cause instanceof Error && cause.message === 'network') return failure('network');
    return failure('malformed');
  }
};

export const updateRemoteProject = async (
  baseUrl: string,
  projectId: string,
  expectedRevision: number,
  project: RoomProject,
): Promise<RemoteResult<RemoteProjectMetadata>> => {
  try {
    const { status, body } = await sendJson(`${baseUrl}/projects/${encodeURIComponent(projectId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedRevision, project }),
    });
    if (status === 200) return okMetadata(body);
    return mapFailure(status, body);
  } catch (cause) {
    if (cause instanceof Error && cause.message === 'network') return failure('network');
    return failure('malformed');
  }
};
