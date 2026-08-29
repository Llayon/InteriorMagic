export const AR0_REVISIONS = Object.freeze({
  'sheen-chair-r1': Object.freeze({
    arRevisionId: 'sheen-chair-r1',
    artifactDirectory: 'r1',
    materialProfile: 'legacy-r1',
  }),
  'sheen-chair-r2': Object.freeze({
    arRevisionId: 'sheen-chair-r2',
    artifactDirectory: 'r2',
    materialProfile: 'quick-look-r2',
  }),
});

export const parseAr0RevisionArgument = (args, fallback = 'sheen-chair-r1') => {
  const index = args.indexOf('--revision');
  const value = index >= 0 ? args[index + 1] : fallback;
  const revision = AR0_REVISIONS[value];
  if (!revision) throw new Error(`Unsupported AR0 revision: ${value ?? '(missing)'}`);
  return revision;
};
