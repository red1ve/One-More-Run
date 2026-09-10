# Business Rules

## Score

The player receives score for distance travelled.

Risky paths provide additional score.

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