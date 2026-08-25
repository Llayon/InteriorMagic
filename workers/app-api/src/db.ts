export async function getExistingUserId(
  db: D1Database,
  provider: string,
  providerSubject: string,
): Promise<string | null> {
  const row = await db
    .prepare('SELECT user_id FROM external_identities WHERE provider = ? AND provider_subject = ?')
    .bind(provider, providerSubject)
    .first<{ user_id: string }>();
  return row?.user_id ?? null;
}

export async function getOrCreateUserId(
  db: D1Database,
  provider: string,
  providerSubject: string,
): Promise<string> {
  const existing = await getExistingUserId(db, provider, providerSubject);
  if (existing) return existing;

  const candidateId = crypto.randomUUID();
  const now = Date.now();

  try {
    const batch = await db.batch([
      db.prepare('INSERT INTO users (id, created_at) VALUES (?, ?)').bind(candidateId, now),
      db.prepare(
        'INSERT INTO external_identities (provider, provider_subject, user_id, created_at) VALUES (?, ?, ?, ?)',
      ).bind(provider, providerSubject, candidateId, now),
    ]);
    // D1 batch returns array of results; check success
    const failed = batch.some((r) => !r.success);
    if (failed) throw new Error('batch failed');
    return candidateId;
  } catch {
    // Concurrent winner may have inserted; recover by selecting existing.
    const after = await getExistingUserId(db, provider, providerSubject);
    if (after) return after;
    throw new Error('failed to resolve identity');
  }
}
