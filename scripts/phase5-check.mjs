// Фаза 5: кнопки «за рекламу» на экране проигрыша (входит в npm run check).
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
  'isGameplayPaused', 'syncGameplayLifecycle', 'start'
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

await check('double coins adds this run coins once', async () => {
  const { game, coins } = makeGameOver({ runCoins: 4 });
  game.handleTap(270, 794);
  await new Promise((r) => setTimeout(r, 0));
  assert(coins() === 14, `coins ${coins()}`);
  assert(game.coinsDoubled && !game.canOfferDoubleCoins(), 'only once per run');
  assert(game.requestDoubleCoins() === false);
});

await check('double coins is not offered without coins this run', async () => {
  const { game } = makeGameOver({ runCoins: 0 });
  assert(!game.canOfferDoubleCoins());
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
