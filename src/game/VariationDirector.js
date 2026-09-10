import { CONFIG, getChoiceIntervalRange, getDualRiskChance } from '../config.js';

export class VariationDirector {
  constructor() {
    this.reset();
  }

  reset() {
    this.lastChoiceType = null;
    this.lastChoiceRunTime = 0;
    this.dualBlocked = false;
    this.lastHadCoin = false;
    this.lastForkBias = null;
    this.forcedForkBias = null;
  }

  observe(segment, runTime) {
    if (!segment || segment.type === 'EMPTY') return;

    if (segment.type === 'TWO_PATHS' || segment.type === 'DUAL_RISK') {
      this.lastChoiceType = segment.type;
      this.lastChoiceRunTime = runTime;
      this.dualBlocked = segment.type === 'DUAL_RISK';
    }

    this.lastHadCoin = Array.isArray(segment.coins) && segment.coins.length > 0;
  }

  secondsSinceChoice(runTime, breathingSinceChoice, speed) {
    const fromTime = Math.max(0, runTime - this.lastChoiceRunTime);
    const fromSegments = breathingSinceChoice * CONFIG.SEGMENT_HEIGHT / Math.max(speed, 1);
    return Math.max(fromTime, fromSegments);
  }

  chooseType({ runTime, speed, breathingSinceChoice, choiceCount, lastType }) {
    if (lastType === 'EMPTY' || lastType === 'TWO_PATHS' || lastType === 'DUAL_RISK') {
      return 'NORMAL';
    }

    if (choiceCount === 0 && breathingSinceChoice < 3) return 'NORMAL';

    const [baseMin, maxInterval] = getChoiceIntervalRange(runTime);
    const minInterval = this.dualBlocked
      ? baseMin + CONFIG.DUAL_RISK_EXTRA_COOLDOWN
      : baseMin;
    const elapsed = this.secondsSinceChoice(runTime, breathingSinceChoice, speed);
    const late = runTime >= 60;
    const floor = late ? 0.62 : 0.5;

    if (elapsed < minInterval * floor) return 'NORMAL';

    let choiceProb = 0.48;
    if (elapsed < minInterval * 0.75) choiceProb *= 0.35;
    else if (elapsed >= maxInterval) choiceProb = Math.max(choiceProb, late ? 0.78 : 0.86);
    else if (elapsed >= minInterval) {
      const t = (elapsed - minInterval) / Math.max(0.01, maxInterval - minInterval);
      choiceProb = 0.55 + 0.28 * t;
    }

    if (breathingSinceChoice >= 5) choiceProb = Math.max(choiceProb, late ? 0.62 : 0.72);
    if (breathingSinceChoice >= 7) choiceProb = Math.max(choiceProb, late ? 0.78 : 0.9);
    if (this.dualBlocked && breathingSinceChoice < 3) choiceProb *= 0.55;

    if (Math.random() >= choiceProb) return 'NORMAL';

    const dualChance = this.dualBlocked ? 0 : getDualRiskChance(runTime);
    if (Math.random() < dualChance) return 'DUAL_RISK';
    return 'TWO_PATHS';
  }

  pickForkBias() {
    if (this.forcedForkBias) return this.forcedForkBias;

    const zones = ['LEFT', 'CENTER', 'RIGHT'];
    const weights = zones.map((zone) => (
      zone === this.lastForkBias ? CONFIG.CHOICE_FORK_REPEAT_WEIGHT : 1
    ));
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    let roll = Math.random() * total;
    let picked = zones[zones.length - 1];
    for (let i = 0; i < zones.length; i += 1) {
      roll -= weights[i];
      if (roll <= 0) {
        picked = zones[i];
        break;
      }
    }
    this.lastForkBias = picked;
    return picked;
  }

  coinChanceScale() {
    return this.lastHadCoin ? CONFIG.COIN_REPEAT_CHANCE_SCALE : 1;
  }
}
