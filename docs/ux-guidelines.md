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

The first START screen may briefly explain:

- SAFE favors survival;
- RISK favors score and builds streak;
- Coins remain between runs.

These hints disappear after the first run. During gameplay, the first RISK may provide one short contextual streak hint; multiplier growth then uses compact score-multiplier feedback.

Choice rewards (`+10`, `+100`, `+150`, `+250`) must remain readable at speed. SAFE/RISK words are not shown on every Choice during play. DUAL_RISK distinguishes the narrower, higher-value branch with `+250` and a deeper clay gate, without changing geometry or rewards.

Game Over shows either `NEW BEST` or the exact points needed to beat the stored best. Restart remains the only primary action; there is no revive, shop, or rewarded-ad CTA.

## No emoji

Do not use emoji anywhere in the game UI.

Use graphical assets or CSS where an icon is actually necessary.