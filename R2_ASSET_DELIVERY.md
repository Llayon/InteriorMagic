# ITHappy R2 asset delivery

This delivery layer keeps Cloudflare outside the editor domain. The application receives one provider-neutral immutable release root through `VITE_ITHAPPY_ASSET_ORIGIN`; `RuntimeAssetRegistry`, `CatalogRepository`, `AssetCache`, and `RoomProject.assetId` otherwise behave exactly as in local catalog mode.

## Immutable release

Release `v1` maps to:

```text
catalog/v1/runtime-catalog.json
catalog/v1/catalog-payload.json
catalog/v1/runtime/<assetId>.glb
catalog/v1/thumbnails/<assetId>.webp
catalog/v1/checksums.json
```

Every object uses `Cache-Control: public, max-age=31536000, immutable`. The deployer uploads `checksums.json` last. If that key already exists, the complete local checksum document must match exactly; otherwise deployment aborts and a new version is required. Partial asset upload cannot finalize a release.

Generated deployment files, logs, and operational absolute paths remain under `.agent-data/ithappy-r2-delivery` and are not committed or uploaded.

## Commands

```powershell
npm run assets:r2:dry-run
npx wrangler login
npm run assets:r2:setup
npm run assets:r2:deploy
$env:ITHAPPY_R2_PUBLIC_ORIGIN = "https://<bucket-id>.r2.dev"
npm run assets:r2:verify
```

`assets:r2:setup` lists buckets before creating `interiormagic-assets`, applies and reads back the read-only CORS policy, and enables the development-only `r2.dev` endpoint. No browser credential exists. The permitted browser methods are GET and HEAD; allowed origins are the GitHub Pages origin and loopback ports 4173/5173.

For local provider-boundary QA without Cloudflare access:

```powershell
npm run test:registry:ithappy:remote-local
```

For a real remote run, start Vite in test mode with an HTTPS release root and open `?registry=ithappy-remote`:

```powershell
$env:VITE_ITHAPPY_ASSET_ORIGIN = "https://<bucket-id>.r2.dev/catalog/v1/"
npm run dev -- --mode test
```

`r2.dev` is only the remote development gate. Cloudflare edge cache verification is **N/A — r2.dev development endpoint**. Production enablement waits for a custom asset domain and a narrowly scoped cache rule; neither is configured here.

Prototype placement bounds remain ignored local test data. They are not part of either deployed manifest and are not authoritative dimensions, footprints, or placement metadata.
