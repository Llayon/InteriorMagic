export const planImmutableUpload = (objects, statuses) => {
  const statusByPath = new Map(statuses.map((status) => [status.path, status]));
  for (const object of objects) {
    const status = statusByPath.get(object.path);
    if (status?.exists && !status.identical) throw new Error(`Immutable R2 conflict at ${object.path}`);
  }

  const checksumsStatus = statusByPath.get('checksums.json');
  const missingPayload = objects.some((object) => object.path !== 'checksums.json' && !statusByPath.get(object.path)?.exists);
  if (checksumsStatus?.exists && missingPayload) {
    throw new Error('Immutable R2 release is incomplete: checksums.json exists while a payload is missing');
  }

  return objects
    .filter((object) => !statusByPath.get(object.path)?.exists)
    .sort((left, right) => Number(left.path === 'checksums.json') - Number(right.path === 'checksums.json'));
};
