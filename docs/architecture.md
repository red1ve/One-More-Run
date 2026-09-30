# Architecture

## Stack

- HTML5
- CSS3
- JavaScript
- Canvas API
- Vite
- Yandex Games SDK
- localStorage

## Runtime

The game runs entirely in the browser.

There is no custom backend and no database.

## Rendering

Canvas is responsible for rendering the gameplay.

HTML/CSS is responsible for menus and non-gameplay UI where appropriate.

## Project structure

```text
src/
├── game/
├── input/
├── rendering/
├── services/
├── ui/
└── localization/

```

### game/

Core gameplay logic.

`Track` keeps semantic segment types (`NORMAL`, `TWO_PATHS`, `DUAL_RISK`) separate from geometric pattern metadata. Non-straight patterns are authored as ordered gate rows and compiled into the same `paths` and `obstacles` rectangles used by rendering and collision.

Full-route reachability propagates valid player-center intervals through every row using current track speed, player speed, player width, and the existing safety margin. Invalid patterns fall back to straight geometry without changing segment rewards or Choice semantics.

### input/

Keyboard, desktop mouse (left/right half of the canvas), and touch input.

### rendering/

Canvas rendering and visual effects.

Painted art (hedge clumps, trees, planters, gates, bushes, props, pergola, sky) comes from `assets/art-pack/`. The originals stay untouched; `node scripts/art-pack-game.mjs` writes game-sized copies to `assets/art-pack/game/` (WebP plus a PNG/JPG fallback). `rendering/ArtPack.js` checks WebP support once, loads one set, and keeps pre-scaled and mirrored copies so each frame only copies ready images. After replacing or adding a picture, rerun the script and add the file to `ArtPack.js` and to the script's `PLAN`.

### services/

External services and browser persistence.

Examples:

- Yandex Games SDK
- localStorage

### ui/

Menus and interface.

### localization/

Translated UI strings.

## External integrations

### Yandex Games SDK

`src/services/YandexService.js` owns:

- advertising;
- authorized leaderboard score submission;
- `LoadingAPI.ready()`;
- `GameplayAPI.start()` / `GameplayAPI.stop()`;
- `game_api_pause` / `game_api_resume` events;
- launch-time `environment.i18n.lang` detection with English fallback;
- SDK loading, initialization, and standalone fallback.

Yandex-specific logic must remain inside the service layer.

The dependency direction is:

```text
Game
  ↓
YandexService
  ↓
Yandex Games SDK
```

`main.js` creates the service and starts `init()` in the background after input setup and the first START render. Gameplay never waits for SDK initialization. `Game` only calls the service's platform-neutral methods and never reads `YaGames` or an SDK object.

### Lifecycle

`Game` keeps START / PLAYING / GAMEOVER as gameplay state. Visibility, platform pause, and advertisement pause are independent pause reasons:

- hidden tab freezes gameplay and audio;
- `game_api_pause` freezes gameplay and audio;
- an interstitial freezes audio and keeps GAMEOVER visible;
- resume never changes START or GAMEOVER into PLAYING;
- a requested post-ad restart starts once after close/resume, unless the page became hidden.

The RAF may continue for rendering, but gameplay updates return early while paused.

### Persistence

`StorageService` remains the immediate persistence and standalone fallback for best score, Coins, and mute. Phase 7 does not add cloud saves or secrets.

See `docs/yandex-integration.md` for SDK setup and Developer Console requirements.

## Local development

Use Vite development server.

```bash
npm install
npm run dev

```

## Production

```bash
npm run build

```

Production files are generated into:

```text
dist/

```

