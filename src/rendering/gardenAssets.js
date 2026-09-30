// Картинки мира. Сад (изгородь, газон, декор, препятствия, небо, песок) с Фазы 1
// рисуется кодом, поэтому из картинок остались только монеты. Группы оставлены
// пустыми, чтобы старый код отрисовки (флаги HEDGE_WALL / GARDEN_OBSTACLES / SKY)
// работал без ошибок; старые PNG удалены в Фазе 6 (есть в истории git).

function full(id, url) {
  return { id, url, sx: 0, sy: 0, sw: 0, sh: 0 };
}

function coin(id) {
  return full(id, new URL(`../../assets/environment/collectibles/${id}.png`, import.meta.url).href);
}

export const PACK_GARDEN_SHEETS = {
  clouds: [],
  trees: [],
  bushes: [],
  flowers: [],
  grass: [],
  planters: [],
  coins: [
    coin('coin-01'),
    coin('coin-02'),
    coin('coin-03'),
    coin('coin-04')
  ],
  distantHorizon: [],
  distantGarden: [],
  sideMasses: [],
  pathSand: [],
  roadCrest: [],
  roadEdges: [],
  landmarks: [],
  obstacles: []
};

export function getGardenSheets() {
  return PACK_GARDEN_SHEETS;
}
