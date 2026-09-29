# Yandex Games Integration

## Runtime design

Yandex Games is an optional platform layer:

```text
Game → YandexService → Yandex Games SDK
```

`YandexService` dynamically loads `/sdk.js` and calls `YaGames.init()` once. Initialization runs in the background after the START screen is rendered. SDK loading never blocks input or the game loop.

The service exposes `unavailable`, `loading`, `ready`, and `failed` states. Missing SDK, initialization failure, unsupported methods, an unauthorized player, a missing leaderboard, and unavailable ads all fall back silently to normal standalone gameplay.

No private keys, tokens, or credentials are used.

## Language detection

Immediately after `YaGames.init()`, the service reads `ysdk.environment.i18n.lang`. It exposes:

- `detectedLanguage` — normalized Yandex portal language;
- `language` — language currently supported by the game UI.

Since Phase 4 the whole UI is localized (START, Game Over, HUD, hints, sound, floating subtitles): every string lives in `src/localization/en.json` and `ru.json`, and `src/localization/i18n.js` picks one via `t(key, params)`. `main.js` calls `setLanguage(yandex.getLanguage())` after `YaGames.init()`.

- `ru` selects Russian. `be`, `kk`, `uk`, `uz` also get the Russian UI (`YANDEX.RUSSIAN_UI_LANGUAGES`), as Yandex recommends for the CIS audience.
- `en` and every other code select English. Standalone mode (no SDK) defaults to English.
- Russian glyphs come from the Cyrillic subset of M PLUS Rounded 1c (`src/localization/fonts.js`, ~14 KB), loaded only when the language is Russian; Latin and digits stay in Fredoka.
- Dev only (`npm run dev`): `?lang=ru` forces a language for testing.

Russian and English can both be declared in the Developer Console. Adding a language later means adding a dictionary with the same keys (`scripts/l10n-check.mjs` checks keys and placeholders) and a font that covers its script.

## Loading and gameplay markup

After input listeners are installed and the visible START screen has rendered, `main.js` requests `LoadingAPI.ready()`. The service sends it when SDK initialization completes. The request is event-driven, has no arbitrary Game Ready delay, and can only be sent once.

`GameplayAPI.start()` is sent only while PLAYING and not paused. `GameplayAPI.stop()` is sent on Game Over, tab hide, a platform pause event, and before an interstitial.

The service subscribes once to:

- `game_api_pause`;
- `game_api_resume`.

These events pause/resume an active run without changing START or GAMEOVER.

## Leaderboard

Technical leaderboard name:

```text
one_more_run_score
```

Create a numeric descending leaderboard with exactly this technical name in the Yandex Games Developer Console.

On a local NEW BEST, the game asks `YandexService` to submit the score. The service checks:

```javascript
await ysdk.isAvailableMethod('leaderboards.setScore')
```

and then uses:

```javascript
await ysdk.leaderboards.setScore('one_more_run_score', score)
```

The deprecated `ysdk.getLeaderboards()` API is not used. Score submission is not attempted every frame and is not required for local NEW BEST feedback. Unauthorized users continue with localStorage.

Phase 7 does not add a leaderboard screen or automatic login prompt.

## Advertising

Fullscreen ads use `ysdk.adv.showFullscreenAdv()` with `onOpen`, `onClose`, and `onError`.

The game never shows an ad during an active run or immediately over Game Over results. A possible ad occurs only after the player requests a restart from GAMEOVER, and only after three completed runs since the previous ad attempt. Yandex may still decline the impression or apply its own frequency control.

Ad close, no-fill, unavailable SDK, and errors all continue to the requested run. Repeated input cannot create duplicate ad calls or duplicate runs. If the page becomes hidden while the ad request is resolving, the game remains on GAMEOVER and waits for a new user gesture.

Rewarded video is intentionally not connected: there is no suitable reward loop, revive, shop, or rewarded Coin mechanic.

## Local fallback

When `/sdk.js` is unavailable (including a normal localhost session):

- START and gameplay work;
- score and local NEW BEST work;
- best score, Coins, and mute remain in localStorage;
- audio and visibility lifecycle work;
- restart starts immediately without ads;
- no global `ysdk` or SDK method is accessed.

## Debug testing

Use the official Yandex Games debug panel from the Developer Console. Alternatively append `&debug-mode=16` to a Yandex game URL.

Verify:

- Loader indicator is `IT`;
- I18N indicator turns green during startup;
- Game Ready turns green;
- Gameplay indicator starts/stops with PLAYING, Game Over, focus, and ads;
- `game_api_pause` freezes movement, score, runTime, Coins, and audio;
- leaderboard submission works for an authorized player;
- an unauthorized player remains fully playable;
- fullscreen ad close and no-fill both lead to exactly one requested restart.

## Yandex Games Console

- [ ] Create the game.
- [ ] Upload the production `dist/` archive and verify `/sdk.js`.
- [ ] Open the draft with the official debug panel.
- [ ] Confirm SDK initialization and `LoadingAPI.ready()`.
- [ ] Confirm automatic language detection in the debug panel.
- [ ] Declare Russian and English (both fully localized since Phase 4); fill the catalogue name and description in both languages.
- [ ] Create a numeric descending leaderboard.
- [ ] Set its Technical leaderboard name to `one_more_run_score`.
- [ ] Test leaderboard submission as an authorized player.
- [ ] Test standalone/unauthorized behavior.
- [ ] Enable monetization if required.
- [ ] Verify fullscreen advertising and frequency behavior.
- [ ] Verify gameplay/audio pause during ads and focus loss.
- [ ] Check portrait mobile scaling, touch, mouse, and keyboard.
- [ ] Submit the tested build for moderation.

Developer Console resources, leaderboard creation, authorization behavior, monetization approval, real ad inventory, and moderation cannot be completed from application code.
