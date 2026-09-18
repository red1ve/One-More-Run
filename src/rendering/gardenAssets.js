import { CONFIG } from '../config.js';

function full(id, url) {
  return { id, url, sx: 0, sy: 0, sw: 0, sh: 0 };
}

function planter(id) {
  return full(id, new URL(`../../assets/environment/garden/planters/${id}.png`, import.meta.url).href);
}

function coin(id) {
  return full(id, new URL(`../../assets/environment/collectibles/${id}.png`, import.meta.url).href);
}

const TREES = [
  full('tree-06', new URL('../../assets/environment/background/trees/tree-06.png', import.meta.url).href),
  full('tree-07', new URL('../../assets/environment/background/trees/tree-07.png', import.meta.url).href),
  full('tree-08', new URL('../../assets/environment/background/trees/tree-08.png', import.meta.url).href)
];

const BUSHES = [
  full('bush-06', new URL('../../assets/environment/vegetation/bushes/bush-06.png', import.meta.url).href),
  full('bush-07', new URL('../../assets/environment/vegetation/bushes/bush-07.png', import.meta.url).href)
];

const FLOWERS = [
  full('flower-04', new URL('../../assets/environment/vegetation/details/flower-04.png', import.meta.url).href),
  full('flower-05', new URL('../../assets/environment/vegetation/details/flower-05.png', import.meta.url).href)
];

const GRASS = [
  full('grass-06', new URL('../../assets/environment/vegetation/details/grass-06.png', import.meta.url).href)
];

export const LEGACY_GARDEN_SHEETS = {
  clouds: [],
  trees: TREES,
  bushes: BUSHES,
  flowers: FLOWERS,
  grass: GRASS,
  planters: [],
  coins: [],
  distantHorizon: [],
  distantGarden: [],
  sideMasses: [],
  pathSand: [],
  roadCrest: [],
  roadEdges: [],
  landmarks: [],
  obstacles: []
};

export const PACK_GARDEN_SHEETS = {
  clouds: [],
  trees: TREES,
  bushes: BUSHES,
  flowers: FLOWERS,
  grass: GRASS,
  planters: [
    planter('planter-01'),
    planter('planter-02'),
    planter('planter-03'),
    planter('planter-04'),
    planter('planter-05'),
    planter('planter-06'),
    planter('planter-07'),
    planter('planter-08')
  ],
  coins: [
    coin('coin-01'),
    coin('coin-02'),
    coin('coin-03'),
    coin('coin-04')
  ],
  distantHorizon: [
    full('distant-garden-horizon', new URL('../../assets/environment/background/distant-garden-horizon.png', import.meta.url).href)
  ],
  distantGarden: [
    full('distant-garden', new URL('../../assets/environment/background/distant-garden.png', import.meta.url).href)
  ],
  sideMasses: [
    full('left-garden-mass', new URL('../../assets/environment/side-masses/left-garden-mass.png', import.meta.url).href),
    full('right-garden-mass', new URL('../../assets/environment/side-masses/right-garden-mass.png', import.meta.url).href)
  ],
  pathSand: [
    full('path-sand-material', new URL('../../assets/environment/background/path-sand-material.png', import.meta.url).href)
  ],
  roadCrest: [],
  roadEdges: [],
  landmarks: [
    full(
      'single-choice-arch',
      new URL('../../assets/environment/garden/landmarks/single-choice-arch.png', import.meta.url).href
    )
  ],
  obstacles: [
    full(
      'garden-gate',
      new URL('../../assets/environment/garden/obstacles/garden-gate.png', import.meta.url).href
    ),
    full(
      'garden-fence',
      new URL('../../assets/environment/garden/obstacles/garden-fence.png', import.meta.url).href
    )
  ]
};

export function getGardenSheets() {
  return CONFIG.VISUAL.USE_ENVIRONMENT_ASSET_PACK ? PACK_GARDEN_SHEETS : LEGACY_GARDEN_SHEETS;
}

export const GARDEN_SHEETS = PACK_GARDEN_SHEETS;
