// Výřez osoby z fotky (odstranění pozadí) přímo v prohlížeči přes transformers.js. Fotka nikam neodchází.
// rychlý: MODNet (Apache-2.0, ~25 MB) – portrétní matting, pár sekund.
// přesný: ORMBG (Apache-2.0, ~44 MB, int8) – celá postava i s hokejkou a čistšími okraji, ~10–20 s.
// Modely se stáhnou jednou, pak je prohlížeč drží v mezipaměti.
(() => {
"use strict";
const TRANSFORMERS = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2";
const MODELY = {
  rychly: { id: "Xenova/modnet", dtype: "fp32" },
  presny: { id: "onnx-community/ormbg-ONNX", dtype: "q8" },
};
const modely = {}; // druh → Promise<pipeline>
function nactiModel(druh) {
  if (!modely[druh]) {
    const m = MODELY[druh];
    modely[druh] = import(TRANSFORMERS).then(({ pipeline }) => pipeline("background-removal", m.id, { dtype: m.dtype, device: "wasm" }));
    modely[druh].catch(() => { delete modely[druh]; });
  }
  return modely[druh];
}
const cache = new Map(); // klíč → Promise<canvas>

function rgba(res) {
  if (res.data.length === res.width * res.height * 4) return new Uint8ClampedArray(res.data);
  const n = res.width * res.height, ch = res.channels, out = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) { out[i * 4] = res.data[i * ch]; out[i * 4 + 1] = res.data[i * ch + 1]; out[i * 4 + 2] = res.data[i * ch + 2]; out[i * 4 + 3] = ch === 4 ? res.data[i * ch + 3] : 255; }
  return out;
}
// Dočištění masky: odstraní poloprůhledný „opar“ a zbytky pozadí, které nejsou spojené s postavou
// (ponechá největší souvislou oblast a další velké části – např. hokejku nebo druhou ruku), zaplní malé díry.
function docisti(c) {
  const w = c.width, h = c.height;
  const x = c.getContext("2d", { willReadFrequently: true });
  const id = x.getImageData(0, 0, w, h), d = id.data;
  // zmenšená binární maska pro hledání souvislých oblastí
  const k = Math.max(1, Math.ceil(Math.max(w, h) / 360));
  const mw = Math.ceil(w / k), mh = Math.ceil(h / k);
  const m = new Uint8Array(mw * mh);
  for (let y = 0; y < mh; y++) for (let xx = 0; xx < mw; xx++) {
    const a = d[((Math.min(h - 1, y * k)) * w + Math.min(w - 1, xx * k)) * 4 + 3];
    m[y * mw + xx] = a > 110 ? 1 : 0;
  }
  const znacka = new Int32Array(mw * mh).fill(-1), velikosti = [];
  const fronta = new Int32Array(mw * mh);
  for (let i = 0; i < m.length; i++) {
    if (!m[i] || znacka[i] >= 0) continue;
    const id2 = velikosti.length; let hlava = 0, konec = 0, n = 0;
    fronta[konec++] = i; znacka[i] = id2;
    while (hlava < konec) {
      const p = fronta[hlava++]; n++;
      const px = p % mw, py = (p / mw) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = px + dx, ny = py + dy;
        if (nx < 0 || ny < 0 || nx >= mw || ny >= mh) continue;
        const q = ny * mw + nx;
        if (m[q] && znacka[q] < 0) { znacka[q] = id2; fronta[konec++] = q; }
      }
    }
    velikosti.push(n);
  }
  if (!velikosti.length) return c;
  const nejvetsi = Math.max(...velikosti);
  const nechat = velikosti.map((n) => n >= nejvetsi * 0.06);
  // díry: oblasti pozadí, které se nedotýkají okraje (uvnitř postavy) → zaplnit
  const venku = new Uint8Array(mw * mh);
  let hlava = 0, konec = 0;
  const pridej = (q) => { if (!venku[q] && !(m[q] && nechat[znacka[q]])) { venku[q] = 1; fronta[konec++] = q; } };
  for (let xx = 0; xx < mw; xx++) { pridej(xx); pridej((mh - 1) * mw + xx); }
  for (let y = 0; y < mh; y++) { pridej(y * mw); pridej(y * mw + mw - 1); }
  while (hlava < konec) {
    const p = fronta[hlava++], px = p % mw, py = (p / mw) | 0;
    if (px > 0) pridej(p - 1); if (px < mw - 1) pridej(p + 1); if (py > 0) pridej(p - mw); if (py < mh - 1) pridej(p + mw);
  }
  const dira = new Uint8Array(mw * mh);
  for (let i = 0; i < m.length; i++) if (!venku[i] && !(m[i] && nechat[znacka[i]])) dira[i] = 1;
  // velké díry (např. mezi rukou a tělem) nechat průhledné – zaplnit jen malé
  for (let y = 0; y < h; y++) for (let xx = 0; xx < w; xx++) {
    const i = (y * w + xx) * 4;
    const mi = Math.min(mh - 1, (y / k) | 0) * mw + Math.min(mw - 1, (xx / k) | 0);
    let a = d[i + 3];
    if (m[mi] && !nechat[znacka[mi]]) a = 0;                     // odtržený zbytek pozadí
    else if (!m[mi] && a < 60 && !dira[mi]) a = 0;               // opar kolem postavy
    d[i + 3] = a;
  }
  // okraje: barva poloprůhledných pixelů se nahradí barvou postavy (bez lemu z původního pozadí),
  // alfa se o pixel stáhne a jemně vyhladí
  const a0 = new Uint8ClampedArray(w * h);
  for (let i = 0; i < w * h; i++) a0[i] = d[i * 4 + 3];
  const src = new Uint8ClampedArray(d);
  for (let y = 1; y < h - 1; y++) for (let xx = 1; xx < w - 1; xx++) {
    const p = y * w + xx, a = a0[p];
    if (!a || a >= 250) continue;
    let r = 0, g = 0, b = 0, n = 0, mn = a;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const yy = y + dy, xq = xx + dx;
      if (yy < 0 || xq < 0 || yy >= h || xq >= w) continue;
      const q = yy * w + xq;
      if (a0[q] >= 245) { r += src[q * 4]; g += src[q * 4 + 1]; b += src[q * 4 + 2]; n++; }
      if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1 && a0[q] < mn) mn = a0[q];
    }
    if (n) { d[p * 4] = r / n; d[p * 4 + 1] = g / n; d[p * 4 + 2] = b / n; }
    d[p * 4 + 3] = (a * 0.55 + mn * 0.45);
  }
  x.putImageData(id, 0, 0);
  return c;
}
function orizni(c) {
  const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
  let x0 = c.width, y0 = c.height, x1 = 0, y1 = 0;
  for (let y = 0; y < c.height; y += 2) for (let x = 0; x < c.width; x += 2) {
    if (d[(y * c.width + x) * 4 + 3] > 40) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 <= x0 || y1 <= y0) return c;
  const o = document.createElement("canvas");
  o.width = x1 - x0 + 1; o.height = y1 - y0 + 1;
  o.getContext("2d").drawImage(c, x0, y0, o.width, o.height, 0, 0, o.width, o.height);
  return o;
}
async function naUrl(zdroj) {
  if (typeof zdroj === "string") return { url: zdroj, uvolni: () => {} };
  let blob = zdroj;
  if (!(zdroj instanceof Blob)) {
    const c = document.createElement("canvas");
    c.width = zdroj.naturalWidth || zdroj.width; c.height = zdroj.naturalHeight || zdroj.height;
    c.getContext("2d").drawImage(zdroj, 0, 0);
    blob = await new Promise((ok) => c.toBlob(ok, "image/png"));
  }
  const url = URL.createObjectURL(blob);
  return { url, uvolni: () => URL.revokeObjectURL(url) };
}

