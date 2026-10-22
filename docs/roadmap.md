# Roadmap

## Version 0.1 — Prototype

Goal:

Prove that the core gameplay is fun.

- player movement;
- obstacles;
- collisions;
- score;
- game over;
- restart.

## Version 0.2 — Playable

Goal:

Make the game comfortable to play.

- mobile controls;
- difficulty progression;
- risk/reward mechanics;
- multiplier;
- responsive layout;
- sound.

## Version 0.3 — Platform integration

Goal:

Prepare the game for Yandex Games.

- Yandex SDK — DONE;
- standalone fallback — DONE;
- LoadingAPI — DONE;
- Gameplay API and platform pause events — DONE;
- automatic SDK language detection — DONE (English UI fallback);
- authorized leaderboard submission — DONE;
- fullscreen ad lifecycle — DONE;
- Developer Console setup and platform verification — NEXT;
- explicit authorization UI — LATER, only if justified;
- rewarded ads (revive, ×2 coins) — DONE (Phase 5); ×2 coins is on again since the shop appeared (2026-10-05).

## Version 0.4 — Polish

Goal:

Make the game look and feel finished.

- visual polish — DONE (Phase 1–1д: reference garden, painted art pack, WebP);
- animations;
- sound polish;
- retention and clarity polish — DONE;
- first-run onboarding without a tutorial mode — DONE;
- procedural track variety (OFFSET, FUNNEL, OFFSET_GATE, DOUBLE_GATE) — DONE;
- retention layer: skin shop with coins — DONE (2026-10-05); daily run with a day streak — DONE (2026-10-05); daily quests — DONE (2026-10-05); store card and publication preparation — DONE (2026-10-05: texts, screenshots, videos, icon, covers, `npm run pack`; the console steps are the owner's);
- late-run content: time of day (day → dawn) — DONE (2026-10-01); swaying planter after 90 s (since 2026-10-09 after 45 s) — DONE (2026-10-05);
- localization — DONE (Russian + English, Phase 4);
- further UX improvements only when supported by playtest data;
- performance optimization — frame time halved in Phase 1д (fewer far rows); deeper pass (Phase 2) after release.

## Version 1.0 — Release

Status (2026-10): Phases 0–6 done — reference look with the painted art pack, Russian/English, rewarded ads, final QA on phone/tablet/desktop sizes, dead code removed, honest catalogue screenshots in `docs/store/screenshots/`, build 3.7 MB (0.65 MB downloaded at start). Left: console setup, upload, moderation (Phase 7, owner; see `docs/yandex-integration.md`, «Store card materials» and `docs/store/listing.md`). The leaderboard screen, cloud save, rating request and shortcut prompt were added on 2026-10-01 (see `docs/yandex-integration.md`). The skin shop (Phase 5b) was built on 2026-10-05, before release, by the owner decision (see GAME_SPEC §43). Postponed to after release: performance pass (Phase 2).

Goal:

Publish the game.

- production build;
- final testing;
- Yandex Games requirements check;
- submission;
- moderation.

## Polish plan (owner review, 2026-10-19)

Made from the owner's answers to the polish ideas list. Each item is still proposed and approved by the owner before the work starts (see CLAUDE.md, «Workflow»). Everything below is one candidate release «v1.1 polish»; what goes into the first moderation and what into an update is the owner's decision.

**Phase 1 — before sending the game to moderation** — DONE 2026-10-19 (checked, saved to git and merged into `main` on 2026-10-19; the owner tests on a phone, then submits the draft)

1. Bug: after a rewarded ad the cat does not revive (found by the owner on a phone: the ad runs, is closed after ~5 s, nothing happens). Two suspects: (a) `Game.revive()` refuses while `platformPaused` / `hidden` is still true at the moment `onRewarded` arrives (the SDK `game_api_resume` can come after `onClose`), so the reward is lost; (b) the ad was closed before the reward and the game says nothing. Fix: queue a granted reward until the game is unpaused, show a short «no reward: watch the ad to the end» message otherwise, same for «×2 coins». Test with an SDK stub that delays the resume event.
2. Sharper picture on phones: render the canvas at `devicePixelRatio` (cap 2), keep the logical 540×960 for drawing and input, fall back to 1× automatically if the frame time is too high. Needs a performance check; the store-capture tools must keep working.
3. Game Over screen: a line «N to your best» and progress to the next skin (coins missing). Restart stays as it is (0.6 s input lock before taps count).
4. Limited Halloween skin (dark cat, orange stripes and a hat, 350 coins; the first purple hat looked bad to the owner, so three variants were drawn on 2026-10-19 and the owner chose the black witch hat; after several rounds the final one is the ORIGINAL hat shape worn low on the head with the ears cut off along the brim, variant 4 of six; details in `docs/visual-bible.md`, «What a skin may change»): decided with the owner as «when the game comes out, on sale for two weeks». Since the release date is not known, the window is 14 days from EACH player's first launch (`firstDay`, merged by the earlier day in the cloud) and never after 2026-11-30; a «N days left» tag in the shop; owned skins stay.
5. Coins: more of them, a part placed in risky spots near the walls (the cat has to leave the line, grab it and come back to the gap), every coin still reachable; skin prices raised to match.
5a. «В МЕНЮ» on the pause screen (owner request, 2026-10-19: a run started by accident could only be left by dying, and the player could not go and buy a skin). DONE: two taps (the first asks «ЗАВЕРШИТЬ ЗАБЕГ?», the second within 3 s leaves); the run ends quietly like a normal game over.

**Phase 2 — gameplay depth** — DONE 2026-10-19 (branch `feat/polish-phase-2`, checked with `scripts/phase2a-check.mjs`; waiting for the owner's test on a phone; rules in `docs/business-rules.md`)

6. Yarn-ball shield (owner's spec, like the board in Subway Surfers): a rare pickup that gives ONE mistake. The first hit does not kill: the shield breaks, the obstacle around the cat «explodes» and disappears, the cat runs on. If no hit happens, the shield expires after 10–15 s (not 6; a timed full invulnerability was called nonsense). Rewards for the broken row are not paid, the multiplier is kept.
7. A faint record marker on the track (confirmed by the owner: a thin ribbon at the moment where the best run ended; no «record N» text in a corner; needs one more stored number: the best run time, merged by max in the cloud).
8. A small bubble with the streak multiplier next to the cat when it changes.

**Phase 3 — music and sound** — DONE 2026-10-22 (branch `feat/polish-phase-2` on top of Phase 2, checked with `scripts/phase3a-check.mjs`; the owner chose the «Ручей» preview, birds a bit quieter, crickets at night instead of sparkles; rules in `docs/features.md`)

9. New, more memorable melody with a longer form (A–B–A′–C) so it does not tire in long sessions; 2–3 candidates as WAV previews first. Very quiet extras: day birdsong, night sparkles. Nothing intrusive; mute and the stage chime keep working.

**Phase 4 — new obstacles and events** — DONE 2026-10-22 (branch `feat/polish-phase-4`, checked with `scripts/phase4a-check.mjs`; DOORS and CART as the two new row types, the golden-hour event; rules in `docs/business-rules.md`; waiting for the owner's test on a phone; the first skin now costs 20)

10. Two or three new row types (for example gates that open and close, a crossing obstacle), each with its fairness checks at 300…1050 px/s. Golden-hour event: a short series of narrower rows with a coin trail.

**Phase 5 — after real player data**

11. 6–8 honest achievements (simple, no fake numbers). Accepted by the owner: «30 seconds without picking a coin», «5 close calls in a row», «7 days of daily streak», «3 risky passes in a row». Rejected as too easy or automatic: surviving a whole night, 10 coins in a run, seeing all four times of day. Also accepted (2026-10-19): reaching the maximum multiplier, surviving 80 seconds (not 120), owning 5 skins, owning all skins. Rejected: «5 coins at a wall in one run» and «break the shield on an obstacle». More ideas will be offered later. A weekly leaderboard only if Yandex allows periodic reset or creation from the game (it did not when checked on 2026-10-05).

**Dropped by the owner:** a newcomer tutorial for the first 60 seconds (the +150 / +250 labels explain the risk), the fish pickup (coins are rare), fireflies that point to coins, a special «instant restart».

## Post-release

Only after collecting real player data consider:

- new gameplay mechanics;
- daily challenges;
- additional game modes;
- progression systems;
- cosmetic customization;
- improved monetization.

Do not add these systems before the core game demonstrates player interest.