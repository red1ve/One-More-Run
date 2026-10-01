# Features

Statuses:

- DONE — готово
- IN PROGRESS — в работе
- PLANNED — запланировано
- BLOCKED — заблокировано

Priorities:

- P0 — критически важно для публикации
- P1 — важно
- P2 — желательно
- P3 — после публикации

---

## Core gameplay


| Feature                | Priority | Status |
| ---------------------- | -------- | ------ |
| Player movement        | P0       | DONE   |
| Obstacle generation    | P0       | DONE   |
| Collision system       | P0       | DONE   |
| Procedural track       | P0       | DONE   |
| OFFSET passages        | P1       | DONE   |
| FUNNEL passages        | P1       | DONE   |
| OFFSET_GATE passages   | P1       | DONE   |
| DOUBLE_GATE passages   | P1       | DONE   |
| Difficulty progression | P0       | DONE   |
| Score system           | P0       | DONE   |
| Game over              | P0       | DONE   |
| Restart                | P0       | DONE   |


Current implementation notes:

- Horizontal player speed grows with the track speed: 420 px/s at the start, 500 px/s at the track maximum (Phase 1b; the generator still plans with 420). Phase 1b: the cat is drawn at 150 px with a 36×36 hitbox, the road at the cat is ~364 px wide, and narrow gaps are 6 px wider so side clearance is unchanged.
- Player X is clamped to the visual garden-path inner edges (hedge borders), not to empty grass outside the sand.
- Track speed follows `v(t) = max - (max - start) * e^(-t / tau)` (300 → 720, tau 70).
- Choices are SAFE/RISK (`TWO_PATHS`) and RISK/RISK (`DUAL_RISK` after 30s). No other Choice types.
- Intentional RISK grows streak; SAFE on a Choice resets streak and multiplier to 1.0x. Breathing / non-choice does not change streak.
- Multiplier starts at 1.0x, steps +0.5, caps at 5.0x. Path reward uses the multiplier **before** the step.
- Coins are a separate meta counter (+1), not score/streak/multiplier. They persist through Game Over. There is no shop.
- `VariationDirector` spaces Choices; reachability remains the source of truth, with fallback.
- Track patterns use ordered gate rows compiled into the existing obstacle/path rectangles. OFFSET, FUNNEL, OFFSET_GATE, and DOUBLE_GATE vary steering geometry without adding controls or rewards.
- All four patterns can vary NORMAL; SAFE/RISK supports OFFSET, FUNNEL, and OFFSET_GATE; DUAL_RISK supports OFFSET_GATE. DOUBLE_GATE unlocks after 60 seconds and remains NORMAL-only.
- Every route is validated across all gate rows and prior exits. Invalid patterns fall back to straight geometry of the same semantic segment.
- Game Over stops physics, score, coins, and new segments. The render loop may continue for overlay/effects.
- Restart: R / tap / click / Space / Enter start a run from START or GAME OVER. R does nothing while PLAYING.

---

## Progression


| Feature           | Priority | Status |
| ----------------- | -------- | ------ |
| Best score        | P0       | DONE   |
| Risk/reward paths | P1       | DONE   |
| Multiplier        | P1       | DONE   |
| RISK streak       | P1       | DONE   |
| Bonus coins       | P1       | DONE   |
| NEW BEST feedback | P1       | DONE   |


---

## Platform


| Feature                         | Priority | Status  |
| ------------------------------- | -------- | ------- |
| Yandex SDK initialization       | P0       | DONE    |
| Standalone browser fallback     | P0       | DONE    |
| LoadingAPI                      | P0       | DONE    |
| Gameplay API                    | P0       | DONE    |
| Platform pause/resume events    | P0       | DONE    |
| Automatic SDK language detection| P0       | DONE    |
| Russian + English UI            | P0       | DONE    |
| Build 3.7 MB (0.65 MB downloaded at start, WebP), `npm run verify:dist` | P0 | DONE |
| Fullscreen advertising wrapper  | P0       | DONE    |
| Authorized leaderboard submit   | P1       | DONE    |
| Sign-in button (in the leaderboard window) | P1 | DONE |
| Leaderboard display UI (top 10 + your place) | P2 | DONE (2026-10-01) |
| Cloud save (record, coins, hints; merge, nothing is lost) | P1 | DONE (2026-10-01) |
| Rating request after a new best | P1 | DONE (2026-10-01) |
| Desktop/home shortcut prompt | P2 | DONE (2026-10-01) |
| Rewarded advertising (continue; x2 coins is switched off until the shop exists) | P1 | DONE |


---

## UX


| Feature              | Priority | Status  |
| -------------------- | -------- | ------- |
| Start screen         | P0       | DONE    |
| Game over screen     | P0       | DONE    |
| Keyboard controls    | P0       | DONE    |
| Mouse click strafe   | P0       | DONE    |
| Mobile / touch       | P0       | DONE    |
| Control hint on start| P1       | DONE    |
| First-Choice hint (replaces the start-screen hint lines) | P1 | DONE    |
| Newcomer help (wider gaps while best score is low) | P1 | DONE |
| Contextual streak explanation | P1 | DONE  |
| DUAL_RISK label hierarchy | P1  | DONE    |
| Game Over replay motivation | P1 | DONE   |
| Mute toggle          | P1       | DONE    |
| Volume control (−/+, default 50%) | P1 | DONE |
| Pause (HUD button, P / Esc)       | P1 | DONE |
| Full settings menu   | P1       | PLANNED |
| Russian localization | P0       | DONE    |
| English UI           | P0       | DONE    |