// zdroj: Blob | HTMLImageElement | canvas | URL → canvas s průhledným pozadím (oříznutý na postavu)
// volby.presne = přesný model (při chybě se použije rychlý)
async function vyrizni(zdroj, klic = null, volby = {}) {
  const druh = volby.presne ? "presny" : "rychly";
  const k = klic ? `${druh}|${klic}` : null;
  if (k && cache.has(k)) return cache.get(k);
  const slib = (async () => {
    let seg;
    try { seg = await nactiModel(druh); } catch (e) { if (druh === "rychly") throw e; seg = await nactiModel("rychly"); }
    const { url, uvolni } = await naUrl(zdroj);
    try {
      const out = await seg(url);
      const res = Array.isArray(out) ? out[0] : out;
      const c = document.createElement("canvas");
      c.width = res.width; c.height = res.height;
      c.getContext("2d").putImageData(new ImageData(rgba(res), res.width, res.height), 0, 0);
      return orizni(volby.presne ? docisti(c) : c);
    } finally { uvolni(); }
  })();
  if (k) { cache.set(k, slib); slib.catch(() => cache.delete(k)); }
  return slib;
}

// Bílý (nebo barevný) „sticker“ obrys kolem výřezu + volitelná záře. Vrací nový canvas s okrajem.
function sObrysem(vyrez, { tloustka = 10, barva = "#ffffff", zare = null, zareSila = 40 } = {}) {
  const okraj = tloustka + (zare ? zareSila : 0);
  const c = document.createElement("canvas");
  c.width = vyrez.width + okraj * 2; c.height = vyrez.height + okraj * 2;
  const x = c.getContext("2d");
  const sil = document.createElement("canvas"); sil.width = vyrez.width; sil.height = vyrez.height;
  const sx = sil.getContext("2d"); sx.drawImage(vyrez, 0, 0); sx.globalCompositeOperation = "source-in"; sx.fillStyle = barva; sx.fillRect(0, 0, sil.width, sil.height);
  if (zare) { x.save(); x.shadowColor = zare; x.shadowBlur = zareSila; x.drawImage(sil, okraj, okraj); x.restore(); }
  for (let a = 0; a < 24; a++) { const u = (a / 24) * Math.PI * 2; x.drawImage(sil, okraj + Math.cos(u) * tloustka, okraj + Math.sin(u) * tloustka); }
  x.drawImage(vyrez, okraj, okraj);
  return c;
}

window.DHVyrez = { vyrizni, sObrysem, orizni, docisti };
})();
