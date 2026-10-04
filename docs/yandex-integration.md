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

After input listeners are installed, the START screen has rendered and the art-pack pictures have loaded (`ArtPack.whenLoaded`, which also settles on a load error), `main.js` requests `LoadingAPI.ready()`. A 6-second limit guarantees the request even on a very slow network. The service sends it when SDK initialization completes, and only once. Checked in the browser with a mock SDK: normal network — one call at ≈1 s with all 32 pictures loaded; slow 3G in dev mode — one call from the 6-second limit.

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

### Leaderboard screen and sign-in (2026-10-01)

The START and Game Over screens show a «ЛИДЕРЫ / LEADERBOARD» button when the SDK has `leaderboards.getEntries` (in `npm run dev` a stub with an invented table is shown instead). It opens a window over the screen with the top 10 and the places around the player (`getEntries('one_more_run_score', { quantityTop: 10, includeUser: true, quantityAround: 1 })`; `getEntries` works without authorization). The answer is normalised in `YandexService.getLeaderboard` (places start at 1, a gap between the top and the player's neighbours is drawn as «…», a missing public name is shown as «ИГРОК», the player's own row is highlighted and, without a name, labelled «ВЫ») and cached for 20 s. States: loading, ready, empty, error (the window always says something and can always be closed: button, Esc).

A player who is not signed in sees the table and a green «ВОЙТИ / SIGN IN» button with the line «войдите, чтобы ваш результат попал в таблицу». It calls `ysdk.auth.openAuthDialog()`; after a successful sign-in the service forgets the old player, the table cache and the last submitted score, the game sends the best score, merges the cloud data and reloads the table. Nothing else in the game asks for a login.

### Cloud save (2026-10-01)

`ysdk.getPlayer({ scopes: false })` then `player.getData(keys)` / `player.setData(data, true)` (limits: 200 KB, 100 requests per 5 minutes). Stored keys (`CONFIG.YANDEX.CLOUD_KEYS`): `bestScore`, `coins` (the balance, for older versions), `coinsEarned`, `coinsSpent`, `skinsOwned`, `skinSelected`, `choiceHintSeen`, `riskHintSeen`. When the SDK is ready the game loads the cloud data and merges it with the local data: the bigger number wins, owned skins are united, hints count as seen if seen anywhere, so nothing is ever lost on either side and spent coins never come back (rules in `docs/business-rules.md`); the merged state is written back. A purchase in the shop is saved at once. At every Game Over the current state is queued for saving; writes are glued so there is at most one per `CLOUD_SAVE_MIN_INTERVAL_MS` (4 s) and the latest state wins. Sound settings stay local. localStorage stays the source of truth for instant saves; the cloud only restores progress on another device or after the site data was cleared.

### Rating request (2026-10-01)

After a NEW BEST, from the `REVIEW_AFTER_RUNS`-th (3rd) completed run of the session, the game waits 1.5 s on the Game Over card and calls `ysdk.feedback.canReview()`; only if it answers `value: true` does it call `requestReview()` (the platform allows one request per session and only for signed-in players: `NO_AUTH` is a normal answer). It never fires if the player has already restarted, an ad is open or the game is paused.

### Shortcut (2026-10-01)

If `ysdk.shortcut.canShowPrompt()` returns `canShow: true`, the START screen shows a «ЯРЛЫК НА ЭКРАН» button that calls `ysdk.shortcut.showPrompt()`; after `outcome: 'accepted'` the button disappears.

All these calls are wrapped: an error, a missing method or an unavailable SDK means «no data / no button», never a crash. `CONFIG.YANDEX.DEV_PLATFORM_STUB` (on only in `npm run dev`) imitates the table, the rating request and the shortcut without the SDK.

## Advertising

Fullscreen ads use `ysdk.adv.showFullscreenAdv()` with `onOpen`, `onClose`, and `onError`.

The game never shows an ad during an active run or immediately over Game Over results. A possible ad occurs only after the player requests a restart from GAMEOVER, and only after three completed runs since the previous ad attempt. Yandex may still decline the impression or apply its own frequency control.

Ad close, no-fill, unavailable SDK, and errors all continue to the requested run. Repeated input cannot create duplicate ad calls or duplicate runs. If the page becomes hidden while the ad request is resolving, the game remains on GAMEOVER and waits for a new user gesture.

### Rewarded video (Phase 5)

`YandexService.showRewarded()` calls `ysdk.adv.showRewardedVideo({ callbacks: { onOpen, onRewarded, onClose, onError } })`. The reward is granted **only** if `onRewarded` fired before `onClose`; `onClose` without it, `onError`, and a thrown call all give no reward and release the ad lock. Only one ad (fullscreen or rewarded) can be open at a time. After a rewarded ad the interstitial cooldown restarts, so a fullscreen ad never follows right after it.

