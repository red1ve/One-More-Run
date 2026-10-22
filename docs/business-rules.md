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

Rewarded ads (fixed 2026-10-19): the reward is paid when `onRewarded` came, even if `platformPaused` / `hidden` is still true (the SDK's `game_api_resume` can come after `onClose`; before that the revive was refused and on a phone «nothing happened»). The revive/×2 flow only refuses a reward when the run is already revived or restarted. When the ad is closed early or fails, `Game.showNotice` shows «WATCH THE AD TO THE END» / «NO AD AVAILABLE RIGHT NOW» for `CONFIG.YANDEX.NOTICE_SECONDS`, and the revive button stays.

Yarn-ball shield (2026-10-19, `CONFIG.SHIELD`): a rare pickup that gives ONE mistake, like the board in Subway Surfers. A yarn ball lies in an ordinary row (never in a row with a swaying planter) from `FIRST_AT` (20 s) of the run, at most one per `MIN_GAP` (45 s), with the chance `CHANCE` (0.3) in every suitable row after that gap, so a normal run of a minute or two sees one or two. It is placed with the same checks as a coin (reachable, not in a wall, not on a coin; `Track.maybePlaceYarn` uses `tryPlaceCoin`, then moves the ball from `segment.coins` to `segment.pickups`, kind `YARN`). Its random numbers are a hash of the row id, not a stream: the track is exactly the same with and without yarn balls and, for one seed (the daily run), the balls stand in the same places for everybody. Taking a ball gives the shield for `DURATION` (12 s; the owner asked for 10–15), a second ball refills it; the time runs only while the run is going and the ring blinks for the last `BLINK_LAST` (3 s). If no mistake happens the shield goes out by itself. The first collision breaks it (`Game.breakShield`): the walls from `CLEAR_AHEAD` (260 px) in front of the cat down to its feet, including a swaying planter, are removed (`Track.breakAhead`), the cat blinks and cannot be hurt for `GRACE` (0.3 s), and the run goes on. The rows that lost walls are marked `shieldBroken`: when passed they pay NO reward, the streak and the multiplier stay as they were. The next collision, with no shield, ends the run as always. The shield does not change the revive after a rewarded ad. There is no text for it: the ring around the cat is the whole message.

Record ribbon (2026-10-19, `CONFIG.RECORD_MARKER`): the time of the best run is stored as `bestRunTime` (seconds, to a tenth) together with every new best score (`Game.gameOver`; a worse run and the daily run do not change it) and goes to the cloud (`CLOUD_KEYS`), where it is merged by the larger value like the score. In a normal run, when `bestRunTime` is at least `MIN_TIME` (8 s) and the place is within `SHOW_AHEAD` (2600 px), a thin faint ribbon lies across the road exactly where the best run ended: `Game.recordMarkerY()` = the cat's y − (`getTrackDistance(bestRunTime)` − `getTrackDistance(runTime)`), so the ribbon is a point of the track and reaches the cat when the run time equals the best time. When the cat crosses it, a few soft sparks fly once (no sound, no text, no «record N» in a corner: the owner's decision). A player whose record is older than this update has no ribbon until the next new best (the time was not stored).

Streak bubble (2026-10-19, `CONFIG.MULT_BUBBLE`): whenever the multiplier changes (`Game.applyReward`) a small bubble «x1.5» pops up next to the cat (amber when it grew, grey when the streak was lost and it fell to x1.0), floats up a little and fades in `LIFE` (1.5 s). It sits on the right of the cat and flips to the left near the right edge. It lives only while the run is going (a pause freezes it) and is the same number as the HUD capsule, so the player sees the result at the cat and not only in the corner.

Leaving a run from the pause (2026-10-19): the pause screen has a «В МЕНЮ» button. The first tap only turns it into «ЗАВЕРШИТЬ ЗАБЕГ?» for `CONFIG.PAUSE_MENU_CONFIRM_MS` (3 s; resume, a new pause or the timeout cancels it), the second tap ends the run: `Game.quitToMenu()` runs `gameOver({ quiet: true })` — the score, the record, the quests, the leaderboard, the cloud save and the run counter for ads count exactly as after dying, but there is no defeat effect, no new-best fanfare, no rating request and no Game Over screen — and then opens the START screen with `fromMenu = true`, so the next run follows the same ad rules as after «В МЕНЮ» from Game Over (no interstitial straight from the menu). A paused run can be left only this way; a run in any other state ignores the button.

