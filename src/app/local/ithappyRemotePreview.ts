import { normalizeRemoteAssetOrigin } from './ithappyRegistryPrototype';

type RemotePreviewConfig = {
  enabled?: string;
  assetOrigin?: string;
  placementMetadataUrl?: string;
};

export const resolveIthappyRemotePreviewOrigin = (search: string, config: RemotePreviewConfig) => {
  const requested = new URLSearchParams(search).get('registry') === 'ithappy-remote';
  if (!requested || config.enabled !== 'true') return null;
  if (!config.assetOrigin || !config.placementMetadataUrl) throw new Error('Remote ITHappy preview requires ASSET_ORIGIN and PREVIEW_PLACEMENT_URL');
  return { assetOrigin: normalizeRemoteAssetOrigin(config.assetOrigin), placementMetadataUrl: config.placementMetadataUrl };
};
