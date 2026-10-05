// Перепаковывает «фрагментный» MP4 из MediaRecorder (длительность в заголовке 0, куски moof/mdat) в обычный
// MP4: moov с полными таблицами выборок и честной длительностью идёт первым, потом один mdat. Видео не
// перекодируется, байты кадров берутся как есть.
// node scripts/store-capture/remux-mp4.mjs вход.mp4 выход.mp4
import fs from 'node:fs';

const [, , input, output] = process.argv;
const buf = fs.readFileSync(input);

function children(start, end) {
  const out = [];
  let pos = start;
  while (pos + 8 <= end) {
    let size = buf.readUInt32BE(pos);
    const type = buf.toString('latin1', pos + 4, pos + 8);
    let header = 8;
    if (size === 1) { size = Number(buf.readBigUInt64BE(pos + 8)); header = 16; }
    if (size === 0) size = end - pos;
    out.push({ type, pos, size, header, end: pos + size, body: pos + header });
    pos += size;
  }
  return out;
}
const child = (parent, type) => children(parent.body, parent.end).find((b) => b.type === type);
const raw = (b) => buf.subarray(b.pos, b.end);
const mk = (type, ...parts) => {
  const body = Buffer.concat(parts);
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length + 8, 0);
  head.write(type, 4, 'latin1');
  return Buffer.concat([head, body]);
};
const u32 = (...values) => { const b = Buffer.alloc(values.length * 4); values.forEach((v, i) => b.writeUInt32BE(v >>> 0, i * 4)); return b; };

const top = children(0, buf.length);
const moov = top.find((b) => b.type === 'moov');
const mvhd = child(moov, 'mvhd');
const trak = child(moov, 'trak');
const tkhd = child(trak, 'tkhd');
const mdia = child(trak, 'mdia');
const mdhd = child(mdia, 'mdhd');
const hdlr = child(mdia, 'hdlr');
const minf = child(mdia, 'minf');
const stblOld = child(minf, 'stbl');
const stsd = child(stblOld, 'stsd');
const mvex = child(moov, 'mvex');
const trex = mvex ? child(mvex, 'trex') : null;
const trexDefaults = trex
  ? { duration: buf.readUInt32BE(trex.body + 8), size: buf.readUInt32BE(trex.body + 12), flags: buf.readUInt32BE(trex.body + 16) }
  : { duration: 0, size: 0, flags: 0 };

// --- выборки из фрагментов
const samples = [];
for (const moof of top.filter((b) => b.type === 'moof')) {
  for (const traf of children(moof.body, moof.end).filter((b) => b.type === 'traf')) {
    const tfhd = child(traf, 'tfhd');
    const tfFlags = buf.readUInt32BE(tfhd.body) & 0xffffff;
    let p = tfhd.body + 8;
    let baseOffset = moof.pos;
    if (tfFlags & 0x1) { baseOffset = Number(buf.readBigUInt64BE(p)); p += 8; }
    if (tfFlags & 0x2) p += 4;
    let defDuration = trexDefaults.duration;
    let defSize = trexDefaults.size;
    let defFlags = trexDefaults.flags;
    if (tfFlags & 0x8) { defDuration = buf.readUInt32BE(p); p += 4; }
    if (tfFlags & 0x10) { defSize = buf.readUInt32BE(p); p += 4; }
    if (tfFlags & 0x20) { defFlags = buf.readUInt32BE(p); p += 4; }
    for (const trun of children(traf.body, traf.end).filter((b) => b.type === 'trun')) {
      const flags = buf.readUInt32BE(trun.body) & 0xffffff;
      const count = buf.readUInt32BE(trun.body + 4);
      let q = trun.body + 8;
      let dataOffset = 0;
      if (flags & 0x1) { dataOffset = buf.readInt32BE(q); q += 4; }
      let firstFlags = null;
      if (flags & 0x4) { firstFlags = buf.readUInt32BE(q); q += 4; }
      let at = baseOffset + dataOffset;
      for (let i = 0; i < count; i += 1) {
        const s = { duration: defDuration, size: defSize, flags: defFlags, cto: 0 };
        if (flags & 0x100) { s.duration = buf.readUInt32BE(q); q += 4; }
        if (flags & 0x200) { s.size = buf.readUInt32BE(q); q += 4; }
        if (flags & 0x400) { s.flags = buf.readUInt32BE(q); q += 4; } else if (i === 0 && firstFlags !== null) s.flags = firstFlags;
        if (flags & 0x800) { s.cto = buf.readInt32BE(q); q += 4; }
        s.offset = at;
        at += s.size;
        samples.push(s);
      }
    }
  }
}
if (!samples.length) throw new Error('no samples found');

