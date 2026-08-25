export const normalizeMediaType = (value) => value?.split(';', 1)[0]?.trim().toLowerCase() ?? '';

export const assertRemoteMediaType = (path, actual, expected) => {
  const actualMediaType = normalizeMediaType(actual);
  const expectedMediaType = normalizeMediaType(expected);
  if (actualMediaType !== expectedMediaType) {
    throw new Error(`Remote MIME is incorrect for ${path}: expected ${expectedMediaType}, received ${actualMediaType || '<missing>'}`);
  }
};
