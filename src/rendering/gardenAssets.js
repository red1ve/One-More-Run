// Картинка монеты (всё остальное в саду — картинки art-pack, см. ArtPack.js).
// Монета одна на всю игру: coin.png собран из исходника coin.svg рядом с ней.
// Путь написан целиком: так Vite кладёт в сборку только этот файл.
export const PACK_GARDEN_SHEETS = {
  coins: [
    { id: 'coin', url: new URL('../../assets/environment/collectibles/coin.png', import.meta.url).href }
  ].map((item) => ({ ...item, sx: 0, sy: 0, sw: 0, sh: 0 }))
};

export function getGardenSheets() {
  return PACK_GARDEN_SHEETS;
}