Limited skin (2026-10-19): a skin with `limited: { days, until }` in `CONFIG.SHOP.SKINS` is on sale for `days` days counted from the player's first launch (`firstDay` in storage, set once, merged by the earlier day in the cloud so a second device does not restart the window), and never after `until`. A bought one stays forever. It is not offered as the «next skin» goal on the Game Over screen. With nine skins the shop uses five compact rows.

Render scale (2026-10-19): the game always draws in 540 × 960; the canvas gets 1, 1.5 or 2 real pixels per logical one (`RenderScale.pickRenderScale`: css width × devicePixelRatio / 540, capped by `CONFIG.RENDER.MAX_SCALE` and by the cap the game remembered, key `renderScaleCap`). In a run `FrameGovernor` counts slow frames (> `SLOW_FRAME_MS`); 45 net slow frames lower the scale one step. Taps and the finger use logical coordinates, not canvas pixels. Dev: `?scale=1|2`.

Pace (changed 2026-10-09, owner's request "a more dynamic game"): the track speed is `1050 − 750 · e^(−t/45)` px/s (was `720 − 420 · e^(−t/70)`; for a few hours 950), the cat's strafe reaches 600 px/s (was 500). The Choice "breathing" safety net counted in segments (`breathingSinceChoice >= 5` and `>= 7`), so on a faster track forks would have come more often than once in 5.6 s; the thresholds now grow with the speed above `CHOICE_PACE_SPEED` (650), see `VariationDirector.chooseType`. The generator still checks reachability against the real speed (`scripts/phase9-check.mjs` runs patterns at 300…1050 px/s with a 120 FPS physics replay). Because rows pass faster, points per second and the daily quest goals are easier to reach than before; time-based thresholds (DUAL_RISK from 30 s) now arrive at a higher speed; the swaying planter was moved from 90 s to 45 s (tiers 45 / 90 / 150 s) for the same reason.

Walls at the road edge: the playfield is wider than the visible sand by 17 px (cat at the start of a run) to 21 px (cat pushed up by the camera at speed) on each side, so a wall up to `EDGE_WALL_HIDDEN` (16, was 20 until 2026-10-09) is hidden under the curb (a passage flush with the edge) and any other wall shows `width − 17…21` px. The old 20 let a wall of 18–20 px stick out 1–3 px under the cat; `ObstacleArt.drawSpan` draws nothing under 3 px, so the cat died on an invisible wall. The rule now: an edge wall either misses the cat completely or sticks out by 3 px or more (`EDGE_WALL_THIN_MAX` 24, `Track.edgeWallsThin`, even the fallback fork avoids them; the funnel widens the SAFE path by at most `2 × EDGE_WALL_HIDDEN`). A wall between 16 and `EDGE_WALL_MIN` (58) would be drawn as a speck of a bush, so `Track` never creates one (`edgeWallsOk`, `snapToEdgeRule`, `fitRowsToEdgeRule`): choice forks and gaps are placed at an allowed spot, pattern rows (offset, funnel, gates) are shifted as a whole, the funnel widening and the offset drift of a choice are reduced when there is no room. Reachability is still checked for every row (`scripts/phase1h-check.mjs`, `phase9-check.mjs`).

### Swaying planter (2026-10-05)

After 45 s of a run (was 90 s until 2026-10-09; `CONFIG.SWAY`, `Track.createSway`, `Track.placeSway`) some ordinary rows (never inside a fork, never right after a fork, never two in a row; `VariationDirector.choosePattern`) have a wooden planter that walks from one wall of the gap to the other. The chance of picking such a row is 12% / 20% / 28% at 90–150 / 150–240 / 240+ s; the period of the swing is 2.8 / 2.4 / 2.0 s (the later, the faster). Because a row that would be unfair is replaced by an ordinary one, the real share is lower (about 9% / 11% / 14% of ordinary rows in `scripts/phase1l-check.mjs`).

Geometry: the gap between the walls is 264 px (planter 84 + a 90 px pocket on each side), the planter is a 84 × 40 obstacle in the row of the walls, the position is a sine wave of the run clock (`Track.swayClock`), so it is the same at any frame rate. The pockets always add up to 180 px, so a free pocket of at least 90 px exists at every moment (in the middle of the swing 90 + 90, at a wall 0 + 180); the cat is 36 px. The planter never goes faster than 203 / 236 / 283 px/s, the cat strafes at 420–500 px/s.

Fairness rules (guarded by `scripts/phase1l-check.mjs`):

- The row is placed only where the cat can reach the safe part of **both** pockets from **any** point of the previous exit (not only from the nearest one), even if it starts moving 0.25 s (`SWAY.REACTION`) after the previous row, at its real speed (`getPlayerSpeed`). The safe part of a pocket is the pocket minus `SWAY.WINDOW_SLACK` (20 px) on the planter's side: the planter moves while the cat is in the row. Where that is not possible (short free road after OFFSET / FUNNEL at high speed) an ordinary row is built instead. After the row the next one must be reachable from both pockets.
- Walls at the road edge follow the edge-wall rule; the newcomer assist does not widen this row (only skilled players get here).
- No coins in this row. One SAFE path covers the whole gap, so the reward (SAFE) and the close-call bonus (`checkGraze`) work as in an ordinary row; the planter counts as a normal obstacle (collision, revive clears the row).
- The test replays every swing phase (24) × speeds (560–1050 px/s) × periods × previous-exit places (plain gaps and rows after OFFSET, FUNNEL, DOUBLE_GATE, OFFSET_GATE) with a bot that reacts 0.3 s after the previous row: no collisions, the narrowest safe place is 26 px (cat 36). A cat that stands still in the gap does get hit, so the planter is a real obstacle.

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

## Daily quests (2026-10-05)

Three quests a day (`Quests.js`, `CONFIG.QUESTS`), one easy (+3 coins), one medium (+5) and one hard (+8), the same for every player on the same Moscow game day (same clock as the daily run). The set is drawn from `CONFIG.QUESTS.POOL` with a seeded random generator whose seed is a hash of the date (`fnv1a`, shared with the daily run's seed); the kinds never repeat within a day (the hard tier is drawn first, it has the fewest kinds). A year of days gives every kind many times and ~190 different sets in a year (the test asks for 120 at least) (guarded by `scripts/phase1p-check.mjs`).

Kinds and goals (easy / medium / hard; «—» = not offered in that tier): collect coins 3 / 6 / 10, take the narrow (risky) path 3 / 6 / 10, close calls 5 / 10 / 16 (these three add up over the day), play runs 3 / 5 / —, play the daily run 1 / 1 / — (these also add up), survive seconds in one run 30 / 50 / 75, score in one run 400 / 900 / 1800, reach a multiplier ×2 (medium) / ×3 (hard) in one run («best of one run»: the best single value counts, runs do not add up). The goals come from the newcomer's ordinary run (30–40 s, 400–800 points, about a coin per run); the quest test keeps the easy goals within those bounds. Measured with a simple bot (no risk, no wall-hugging): 33 s median, 530 points; real players take more risk and close calls, so the risk and close-call goals are a first guess to be tuned after playtests.

How progress is counted (`Game` feeds events, `Quests.record` decides): a coin picked up on the track (the ×2 ad and rewards do not count), an intentional risk pass (`applyReward` with `isIntentional`), a close call (`applyGraze`), the multiplier (`runMaxMultiplier`), the run seconds and the score. A quest of the «best of one run» kind is watched during the run (`Game.updateQuests`: a few number comparisons per frame, the storage is touched only when the goal is reached) so the quest completes at that moment; at the end of the run the final values are recorded too (the defeat can come in the same frame as the goal). «Play runs» and «play the daily run» count only runs of at least `MIN_RUN_SECONDS` (10 s: an instant defeat is not a run) and a revive does not count the same run twice.

Completion pays at once: `storage.addCoins(reward)` (normal earned coins), once per quest per day. The player sees a capsule «ЗАДАНИЕ ВЫПОЛНЕНО +N» (`CONFIG.QUESTS.TOAST_SECONDS`, 3 s; queued one after another) under the HUD in a run, above the card on Game Over; a chime and a pulse accompany it. The START screen has a button «ЗАДАНИЯ done/total» (green when all three are done) next to the shop; it opens a window with three rows: title (no numbers in the title, Russian declension), «ЗА ДЕНЬ» / «ЗА ОДИН ЗАБЕГ», the reward capsule or green «ГОТОВО», a progress bar with the numbers, and the time to the next Moscow midnight. Esc or «ЗАКРЫТЬ» shuts it; while it is open a tap or R / Space / Enter does not start a run. There is no quest button on Game Over (it is crowded by the ad offers); the result is visible in the capsule and in the window.

Storage / cloud: keys `questDay`, `questProgress` (by kind, never above the biggest goal of that kind, absent for a claimed kind), `questClaimed` (kinds already paid). A record of another day reads as empty, so every new day starts clean. Merge (`Quests.merge`): only today's cloud record matters; per kind the bigger progress wins (so the same coin is not counted twice, the smaller of two devices is lost), claims are united. A claim arriving from the cloud pays nothing: the coins come with the shared earned-coin counters (`Shop.merge`, bigger value wins), so two devices completing the same quest at once pay once. A day from the future (wrong clock) is ignored.

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