Offers appear only on the Game Over card, only as explicit opt-in buttons with a video icon and the words "за рекламу" / "AD":

- **ПРОДОЛЖИТЬ ЗА РЕКЛАМУ / CONTINUE • AD** — once per run (`Game.revive()`): rows ahead are cleared and the cat is invulnerable for 2 s.
- **×2 МОНЕТЫ ЗА РЕКЛАМУ / x2 COINS • AD** — once per run, only if the run collected coins; adds this run's coins again. **Switched off** (`CONFIG.YANDEX.DOUBLE_COINS_AD = false`) since 2026-10-01 because coins have no use yet; switch on together with the shop. Do not test it in the console until then.

While the ad is open the game is paused (`adPaused`: movement, timers and audio stop; GameplayAPI is stopped) and restart input is ignored. Input is also ignored for `GAME_OVER_INPUT_LOCK` (0.6 s) after a crash, so a steering tap cannot restart or open an ad by accident. Without the SDK the buttons are hidden; in `npm run dev` a stub (`DEV_REWARDED_STUB`) simulates a watched ad so the flow can be tested locally.

Checked against the official docs by the owner (2026-09-29: `yandex.com/dev/games/doc/en/sdk/sdk-adv`, `.../concepts/requirements`): `showRewardedVideo` with `onOpen` / `onRewarded` / `onClose` / `onError`; the reward is given only on `onRewarded`; buttons must say it is an ad and what the reward is. The docs do not fix the order of `onRewarded` and `onClose`, so after `onClose` without a reward the service waits `REWARDED_CLOSE_GRACE_MS` (250 ms) for a late `onRewarded` before deciding there was no reward (`scripts/phase7-check.mjs` covers late, missing and too-late rewards).

Fullscreen (interstitial) facts from the same check: never during gameplay, only after a player action; Yandex decides the actual frequency. Our own 3-run cooldown only limits how often we ask.

### Sticky banner

Yandex shows the sticky banner by default from launch for the whole session. It is configured in the Developer Console, not in code. **Check its effect on the layout in the console draft** (the canvas is letterboxed to 9:16; the banner must not cover the HUD, the Game Over buttons or the bottom sound pill on 360×640), or switch it off in the console.

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
- fullscreen ad close and no-fill both lead to exactly one requested restart;
- rewarded: watching to the end revives / doubles coins; closing early or no-fill gives nothing and keeps Game Over; sound is muted while the ad is open.

## Moderation checklist

