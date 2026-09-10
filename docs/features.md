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
| Difficulty progression | P0       | DONE   |
| Score system           | P0       | DONE   |
| Game over              | P0       | DONE   |
| Restart                | P0       | DONE   |


Current implementation notes:

- Horizontal player speed is ~420 px/s; the hitbox is unchanged.
- Track speed follows `v(t) = max - (max - start) * e^(-t / tau)` (300 → 720, tau 70).
- Choices are SAFE/RISK (`TWO_PATHS`) and RISK/RISK (`DUAL_RISK` after 30s). No other Choice types.
- Intentional RISK grows streak; SAFE on a Choice resets streak and multiplier to 1.0x. Breathing / non-choice does not change streak.
- Multiplier starts at 1.0x, steps +0.5, caps at 5.0x. Path reward uses the multiplier **before** the step.
- Coins are a separate meta counter (+1), not score/streak/multiplier. They persist through Game Over. There is no shop.
- `VariationDirector` spaces Choices; reachability remains the source of truth, with fallback.
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


| Feature                   | Priority | Status  |
| ------------------------- | -------- | ------- |
| Yandex SDK initialization | P0       | PLANNED |
| LoadingAPI                | P0       | PLANNED |
| Gameplay API              | P0       | PLANNED |
| Fullscreen advertising    | P0       | PLANNED |
| Rewarded advertising      | P0       | PLANNED |
| Authorization             | P1       | PLANNED |
| Leaderboard               | P1       | PLANNED |


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
| Mute toggle          | P1       | DONE    |
| Full settings menu   | P1       | PLANNED |
| Russian localization | P0       | PLANNED |
| English localization | P0       | PLANNED |


Start / Game Over are canvas overlays, not a separate menu system. Localization files exist but are not wired yet.

---

## Audio / feel


| Feature                        | Priority | Status  |
| ------------------------------ | -------- | ------- |
| Sound effects                  | P1       | DONE    |
| Mute (M key + HUD)             | P1       | DONE    |
| Pause audio on tab hidden      | P0       | DONE    |
| Unlock after user gesture      | P0       | DONE    |
| GameFeel / particles           | P1       | DONE    |
| Pause audio during advertising | P0       | PLANNED |


Web Audio is created once, unlocked by a user gesture, muted via storage key `audioMuted`, and suspended while the tab is hidden.
