# UX Guidelines

## General

The interface should feel like a small, polished indie game.

Prioritize clarity over decoration.

The player should understand the main action immediately.

## Visual language

Use a restrained visual system.

Use a limited color palette.

Do not introduce colors without a purpose.

Avoid excessive gradients.

Avoid excessive rounded cards.

Avoid unnecessary shadows.

Avoid decorative elements that do not communicate information.

## Typography

Use a small number of font sizes.

Hierarchy should be clear:

1. game title;
2. primary action;
3. secondary actions;
4. informational text.

## Buttons

Primary actions should be visually dominant.

Button labels must describe the action.

Prefer:

PLAY

PLAY AGAIN

LEADERBOARD

SETTINGS

WATCH AD TO CONTINUE

Avoid vague labels such as:

CONTINUE

GO

OK

DO IT

## Text

Use short sentences.

Do not use marketing-style AI-generated phrases.

Avoid:

"Embark on an epic journey!"

"Are you ready for the ultimate challenge?"

"Unleash your potential!"

Use functional language instead.

## Localization

All user-facing text must come from localization files.

Do not hardcode interface text inside gameplay logic.

## Mobile

Controls must be comfortable with one hand.

Interactive elements must have sufficient touch area.

The interface must not cover important gameplay information.

## Retention and clarity

The START screen is short: title, the play button and one controls line. It carries no rules text (changed 2026-10-01: three hint lines were too wordy and few players read them).

The rule is taught where it matters: while the first Choice of a new player approaches, one capsule under the HUD says "WIDER = SAFER • NARROWER = MORE POINTS" (`hint.choice`, `Game.choiceHintVisible`). It disappears when the cat reaches the row and never returns after the first Choice has been passed (storage key `choiceHintSeen`). During gameplay, the first RISK may provide one short contextual streak hint; multiplier growth then uses compact score-multiplier feedback.

Choice rewards (`+10`, `+100`, `+150`, `+250`) must remain readable at speed. SAFE/RISK words are not shown on every Choice during play. DUAL_RISK distinguishes the narrower, higher-value branch with `+250` and a deeper clay gate, without changing geometry or rewards.

Game Over shows either `NEW BEST` or the exact points needed to beat the stored best. Restart remains the only primary action. The rewarded offers (continue, ×2 coins) sit above it as optional capsules with a video icon. Under the sound controls there are two small buttons, «МАГАЗИН» and «ЛИДЕРЫ» (the START screen adds «ЯРЛЫК НА ЭКРАН» in a second row when the platform allows it); buttons sit two per row with finger-sized tap areas that never overlap each other or the sound row (guarded by `scripts/phase1n-check.mjs`).

Shop window (2026-10-05): a cream plate with the title, the balance (coin icon + number), a hint line and a 2 × 4 grid. Each cell shows the skin on the running cat, its name and a status capsule: green «НАДЕТО» for the one worn, plain «КУПЛЕНО» for owned ones, the price with a coin for the rest (amber when affordable, plain when not). Tapping a cell buys-and-wears or just wears; if the coins are not enough, an apricot line «НЕ ХВАТАЕТ МОНЕТ: N» replaces the hint for under two seconds. No confirmation dialog: a purchase is cheap and the choice is always reversible.

Daily run (2026-10-05): on the START screen a green capsule «ЗАБЕГ ДНЯ» sits right under the amber «ИГРАТЬ» (the card grows by 72 px and moves up). Its second line says what waits: «+5 МОНЕТ» (a new streak), «+11 МОНЕТ • СЕРИЯ 4» (a streak that can continue) or, once played today, «СЕГОДНЯ 1234 • СЕРИЯ 4». A tap on the capsule starts the daily run, a tap anywhere else an ordinary run; with a window open (shop, leaderboard) the capsule is out of reach. The daily button exists only on START (a session ritual); the Game Over screen of a daily run replaces the record lines with the reward capsule (or the title «ЗАБЕГ ДНЯ») and «ЛУЧШИЙ ЗА СЕГОДНЯ». Its buttons below keep their places.

## No emoji

Do not use emoji anywhere in the game UI.

Use graphical assets or CSS where an icon is actually necessary.