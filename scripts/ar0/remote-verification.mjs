export const requireRemoteVerificationOrigins = ({ publicOrigin, appOrigin }) => {
  if (!publicOrigin?.trim()) throw new Error('AR0_R2_PUBLIC_ORIGIN is required for remote verification');
  if (!appOrigin?.trim()) throw new Error('AR0_APP_ORIGIN is required for remote verification');
  return { publicOrigin: publicOrigin.trim(), appOrigin: appOrigin.trim() };
};

export const assertRemoteCors = (allowOrigin, appOrigin) => {
  if (allowOrigin !== '*' && allowOrigin !== appOrigin) {
    throw new Error(`Remote CORS does not allow ${appOrigin}`);
  }
};
