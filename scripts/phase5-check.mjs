// Фаза 5: кнопки «за рекламу» на экране проигрыша (входит в npm run check).
import fs from 'node:fs';
import { CONFIG } from '../src/config.js';
import { Game } from '../src/game/Game.js';
import { Player } from '../src/game/Player.js';
import { Track } from '../src/game/Track.js';

const results = [];
async function check(name, fn) {
  try {
    await fn();
    results.push(`OK  ${name}`);
  } catch (error) {
    results.push(`FAIL ${name}: ${error.message}`);
  }
}
function assert(condition, message = 'assertion failed') {
  if (!condition) throw new Error(message);
}

const METHODS = [
  'canRevive', 'revive', 'canOfferRevive', 'canOfferDoubleCoins', 'handleTap', 'showRewardedAd',
  'requestRevive', 'requestDoubleCoins', 'gameOverInputLocked', 'tryLaunch', 'setAdPaused',
  'isGameplayPaused', 'syncGameplayLifecycle', 'start', 'showNotice', 'updateNotice'
];

// Игра на экране проигрыша; реклама отвечает так, как скажет `adResult`.
function makeGameOver({ adResult = { rewarded: true }, runCoins = 3, age = 1 } = {}) {
  let coins = 10;
  const calls = { shown: 0, started: 0, gameplay: [] };
  const game = {
    state: 'GAMEOVER', reviveUsed: false, launchPending: false, rewardPending: false,
    hidden: false, platformPaused: false, adPaused: false, runCoins, coinsDoubled: false,
    coins, invulnerableTime: 0, player: new Player(), track: new Track(),
    feel: { gameOverAge: age },
    audio: { setAdPaused() {} },
    storage: { addCoins(n) { coins += n; return coins; } },
    keyboardInput: { reset() {} }, mouseInput: null, touchInput: null,
    renderer: { gameOverButtons: {}, hitGameOverButton(x, y) {
      for (const [name, r] of Object.entries(this.gameOverButtons)) {
        if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return name;
      }
      return null;
    } },
    platform: {
      canShowRewarded: () => true,
      showRewarded: () => { calls.shown += 1; return Promise.resolve(adResult); },
      setGameplayActive: (active) => calls.gameplay.push(active),
      shouldShowInterstitial: () => false
    }
  };
  for (const name of METHODS) game[name] = Game.prototype[name];
  game.start = function start() { calls.started += 1; this.state = 'PLAYING'; };
  game.renderer.gameOverButtons = {
    revive: { x: 80, y: 700, w: 380, h: 56 },
    double: { x: 80, y: 766, w: 380, h: 56 }
  };
  return { game, calls, coins: () => coins };
}

await check('revive button shows a rewarded ad and revives only after onRewarded', async () => {
  const { game, calls } = makeGameOver();
  assert(game.handleTap(270, 728) === true, 'tap on the revive button');
  assert(game.rewardPending && game.adPaused, 'game is paused while the ad is open');
  assert(game.tryLaunch() === false, 'no restart while the ad is open');
  await new Promise((r) => setTimeout(r, 0));
  assert(calls.shown === 1);
  assert(game.state === 'PLAYING' && game.reviveUsed, 'revived after the reward');
  assert(!game.adPaused && !game.rewardPending, 'pause released');
});

await check('closing the ad early gives no revive and keeps Game Over', async () => {
  const { game } = makeGameOver({ adResult: { rewarded: false } });
  game.handleTap(270, 728);
  await new Promise((r) => setTimeout(r, 0));
  assert(game.state === 'GAMEOVER' && !game.reviveUsed, 'no reward, no revive');
  assert(game.canOfferRevive(), 'revive can still be offered after a failed ad');
});

// Баг с телефона (2026-10-19): реклама досмотрена, закрыта, а кот не возрождается. Яндекс присылает «возобновить»
// (game_api_resume) вокруг onClose; пока флаг паузы платформы не снят, возрождение отказывало, и награда терялась.
await check('the revive reward is paid even while the platform pause flag is not yet released', async () => {
  for (const flags of [{ platformPaused: true }, { hidden: true }, { platformPaused: true, hidden: true }]) {
    const { game } = makeGameOver();
    game.handleTap(270, 728);
    Object.assign(game, flags); // «возобновить» ещё не пришло, когда реклама уже закрылась
    await new Promise((r) => setTimeout(r, 0));
    assert(game.state === 'PLAYING' && game.reviveUsed, `no revive with ${JSON.stringify(flags)}`);
    assert(!game.adPaused && !game.rewardPending, 'the ad pause is released');
    assert(game.isGameplayPaused(), 'the game still waits for the platform to resume (nothing runs yet)');
  }
});

await check('an ordinary revive (no ad) is still refused while the game is paused', () => {
  const { game } = makeGameOver();
  game.platformPaused = true;
  assert(!game.canRevive() && game.revive() === false, 'no revive on pause without a reward');
  assert(game.canRevive({ ignorePause: true }), 'a reward may revive');
  game.reviveUsed = true;
  assert(!game.canRevive({ ignorePause: true }), 'but only once per run');
});

