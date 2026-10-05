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

### Swaying planter (2026-10-05)

After 90 s of a run (`CONFIG.SWAY`, `Track.createSway`, `Track.placeSway`) some ordinary rows (never inside a fork, never right after a fork, never two in a row; `VariationDirector.choosePattern`) have a wooden planter that walks from one wall of the gap to the other. The chance of picking such a row is 12% / 20% / 28% at 90–150 / 150–240 / 240+ s; the period of the swing is 2.8 / 2.4 / 2.0 s (the later, the faster). Because a row that would be unfair is replaced by an ordinary one, the real share is lower (about 9% / 11% / 14% of ordinary rows in `scripts/phase1l-check.mjs`).

Geometry: the gap between the walls is 264 px (planter 84 + a 90 px pocket on each side), the planter is a 84 × 40 obstacle in the row of the walls, the position is a sine wave of the run clock (`Track.swayClock`), so it is the same at any frame rate. The pockets always add up to 180 px, so a free pocket of at least 90 px exists at every moment (in the middle of the swing 90 + 90, at a wall 0 + 180); the cat is 36 px. The planter never goes faster than 203 / 236 / 283 px/s, the cat strafes at 420–500 px/s.

Fairness rules (guarded by `scripts/phase1l-check.mjs`):

- The row is placed only where the cat can reach the safe part of **both** pockets from **any** point of the previous exit (not only from the nearest one), even if it starts moving 0.25 s (`SWAY.REACTION`) after the previous row, at its real speed (`getPlayerSpeed`). The safe part of a pocket is the pocket minus `SWAY.WINDOW_SLACK` (20 px) on the planter's side: the planter moves while the cat is in the row. Where that is not possible (short free road after OFFSET / FUNNEL at high speed) an ordinary row is built instead. After the row the next one must be reachable from both pockets.
- Walls at the road edge follow the edge-wall rule; the newcomer assist does not widen this row (only skilled players get here).
- No coins in this row. One SAFE path covers the whole gap, so the reward (SAFE) and the close-call bonus (`checkGraze`) work as in an ordinary row; the planter counts as a normal obstacle (collision, revive clears the row).
- The test replays every swing phase (24) × speeds (560–720 px/s) × periods × previous-exit places (plain gaps and rows after OFFSET, FUNNEL, DOUBLE_GATE, OFFSET_GATE) with a bot that reacts 0.3 s after the previous row: no collisions, the narrowest safe place is 26 px (cat 36). A cat that stands still in the gap does get hit, so the planter is a real obstacle.

Dev only: `?start=100` starts the run at the 100th second (speed, time of day and the planter as in a long run); with `?seed=11` the first swaying row of that seed comes at ~136 s.

## Coins and the skin shop (2026-10-05)

Coins are collected on the track (+1, not score). They are stored as two counters, **earned** and **spent**; the balance is their difference (`StorageService`: `coinCounters`, `addCoins`, `spendCoins`). An old save with the single `coins` number becomes `earned`. The balance can never go negative, a purchase is refused if the balance is smaller than the price.

The shop (`Shop.js`, `CONFIG.SHOP`) sells the 8 cat skins for coins; all prices are in `CONFIG.SHOP.SKINS` (classic 0, ginger 10, honey 25, snow 40, tuxedo 60, siamese 90, calico 130, ribbon 180). Buying spends the exact price, adds the skin to the owned list and puts it on at once; a bought skin can be worn again for free, a skin cannot be bought twice, a broken save falls back to the free skin. The window opens from the START and Game Over screens (never during a run); Esc or the close button shuts it; while it is open a tap or R / Space / Enter does not start a run.

Prices come from the measured income (`scripts/phase1n-check.mjs`): the track offers on average 1.8 coins in the first 30 s of a run, 5.3 in 60 s, 10.8 in 90 s; a player picks up about 60%. So the first skin takes about 10 short runs (about 5 with the ×2 ad), the whole ladder (535 coins) about 170 minute-long runs; daily rewards and quests (next steps) add coins on top. The test fails if the track's coin income or the price ladder drifts out of these bounds.

Cloud (`Shop.merge`, `Game.cloudSnapshot` / `applyCloudData`): the cloud holds `coinsEarned`, `coinsSpent`, `skinsOwned`, `skinSelected` (and `coins` = the balance, for older versions). Merge rules: each counter takes the bigger value, so spent coins never come back; owned skins are the union; the cloud choice is adopted only on a device where nothing was chosen yet and only if that skin is owned; `spent > earned` in the cloud is ignored as contradictory; an old client that sent only `coins` counts as `earned`. If two devices bought different skins, the player keeps both and pays by the bigger spent counter (generous, never punishing). A purchase is saved to the cloud at once.

The ×2 coins ad (`YANDEX.DOUBLE_COINS_AD`) is on again: it adds this run's coins once more (`earned`).

## Daily run and the day streak (2026-10-05)

A «ЗАБЕГ ДНЯ» button on the START screen (`Daily.js`, `CONFIG.DAILY`, `Game.startDaily`). In one game day every player gets the **same track**: the seed is a hash of the date (`dailySeed`), and the help for newcomers is fixed to `DAILY.ASSIST` (0.4, a bit easier than normal) for everyone, because the normal help depends on the player's record and would make the tracks differ. The generator is deterministic whatever the frame rate or the player does (`scripts/phase1o-check.mjs` replays it at 10 / 30 / 60 / 120 FPS); another day or another help gives another track.

The game day is the **Moscow** calendar day (UTC+3, midnight Moscow = 21:00 UTC): most of the audience is in Russia and the CIS, and everybody needs the same moment of change. «Now» comes from the Yandex server clock (`ysdk.serverTime()`, read once when the SDK is ready; `Game.clockOffset`), so setting the device clock does not help; without the SDK the device clock is used. Dev only: `?day=2026-10-06` fixes «today».

Reward and streak (`Daily.complete`): the **first** daily run of a day pays `REWARD_BASE` (5) coins; if the previous game day was also played the streak grows by one and the reward by `REWARD_STEP` (2) up to `REWARD_MAX` (15): 5, 7, 9, 11, 13, 15, 15… A missed day starts the streak over from 5. The coins are normal earned coins (`StorageService.addCoins`). A week of streak pays 75; two daily runs already pay for the first skin. The button shows the next reward and the streak, or, once played today, the best score of the day and the streak.

Replays are unlimited: the track is known, like a daily puzzle. They pay nothing but raise the best of the day. A revive in a daily run does not pay twice.

A daily run **never touches the record**: no `bestScore`, no leaderboard submission, no «NEW BEST», no rating request; otherwise the known track could be learned for a leaderboard record. Its Game Over shows «+N МОНЕТ • СЕРИЯ k» (first run of the day) or «ЗАБЕГ ДНЯ», and «ЛУЧШИЙ ЗА СЕГОДНЯ». There is no daily leaderboard: Yandex has no periodic reset and no creation of tables from the game.

Cloud keys: `dailyDay`, `dailyStreak`, `dailyBest`. Merge (`Daily.merge`): the later day wins; the same day takes the bigger streak and best; an older day and a day from the future (garbage or a wrong clock) are ignored. If the saved day is later than «today» (the device clock was set back) nothing is paid until the real date catches up.

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