// Последняя выборка в записи часто без длительности: берём среднюю по остальным.
const known = samples.filter((s) => s.duration > 0);
const average = Math.round(known.reduce((a, s) => a + s.duration, 0) / Math.max(1, known.length));
for (const s of samples) if (!s.duration) s.duration = average;

const mdhdVersion = buf[mdhd.body];
const mediaTimescale = buf.readUInt32BE(mdhd.body + (mdhdVersion === 1 ? 20 : 12));
const mvhdVersion = buf[mvhd.body];
const movieTimescale = buf.readUInt32BE(mvhd.body + (mvhdVersion === 1 ? 20 : 12));
const mediaDuration = samples.reduce((a, s) => a + s.duration, 0);
const movieDuration = Math.round((mediaDuration / mediaTimescale) * movieTimescale);

// --- таблицы выборок
const runs = [];
for (const s of samples) {
  const last = runs[runs.length - 1];
  if (last && last.duration === s.duration) last.count += 1; else runs.push({ count: 1, duration: s.duration });
}
const stts = mk('stts', u32(0, runs.length), ...runs.map((r) => u32(r.count, r.duration)));
const hasCto = samples.some((s) => s.cto !== 0);
const cttsRuns = [];
for (const s of samples) {
  const last = cttsRuns[cttsRuns.length - 1];
  if (last && last.cto === s.cto) last.count += 1; else cttsRuns.push({ count: 1, cto: s.cto });
}
const ctts = hasCto ? mk('ctts', u32(0x01000000, cttsRuns.length), ...cttsRuns.map((r) => u32(r.count, r.cto))) : null;
const syncIndexes = [];
samples.forEach((s, i) => { if (!(s.flags & 0x10000)) syncIndexes.push(i + 1); });
const stss = mk('stss', u32(0, syncIndexes.length), ...syncIndexes.map((i) => u32(i)));
const stsc = mk('stsc', u32(0, 1, 1, samples.length, 1));
const stsz = mk('stsz', u32(0, 0, samples.length), ...samples.map((s) => u32(s.size)));

const patchDuration = (box, atOffsetV0, atOffsetV1, value) => {
  const copy = Buffer.from(raw(box));
  const version = copy[box.header];
  if (version === 1) copy.writeBigUInt64BE(BigInt(value), box.header + atOffsetV1);
  else copy.writeUInt32BE(value, box.header + atOffsetV0);
  return copy;
};
const newMvhd = patchDuration(mvhd, 16, 24, movieDuration);
const newTkhd = patchDuration(tkhd, 20, 28, movieDuration);
const newMdhd = patchDuration(mdhd, 16, 24, mediaDuration);

const buildMoov = (chunkOffset) => {
  const stco = mk('stco', u32(0, 1, chunkOffset));
  const stbl = mk('stbl', raw(stsd), stts, ...(ctts ? [ctts] : []), stss, stsc, stsz, stco);
  const minfParts = children(minf.body, minf.end).filter((b) => b.type !== 'stbl').map(raw);
  const newMinf = mk('minf', ...minfParts, stbl);
  const newMdia = mk('mdia', newMdhd, raw(hdlr), newMinf);
  const newTrak = mk('trak', newTkhd, newMdia);
  return mk('moov', newMvhd, newTrak);
};

const ftyp = mk('ftyp', Buffer.from('isom', 'latin1'), u32(512), Buffer.from('isomiso2avc1mp41', 'latin1'));
const probe = buildMoov(0);
const mdatStart = ftyp.length + probe.length + 8;
const moovFinal = buildMoov(mdatStart);
const payloadSize = samples.reduce((a, s) => a + s.size, 0);
const mdatHead = Buffer.alloc(8);
mdatHead.writeUInt32BE(payloadSize + 8, 0);
mdatHead.write('mdat', 4, 'latin1');
const out = Buffer.concat([ftyp, moovFinal, mdatHead, ...samples.map((s) => buf.subarray(s.offset, s.offset + s.size))]);
fs.writeFileSync(output, out);
console.log(`remuxed ${samples.length} samples, ${syncIndexes.length} sync, ${(movieDuration / movieTimescale).toFixed(2)} s, ${out.length} bytes, media timescale ${mediaTimescale}`);
