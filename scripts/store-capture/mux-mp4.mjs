// Собирает обычный MP4 (moov в начале, дорожки видео H.264 и звука AAC, куски по секунде вперемешку) из
// кадров, закодированных в браузере (WebCodecs, cap.js recordCfr). Входной файл — простой контейнер OMRV:
//   'OMRV' | длина заголовка (u32) | заголовок JSON | байты кадров: сначала все видео, потом все звук.
// Заголовок: { video: { width, height, timescale, description (base64, запись avcC), samples: [[размер, длительность, ключевой]] },
//              audio: { sampleRate, channels, description (base64, AudioSpecificConfig), samples: [[размер, длительность]] } }.
// Видео не перекодируется. node scripts/store-capture/mux-mp4.mjs вход.omrbin выход.mp4
import fs from 'node:fs';

const [, , input, output] = process.argv;
const raw = fs.readFileSync(input);
if (raw.toString('latin1', 0, 4) !== 'OMRV') throw new Error('это не файл OMRV');
const headerLength = raw.readUInt32BE(4);
const header = JSON.parse(raw.toString('utf8', 8, 8 + headerLength));
const data = raw.subarray(8 + headerLength);

const u32 = (...values) => { const b = Buffer.alloc(values.length * 4); values.forEach((v, i) => b.writeUInt32BE(v >>> 0, i * 4)); return b; };
const u16 = (...values) => { const b = Buffer.alloc(values.length * 2); values.forEach((v, i) => b.writeUInt16BE(v, i * 2)); return b; };
const zeros = (n) => Buffer.alloc(n);
const mk = (type, ...parts) => {
  const body = Buffer.concat(parts);
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length + 8, 0);
  head.write(type, 4, 'latin1');
  return Buffer.concat([head, body]);
};
const MATRIX = u32(0x00010000, 0, 0, 0, 0x00010000, 0, 0, 0, 0x40000000);
const NOW = Math.floor(Date.now() / 1000) + 2082844800; // секунды с 1904 года, как требует MP4

// --- дорожки: у каждой список выборок с положением в данных
function trackFrom(spec, hasKeys) {
  let at = 0;
  return spec.samples.map(([size, duration, key]) => {
    const s = { size, duration, key: hasKeys ? !!key : true, offset: at };
    at += size;
    return s;
  });
}
const video = { spec: header.video, samples: trackFrom(header.video, true) };
const audio = header.audio ? { spec: header.audio, samples: trackFrom(header.audio, false) } : null;
const videoBytes = video.samples.reduce((a, s) => a + s.size, 0);
if (audio) for (const s of audio.samples) s.offset += videoBytes;

const seconds = (track) => track.samples.reduce((a, s) => a + s.duration, 0) / track.spec.timescale;
const movieDuration = Math.round(Math.max(seconds(video), audio ? seconds(audio) : 0) * 1000);

// --- куски по секунде: видео и звук вперемешку
function chunksOf(track) {
  const chunks = [];
  let time = 0;
  for (const s of track.samples) {
    const index = Math.floor(time / track.spec.timescale + 1e-9);
    (chunks[index] = chunks[index] || []).push(s);
    time += s.duration;
  }
  return chunks;
}
const vChunks = chunksOf(video);
const aChunks = audio ? chunksOf(audio) : [];
const chunkCount = Math.max(vChunks.length, aChunks.length);

const order = []; // порядок кусков в mdat
for (let k = 0; k < chunkCount; k += 1) {
  if (vChunks[k]) order.push({ track: 'v', k, samples: vChunks[k] });
  if (aChunks[k]) order.push({ track: 'a', k, samples: aChunks[k] });
}

// --- описания выборок
function avcEntry() {
  const spec = header.video;
  const avcC = mk('avcC', Buffer.from(spec.description, 'base64'));
  const pasp = mk('pasp', u32(1, 1));
  return mk('avc1', zeros(6), u16(1), u16(0, 0), zeros(12), u16(spec.width, spec.height), u32(0x00480000, 0x00480000, 0), u16(1), zeros(32), u16(0x0018, 0xffff), avcC, pasp);
}
const desc = (tag, payload) => Buffer.concat([Buffer.from([tag, payload.length]), payload]);
function mp4aEntry() {
  const spec = header.audio;
  const asc = Buffer.from(spec.description, 'base64');
  const decoderConfig = desc(0x04, Buffer.concat([Buffer.from([0x40, 0x15, 0, 0, 0]), u32(0, 0), desc(0x05, asc)]));
  const esDescriptor = desc(0x03, Buffer.concat([u16(1), Buffer.from([0]), decoderConfig, desc(0x06, Buffer.from([0x02]))]));
  const esds = mk('esds', u32(0), esDescriptor);
  return mk('mp4a', zeros(6), u16(1), u16(0, 0), zeros(4), u16(spec.channels, 16, 0, 0), u32(spec.sampleRate * 65536), esds);
}

function runLength(values) {
  const runs = [];
  for (const v of values) {
    const last = runs[runs.length - 1];
    if (last && last.value === v) last.count += 1; else runs.push({ value: v, count: 1 });
  }
  return runs;
}

