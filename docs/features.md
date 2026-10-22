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

- Horizontal player speed grows with the track speed: 420 px/s at the start, 500 px/s at the track maximum (Phase 1b; the generator still plans with 420). Since 2026-10-09 the maximum is 600 px/s (`PLAYER_SPEED_MAX`; first 560), because the track is faster. Phase 1b: the cat is drawn at 150 px with a 36×36 hitbox, the road at the cat is ~364 px wide, and narrow gaps are 6 px wider so side clearance is unchanged.
- Player X is clamped to the visual garden-path inner edges (hedge borders), not to empty grass outside the sand.
- Track speed follows `v(t) = max - (max - start) * e^(-t / tau)`: 300 → 1050, tau 45 (changed 2026-10-09 at the owner's request, "a more dynamic game"; it was 300 → 720, tau 70, then 950 for a few hours). In px/s: 10 s → 449, 30 s → 665, 60 s → 852, 120 s → 998; what used to be the speed at the second minute (644) is now reached at about 28 s. The start did not change.
- Choices are SAFE/RISK (`TWO_PATHS`) and RISK/RISK (`DUAL_RISK` after 30s). No other Choice types.
- Intentional RISK grows streak; SAFE on a Choice resets streak and multiplier to 1.0x. Breathing / non-choice does not change streak.
- Multiplier starts at 1.0x, steps +0.5, caps at 5.0x. Path reward uses the multiplier **before** the step.
- Coins (changed 2026-10-19, the owner found them too rare): about twice as many (chances ×1.6–2.2, `COIN_REPEAT_CHANCE_SCALE` 0.75, sometimes a second coin along the same wall `COIN_PAIR_CHANCE`), placed closer to the walls of the gap (`COIN_CENTER_WEIGHT`, `COIN_EDGE_POWER`: the share within 12 px of a wall rose from 11% to 27%), every coin still reachable and skippable; skin prices were raised ×1.6 (16 … 290, Halloween 350); since 2026-10-22 the first skin costs 20 because the golden hour adds coins. Coins are a separate meta counter (+1), not score/streak/multiplier. They persist through Game Over and are spent in the skin shop.
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
| Close call bonus (+10..30, `Track.checkGraze`) | P1 | DONE (2026-10-01) |
| Time of day: day, golden hour, dusk, night (fireflies), dawn, with a milestone capsule | P1 | DONE (2026-10-01) |
| Moving rows (2026-10-22): DOORS (two doorways with gate leaves, one open, frozen near the cat; from 50 s) and CART (a planter that slides across a wide gap; from 70 s), fairness-tested at 300…1050 px/s (`CONFIG.DOORS`, `CONFIG.CART`) | P1 | DONE (2026-10-22) |
| Golden hour event: a series of 4 narrower rows with a coin in each gap once per golden stage (`CONFIG.GOLDEN`); first skin price 16 → 20 | P1 | DONE (2026-10-22) |
| Swaying planter: a moving obstacle after 45 s (was 90 s until 2026-10-09; tiers 45 / 90 / 150 s), always a free pocket of 90+ px (`CONFIG.SWAY`, `Track.createSway`) | P1 | DONE (2026-10-05) |
| Cat skins engine: 8 colourways by recolouring the run frames and the sitting cat (`SkinArt.js`); a 9th, the limited Halloween skin with a witch hat, since 2026-10-19 | P1 | DONE (2026-10-05) |
| Limited skin: sold for 14 days from each player's first launch (but not after `until`), expensive, owned forever (`CONFIG.SHOP`, `Shop.availability`, cloud key `firstDay` merged by the earlier day) | P1 | DONE (2026-10-19) |
| Game Over: the nearest skin goal «SKIN … 118 / 130» with a bar, next to the existing «N TO NEW BEST» | P1 | DONE (2026-10-19) |
| Rewarded ads: the cat revives even if the platform resume event is late; a short notice when no reward came (`over.noReward`, `over.adFailed`) | P0 | DONE (2026-10-19) |
| Sharper picture on phones: the canvas gets 1× / 1.5× / 2× real pixels (`RenderScale.js`), drops by itself on a slow phone and remembers it | P1 | DONE (2026-10-19) |
| Skin shop for coins (`Shop.js`, START and Game Over screens), coins as earned / spent counters, cloud merge | P1 | DONE (2026-10-05) |
| Daily run: the same track for everybody each Moscow day, coins for the first run and a day streak (`Daily.js`) | P1 | DONE (2026-10-05) |
| «В МЕНЮ» on Game Over: back to the START screen (daily run, quests, shortcut), the first start after loading has no ad but a later start through the menu does (`Game.openMenu`) | P1 | DONE (2026-10-05) |
| Store card kit: RU/EN texts with limit checks, 20 screenshots, two 27 s videos, icon and covers (Gemini background plus the Loaf vector), `npm run pack` zip (`docs/store/`, `scripts/store-capture/`, `scripts/pack-zip.mjs`) | P1 | DONE (2026-10-05) |
| Daily quests: three a day (3 / 5 / 8 coins) drawn from 8 kinds by the date, progress and payment at the moment of completion, a window on START (`Quests.js`) | P1 | DONE (2026-10-05) |
| Vibration on events (`HapticsService`, follows the sound switch) | P2 | DONE (2026-10-01) |
| Streak and coin-chain pitch (pentatonic, in tune with the music) | P2 | DONE (2026-10-01) |


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
| Rewarded advertising (continue; x2 coins, on since the shop appeared) | P1 | DONE |


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
| «В МЕНЮ» on the pause screen (two taps, quiet end of the run) | P1 | DONE |
| Yarn-ball shield: a rare pickup, ONE mistake, 12 s, the walls around the cat explode, no reward for the broken row | P1 | DONE (2026-10-19) |
| Faint record ribbon on the track where the best run ended (best run time stored, merged by max in the cloud) | P1 | DONE (2026-10-19) |
| Streak multiplier bubble next to the cat when the multiplier changes | P1 | DONE (2026-10-19) |
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

Run music «Ручей» (2026-10-22, `src/services/MusicScore.js` + `AudioService`; the owner chose it from three WAV previews): running marimba-like arpeggios in eighth notes (chords C, G, Am, F; the arpeggio goes up and down over four chord tones), a singing sine melody on top (C major pentatonic only, so it sits in one key with the game's sounds and the stage chime), a soft bass (root and fifth) and a very quiet long chord every four bars. The form is 32 bars = A (theme) – B (second, higher part) – A′ (the theme returns, a new ending) – C (a quiet break: half as many arpeggio notes, softer), about 70–80 seconds per pass, so a normal run hears the whole form once instead of a 16-second loop five times (the old music tired the owner). Synthesized with Web Audio, no audio files. It plays only during a run, fades in and out, speeds up from 96 to 112 BPM with the track speed, and pauses together with the audio context (mute, hidden tab, ad, platform pause). Voices, volume and tempo are in `CONFIG.MUSIC` (`VOICES`); the loudness of the new music was compared with the old one through the same synth (the same level, so the balance with the effects did not change).

Quiet ambience on top of the music (2026-10-22, `CONFIG.MUSIC.AMBIENCE`, `AudioService.setAmbience`): by DAY short soft bird chirps (2–4 gliding notes with a little vibrato every 3–7 seconds; the owner asked for them a bit quieter than the first sample, `BIRDS.AMP` 0.0175), at NIGHT quiet CRICKETS as a background (the owner: «a quite quiet sound in the background»; the first idea, «sparkles» for the fireflies, was rejected as «rubbish», and the first crickets did not sound like crickets, so the owner gave a reference, a recording of a pair of crickets; I analysed it by numbers (spectrum and envelope in the browser) and matched the synthesis to it): a LOUD cricket near 4.25 kHz and a QUIETER, lower one near 4.15 kHz (a nearly pure tone, no overtones); a chirp is 4–6 pulses (five most often) 29 ms apart; every pulse starts with a quick rise to a third of its height, then swells smoothly for about 13 ms and is cut off in about 9 ms (the real one is the other way round from a plucked sound), the pulses of a chirp are quiet at first, loudest at the third, and fade a little at the end (`PROFILE`); the loud cricket chirps about once a second but unevenly (0.6–1.4 of its usual interval) and sometimes rests for another second, the quiet one about every four seconds; every chirp is a little higher or lower (±0.5%). Compared with the recording by the same analysis: pulses per chirp, spacing, chirp length, pitches and the swell of the trill agree. The level is much lower than in the recording (about −26 dB from the music peak, `CRICKETS.AMP` 0.012): it is a background. `Game.updateStage` / `Game.start` pick the sound by the stage name (`AMBIENCE.STAGES`: day → birds, night → crickets, golden hour, dusk and dawn → nothing); the extras go through the music volume, so they fade with it and mute/pause silence them. The old cat meow on RISK crossings was removed (2026-10-01): RISK keeps its visual feedback only.

Yandex integration uses `YandexService` as an optional platform layer. The game remains fully playable when `/sdk.js`, authorization, leaderboards, or ads are unavailable. Rewarded ads (Phase 5): one revive per run (and, behind the switch `YANDEX.DOUBLE_COINS_AD`, ×2 coins of the run), reward only after `onRewarded`. The ×2 coins button is OFF since 2026-10-01: coins have no use until the shop exists, so the player would get nothing for watching. Turn the switch on together with the shop.

Newcomer help (2026-10-01): `getAssist(bestScore)` gives 1 for a brand-new player and fades linearly to 0 at best score `ASSIST.UNTIL_BEST` (800). At the start of every run `Game.start` hands it to `Track.setAssist`; ordinary gaps get up to +32 px and the SAFE gap of a Choice up to +24 px (at the very first fork up to +20, so the edge walls still fit): at full help the widths are the ones from before the narrowing (200 / 168 and 200 / 180 / 160). RISK gaps never change. An experienced player (best 800+) sees the current narrow widths. Dev only: `?assist=0..1` forces it.

Pause (2026-10-01): during a run a round pause button sits in the HUD between the score and the coin pill (same capsule style, two brown bars). It, `P` or `Esc` freezes the run (`Game.userPaused`, counted in `isGameplayPaused()`, so Yandex GameplayAPI is stopped too) and opens a card: PAUSE, score, best, RESUME (button, `P`, `Esc`, Space or Enter) and the sound row [-] [SOUND n%] [+] under it. Music keeps playing on pause so volume changes can be heard. Taps on the card never start a new run; `R` does not restart from the pause. Held keys and fingers are released on pause and resume. A hidden tab does not set the pause by itself (the game freezes while hidden and continues on return, as before).

Game feel (2026-10-01): a close call (see `docs/business-rules.md`) shows a ginger «+10» with «ВПРИТИРКУ / CLOSE CALL» (and «×n» for a chain), amber sparks at the wall and a short tick that climbs the scale with the chain. A plain RISK crossing now has a soft tone (`risk`, C5 triangle) that rises one pentatonic note per streak step (C D E G A C D E, then stays on top); coins collected within 1.2 s of each other rise too. The tones are synthesized and stay in the C pentatonic of the run music. Vibration (`navigator.vibrate`, Android) pulses on close call, RISK, multiplier step, max multiplier, streak loss, new best and Game Over (patterns in `CONFIG.FEEL.HAPTIC_PATTERNS`, at most one per 60 ms, none longer than 300 ms); it is off whenever the sound is off, stops on pause, and does nothing where the browser has no vibration (iPhone, desktop).

Volume (2026-10-01): one master volume for effects and music, 0-100% in 10% steps, default 50% (the level the sounds were tuned for). Buttons [-] [SOUND n%] [+] on the START and Game Over screens (tapping the middle capsule mutes), keys `-` / `+`, `M` mutes. Saved in storage keys `audioVolume` and `audioMuted`. Settings in `CONFIG.AUDIO`.
