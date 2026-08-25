import type { AssetId } from '@/editor/assets/registry';

export interface Ar0RevisionDefinition {
  readonly assetRevisionId: 'sheen-chair-r1';
  readonly assetId: AssetId;
  readonly prefix: 'ar0/sheen-chair/r1/';
}

const SHEEN_CHAIR_R1: Ar0RevisionDefinition = {
  assetRevisionId: 'sheen-chair-r1',
  assetId: 'sheenChair',
  prefix: 'ar0/sheen-chair/r1/',
};

export const getAr0RevisionForAsset = (assetId: string): Ar0RevisionDefinition | null =>
  assetId === SHEEN_CHAIR_R1.assetId ? SHEEN_CHAIR_R1 : null;

export const getAr0Revision = (assetRevisionId: string): Ar0RevisionDefinition | null =>
  assetRevisionId === SHEEN_CHAIR_R1.assetRevisionId ? SHEEN_CHAIR_R1 : null;

const ensureTrailingSlash = (value: string) => value.endsWith('/') ? value : `${value}/`;

export interface Ar0UrlEnvironment {
  readonly locationOrigin: string;
  readonly baseUrl: string;
  readonly assetOrigin?: string;
}

export const buildAr0LandingUrl = (
  assetRevisionId: string,
  environment: Ar0UrlEnvironment = {
    locationOrigin: window.location.origin,
    baseUrl: import.meta.env.BASE_URL,
  },
): string => {
  const url = new URL(environment.baseUrl, environment.locationOrigin);
  url.search = '';
  url.hash = '';
  url.searchParams.set('ar', assetRevisionId);
  return url.href;
};

export const buildAr0RevisionBaseUrl = (
  revision: Ar0RevisionDefinition,
  environment: Ar0UrlEnvironment = {
    locationOrigin: window.location.origin,
    baseUrl: import.meta.env.BASE_URL,
    assetOrigin: import.meta.env.VITE_AR_ASSET_ORIGIN,
  },
): string => {
  const configuredOrigin = environment.assetOrigin?.trim();
  const base = configuredOrigin
    ? new URL(ensureTrailingSlash(configuredOrigin))
    : new URL(environment.baseUrl, environment.locationOrigin);
  if (configuredOrigin && base.protocol !== 'https:' && !(base.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname))) {
    throw new Error('VITE_AR_ASSET_ORIGIN must use HTTPS or loopback HTTP');
  }
  return new URL(revision.prefix, ensureTrailingSlash(base.href)).href;
};