function stblFor(track, chunks, entry, withKeys, offsets) {
  const stts = mk('stts', u32(0), u32(runLength(track.samples.map((s) => s.duration)).length), ...runLength(track.samples.map((s) => s.duration)).map((r) => u32(r.count, r.value)));
  const keys = [];
  track.samples.forEach((s, i) => { if (s.key) keys.push(i + 1); });
  const stss = withKeys ? [mk('stss', u32(0, keys.length), ...keys.map((i) => u32(i)))] : [];
  const perChunk = chunks.filter(Boolean).map((c) => c.length);
  const stscRuns = [];
  let first = 1;
  for (const run of runLength(perChunk)) {
    stscRuns.push([first, run.value, 1]);
    first += run.count;
  }
  const stsc = mk('stsc', u32(0, stscRuns.length), ...stscRuns.map((r) => u32(...r)));
  const stsz = mk('stsz', u32(0, 0, track.samples.length), ...track.samples.map((s) => u32(s.size)));
  const stco = mk('stco', u32(0, offsets.length), ...offsets.map((o) => u32(o)));
  return mk('stbl', mk('stsd', u32(0, 1), entry), stts, ...stss, stsc, stsz, stco);
}

function buildMoov(chunkOffsets) {
  const movieTrackId = audio ? 3 : 2;
  const mvhd = mk('mvhd', u32(0, NOW, NOW, 1000, movieDuration, 0x00010000), u16(0x0100, 0), zeros(8), MATRIX, zeros(24), u32(movieTrackId));
  const vOffsets = chunkOffsets.filter((c) => c.track === 'v').map((c) => c.offset);
  const aOffsets = chunkOffsets.filter((c) => c.track === 'a').map((c) => c.offset);
  const make = (id, track, chunks, kind, entry, offsets) => {
    const isVideo = kind === 'vide';
    const duration = Math.round(seconds(track) * 1000);
    const tkhd = mk('tkhd', u32(3, NOW, NOW, id, 0, duration), zeros(8), u16(0, isVideo ? 0 : 1, isVideo ? 0 : 0x0100, 0), MATRIX, isVideo ? u32(track.spec.width * 65536, track.spec.height * 65536) : u32(0, 0));
    const mediaDuration = track.samples.reduce((a, s) => a + s.duration, 0);
    const mdhd = mk('mdhd', u32(0, NOW, NOW, track.spec.timescale, mediaDuration), u16(0x55c4, 0));
    const hdlr = mk('hdlr', u32(0, 0), Buffer.from(kind, 'latin1'), zeros(12), Buffer.from(isVideo ? 'VideoHandler\0' : 'SoundHandler\0', 'latin1'));
    const mediaHeader = isVideo ? mk('vmhd', u32(1), u16(0, 0, 0, 0)) : mk('smhd', u32(0), u16(0, 0));
    const dinf = mk('dinf', mk('dref', u32(0, 1), mk('url ', u32(1))));
    const minf = mk('minf', mediaHeader, dinf, stblFor(track, chunks, entry, isVideo, offsets));
    return mk('trak', tkhd, mk('mdia', mdhd, hdlr, minf));
  };
  const traks = [make(1, video, vChunks, 'vide', avcEntry(), vOffsets)];
  if (audio) traks.push(make(2, audio, aChunks, 'soun', mp4aEntry(), aOffsets));
  return mk('moov', mvhd, ...traks);
}

const ftyp = mk('ftyp', Buffer.from('isom', 'latin1'), u32(512), Buffer.from('isomiso2avc1mp41', 'latin1'));
// Два прохода: размер moov не зависит от значений смещений, поэтому сначала считаем с нулями.
let position = 0;
const probe = order.map((c) => { const entry = { track: c.track, offset: 0 }; position += c.samples.reduce((a, s) => a + s.size, 0); return entry; });
const mdatStart = ftyp.length + buildMoov(probe).length + 8;
position = mdatStart;
const real = order.map((c) => {
  const entry = { track: c.track, offset: position };
  position += c.samples.reduce((a, s) => a + s.size, 0);
  return entry;
});
const moov = buildMoov(real);
const payload = [];
let payloadSize = 0;
for (const c of order) for (const s of c.samples) { payload.push(data.subarray(s.offset, s.offset + s.size)); payloadSize += s.size; }
const mdatHead = Buffer.alloc(8);
mdatHead.writeUInt32BE(payloadSize + 8, 0);
mdatHead.write('mdat', 4, 'latin1');
const out = Buffer.concat([ftyp, moov, mdatHead, ...payload]);
fs.writeFileSync(output, out);
console.log(`muxed: video ${video.samples.length} frames (${seconds(video).toFixed(2)} s, ${(video.samples.length / seconds(video)).toFixed(2)} fps)` +
  (audio ? `, audio ${audio.samples.length} frames (${seconds(audio).toFixed(2)} s)` : ', no audio') + `, ${out.length} bytes`);
