// Výřez osoby z fotky (odstranění pozadí) přímo v prohlížeči – MODNet (Apache-2.0) přes transformers.js.
// Model (~25 MB) se stáhne jednou, pak ho prohlížeč drží v mezipaměti. Fotka nikam neodchází.
(() => {
"use strict";
const TRANSFORMERS = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2";
const MODEL = "Xenova/modnet";
let model = null;
const cache = new Map(); // klíč → Promise<canvas>

function rgba(res) {
  if (res.data.length === res.width * res.height * 4) return new Uint8ClampedArray(res.data);
  const n = res.width * res.height, ch = res.channels, out = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) { out[i * 4] = res.data[i * ch]; out[i * 4 + 1] = res.data[i * ch + 1]; out[i * 4 + 2] = res.data[i * ch + 2]; out[i * 4 + 3] = ch === 4 ? res.data[i * ch + 3] : 255; }
  return out;
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
async function vyrizni(zdroj, klic = null) {
  if (klic && cache.has(klic)) return cache.get(klic);
  const slib = (async () => {
    if (!model) {
      model = import(TRANSFORMERS).then(({ pipeline }) => pipeline("background-removal", MODEL, { dtype: "fp32", device: "wasm" }));
      model.catch(() => { model = null; });
    }
    const seg = await model;
    const { url, uvolni } = await naUrl(zdroj);
    try {
      const out = await seg(url);
      const res = Array.isArray(out) ? out[0] : out;
      const c = document.createElement("canvas");
      c.width = res.width; c.height = res.height;
      c.getContext("2d").putImageData(new ImageData(rgba(res), res.width, res.height), 0, 0);
      return orizni(c);
    } finally { uvolni(); }
  })();
  if (klic) { cache.set(klic, slib); slib.catch(() => cache.delete(klic)); }
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

window.DHVyrez = { vyrizni, sObrysem, orizni };
})();
