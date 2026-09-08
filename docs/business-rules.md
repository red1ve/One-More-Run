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

## Rewarded continue

The player may continue a run by voluntarily watching a rewarded advertisement.

The reward is granted only after Yandex SDK confirms the reward.

A player may use the continue mechanic only according to the configured limit for a single run.

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

Rewarded ads are shown only after the player explicitly chooses the rewarded action.

The game and audio must be paused during advertising.