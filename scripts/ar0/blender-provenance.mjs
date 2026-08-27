export const readApprovedBlenderVersion = (report) => {
  const version = report?.converter?.version;
  if (report?.schemaVersion !== 1 || report?.converter?.name !== 'Blender' || typeof version !== 'string' || !version.trim()) {
    throw new Error('Blender converter report does not contain valid converter provenance');
  }
  if (!/^5\.2(?:\.|\s|$)/u.test(version)) {
    throw new Error(`Unsupported Blender version ${version}; AR0 requires the approved Blender 5.2 line`);
  }
  return version;
};
