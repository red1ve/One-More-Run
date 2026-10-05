// Разбирает коробки MP4: порядок верхнего уровня, длительность из mvhd, размер кадра из tkhd, кодек из stsd.
// Как программа: node scripts/store-capture/mp4-info.mjs файл.mp4 ; как модуль: mp4Info(buffer) для store-check.mjs.
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

function boxes(buf, start, end, depth = 0, out = []) {
  let pos = start;
  while (pos + 8 <= end) {
    let size = buf.readUInt32BE(pos);
    const type = buf.toString('latin1', pos + 4, pos + 8);
    let header = 8;
    if (size === 1) { size = Number(buf.readBigUInt64BE(pos + 8)); header = 16; }
    if (size === 0) size = end - pos;
    if (size < header || pos + size > end) break; // битый или оборванный файл
    out.push({ type, pos, size, header, depth });
    if (['moov', 'trak', 'mdia', 'minf', 'stbl', 'moof', 'traf', 'mvex', 'edts'].includes(type)) boxes(buf, pos + header, pos + size, depth + 1, out);
    pos += size;
  }
  return out;
}

// Что внутри MP4: { top: ['ftyp', 'moov', ...], hasMoov, duration (секунды, 0 если неизвестна), width, height, codec, fragmented }.
export function mp4Info(buf) {
  const list = boxes(buf, 0, buf.length);
  const info = { top: list.filter((b) => b.depth === 0).map((b) => b.type), hasMoov: false, duration: 0, width: 0, height: 0, codec: null, fragmented: false };
  const moov = list.find((b) => b.type === 'moov');
  if (!moov) return info;
  info.hasMoov = true;
  const mvhd = list.find((b) => b.type === 'mvhd');
  if (mvhd) {
    const p = mvhd.pos + mvhd.header;
    const version = buf[p];
    const timescale = buf.readUInt32BE(p + (version === 1 ? 20 : 12));
    const duration = version === 1 ? Number(buf.readBigUInt64BE(p + 24)) : buf.readUInt32BE(p + 16);
    info.duration = timescale ? duration / timescale : 0;
  }
  const tkhd = list.find((b) => b.type === 'tkhd');
  if (tkhd) {
    const q = tkhd.pos + tkhd.header;
    const v = buf[q];
    info.width = buf.readUInt32BE(q + (v === 1 ? 88 : 76)) / 65536;
    info.height = buf.readUInt32BE(q + (v === 1 ? 92 : 80)) / 65536;
  }
  const stsd = list.find((b) => b.type === 'stsd');
  if (stsd) info.codec = buf.toString('latin1', stsd.pos + 20, stsd.pos + 24);
  info.fragmented = list.some((b) => b.type === 'mvex' || b.type === 'moof');
  return info;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const info = mp4Info(fs.readFileSync(process.argv[2]));
  console.log('top level:', info.top.join(' '));
  console.log(`duration ${info.duration.toFixed(2)} s, ${info.width}x${info.height}, codec ${info.codec}, fragmented: ${info.fragmented}`);
}