await check('no reward: a short notice tells why (closed early / ad failed), nothing is shown after a reward', async () => {
  const closedEarly = makeGameOver({ adResult: { attempted: true, rewarded: false } });
  closedEarly.game.handleTap(270, 728);
  await new Promise((r) => setTimeout(r, 0));
  assert(closedEarly.game.notice && closedEarly.game.notice.key === 'over.noReward', 'closed early');
  assert(closedEarly.game.state === 'GAMEOVER' && closedEarly.game.canOfferRevive(), 'the revive button stays');

  const failed = makeGameOver({ adResult: { attempted: true, rewarded: false, error: new Error('no ad') } });
  failed.game.handleTap(270, 728);
  await new Promise((r) => setTimeout(r, 0));
  assert(failed.game.notice && failed.game.notice.key === 'over.adFailed', 'the ad failed');

  const rewarded = makeGameOver({ adResult: { attempted: true, rewarded: true } });
  rewarded.game.handleTap(270, 728);
  await new Promise((r) => setTimeout(r, 0));
  assert(!rewarded.game.notice, 'no notice after a reward');

  const { game } = closedEarly;
  game.updateNotice(CONFIG.YANDEX.NOTICE_SECONDS - 0.1);
  assert(game.notice, 'still on the screen');
  game.updateNotice(0.2);
  assert(game.notice === null, 'gone after NOTICE_SECONDS');
});

await check('the notice strings exist in both languages and the notice is drawn on Game Over', () => {
  for (const lang of ['ru', 'en']) {
    const dict = JSON.parse(fs.readFileSync(new URL(`../src/localization/${lang}.json`, import.meta.url), 'utf8'));
    assert(dict.over.noReward && dict.over.adFailed, `${lang}: notice strings`);
  }
  const source = fs.readFileSync(new URL('../src/game/Game.js', import.meta.url), 'utf8');
  assert(/drawStageToast\(t\(notice\.key\)/.test(source), 'render draws the notice');
  assert(/this\.updateNotice\?\.\(deltaTime\)/.test(source), 'update ages the notice');
});

// «×2 монеты» включена вместе с магазином (CONFIG.YANDEX.DOUBLE_COINS_AD, шаг 6б): монеты есть на что
// тратить. Выключатель по-прежнему работает: с выключенным кнопка не предлагается.
await check('the x2 coins ad is on now that there is a shop, and the switch still turns it off', async () => {
  assert(CONFIG.YANDEX.DOUBLE_COINS_AD === true, 'x2 coins is on together with the shop');
  const { game } = makeGameOver({ runCoins: 4 });
  assert(game.canOfferDoubleCoins(), 'must be offered when everything allows it');
  CONFIG.YANDEX.DOUBLE_COINS_AD = false;
  try {
    assert(!game.canOfferDoubleCoins(), 'must not be offered while the switch is off');
    assert(game.requestDoubleCoins() === false);
  } finally {
    CONFIG.YANDEX.DOUBLE_COINS_AD = true;
  }
});

await check('double coins adds this run coins once (switch on)', async () => {
  try {
    const { game, coins } = makeGameOver({ runCoins: 4 });
    game.handleTap(270, 794);
    await new Promise((r) => setTimeout(r, 0));
    assert(coins() === 14, `coins ${coins()}`);
    assert(game.coinsDoubled && !game.canOfferDoubleCoins(), 'only once per run');
    assert(game.requestDoubleCoins() === false);
  } finally {
    CONFIG.YANDEX.DOUBLE_COINS_AD = true;
  }
});

await check('double coins is not offered without coins this run (switch on)', async () => {
  try {
    const { game } = makeGameOver({ runCoins: 0 });
    assert(!game.canOfferDoubleCoins());
  } finally {
    CONFIG.YANDEX.DOUBLE_COINS_AD = true;
  }
});

await check('taps right after the crash do not restart or trigger ads', async () => {
  const { game, calls } = makeGameOver({ age: CONFIG.GAME_OVER_INPUT_LOCK / 2 });
  assert(game.handleTap(270, 728) === false, 'revive button locked for a moment');
  assert(game.handleTap(20, 20) === false, 'restart locked for a moment');
  assert(calls.shown === 0 && calls.started === 0);
  game.feel.gameOverAge = CONFIG.GAME_OVER_INPUT_LOCK + 0.1;
  assert(game.handleTap(20, 20) === true && calls.started === 1, 'tap outside buttons restarts');
});

await check('no rewarded offers when ads are unavailable', async () => {
  const { game } = makeGameOver();
  game.platform.canShowRewarded = () => false;
  assert(!game.canOfferRevive() && !game.canOfferDoubleCoins());
  assert(game.requestRevive() === false && game.requestDoubleCoins() === false);
});

console.log(results.join('\n'));
const failed = results.filter((line) => line.startsWith('FAIL'));
if (failed.length) {
  console.log(`\n${failed.length} Phase 5 check(s) failed`);
  process.exitCode = 1;
} else {
  console.log('\nAll Phase 5 checks passed');
}
