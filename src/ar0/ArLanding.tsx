import '@google/model-viewer';
import { useEffect, useMemo, useRef, useState } from 'react';
import { getAsset } from '@/editor/assets/registry';
import { parseAr0Manifest, type Ar0RuntimeManifest } from './manifest';
import { buildAr0RevisionBaseUrl, getAr0Revision } from './revisions';
import './ar0.css';

interface ArLandingProps { readonly revisionId: string }

const centimeters = (meters: number) => `${(meters * 100).toFixed(1)} см`;

export function ArLanding({ revisionId }: ArLandingProps) {
  const revision = getAr0Revision(revisionId);
  const [manifest, setManifest] = useState<Ar0RuntimeManifest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isAppleMobile, setIsAppleMobile] = useState(false);
  const revisionBaseUrl = useMemo(() => revision ? buildAr0RevisionBaseUrl(revision) : null, [revision]);
  const modelViewerRef = useRef<HTMLElement & { activateAR?: () => Promise<void> | void }>(null);

  useEffect(() => {
    setIsAppleMobile(/iPhone|iPad|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
  }, []);

  useEffect(() => {
    if (!revision || !revisionBaseUrl) return;
    let active = true;
    setManifest(null);
    setError(null);
    void fetch(new URL('manifest.json', revisionBaseUrl))
      .then(async (response) => {
        if (!response.ok) throw new Error(`manifest HTTP ${response.status}`);
        return parseAr0Manifest(await response.json(), revision);
      })
      .then((loadedManifest) => { if (active) setManifest(loadedManifest); })
      .catch(() => {
        if (active) {
          setError('Не удалось загрузить AR-модель. Попробуйте позже.');
        }
      });
    return () => { active = false; };
  }, [revision, revisionBaseUrl]);

  if (!revision) {
    return <main className="ar0-landing ar0-error" data-testid="ar0-unknown-revision">
      <div className="ar0-card"><small>INTERIORMAGIC</small><h1>Модель не найдена</h1><p>Эта AR-ревизия недоступна.</p><a href={import.meta.env.BASE_URL}>Вернуться в каталог</a></div>
    </main>;
  }

  const asset = getAsset(revision.assetId);
  const modelUrl = manifest && revisionBaseUrl ? new URL(manifest.files.glb.path, revisionBaseUrl).href : undefined;
  const iosUrl = manifest && revisionBaseUrl ? new URL(manifest.files.usdz.path, revisionBaseUrl).href : undefined;
  const posterUrl = manifest && revisionBaseUrl ? new URL(manifest.files.poster.path, revisionBaseUrl).href : undefined;

  return <main className="ar0-landing" data-testid="ar0-landing" data-revision-id={revision.arRevisionId}>
    <header className="ar0-header"><div><small>INTERIORMAGIC</small><h1>{asset.name}</h1></div><span className="ar0-scale">Масштаб 1:1</span></header>
    <section className="ar0-viewer-shell" aria-label="Интерактивная 3D-модель кресла">
      {manifest && modelUrl && iosUrl && <model-viewer
        ref={modelViewerRef}
        data-testid="ar0-model-viewer"
        src={modelUrl}
        ios-src={iosUrl}
        poster={posterUrl}
        ar
        ar-modes="scene-viewer quick-look"
        ar-scale={manifest.ar.scale}
        ar-placement={manifest.ar.placement}
        camera-controls
        shadow-intensity="1"
        exposure="1"
      >
      </model-viewer>}
      {!manifest && !error && <div className="ar0-loading" role="status">Загружаем кресло…</div>}
      {error && <div className="ar0-load-error" role="alert">{error}</div>}
    </section>
    {manifest && modelUrl && iosUrl && <div className="ar0-actions">
      {isAppleMobile ? <a
        className="ar0-primary ar0-ios-launch"
        data-testid="ar0-launch"
        href={`${iosUrl}#allowsContentScaling=0`}
        rel="ar"
      >
        <img src={posterUrl} alt="" aria-hidden="true" />
        Примерить в комнате
      </a> : <button
        type="button"
        className="ar0-primary"
        data-testid="ar0-launch"
        onClick={() => { void modelViewerRef.current?.activateAR?.(); }}
      >Примерить в комнате</button>}
    </div>}
    <section className="ar0-details">
      <div className="ar0-dimensions" aria-label="Размеры кресла">
        <span>Ширина: <strong>{manifest ? centimeters(manifest.spatial.dimensionsMeters.width) : '—'}</strong></span>
        <span>Высота: <strong>{manifest ? centimeters(manifest.spatial.dimensionsMeters.height) : '—'}</strong></span>
        <span>Глубина: <strong>{manifest ? centimeters(manifest.spatial.dimensionsMeters.depth) : '—'}</strong></span>
      </div>
      <p data-testid="ar0-web-fallback">Наведите камеру на пол и немного подвигайте телефон. Если AR недоступен, модель остаётся доступной в 3D.</p>
    </section>
  </main>;
}