From the official requirements (owner's check, 2026-09-29). Status after Phase 6 QA (2026-09-30):

- [x] No long-press menu, text selection or context menu on phones (`user-select`, `-webkit-touch-callout`, `contextmenu` blocked on the game area).
- [x] No pull-to-refresh, page scroll or pinch/double-tap zoom on phones (`overscroll-behavior: none`, `touch-action: none` on the page and canvas, `user-scalable=no`, iOS `gesture*` and `dblclick` blocked).
- [x] File names in the archive have no spaces and no Cyrillic (`npm run verify:dist`).
- [x] `index.html` is at the root of `dist/`, relative asset paths (`base: './'`), build 3.7 MB (limit 100 MB): 0.65 MB is downloaded at start on modern browsers (WebP), the PNG fallback only on browsers without WebP.
- [x] The game field stretches to the screen: the 9:16 canvas fills the full height on desktop/landscape and the full width on tall phones (long side / short side = 1.78 ≤ 2). The page around it is the garden green, no shadow. Checked again in Phase 6 (2026-10) on 360×640, 390×844, 768×1024, 1366×768, 1920×1080 and landscape 844×390, Russian and English: no console errors, start, play, restart, tab hide/show, platform pause, sound, localStorage, rewarded ad (stub), touch hold left/right. In landscape on a phone the portrait field is narrow (219×390 on 844×390) — **declare portrait orientation in the console**.
- [x] Sign-in only by an explicit button; a guest plays fully without signing in (the game has no sign-in yet; leaderboard submit is skipped for guests).
- [ ] Game name matches the console per language: RU «Ещё забег», EN «One More Run» (START title and browser tab title come from `src/localization/*.json` → `start.title`, `meta.title`). **Owner: type exactly these names in the console.**
- [x] Rewarded buttons say it is an ad and name the reward; reward only on `onRewarded`.
- [x] No ads during gameplay; interstitial only after a player action (restart).
- [x] Sound and gameplay pause during ads and on `game_api_pause`; GameplayAPI start/stop follows PLAYING.
- [ ] Sticky banner does not cover the HUD or Game Over buttons (check in the console draft, or switch the banner off).

## Build and zip for the console

The console accepts a zip archive whose root contains `index.html` (not a folder with `index.html` inside).

1. Get the latest `main` and install: `git checkout main`, `git pull`, `npm install`.
   - Only if you replaced or added pictures in `assets/art-pack/`: run `node scripts/art-pack-game.mjs` (needs Playwright, see the script header) and commit `assets/art-pack/game/`. Otherwise skip this — the game copies are already in the repository.
2. Run the checks: `npm run check` (everything must say "passed").
3. Build: `npm run build`. This creates the `dist` folder.
4. Verify the build: `npm run verify:dist`. It must print «Сборка готова к упаковке в zip для Яндекса.»
5. Make the zip **from the contents of `dist`**, not from the folder itself:
   - **Windows (Explorer):** open the `dist` folder, press Ctrl+A to select `index.html` and `assets`, right-click → «Отправить» → «Сжатая ZIP-папка». Rename it, e.g. `one-more-run.zip`.
   - **Windows (PowerShell, in the project folder):** `Compress-Archive -Path dist\* -DestinationPath one-more-run.zip -Force`
   - **macOS / Linux (terminal, in the project folder):** `cd dist && zip -r ../one-more-run.zip . && cd ..`
6. Check the zip: open it — you must see `index.html` and the `assets` folder right away, without an extra `dist` folder.
7. Upload the zip in the Developer Console (draft → «Загрузить архив»), then open the draft with the debug panel (`&debug-mode=16`) and go through «Debug testing» above.

`/sdk.js` gives a 404 locally — that is expected; on Yandex hosting it is served by the platform.

## Yandex Games Console

- [ ] Create the game.
- [ ] Upload the production `dist/` archive and verify `/sdk.js`.
- [ ] Open the draft with the official debug panel.
- [ ] Confirm SDK initialization and `LoadingAPI.ready()`.
- [ ] Confirm automatic language detection in the debug panel.
- [ ] Declare Russian and English (both fully localized since Phase 4); fill the catalogue name and description in both languages. Names must match the game: RU «Ещё забег», EN «One More Run».
- [ ] Enable rewarded video and fullscreen ads for the game (monetization settings).
- [ ] Check or switch off the sticky banner (see «Sticky banner»).
- [ ] In the draft with the debug panel: watch a rewarded ad to the end (revive happens; ×2 coins only if the switch is on), close one early (nothing happens), check sound is muted during ads.
- [ ] Create a numeric descending leaderboard.
- [ ] Set its Technical leaderboard name to `one_more_run_score`.
- [ ] Test leaderboard submission as an authorized player.
- [ ] Test standalone/unauthorized behavior.
- [ ] Draft + debug panel, leaderboard screen: the «ЛИДЕРЫ» button opens the table with the real top and your place; as a guest the «ВОЙТИ» button opens the Yandex login and, after signing in, your best score appears in the table.
- [ ] Draft, cloud save: play a run, clear the site data (or open on another device) and reload while signed in: the best score and coins come back.
- [ ] Draft, shop: with some coins press «МАГАЗИН» on the start screen, buy a skin: the coins drop by the price, the running cat and the sitting cat wear it; reload: the skin and the balance stay; open the game on another device (or clear the site data) while signed in: the skin and the balance come back, the spent coins do not.
- [ ] Draft, shop: play on two devices, buy different skins on each, sync both: both devices keep both skins and the balance is not negative.
- [ ] Draft, rating request: signed in, beat your record on the 3rd run of a session: the Yandex rating window appears once on the Game Over card (not for guests, not twice in a session).
- [ ] Draft, shortcut: the «ЯРЛЫК НА ЭКРАН» button appears only where the platform allows it and disappears after accepting.
- [ ] Enable monetization if required.
- [ ] Verify fullscreen advertising and frequency behavior.
- [ ] Verify gameplay/audio pause during ads and focus loss.
- [ ] Declare **portrait** orientation (the field is 9:16; in landscape on a phone it is narrow).
- [ ] Upload the icon 512×512 and the cover (owner prepares them) and the screenshots from `docs/store/screenshots/` (phone 1080×1920 and desktop 1920×1080, honest gameplay frames).
- [ ] Check portrait mobile scaling, touch, mouse, and keyboard.
- [ ] Submit the tested build for moderation.

Developer Console resources, leaderboard creation, authorization behavior, monetization approval, real ad inventory, and moderation cannot be completed from application code.
