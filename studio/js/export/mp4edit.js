// A small patch to the finished MP4: an edit list on the audio track.
//
// AAC encoders start every stream with a few dozen milliseconds of "priming" (the encoder's look-ahead).
// Without an edit list a player plays that first, so the whole soundtrack ends up late. The edit list
// says "start the audio <mediaTime> samples in and play <durationMs>", the way Apple and ffmpeg write it.
// Only done when the moov box sits after the media data, so no chunk offsets move.

function boxes(dv, start, end) {
  const out = [];
  for (let p = start; p + 8 <= end;) {
    let size = dv.getUint32(p), hdr = 8;
    const type = String.fromCharCode(dv.getUint8(p + 4), dv.getUint8(p + 5), dv.getUint8(p + 6), dv.getUint8(p + 7));
    if (size === 1) { size = Number(dv.getBigUint64(p + 8)); hdr = 16; } else if (size === 0) size = end - p;
    if (size < hdr || p + size > end) break;
    out.push({ type, start: p, size, hdr, end: p + size });
    p += size;
  }
  return out;
}
const kids = (dv, b) => boxes(dv, b.start + b.hdr, b.end);
const find = (list, type) => list.find(b => b.type === type);

// duration fields of mvhd (movie timescale) and tkhd (movie timescale), version 0 or 1
function setDuration(dv, b, v) {
  const ver = dv.getUint8(b.start + 8), off = b.type === 'mvhd' ? (ver ? 32 : 24) : (ver ? 36 : 28);
  if (ver) dv.setBigUint64(b.start + off, BigInt(v)); else dv.setUint32(b.start + off, v);
}
function getDuration(dv, b) {
  const ver = dv.getUint8(b.start + 8), off = b.type === 'mvhd' ? (ver ? 32 : 24) : (ver ? 36 : 28);
  return ver ? Number(dv.getBigUint64(b.start + off)) : dv.getUint32(b.start + off);
}

// mediaTime: samples to skip, in the audio track's own timescale (its sample rate); durationMs: how much to play
export function addAudioEdit(buf, { mediaTime, durationMs }) {
  const dv = new DataView(buf), top = boxes(dv, 0, buf.byteLength);
  const moov = find(top, 'moov'), mdat = find(top, 'mdat');
  if (!moov || !mdat || moov.start < mdat.start || moov.hdr !== 8) return null;
  const inMoov = kids(dv, moov), mvhd = find(inMoov, 'mvhd');
  let audio = null, others = [];
  for (const t of inMoov.filter(b => b.type === 'trak')) {
    const mdia = find(kids(dv, t), 'mdia'), hdlr = mdia && find(kids(dv, mdia), 'hdlr');
    const sub = hdlr ? String.fromCharCode(...new Uint8Array(buf, hdlr.start + 16, 4)) : '';
    if (sub === 'soun' && !audio) audio = t; else others.push(t);
  }
  if (!audio || !mvhd || audio.hdr !== 8) return null;
  const inTrak = kids(dv, audio), tkhd = inTrak[0];
  if (!tkhd || tkhd.type !== 'tkhd' || find(inTrak, 'edts')) return null;

  // edts { elst v0: one entry (segment_duration, media_time, rate 1.0) }
  const edts = new DataView(new ArrayBuffer(36));
  edts.setUint32(0, 36); edts.setUint32(4, 0x65647473);           // 'edts'
  edts.setUint32(8, 28); edts.setUint32(12, 0x656c7374);          // 'elst'
  edts.setUint32(16, 0); edts.setUint32(20, 1);                   // version/flags, entry count
  edts.setUint32(24, durationMs); edts.setInt32(28, mediaTime); edts.setUint32(32, 0x00010000);

  const out = new Uint8Array(buf.byteLength + 36);
  out.set(new Uint8Array(buf, 0, tkhd.end), 0);
  out.set(new Uint8Array(edts.buffer), tkhd.end);
  out.set(new Uint8Array(buf, tkhd.end), tkhd.end + 36);
  const o = new DataView(out.buffer);
  o.setUint32(moov.start, moov.size + 36);
  o.setUint32(audio.start, audio.size + 36);
  setDuration(o, tkhd, durationMs);                                 // tkhd precedes the insertion point, so its offset holds
  const longest = Math.max(durationMs, ...others.map(t => { const h = kids(dv, t)[0]; return h && h.type === 'tkhd' ? getDuration(dv, h) : 0; }));
  setDuration(o, mvhd, longest);
  return out.buffer;
}
