# Business Rules

## Score

The player receives score for distance travelled.

Risky paths provide additional score.

Close call (2026-10-01, `CONFIG.GRAZE`): when the cat passes a wall with a clearance of 0 < gap <= 8 px between its hitbox and the wall while it is inside the row, it gets +10 score; close calls within 2.5 s of each other add +5 each (10, 15, 20, 25, 30, then 30). The bonus is not multiplied and does not touch the risk streak or multiplier. Every wall counts once, walls hidden under the curb at the road edge do not count, nothing is awarded while the cat is invulnerable after a revive. It is deliberately small next to a risky path (100 × multiplier): a bot that does not aim at walls gains 2–5%, a player who hugs every wall at most about a quarter. Hitboxes and the track do not change. The seeded-run baseline in `scripts/phase1e-check.mjs` includes it.

## Multiplier

Successful risky actions increase the multiplier.

A collision resets the multiplier.

## Difficulty

Difficulty increases gradually during a run.

Difficulty may affect:

- movement speed;
- obstacle frequency;
- obstacle complexity.

The difficulty system must never intentionally generate an impossible situation.

Gap widths (px of track, 400 px wide; the cat is 36 px). Narrowed twice on 2026-10-01 because the game felt too easy: ordinary passages `BREATHING_GAP_WIDTH` 168 for the first ~14 s and `BREATHING_GAP_LATE` 136 afterwards (were 200 / 168); the SAFE gap of a choice `SAFE_GAP_TUTORIAL / _WIDTH / _LATE` 176 / 156 / 136 (were 200 / 180 / 160). RISK gaps (`RISKY_GAP_*`, `RISK_EASY/HARD_GAP_WIDTH`) were not changed. What was cut from SAFE went into the divider between SAFE and RISK (`TWO_PATHS_DIVIDER` 24 → 48), so the fork keeps its width and the divider reads as a proper bush. The generator still widens a gap when it would otherwise be unreachable.

Walls at the road edge: the playfield is 18 px wider than the visible sand on each side, so a wall up to `EDGE_WALL_HIDDEN` (20) is hidden under the curb (a passage flush with the edge) and any other wall shows `width − 18` px. A wall between 20 and `EDGE_WALL_MIN` (58) would be drawn as a speck of a bush, so `Track` never creates one (`edgeWallsOk`, `snapToEdgeRule`, `fitRowsToEdgeRule`): choice forks and gaps are placed at an allowed spot, pattern rows (offset, funnel, gates) are shifted as a whole, the funnel widening and the offset drift of a choice are reduced when there is no room. Reachability is still checked for every row (`scripts/phase1h-check.mjs`, `phase9-check.mjs`).

## Rewarded advertising

Rewarded advertising is not part of the current release. There is no continue, revive, score reward, or Coin reward for watching an ad.

If a real reward loop is designed later, it must be voluntary and granted only after Yandex SDK confirms the reward.

## Authorization

The game is playable without authorization.

Authorization is initiated only by an explicit user action.

## Leaderboard

Only authenticated players can submit scores.

The leaderboard stores the player's best result.

Leaderboard errors must not interrupt gameplay.

## Advertising

Advertising must not interrupt active gameplay.

Fullscreen ads are shown only at logical breaks.

The current logical break is a player-requested restart from Game Over. A local cooldown prevents an ad attempt after every run, and Yandex retains its own frequency control.

The game and audio must be paused during advertising.