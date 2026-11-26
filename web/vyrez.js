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
  const nechat = velikosti.map((n) => n >= nejvetsi * 0.1);
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

// ------------------------------------------------- SAM: výřez podle bodů --
// SlimSAM (Apache-2.0, ~40 MB) vyřízne objekt, na který ukazují body (+ hráč, − branka/okolí).
// Přesný režim: ORMBG dá jemné okraje, MODNet najde postavu → z ní se spočítají body pro SAM,
// SAM pak oddělí jen hráče (bez branky, mantinelu, rozhodčího). Body jde upravit ručně.
let sam = null;
function nactiSam() {
  if (!sam) {
    sam = import(TRANSFORMERS).then(async ({ SamModel, AutoProcessor, RawImage }) => ({
      model: await SamModel.from_pretrained("Xenova/slimsam-77-uniform", { dtype: "fp32", device: "wasm" }),
      processor: await AutoProcessor.from_pretrained("Xenova/slimsam-77-uniform"),
      RawImage,
    }));
    sam.catch(() => { sam = null; });
  }
  return sam;
}
async function samMaska(url, plus, minus) {
  const { model, processor, RawImage } = await nactiSam();
  const img = await RawImage.read(url);
  const body = [...plus, ...minus];
  const inputs = await processor(img, { input_points: [body], input_labels: [[...plus.map(() => 1), ...minus.map(() => 0)]] });
  const out = await model(inputs);
  // měkká maska: logity zvětšené bilineárně → pravděpodobnost (hladké okraje místo zubatých schodů)
  const masky = await processor.post_process_masks(out.pred_masks, inputs.original_sizes, inputs.reshaped_input_sizes, { binarize: false });
  const skore = Array.from(out.iou_scores.data);
  const m = masky[0], [, , H, Wd] = m.dims;
  const nej = skore.indexOf(Math.max(...skore));
  const vys = new Uint8Array(Wd * H), mekka = new Float32Array(Wd * H);
  const off = nej * Wd * H;
  for (let i = 0; i < Wd * H; i++) { const p = 1 / (1 + Math.exp(-m.data[off + i])); mekka[i] = p; vys[i] = p > 0.5 ? 1 : 0; }
  return { maska: vys, mekka, w: Wd, h: H, skore: skore[nej] };
}
const alfaZ = (res) => {
  const n = res.width * res.height, ch = res.channels, a = new Uint8Array(n);
  for (let i = 0; i < n; i++) a[i] = ch === 4 ? res.data[i * 4 + 3] : res.data[i * ch];
  return a;
};
// automatické body: + na postavě (MODNet), − na věcech, které nejsou člověk (ORMBG ano, MODNet ne, daleko od postavy)
function autoBody(ao, am, w, h) {
  const krok = Math.max(2, Math.round(Math.max(w, h) / 160));
  const osoba = [];
  for (let y = 0; y < h; y += krok) for (let x = 0; x < w; x += krok) if (am[y * w + x] > 200) osoba.push([x, y]);
  if (osoba.length < 20) for (let y = 0; y < h; y += krok) for (let x = 0; x < w; x += krok) if (ao[y * w + x] > 200) osoba.push([x, y]);
  if (!osoba.length) return { plus: [[w / 2, h / 2]], minus: [] };
  const plus = [];
  const ys = osoba.map((b) => b[1]), y0 = Math.min(...ys), y1 = Math.max(...ys);
  // body ve 4 výškách postavy (hlava, hrudník, pás, nohy) – vždy na nejdelším úseku řádku
  for (const t of [0.08, 0.3, 0.55, 0.8]) {
    const cilY = y0 + (y1 - y0) * t;
    const radek = osoba.filter((b) => Math.abs(b[1] - cilY) <= krok);
    if (!radek.length) continue;
    radek.sort((a, b) => a[0] - b[0]);
    let nej = [radek[0]], akt = [radek[0]];
    for (let i = 1; i < radek.length; i++) {
      if (radek[i][0] - radek[i - 1][0] <= krok * 1.5) akt.push(radek[i]); else akt = [radek[i]];
      if (akt.length > nej.length) nej = [...akt];
    }
    plus.push(nej[Math.floor(nej.length / 2)]);
  }
  const diag = Math.hypot(w, h), minus = [];
  // pro vzdálenost bereme i méně jisté části postavy (MODNet občas nepozná betony / výstroj)
  const vzorek = [];
  for (let y = 0; y < h; y += krok * 2) for (let x = 0; x < w; x += krok * 2) if (am[y * w + x] > 60) vzorek.push([x, y]);
  const kandidati = [];
  const k2 = krok * 3;
  for (let y = 0; y < h; y += k2) for (let x = 0; x < w; x += k2) {
    if (ao[y * w + x] < 180 || am[y * w + x] > 20) continue;
    let d = Infinity;
    for (const [px, py] of vzorek) { const q = Math.hypot(px - x, py - y); if (q < d) d = q; }
    if (d > diag * 0.14) kandidati.push({ x, y, d });
  }
  kandidati.sort((a, b) => b.d - a.d);
  for (const k of kandidati) {
    if (minus.length >= 4) break;
    if (minus.every(([mx, my]) => Math.hypot(mx - k.x, my - k.y) > diag * 0.15)) minus.push([k.x, k.y]);
  }
  return { plus, minus };
}
// spojení: jádro postavy (SAM si je jistý) plné, okraj = jemná alfa ORMBG vážená měkkou pravděpodobností SAM
function kombinuj(ao, sm, w, h, mekka = null) {
  const r = Math.max(1, Math.round(Math.max(w, h) / 500));
  const er = new Uint8Array(w * h), dil = new Uint8Array(w * h);
  // eroze / dilatace čtvercem (r) – dvakrát průchod řádky a sloupci
  const filtr = (src, dst, jeMax) => {
    const tmp = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let v = jeMax ? 0 : 1;
      for (let d = -r; d <= r; d++) { const q = Math.min(w - 1, Math.max(0, x + d)); v = jeMax ? Math.max(v, src[y * w + q]) : Math.min(v, src[y * w + q]); }
      tmp[y * w + x] = v;
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let v = jeMax ? 0 : 1;
      for (let d = -r; d <= r; d++) { const q = Math.min(h - 1, Math.max(0, y + d)); v = jeMax ? Math.max(v, tmp[q * w + x]) : Math.min(v, tmp[q * w + x]); }
      dst[y * w + x] = v;
    }
  };
  filtr(sm, er, false); filtr(sm, dil, true);
  const a = new Uint8Array(w * h);
  const ss = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
  for (let i = 0; i < w * h; i++) {
    const p = mekka ? mekka[i] : sm[i];
    if (er[i] && p > 0.85) { a[i] = 255; continue; }          // jisté jádro postavy
    const vaha = ss((p - 0.2) / 0.6);                           // měkký přechod podle SAM
    // na okraji jemná alfa ORMBG; kde ORMBG postavu nevidí (bílé betony), vezmi aspoň SAM
    const v = Math.round(Math.max(ao[i] * vaha, p > 0.6 ? 255 * ss((p - 0.6) / 0.35) : 0));
    a[i] = v < 48 ? 0 : v; // slabé zbytky (síť, opar) pryč
  }
  return a;
}

