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

Game Over shows either `NEW BEST` or the exact points needed to beat the stored best. Restart remains the only primary action. The rewarded offers (continue, ×2 coins) sit above it as optional capsules with a video icon. Under the sound controls Game Over has one row of small buttons: «МАГАЗИН», «ЛИДЕРЫ» (only where the platform has a leaderboard) and «В МЕНЮ», which brings the player back to the START screen (without it the daily run, the quests and the shortcut button would be out of reach after the first run of a session). Three buttons share the row, so they are narrower and have no icons; with two they are wider and the shop button keeps its coin. The START screen has «МАГАЗИН», «ЗАДАНИЯ n/3», «ЛИДЕРЫ» and, when the platform allows it, «ЯРЛЫК НА ЭКРАН», two per row; buttons sit two per row with finger-sized tap areas that never overlap each other or the sound row (guarded by `scripts/phase1n-check.mjs`).

Shop window (2026-10-05): a cream plate with the title, the balance (coin icon + number), a hint line and a 2 × 4 grid. Each cell shows the skin on the running cat, its name and a status capsule: green «НАДЕТО» for the one worn, plain «КУПЛЕНО» for owned ones, the price with a coin for the rest (amber when affordable, plain when not). Tapping a cell buys-and-wears or just wears; if the coins are not enough, an apricot line «НЕ ХВАТАЕТ МОНЕТ: N» replaces the hint for under two seconds. No confirmation dialog: a purchase is cheap and the choice is always reversible.

Daily run (2026-10-05): on the START screen a green capsule «ЗАБЕГ ДНЯ» sits right under the amber «ИГРАТЬ» (the card grows by 72 px and moves up). Its second line says what waits: «+5 МОНЕТ» (a new streak), «+11 МОНЕТ • СЕРИЯ 4» (a streak that can continue) or, once played today, «СЕГОДНЯ 1234 • СЕРИЯ 4». A tap on the capsule starts the daily run, a tap anywhere else an ordinary run; with a window open (shop, leaderboard) the capsule is out of reach. The daily button exists only on START (reached on loading or with «В МЕНЮ» on Game Over); the Game Over screen of a daily run replaces the record lines with the reward capsule (or the title «ЗАБЕГ ДНЯ») and «ЛУЧШИЙ ЗА СЕГОДНЯ». Its buttons below keep their places.

Quests (2026-10-05): the START button «ЗАДАНИЯ n/3» carries a check icon (a green disc) and turns green when all three quests are done. The window is a cream plate like the shop's (title, a quiet line «НОВЫЕ ЗАДАНИЯ ЧЕРЕЗ 5 Ч 12 МИН», three rows, «ЗАКРЫТЬ»): each row has the title (no numbers in it), a quiet «ЗА ДЕНЬ» / «ЗА ОДИН ЗАБЕГ», an amber capsule with a coin and the reward (or a green «ГОТОВО» and a green-tinted row), an outlined progress bar and the numbers («3 / 10», «40 / 75 С», «×1 / ×2»). In a run the capsule «ЗАДАНИЕ ВЫПОЛНЕНО +5» appears under the HUD (below the time-of-day capsule when both show), fades in and out, and on Game Over sits above the card; it is not drawn over the pause screen.

## No emoji

Do not use emoji anywhere in the game UI.

Use graphical assets or CSS where an icon is actually necessary.