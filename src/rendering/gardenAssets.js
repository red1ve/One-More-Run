// Картинки монет (всё остальное в саду — картинки art-pack, см. ArtPack.js).
// Каждый путь написан целиком: так Vite кладёт в сборку только эти файлы.
export const PACK_GARDEN_SHEETS = {
  coins: [
    { id: 'coin-01', url: new URL('../../assets/environment/collectibles/coin-01.png', import.meta.url).href },
    { id: 'coin-02', url: new URL('../../assets/environment/collectibles/coin-02.png', import.meta.url).href },
    { id: 'coin-03', url: new URL('../../assets/environment/collectibles/coin-03.png', import.meta.url).href },
    { id: 'coin-04', url: new URL('../../assets/environment/collectibles/coin-04.png', import.meta.url).href }
  ].map((item) => ({ ...item, sx: 0, sy: 0, sw: 0, sh: 0 }))
};

export function getGardenSheets() {
  return PACK_GARDEN_SHEETS;
}
