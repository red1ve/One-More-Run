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

Achievements (`src/game/Achievements.js`) follow the daily quests: `Game` reports events (a risk pass, a close call, a coin, the run time) and the module only decides and stores; the START window is `Renderer.drawAchievements`. Moving parts other than the swaying planter live in `segment.movers` (door leaves with `door`, the cart with `cart`; `Track.placeMover` drives them in `Track.update`; an open leaf has `open = true` and is skipped by collision and close calls). Rare pickups (the yarn-ball shield) live in `segment.pickups` next to `segment.coins`: `Track.maybePlaceYarn` decides with a hash of the row id (never `this.random` or `Math.random`, so the track itself does not change), `collectPickups` takes them, `breakAhead` removes the walls near the cat when a shield breaks. `Track` keeps semantic segment types (`NORMAL`, `TWO_PATHS`, `DUAL_RISK`) separate from geometric pattern metadata. Non-straight patterns are authored as ordered gate rows and compiled into the same `paths` and `obstacles` rectangles used by rendering and collision.

Full-route reachability propagates valid player-center intervals through every row using current track speed, player speed, player width, and the existing safety margin. Invalid patterns fall back to straight geometry without changing segment rewards or Choice semantics.

### input/

Keyboard (left/right keys), mouse and touch. A held finger or mouse button is a target point: `Player.steerTo(x)` drives the cat to it at its normal speed (`CONFIG.PLAYER_SPEED`) but never past it, starts only when the finger moves more than `CONFIG.STEER.START_PX` away and stops within `STOP_PX`, so finger tremor does not move the cat. Keys win over finger and mouse. The cat's lean (`Player.lean`) follows its real movement, not the pressed direction. Checks: `scripts/phase1r-check.mjs`.

### rendering/

Canvas rendering and visual effects. All drawing code works in logical 540 × 960 coordinates; `Game.render` sets `ctx.setTransform(scale…)` from the canvas width every frame, so a canvas with 1.5× or 2× real pixels (`RenderScale.js`) needs no changes in the drawing code. Caches in real pixels (the sky cache in `SkyArt`) and the picture-size choice of `ArtPack` follow `scale`.

Painted art (hedge clumps, trees, planters, gates, bushes, props, pergola, sky) comes from `assets/art-pack/`. The originals stay untouched; `node scripts/art-pack-game.mjs` writes game-sized copies to `assets/art-pack/game/` (WebP plus a PNG/JPG fallback). `rendering/ArtPack.js` checks WebP support once, loads one set, and keeps pre-scaled and mirrored copies so each frame only copies ready images. After replacing or adding a picture, rerun the script and add the file to `ArtPack.js` and to the script's `PLAN`.

### services/

External services and browser persistence. `AudioService` plays the sounds and the music by Web Audio synthesis (no audio files): `MusicScore.js` holds the music as data (32 bars: melody, bass, arpeggio, long chord; checked by tests, silent), `CONFIG.MUSIC` the voices and the quiet birds (day) and crickets (night).

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

`StorageService` remains the immediate persistence and standalone fallback for best score, the time of the best run (`bestRunTime`, for the record ribbon), Coins, and mute. Phase 7 does not add cloud saves or secrets.

See `docs/yandex-integration.md` for SDK setup and Developer Console requirements.

## Local development

Use Vite development server.

```bash
npm install
npm run dev

```

## Performance (measured 2026-10-22, before the first release)

Measured in the Browser pane of the desktop app at a phone-sized viewport (375 px, devicePixelRatio 2, canvas scale 2 = 1080 × 1920) with a bot that plays on its own. A phone is several times slower than this computer, so these are relative numbers. The owner played the build on a real phone on 2026-10-22 and found it smooth (no frame counter was needed; an idea for a dev-only `?fps=1` counter was dropped on purpose).

- A frame costs 2.5 ms of main-thread time (the budget at 60 fps is 16.7 ms): `update` 0.06 ms, drawing 2.4 ms. Nothing inside it is above 0.9 ms; the biggest piece is the hedge (`HedgeArt.drawPackClumps`: about 1000 `drawImage` calls a frame, all of them visible, medium size, overdraw 1.4×) and everything else is smaller. Per frame the code makes about 4400 `lineTo` (the hedge and curb polygons), 1070 `drawImage`, 290 `ellipse`; the road ribbon is only 370 of the `lineTo`.
- Memory: the JS heap saw-tooths between 11 and 25 MB (about 230 KB of garbage per frame, mostly the objects that `projectWorldToScreen` returns), no growth over a long run; the audio scheduler costs under 1 ms a second (10–12 oscillators and 6 filters a second).
- Loading the production build: 41 requests, 644 KB (WebP set; the PNG fallback set is not loaded where WebP works), the `load` event at about 0.55 s on localhost, no task over 50 ms. Switching a skin takes 22–30 ms.
- The camera shift changes every frame, so the road and hedge outlines cannot be cached between frames (and they cost only 0.3 ms).

Tried and rejected (no gain in a measurement against pixel-identical frames, so the code stayed as it is): turning the pre-scaled sprites into `ImageBitmap`s (same time, same pixels); drawing the hedge sprites from one atlas canvas (not faster, and the pixels differ at the sprite edges). Not done on purpose: skipping frames on 90–120 Hz screens (a 60 fps cap would give 45 fps on 90 Hz screens), caching road geometry, pooling the projector results (a refactor of the render path for a gain that cannot be seen without a phone). Known and harmless: the game over screen and the pause keep redrawing every frame (battery, not speed).

## Production

```bash
npm run build

```

Production files are generated into:

```text
dist/

```

