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
    this.lastPattern = 'STRAIGHT';
    this.forcedPattern = null;
    this.lastDriftDirection = 0;
    this.forcedDriftDirection = 0;
  }

  observe(segment, runTime) {
    if (!segment || segment.type === 'EMPTY') return;

    if (segment.type === 'TWO_PATHS' || segment.type === 'DUAL_RISK') {
      this.lastChoiceType = segment.type;
      this.lastChoiceRunTime = runTime;
      this.dualBlocked = segment.type === 'DUAL_RISK';
    }

    this.lastHadCoin = Array.isArray(segment.coins) && segment.coins.length > 0;
    this.lastPattern = segment.pattern || 'STRAIGHT';
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

  choosePattern({ runTime, segmentType, lastType }) {
    if (this.forcedPattern) return this.forcedPattern;

    let weights;
    if (segmentType === 'DUAL_RISK') {
      weights = { STRAIGHT: 0.76, OFFSET_GATE: 0.24 };
    } else if (segmentType === 'TWO_PATHS') {
      if (runTime < 30) {
        weights = { STRAIGHT: 0.8, OFFSET: 0.08, FUNNEL: 0.06, OFFSET_GATE: 0.06 };
      } else if (runTime < 60) {
        weights = { STRAIGHT: 0.55, OFFSET: 0.16, FUNNEL: 0.14, OFFSET_GATE: 0.15 };
      } else if (runTime < 120) {
        weights = { STRAIGHT: 0.45, OFFSET: 0.18, FUNNEL: 0.17, OFFSET_GATE: 0.2 };
      } else {
        weights = { STRAIGHT: 0.4, OFFSET: 0.2, FUNNEL: 0.18, OFFSET_GATE: 0.22 };
      }
    } else if (lastType === 'TWO_PATHS' || lastType === 'DUAL_RISK') {
      weights = { STRAIGHT: 0.72, OFFSET: 0.12, FUNNEL: 0.08, OFFSET_GATE: 0.08 };
    } else if (runTime < 30) {
      weights = { STRAIGHT: 0.72, OFFSET: 0.13, FUNNEL: 0.08, OFFSET_GATE: 0.07 };
    } else if (runTime < 60) {
      weights = { STRAIGHT: 0.45, OFFSET: 0.2, FUNNEL: 0.17, OFFSET_GATE: 0.18 };
    } else if (runTime < 120) {
      weights = { STRAIGHT: 0.32, OFFSET: 0.2, FUNNEL: 0.19, OFFSET_GATE: 0.17, DOUBLE_GATE: 0.12 };
    } else {
      weights = { STRAIGHT: 0.25, OFFSET: 0.2, FUNNEL: 0.2, OFFSET_GATE: 0.18, DOUBLE_GATE: 0.17 };
    }

    if (runTime < CONFIG.PATTERN_DOUBLE_UNLOCK_TIME) delete weights.DOUBLE_GATE;
    if (this.lastPattern !== 'STRAIGHT' && weights[this.lastPattern] !== undefined) {
      weights[this.lastPattern] *= this.lastPattern === 'DOUBLE_GATE'
        ? 0
        : CONFIG.PATTERN_REPEAT_WEIGHT;
    }

    return this.pickWeightedPattern(weights);
  }

  pickWeightedPattern(weights) {
    const entries = Object.entries(weights).filter(([, weight]) => weight > 0);
    const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
    let roll = Math.random() * total;
    for (const [pattern, weight] of entries) {
      roll -= weight;
      if (roll <= 0) return pattern;
    }
    return entries[entries.length - 1]?.[0] || 'STRAIGHT';
  }

  pickDriftDirection() {
    if (this.forcedDriftDirection) return Math.sign(this.forcedDriftDirection);

    const same = this.lastDriftDirection || (Math.random() < 0.5 ? -1 : 1);
    const opposite = -same;
    const repeatWeight = 1;
    const reverseWeight = CONFIG.PATTERN_REVERSE_WEIGHT;
    const picked = Math.random() * (repeatWeight + reverseWeight) < repeatWeight
      ? same
      : opposite;
    this.lastDriftDirection = picked;
    return picked;
  }

  coinChanceScale() {
    return this.lastHadCoin ? CONFIG.COIN_REPEAT_CHANCE_SCALE : 1;
  }
}
