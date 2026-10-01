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
- rewarded ads (revive, ×2 coins) — DONE (Phase 5); ×2 coins is switched off until the shop exists.

## Version 0.4 — Polish

Goal:

Make the game look and feel finished.

- visual polish — DONE (Phase 1–1д: reference garden, painted art pack, WebP);
- animations;
- sound polish;
- retention and clarity polish — DONE;
- first-run onboarding without a tutorial mode — DONE;
- procedural track variety (OFFSET, FUNNEL, OFFSET_GATE, DOUBLE_GATE) — DONE;
- localization — DONE (Russian + English, Phase 4);
- further UX improvements only when supported by playtest data;
- performance optimization — frame time halved in Phase 1д (fewer far rows); deeper pass (Phase 2) after release.

## Version 1.0 — Release

Status (2026-10): Phases 0–6 done — reference look with the painted art pack, Russian/English, rewarded ads, final QA on phone/tablet/desktop sizes, dead code removed, honest catalogue screenshots in `docs/store/screenshots/`, build 3.7 MB (0.65 MB downloaded at start). Left: console setup, upload, moderation (Phase 7, owner; see `docs/yandex-integration.md`). The leaderboard screen, cloud save, rating request and shortcut prompt were added on 2026-10-01 (see `docs/yandex-integration.md`). Postponed to after release: skin shop (Phase 5b), performance pass (Phase 2).

Goal:

Publish the game.

- production build;
- final testing;
- Yandex Games requirements check;
- submission;
- moderation.

## Post-release

Only after collecting real player data consider:

- new gameplay mechanics;
- daily challenges;
- additional game modes;
- progression systems;
- cosmetic customization;
- improved monetization.

Do not add these systems before the core game demonstrates player interest.