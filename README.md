# Interior Magic

On mobile, the 3D room fills the viewport. Use the bottom sheet handle to switch between peek and expanded catalog states, open Materials in the same sheet, and use the Home button to fit the room around the currently occupied UI area. Object actions appear contextually above the sheet.

[Live demo](https://llayon.github.io/InteriorMagic/)

The curated visual-QA room is available with `?demo=1`; combine it with `&debug=1` for renderer/cache metrics. Trial asset measurements are recorded in [`ASSET_AUDIT.md`](./ASSET_AUDIT.md).

Mobile-first прототип Telegram Mini App для расстановки мебели в заранее созданной 3D-комнате. Источником истины является сериализуемый проект; Three.js только отображает его.

Telegram bridge подключается официальным `telegram-web-app.js`; обычный browser/localhost mode остаётся рабочим без Telegram-контекста.

## Запуск

```bash
npm install
npm run dev
```

Browser QA запускается без отдельного ручного Vite server:

```bash
npm run playwright:install
npm run test:e2e
```

Подробности: [BROWSER_TESTING.md](BROWSER_TESTING.md).

Проверки: `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`. Тестовые GLB воспроизводятся командой `npm run assets:generate`.

## Стек

Vite, TypeScript strict, React, Three.js, React Three Fiber, Drei/Camera Controls и Zustand. Backend не требуется; сохранение выполняется в localStorage.

## Структура

- `src/editor` — модель проекта, asset registry, placement/collision/snap, DragController, session state и сериализация без зависимости от React/Three.js.
- `src/scene` — R3F-представление, GLB loader/cache, interaction proxies, камера и diagnostics.
- `src/ui` — HTML/CSS-интерфейс каталога, операций и материалов.
- `src/telegram` — безопасная интеграция с Telegram WebApp, не мешающая browser mode.
- `src/shared` — централизованные quality profiles.

Asset requirements и normalization описаны в [`ASSET_GUIDE.md`](./ASSET_GUIDE.md).

Лицензии и источники внешних моделей перечислены в [`THIRD_PARTY_ASSETS.md`](./THIRD_PARTY_ASSETS.md).

Управление: тап загружает и добавляет предмет, перетаскивание за любую часть proxy двигает его без скачка pivot; панель выбранного объекта позволяет вращать на 45°, дублировать и удалять. Меню `•••` сохраняет, загружает и сбрасывает проект.