// zdroj: Blob | HTMLImageElement | canvas | URL → canvas s průhledným pozadím (oříznutý na postavu)
// volby.presne = přesný model (při chybě se použije rychlý); volby.body = {plus, minus} ruční body pro SAM.
// Výsledný canvas má vlastnost .body (použité body) a .sam (true, když se použil SAM).
async function vyrizni(zdroj, klic = null, volby = {}) {
  if (volby.presne) return vyrizniPresne(zdroj, volby);
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

async function vyrizniPresne(zdroj, volby) {
  const { url, uvolni } = await naUrl(zdroj);
  try {
    const presny = await nactiModel("presny").catch(() => null);
    const rychly = await nactiModel("rychly");
    const resO = presny ? (await presny(url)) : null;
    const ro = resO ? (Array.isArray(resO) ? resO[0] : resO) : null;
    const resM = await rychly(url);
    const rm = Array.isArray(resM) ? resM[0] : resM;
    const zaklad = ro || rm;
    const w = zaklad.width, h = zaklad.height;
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const px = rgba(zaklad);
    const ao = ro ? alfaZ(ro) : alfaZ(rm), am = alfaZ(rm);
    let body = volby.body && volby.body.plus?.length ? volby.body : autoBody(ao, am, w, h);
    let pouzitSam = false;
    try {
      const sm = await samMaska(url, body.plus, body.minus);
      const plocha = sm.maska.reduce((s, v) => s + v, 0);
      if (sm.w === w && sm.h === h && plocha > w * h * 0.01) {
        const a = kombinuj(ao, sm.maska, w, h, sm.mekka);
        for (let i = 0; i < w * h; i++) px[i * 4 + 3] = a[i];
        pouzitSam = true;
      }
    } catch (e) { console.warn("SAM výřez se nepovedl, použiji jen ORMBG:", e?.message); }
    c.getContext("2d").putImageData(new ImageData(px, w, h), 0, 0);
    const plna = docisti(c);
    const vysl = orizni(plna);
    vysl.body = body; vysl.sam = pouzitSam; vysl.plna = plna;
    return vysl;
  } finally { uvolni(); }
}

window.DHVyrez = { vyrizni, sObrysem, orizni, docisti };
})();
