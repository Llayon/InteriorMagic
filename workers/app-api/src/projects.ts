/** Owner-scoped cloud project repository (H3B).
 *
 *  Every query is scoped by user_id derived from requireSession(); callers must
 *  never pass client-supplied ownership. Documents are passed as canonical JSON
 *  strings produced by the validated document boundary — never raw client text.
 *
 *  CAS classification relies on documented D1 semantics: D1Result.meta.changes
 *  counts affected rows, and db.batch() executes statements sequentially in one
 *  transaction with rollback on failure, so a zero-change UPDATE followed by an
 *  owner-scoped SELECT observes consistent pre-update state. */

export interface ProjectMetadata {
  id: string;
  schemaVersion: number;
  revision: number;
  createdAt: number;
  updatedAt: number;
}

export interface ProjectRow {
  id: string;
  user_id: string;
  schema_version: number;
  revision: number;
  project_json: string;
  created_at: number;
  updated_at: number;
}

const toMetadata = (row: ProjectRow): ProjectMetadata => ({
  id: row.id,
  schemaVersion: row.schema_version,
  revision: row.revision,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const SELECT_COLUMNS = 'id, user_id, schema_version, revision, project_json, created_at, updated_at';

const getProjectRow = async (
  db: D1Database,
  userId: string,
  projectId: string,
): Promise<ProjectRow | null> => {
  const row = await db
    .prepare(`SELECT ${SELECT_COLUMNS} FROM projects WHERE id = ? AND user_id = ?`)
    .bind(projectId, userId)
    .first<ProjectRow>();
  return row ?? null;
};

/** Reads one owner-scoped project. Foreign and missing ids are indistinguishable. */
export const getProject = getProjectRow;

export type CreateProjectResult =
  | { kind: 'created'; metadata: ProjectMetadata }
  | { kind: 'idempotent'; metadata: ProjectMetadata }
  /** Same id exists under another owner, or same owner with different content.
   *  The external reason is never revealed. */
  | { kind: 'conflict' };

/** Retry-safe create keyed by client-generated UUID; ownership stays server-derived. */
export const createProject = async (
  db: D1Database,
  userId: string,
  projectId: string,
  schemaVersion: number,
  canonicalJson: string,
  now: number,
): Promise<CreateProjectResult> => {
  const res = await db
    .prepare(
      'INSERT INTO projects (id, user_id, schema_version, revision, project_json, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?, ?) ON CONFLICT(id) DO NOTHING',
    )
    .bind(projectId, userId, schemaVersion, canonicalJson, now, now)
    .run();
  const changes = (res as unknown as { meta?: { changes?: number } })?.meta?.changes ?? 0;
  if (changes === 1) {
    return {
      kind: 'created',
      metadata: { id: projectId, schemaVersion, revision: 1, createdAt: now, updatedAt: now },
    };
  }
  // inserts 0 → conflict on id: recover without creating an ownership oracle.
  const existing = await getProjectRow(db, userId, projectId);
  if (existing && existing.project_json === canonicalJson) {
    return { kind: 'idempotent', metadata: toMetadata(existing) };
  }
  return { kind: 'conflict' };
};

export type UpdateProjectResult =
  | { kind: 'updated'; metadata: ProjectMetadata }
  /** Lost-response retry: exactly expectedRevision+1 stored with identical canonical content. */
  | { kind: 'already_applied'; metadata: ProjectMetadata }
  | { kind: 'stale_revision'; currentRevision: number }
  | { kind: 'not_found' };

/** Owner-scoped optimistic CAS update. Zero changed rows are classified narrowly:
 *  already_applied requires currentRevision === expectedRevision + 1 AND identical
 *  canonical content; anything else with an existing row is stale_revision. */
export const updateProjectCas = async (
  db: D1Database,
  userId: string,
  projectId: string,
  expectedRevision: number,
  schemaVersion: number,
  canonicalJson: string,
  now: number,
): Promise<UpdateProjectResult> => {
  const results = await db.batch([
    db
      .prepare(
        'UPDATE projects SET project_json = ?, schema_version = ?, revision = revision + 1, updated_at = ? WHERE id = ? AND user_id = ? AND revision = ?',
      )
      .bind(canonicalJson, schemaVersion, now, projectId, userId, expectedRevision),
    db
      .prepare(`SELECT ${SELECT_COLUMNS} FROM projects WHERE id = ? AND user_id = ?`)
      .bind(projectId, userId),
  ]);

  const changes = results[0]?.meta?.changes ?? 0;
  const selectResult = results[1];
  const row =
    selectResult && typeof selectResult === 'object' && 'results' in selectResult
      ? ((selectResult as { results: ProjectRow[] }).results[0] ?? null)
      : null;

  if (changes === 1) {
    const metadata: ProjectMetadata = row
      ? toMetadata(row)
      : { id: projectId, schemaVersion, revision: expectedRevision + 1, createdAt: now, updatedAt: now };
    return { kind: 'updated', metadata };
  }

  if (!row) return { kind: 'not_found' };
  if (row.revision === expectedRevision + 1 && row.project_json === canonicalJson) {
    return { kind: 'already_applied', metadata: toMetadata(row) };
  }
  return { kind: 'stale_revision', currentRevision: row.revision };
};