Start / Game Over are canvas overlays, not a separate menu system. UI text comes from `src/localization/en.json` / `ru.json`; the language follows the Yandex SDK (ru/be/kk/uk/uz → Russian, otherwise English).

Phase 8 added presentation-only clarity (since 2026-10-01 the start-screen hint lines are replaced by one capsule at the first Choice, see `docs/ux-guidelines.md`): the first RISK explains streak, multiplier steps identify the new score multiplier, and Game Over shows either honest NEW BEST feedback or the points still needed. Coins are described as saved between runs. During play, Choices show reward values rather than repeating the words SAFE and RISK.

Phase 8 deliberately does not change speed, physics, hitboxes, Choice timing/geometry, rewards, score mathematics, streak/multiplier rules, Coin behavior, reachability, or Yandex lifecycle.

---

## Visual

| Feature | Priority | Status |
| ------- | -------- | ------ |
| Garden look matching `docs/reference/reference.webp` | P0 | DONE |
| Painted art pack (hedge, trees, planters, gates, bushes, props, pergola, sky) | P1 | DONE |
| Game-sized WebP copies + PNG fallback (`scripts/art-pack-game.mjs`) | P1 | DONE |
| Objects appear small at the pergola and grow (draw-only projection) | P1 | DONE |
| No flicker: every picture fixed per world slot (`scripts/phase1f-check.mjs`) | P1 | DONE |
| Portrait-only field; landscape phone shows a narrow field with green bars | P2 | Declare portrait in the console |

Details: `docs/visual-bible.md` §5–6.

---

## Audio / feel


| Feature                        | Priority | Status  |
| ------------------------------ | -------- | ------- |
| Sound effects                  | P1       | DONE    |
| Run music (synthesized loop)   | P1       | DONE    |
| Mute (M key + HUD)             | P1       | DONE    |
| Pause audio on tab hidden      | P0       | DONE    |
| Unlock after user gesture      | P0       | DONE    |
| GameFeel / particles           | P1       | DONE    |
| Pause audio during advertising | P0       | DONE    |


Web Audio is created once, unlocked by a user gesture, muted via storage key `audioMuted`, and suspended while the tab is hidden.

Run music (`src/services/MusicScore.js` + `AudioService`): a very simple calm 8-bar loop (C - Am - F - G, three-note pentatonic phrases, soft bass and a long quiet chord) synthesized with Web Audio, no audio files. It plays only during a run, fades in and out, speeds up from 100 to 120 BPM with the track speed, and pauses together with the audio context (mute, hidden tab, ad, platform pause). Volume and tempo are in `CONFIG.MUSIC`. The old cat meow on RISK crossings was removed (2026-10-01): RISK keeps its visual feedback only.

Yandex integration uses `YandexService` as an optional platform layer. The game remains fully playable when `/sdk.js`, authorization, leaderboards, or ads are unavailable. Rewarded ads (Phase 5): one revive per run (and, behind the switch `YANDEX.DOUBLE_COINS_AD`, ×2 coins of the run), reward only after `onRewarded`. The ×2 coins button is OFF since 2026-10-01: coins have no use until the shop exists, so the player would get nothing for watching. Turn the switch on together with the shop.

Newcomer help (2026-10-01): `getAssist(bestScore)` gives 1 for a brand-new player and fades linearly to 0 at best score `ASSIST.UNTIL_BEST` (800). At the start of every run `Game.start` hands it to `Track.setAssist`; ordinary gaps get up to +32 px and the SAFE gap of a Choice up to +24 px (at the very first fork up to +20, so the edge walls still fit): at full help the widths are the ones from before the narrowing (200 / 168 and 200 / 180 / 160). RISK gaps never change. An experienced player (best 800+) sees the current narrow widths. Dev only: `?assist=0..1` forces it.

Pause (2026-10-01): during a run a round pause button sits in the HUD between the score and the coin pill (same capsule style, two brown bars). It, `P` or `Esc` freezes the run (`Game.userPaused`, counted in `isGameplayPaused()`, so Yandex GameplayAPI is stopped too) and opens a card: PAUSE, score, best, RESUME (button, `P`, `Esc`, Space or Enter) and the sound row [-] [SOUND n%] [+] under it. Music keeps playing on pause so volume changes can be heard. Taps on the card never start a new run; `R` does not restart from the pause. Held keys and fingers are released on pause and resume. A hidden tab does not set the pause by itself (the game freezes while hidden and continues on return, as before).

Volume (2026-10-01): one master volume for effects and music, 0-100% in 10% steps, default 50% (the level the sounds were tuned for). Buttons [-] [SOUND n%] [+] on the START and Game Over screens (tapping the middle capsule mutes), keys `-` / `+`, `M` mutes. Saved in storage keys `audioVolume` and `audioMuted`. Settings in `CONFIG.AUDIO`.
