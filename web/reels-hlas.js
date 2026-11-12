// Reels Factory – český hlas (Piper TTS v prohlížeči, mikrofon), hudba a smíchání zvuku.
(() => {
"use strict";

const VZORKOVANI = 48000;
// Piper (open-source, zdarma, běží v prohlížeči přes ONNX). Model se stáhne jednou (~60 MB) z Hugging Face
// a prohlížeč si ho uloží; pak funguje i bez dalšího stahování.
const HLASY = {
  "cs_CZ-jirka-medium": "Jirka – lepší kvalita (Piper, zdarma)",
  "cs_CZ-jirka-low": "Jirka – rychlejší, menší model (Piper, zdarma)",
};
const VITS_URL = "https://cdn.jsdelivr.net/npm/@diffusionstudio/vits-web@1.0.3/+esm";

let vits = null;
async function knihovnaTTS() {
  if (!vits) vits = import(VITS_URL).catch((e) => { vits = null; throw new Error("Nepodařilo se načíst hlasový modul (jsi online?). " + e.message); });
  return vits;
}

// Text pro syntézu: bez značek *zvýraznění*, bez emoji, sjednocené mezery.
function textProHlas(text) {
  return String(text || "")
    .replace(/\*/g, "")
    .replace(/(?:\p{Extended_Pictographic}|\p{Regional_Indicator})(?:️|‍\p{Extended_Pictographic})*/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function syntetizuj(text, hlasId = "cs_CZ-jirka-medium", pokrok = () => {}) {
  const tts = await knihovnaTTS();
  const cisty = textProHlas(text);
  if (!cisty) throw new Error("Prázdný text pro hlas.");
  return tts.predict({ text: cisty, voiceId: hlasId }, (p) => {
    if (p && p.total) pokrok(Math.round((p.loaded / p.total) * 100));
  });
}

// ------------------------------------------------------------- mikrofon --

async function nahravkaZMikrofonu() {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error("Prohlížeč neumí nahrávat z mikrofonu.");
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  const typ = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find((t) => MediaRecorder.isTypeSupported(t)) || "";
  const rec = new MediaRecorder(stream, typ ? { mimeType: typ } : undefined);
  const kusy = [];
  rec.ondataavailable = (e) => { if (e.data.size) kusy.push(e.data); };
  rec.start();
  return {
    zastav: () => new Promise((ok) => {
      rec.onstop = () => { stream.getTracks().forEach((t) => t.stop()); ok(new Blob(kusy, { type: rec.mimeType || "audio/webm" })); };
      rec.stop();
    }),
  };
}

// ------------------------------------------------------------- dekódování --

let ctxDekoder = null;
const bufferCache = new Map();
async function dekoduj(klic, nacistBlob) {
  if (bufferCache.has(klic)) return bufferCache.get(klic);
  const slib = (async () => {
    const blob = await nacistBlob();
    const data = await blob.arrayBuffer();
    ctxDekoder = ctxDekoder || new (window.AudioContext || window.webkitAudioContext)({ sampleRate: VZORKOVANI });
    return ctxDekoder.decodeAudioData(data);
  })();
  bufferCache.set(klic, slib);
  slib.catch(() => bufferCache.delete(klic));
  return slib;
}
const zapomen = (klic) => bufferCache.delete(klic);

async function delkaZvuku(blob) {
  const b = await dekoduj(`tmp-${Date.now()}-${Math.random()}`, async () => blob);
  return b.duration;
}

// ---------------------------------------------------------------- mix --
// stopy: [{ buffer, od, offset=0, delka, hlasitost=1, rychlost=1, prolnuti=0.08 }]
async function smichej({ celkem, stopy = [], hudba = null }) {
  const delkaVzorku = Math.max(1, Math.ceil(celkem * VZORKOVANI));
  const ctx = new OfflineAudioContext(2, delkaVzorku, VZORKOVANI);
  for (const s of stopy) {
    if (!s.buffer || s.delka <= 0) continue;
    const src = ctx.createBufferSource();
    src.buffer = s.buffer;
    src.playbackRate.value = s.rychlost || 1;
    const g = ctx.createGain();
    const h = s.hlasitost ?? 1;
    const p = Math.min(s.prolnuti ?? 0.08, s.delka / 3);
    g.gain.setValueAtTime(0, s.od);
    g.gain.linearRampToValueAtTime(h, s.od + p);
    g.gain.setValueAtTime(h, Math.max(s.od + p, s.od + s.delka - p));
    g.gain.linearRampToValueAtTime(0, s.od + s.delka);
    src.connect(g).connect(ctx.destination);
    src.start(s.od, s.offset || 0, s.delka * (s.rychlost || 1));
  }
  if (hudba?.buffer && hudba.hlasitost > 0) {
    const src = ctx.createBufferSource();
    src.buffer = hudba.buffer;
    src.loop = true;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, 0);
    g.gain.linearRampToValueAtTime(hudba.hlasitost, 1);
    g.gain.setValueAtTime(hudba.hlasitost, Math.max(1, celkem - 2.5));
    g.gain.linearRampToValueAtTime(0, celkem);
    src.connect(g).connect(ctx.destination);
    src.start(0);
  }
  // Jemný limiter, aby se součet stop nepřebudil.
  return ctx.startRendering().then((buf) => {
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const d = buf.getChannelData(c);
      let max = 0;
      for (let i = 0; i < d.length; i++) max = Math.max(max, Math.abs(d[i]));
      if (max > 0.98) { const k = 0.98 / max; for (let i = 0; i < d.length; i++) d[i] *= k; }
    }
    return buf;
  });
}

// Přehrání smíchaného zvuku v náhledu.
function prehraj(buffer, odCasu = 0) {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.connect(ctx.destination);
  const start = ctx.currentTime + 0.05;
  src.start(start, odCasu);
  return {
    cas: () => Math.max(0, ctx.currentTime - start) + odCasu,
    zastav: () => { try { src.stop(); } catch { /* nic */ } ctx.close(); },
  };
}

// AudioBuffer → WAV Blob (pro export samotného voiceoveru).
function naWav(buffer) {
  const kanaly = buffer.numberOfChannels, delka = buffer.length, sr = buffer.sampleRate;
  const data = new DataView(new ArrayBuffer(44 + delka * kanaly * 2));
  const str = (o, s) => [...s].forEach((c, i) => data.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF"); data.setUint32(4, 36 + delka * kanaly * 2, true); str(8, "WAVE"); str(12, "fmt ");
  data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, kanaly, true);
  data.setUint32(24, sr, true); data.setUint32(28, sr * kanaly * 2, true); data.setUint16(32, kanaly * 2, true);
  data.setUint16(34, 16, true); str(36, "data"); data.setUint32(40, delka * kanaly * 2, true);
  let o = 44;
  const ch = [...Array(kanaly)].map((_, c) => buffer.getChannelData(c));
  for (let i = 0; i < delka; i++) for (let c = 0; c < kanaly; c++) {
    const v = Math.max(-1, Math.min(1, ch[c][i]));
    data.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true); o += 2;
  }
  return new Blob([data], { type: "audio/wav" });
}

window.DHReelsHlas = { HLASY, VZORKOVANI, textProHlas, syntetizuj, nahravkaZMikrofonu, dekoduj, zapomen, delkaZvuku, smichej, prehraj, naWav };
})();
