// Promo hráče – „fire“ grafika na reposty: jméno hráče → AI dohledá fakta na webu → skutečná fotka,
// hráč vyříznutý z pozadí (MODNet přímo v prohlížeči, zdarma) → plakát ve 3 stylech → PNG + popisek.
(() => {
"use strict";

const $ = (q, el = document) => el.querySelector(q);
const $$ = (q, el = document) => [...el.querySelectorAll(q)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const AI = () => window.DHAI;
const G = () => window.DHG;
const U = () => window.DHYtUloziste;
const toast = (t, d = "ok") => window.DHToast?.(t, d);

const KLIC = "dhpf_promo";
const TRANSFORMERS = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2";
const MODEL_VYREZ = "Xenova/modnet"; // Apache-2.0, ~25 MB, stáhne se jednou a prohlížeč si ho pamatuje
const W = 1080;
const FORMATY = { "4x5": { nazev: "Post 4:5", h: 1350 }, "1x1": { nazev: "Čtverec 1:1", h: 1080 }, "9x16": { nazev: "Story 9:16", h: 1920 } };
const UHLY = {
  legenda: "Legenda / celá kariéra",
  milnik: "Rekord nebo milník",
  narozeniny: "Narozeniny",
  rozlucka: "Konec kariéry / poslední sezóna",
  hype: "Hype – forma, zápas, sezóna",
};
const SABLONY = {
  plakat: { nazev: "🔥 Plakát", popis: "jméno za hráčem, záře, číslo" },
  sticker: { nazev: "💥 Sticker", popis: "duotón, bílý obrys, velké písmo" },
  staty: { nazev: "📊 Statistiky", popis: "hráč + čísla kariéry" },
};
const PISMO_H = '"Anton", "Oswald", Impact, sans-serif';
const PISMO_T = '"Montserrat", "Arial Black", sans-serif';
const PISMO_U = '"Roboto Condensed", "Oswald", sans-serif';

const prazdna = () => ({
  jmeno: "", uhel: "legenda", format: "4x5", sablona: "plakat", logo: true,
  data: { jmeno: "", prijmeni: "", cislo: "", prezdivka: "", tym: "", headline: "", podtitul: "", staty: [], popisek: "", hashtagy: [], zdroje: [] },
  barvy: ["#c8102e", "#ffc000"],
  fotoId: null, vyrezId: null, kredit: "",
  hrac: { zoom: 1, x: 0, y: 0 },
});
let st = prazdna();
try { st = { ...prazdna(), ...JSON.parse(localStorage.getItem(KLIC) || "{}") }; } catch { /* nic */ }
const uloz = () => { try { localStorage.setItem(KLIC, JSON.stringify(st)); } catch { /* nic */ } };

let foto = null, vyrez = null; // HTMLImageElement / canvas
const vyska = () => FORMATY[st.format]?.h || 1350;

// ------------------------------------------------------------- AI fakta --

async function navrhni() {
  const jmeno = $("#prJmeno").value.trim();
  if (!jmeno) { zprava("Napiš jméno hráče.", "chyba"); return; }
  st.jmeno = jmeno; uloz();
  if (!AI()?.maKlic()) { zprava("Bez AI klíče vyplň texty a čísla ručně níž (AI klíč: Můj styl → AI pomocník).", "varovani"); predvyplnRucne(); return; }
  const b = $("#prNavrhni"); b.disabled = true;
  zprava("AI hledá na webu fakta a čísla o hráči… (20–60 s)");
  try {
    const r = await AI().hledatNaWebu({
      casovyLimit: 60000,
      system: `Jsi kreativec českého hokejového Instagramu „Deník hokeje“. Děláš promo grafiky, které lidi sdílejí do stories a posílají kámošům.
Čísla a fakta ber JEN z výsledků hledání (NHL.com, Hockey-Reference, Elite Prospects, IIHF, Wikipedie, kluby). Když si číslem nejsi jistý, nepoužij ho. Nic si nevymýšlej.`,
      zadani: `Hráč: ${jmeno}
Úhel: ${UHLY[st.uhel] || st.uhel}

Vrať POUZE JSON:
{
 "jmeno": "celé jméno s diakritikou",
 "prijmeni": "příjmení (to bude obří přes celý plakát)",
 "cislo": "číslo dresu, se kterým je nejvíc spojený (jen číslo)",
 "prezdivka": "známá přezdívka nebo krátký titul, max 3 slova (např. „THE GR8", „KRÁL"), jinak prázdné",
 "tym": "tým, se kterým je nejvíc spojený",
 "barvy": ["#hex hlavní barva toho týmu", "#hex akcentní barva (kontrastní, svítivá)"],
 "headline": "ÚDERNÝ titulek česky, max 4 slova, jedno klíčové slovo dej do *hvězdiček* (např. „LEGENDA *NEUMÍRÁ*“, „KRÁL *KANADY*“)",
 "podtitul": "jedna krátká věta česky, max 9 slov, fakt nebo emoce",
 "staty": [{"hodnota": "číslo (krátce, např. 1 921, 2×, 766)", "popis": "CO TO JE, max 3 slova"}],
 "popisek": "popisek pod post česky: 1. řádek hook max 10 slov, pak 2–3 krátké řádky s fakty, pak výzva ke sdílení (např. „Pošli to někomu, kdo pamatuje…“ / „Sdílej, jestli…“) a otázka do komentářů. Emoji střídmě.",
 "hashtagy": ["#denikhokeje", "…4–6 relevantních"]
}
Statistik 3–4, jen ověřené.`,
    });
    const d = AI().jsonZTextu(r.text);
    st.data = {
      jmeno: d.jmeno || jmeno, prijmeni: d.prijmeni || jmeno.split(" ").pop(), cislo: String(d.cislo || "").replace(/[^\d]/g, "").slice(0, 2),
      prezdivka: d.prezdivka || "", tym: d.tym || "", headline: d.headline || "", podtitul: d.podtitul || "",
      staty: (d.staty || []).filter((x) => x?.hodnota).slice(0, 4).map((x) => ({ hodnota: String(x.hodnota), popis: String(x.popis || "") })),
      popisek: d.popisek || "", hashtagy: AI().cisteHashtagy ? AI().cisteHashtagy(d.hashtagy || []) : (d.hashtagy || []),
      zdroje: (r.zdroje || []).slice(0, 6),
    };
    if (Array.isArray(d.barvy)) st.barvy = d.barvy.filter((x) => /^#[0-9a-f]{6}$/i.test(x)).concat(st.barvy).slice(0, 2);
    uloz();
    vykresliFormular();
    vykresli();
    zprava(`Hotovo ✓ Zkontroluj čísla (zdroje jsou pod formulářem) a vyber styl.${foto ? "" : " Ještě přidej fotku hráče."}`, "ok");
    if (!foto) najdiFoto(true);
  } catch (e) { zprava(esc(e.message), "chyba"); predvyplnRucne(); }
  finally { b.disabled = false; }
}

function predvyplnRucne() {
  if (!st.data.prijmeni) {
    const casti = st.jmeno.split(/\s+/);
    st.data.jmeno = st.jmeno; st.data.prijmeni = casti.pop() || "";
    st.data.headline = st.data.headline || "LEGENDA *NEUMÍRÁ*";
    if (!st.data.staty.length) st.data.staty = [{ hodnota: "", popis: "" }, { hodnota: "", popis: "" }, { hodnota: "", popis: "" }];
  }
  uloz(); vykresliFormular(); vykresli();
}

// ------------------------------------------------------- fotka a výřez --

async function nastavFoto(blob, kredit = "") {
  st.fotoId = await U().ulozObrazek(blob, { kredit, promo: true });
  st.kredit = kredit; st.vyrezId = null; st.hrac = { zoom: 1, x: 0, y: 0 };
  uloz();
  foto = await U().obrazekImg(st.fotoId);
  vyrez = null;
  vykresliFormular();
  vykresli();
  await vyrizni();
}

async function najdiFoto(tiche = false) {
  const q = st.data.jmeno || st.jmeno || $("#prJmeno").value.trim();
  if (!q) return;
  try {
    const v = await AI().vyberFoto(`${q} ice hockey`);
    if (!v) return;
    const blob = await new Promise((ok) => { const c = document.createElement("canvas"); c.width = v.img.naturalWidth; c.height = v.img.naturalHeight; c.getContext("2d").drawImage(v.img, 0, 0); c.toBlob(ok, "image/jpeg", 0.94); });
    await nastavFoto(blob, AI().kredit(v.foto));
  } catch (e) { if (!tiche) zprava(esc(e.message), "chyba"); }
}

let modelSlib = null;
async function vyrizni() {
  if (!foto) return;
  zprava("✂️ Vyřezávám hráče z pozadí… poprvé se stáhne model (~25 MB), pak to trvá pár sekund.");
  try {
    if (!modelSlib) {
      modelSlib = import(TRANSFORMERS).then(({ pipeline }) => pipeline("background-removal", MODEL_VYREZ, { dtype: "fp32", device: "wasm" }));
      modelSlib.catch(() => { modelSlib = null; });
    }
    const seg = await modelSlib;
    const url = URL.createObjectURL(await U().obrazekBlob(st.fotoId));
    const out = await seg(url);
    URL.revokeObjectURL(url);
    const res = Array.isArray(out) ? out[0] : out;
    const c = document.createElement("canvas");
    c.width = res.width; c.height = res.height;
    const data = new Uint8ClampedArray(res.data.length === res.width * res.height * 4 ? res.data : rgbaZ(res));
    c.getContext("2d").putImageData(new ImageData(data, res.width, res.height), 0, 0);
    const oriz = orizniPruhledne(c);
    vyrez = oriz;
    const blob = await new Promise((ok) => oriz.toBlob(ok, "image/png"));
    st.vyrezId = await U().ulozObrazek(blob, { promoVyrez: true });
    uloz();
    vykresli();
    zprava("Hráč je vyříznutý ✓ Polohu a velikost dolaď posuvníky pod náhledem.", "ok");
  } catch (e) {
    vyrez = null;
    zprava(`Výřez se nepovedl (${esc(e.message)}). Plakát použije celou fotku.`, "varovani");
    vykresli();
  }
}
function rgbaZ(res) {
  const n = res.width * res.height, ch = res.channels, out = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) { out[i * 4] = res.data[i * ch]; out[i * 4 + 1] = res.data[i * ch + 1]; out[i * 4 + 2] = res.data[i * ch + 2]; out[i * 4 + 3] = ch === 4 ? res.data[i * ch + 3] : 255; }
  return out;
}
// Ořízne průhledné okraje, ať se s hráčem dobře pracuje.
function orizniPruhledne(c) {
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

// ------------------------------------------------------------- kreslení --

const hex = (h, a = 1) => { const n = parseInt(String(h).slice(1), 16) || 0; return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };
function jas(h) { const n = parseInt(String(h).slice(1), 16) || 0; return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; }

let zrno = null;
function kresliZrno(ctx, w, h, sila = 0.09) {
  if (!zrno) {
    zrno = document.createElement("canvas"); zrno.width = zrno.height = 256;
    const z = zrno.getContext("2d"), id = z.createImageData(256, 256);
    for (let i = 0; i < id.data.length; i += 4) { const v = Math.random() * 255; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255; }
    z.putImageData(id, 0, 0);
  }
  ctx.save(); ctx.globalAlpha = sila; ctx.globalCompositeOperation = "overlay";
  ctx.fillStyle = ctx.createPattern(zrno, "repeat"); ctx.fillRect(0, 0, w, h); ctx.restore();
}
function vineta(ctx, w, h, sila = 0.6) {
  const g = ctx.createRadialGradient(w / 2, h * 0.45, Math.min(w, h) * 0.3, w / 2, h * 0.5, Math.max(w, h) * 0.75);
  g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, `rgba(0,0,0,${sila})`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
}
function velikostNaSirku(ctx, text, font, max, sirka, min = 30) {
  let v = max;
  for (; v > min; v -= 4) { ctx.font = font(v); if (ctx.measureText(text).width <= sirka) break; }
  return v;
}
// Text s *zvýrazněním* na jednom řádku, zarovnaný na střed.
function radekZvyrazneni(ctx, text, x, y, barva, akcent, zarovnani = "center") {
  const kusy = String(text).split(/(\*[^*]+\*)/).filter(Boolean).map((k) => ({ t: k.replace(/\*/g, ""), a: k.startsWith("*") }));
  const sirka = kusy.reduce((s, k) => s + ctx.measureText(k.t).width, 0);
  let cx = zarovnani === "center" ? x - sirka / 2 : x;
  ctx.textAlign = "left";
  for (const k of kusy) { ctx.fillStyle = k.a ? akcent : barva; ctx.fillText(k.t, cx, y); cx += ctx.measureText(k.t).width; }
}
// Hráč: výřez (nebo celá fotka) – vrátí obdélník, kam se nakreslil.
function polohaHrace(h, vyskaPodil = 0.8, stredX = 0.5) {
  const z = vyrez;
  if (!z) return null;
  const vh = h * vyskaPodil * (st.hrac.zoom || 1);
  const vw = vh * (z.width / z.height);
  const x = W * stredX - vw / 2 + (st.hrac.x || 0) * W * 0.5;
  const y = h - vh + (st.hrac.y || 0) * h * 0.4 + h * 0.02;
  return { x, y, w: vw, h: vh };
}
function silueta(zdroj, barva) {
  const c = document.createElement("canvas"); c.width = zdroj.width; c.height = zdroj.height;
  const x = c.getContext("2d"); x.drawImage(zdroj, 0, 0); x.globalCompositeOperation = "source-in"; x.fillStyle = barva; x.fillRect(0, 0, c.width, c.height);
  return c;
}
function duoton(zdroj, tmava, svetla) {
  const c = document.createElement("canvas"); c.width = zdroj.width; c.height = zdroj.height;
  const x = c.getContext("2d"); x.drawImage(zdroj, 0, 0);
  const id = x.getImageData(0, 0, c.width, c.height), d = id.data;
  const a = parseInt(tmava.slice(1), 16), b = parseInt(svetla.slice(1), 16);
  const A = [(a >> 16) & 255, (a >> 8) & 255, a & 255], B = [(b >> 16) & 255, (b >> 8) & 255, b & 255];
  for (let i = 0; i < d.length; i += 4) {
    let l = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
    l = Math.min(1, Math.max(0, (l - 0.12) * 1.35)); // víc kontrastu
    d[i] = A[0] + (B[0] - A[0]) * l; d[i + 1] = A[1] + (B[1] - A[1]) * l; d[i + 2] = A[2] + (B[2] - A[2]) * l;
  }
  x.putImageData(id, 0, 0);
  return c;
}
function celaFoto(ctx, h, filtr = "") {
  if (!foto) return;
  const iw = foto.naturalWidth, ih = foto.naturalHeight;
  const m = Math.max(W / iw, h / ih) * (st.hrac.zoom || 1);
  const sw = W / m, sh = h / m;
  const sx = Math.min(Math.max(iw / 2 - sw / 2 - (st.hrac.x || 0) * iw * 0.3, 0), iw - sw);
  const sy = Math.min(Math.max(ih * 0.4 - sh / 2 - (st.hrac.y || 0) * ih * 0.3, 0), ih - sh);
  ctx.save(); if (filtr) ctx.filter = filtr;
  ctx.drawImage(foto, sx, sy, sw, sh, 0, 0, W, h); ctx.restore();
}
function kresliLogoPromo(ctx) {
  if (st.logo) G().kresliLogo(ctx, "bila", { x: 56, y: 52, sirka: 150 });
}
function statyRadek(ctx, staty, y, akcent, h) {
  const s = staty.filter((x) => x.hodnota);
  if (!s.length) return;
  const sirka = (W - 120) / s.length;
  s.forEach((x, i) => {
    const cx = 60 + sirka * i + sirka / 2;
    ctx.textAlign = "center";
    ctx.font = `${Math.round(h * 0.062)}px ${PISMO_H}`;
    ctx.fillStyle = akcent;
    ctx.fillText(x.hodnota.toUpperCase(), cx, y);
    ctx.font = `700 ${Math.round(h * 0.019)}px ${PISMO_U}`;
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillText(x.popis.toUpperCase(), cx, y + h * 0.032);
    if (i) { ctx.fillStyle = "rgba(255,255,255,0.2)"; ctx.fillRect(60 + sirka * i - 1, y - h * 0.05, 2, h * 0.075); }
  });
}

// 🔥 Plakát: tmavé pozadí se září týmu, obří příjmení za hráčem, obrys příjmení před ním, číslo, titulek, statistiky
function sablonaPlakat(ctx, h) {
  const [b1, c2] = st.barvy, d = st.data;
  const c1 = jas(b1) < 0.12 ? c2 : b1; // černá týmová barva by nesvítila – záře dostane akcent
  ctx.fillStyle = "#060608"; ctx.fillRect(0, 0, W, h);
  if (!vyrez && foto) { celaFoto(ctx, h, "grayscale(0.35) contrast(1.15) brightness(0.8)"); ctx.fillStyle = hex(c1, 0.25); ctx.fillRect(0, 0, W, h); }
  let g = ctx.createRadialGradient(W * 0.5, h * 0.36, 10, W * 0.5, h * 0.4, h * 0.6);
  g.addColorStop(0, hex(c1, 0.85)); g.addColorStop(0.45, hex(c1, 0.25)); g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, h);
  g = ctx.createRadialGradient(W * 0.1, h * 0.95, 10, W * 0.1, h * 0.95, h * 0.5);
  g.addColorStop(0, hex(c2, 0.35)); g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, h);
  // světelné paprsky
  ctx.save(); ctx.translate(W / 2, h * 0.38); ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < 14; i++) {
    ctx.rotate((Math.PI * 2) / 14);
    const lg = ctx.createLinearGradient(0, 0, h, 0); lg.addColorStop(0, hex(c2, 0.10)); lg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = lg; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(h, -26); ctx.lineTo(h, 26); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
  // číslo
  if (d.cislo) {
    ctx.save(); ctx.font = `${Math.round(h * 0.62)}px ${PISMO_H}`; ctx.textAlign = "center";
    ctx.fillStyle = hex(c1, 0.16); ctx.fillText(d.cislo, W * 0.5, h * 0.66);
    ctx.lineWidth = 4; ctx.strokeStyle = hex(c2, 0.35); ctx.strokeText(d.cislo, W * 0.5, h * 0.66); ctx.restore();
  }
  // příjmení za hráčem
  const prijmeni = (d.prijmeni || "").toUpperCase();
  const yJm = h * 0.43;
  let vJm = 0;
  if (prijmeni) {
    vJm = velikostNaSirku(ctx, prijmeni, (v) => `${v}px ${PISMO_H}`, h * 0.3, W * 0.94);
    ctx.save(); ctx.font = `${vJm}px ${PISMO_H}`; ctx.textAlign = "center";
    const tg = ctx.createLinearGradient(0, yJm - vJm, 0, yJm);
    tg.addColorStop(0, "#ffffff"); tg.addColorStop(1, "#c9c9c9");
    ctx.fillStyle = tg; ctx.shadowColor = "rgba(0,0,0,0.5)"; ctx.shadowBlur = 30;
    ctx.fillText(prijmeni, W / 2, yJm); ctx.restore();
  }
  // hráč
  const r = polohaHrace(h, 0.8);
  if (r) {
    ctx.save(); ctx.shadowColor = hex(c1, 0.95); ctx.shadowBlur = 70; ctx.drawImage(vyrez, r.x, r.y, r.w, r.h); ctx.restore();
    ctx.save(); ctx.shadowColor = hex(c2, 0.6); ctx.shadowBlur = 18; ctx.drawImage(vyrez, r.x, r.y, r.w, r.h); ctx.restore();
    ctx.drawImage(vyrez, r.x, r.y, r.w, r.h);
    // obrys příjmení přes hráče (hloubka)
    if (prijmeni) {
      ctx.save(); ctx.font = `${vJm}px ${PISMO_H}`; ctx.textAlign = "center";
      ctx.lineWidth = 3; ctx.strokeStyle = "rgba(255,255,255,0.75)"; ctx.strokeText(prijmeni, W / 2, yJm); ctx.restore();
    }
  }
  // spodní tma + texty
  g = ctx.createLinearGradient(0, h * 0.55, 0, h);
  g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(0.55, "rgba(0,0,0,0.75)"); g.addColorStop(1, "rgba(0,0,0,0.95)");
  ctx.fillStyle = g; ctx.fillRect(0, h * 0.55, W, h * 0.45);
  const maStaty = d.staty.some((x) => x.hodnota);
  const yHead = maStaty ? h * 0.8 : h * 0.88;
  if (d.headline) {
    const t = d.headline.toUpperCase();
    const v = velikostNaSirku(ctx, t.replace(/\*/g, ""), (x) => `${x}px ${PISMO_H}`, h * 0.085, W - 110);
    ctx.font = `${v}px ${PISMO_H}`; ctx.shadowColor = "rgba(0,0,0,0.7)"; ctx.shadowBlur = 20;
    radekZvyrazneni(ctx, t, W / 2, yHead, "#ffffff", c2); ctx.shadowBlur = 0;
  }
  if (d.podtitul) {
    ctx.font = `italic 800 ${Math.round(h * 0.024)}px ${PISMO_T}`; ctx.textAlign = "center"; ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.fillText(d.podtitul, W / 2, yHead - h * 0.075, W - 120);
  }
  if (maStaty) statyRadek(ctx, d.staty, h * 0.905, c2, h);
  if (d.prezdivka) stitek(ctx, d.prezdivka, W - 56, 60, c2, h);
  kresliLogoPromo(ctx);
  vineta(ctx, W, h, 0.45);
  kresliZrno(ctx, W, h, 0.1);
}

function stitek(ctx, text, xPravy, y, barva, h) {
  ctx.save();
  ctx.font = `700 ${Math.round(h * 0.02)}px ${PISMO_U}`;
  const t = text.toUpperCase(), sw = ctx.measureText(t).width + 36, sh = h * 0.036;
  ctx.fillStyle = barva; ctx.beginPath(); ctx.roundRect(xPravy - sw, y, sw, sh, sh / 2); ctx.fill();
  ctx.fillStyle = jas(barva) > 0.6 ? "#111" : "#fff"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(t, xPravy - sw / 2, y + sh / 2 + 1);
  ctx.restore();
}

// 💥 Sticker: barevné pozadí s rastrem, obří titulek, hráč v duotónu s bílým obrysem
function sablonaSticker(ctx, h) {
  const [c1, c2] = st.barvy, d = st.data;
  ctx.fillStyle = c1; ctx.fillRect(0, 0, W, h);
  // rastr
  ctx.save(); ctx.fillStyle = hex(jas(c1) > 0.5 ? "#000000" : "#ffffff", 0.12);
  for (let y = 0; y < h; y += 22) for (let x = (y / 22) % 2 ? 11 : 0; x < W; x += 22) { const r = 2 + 5 * (y / h); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
  // diagonální pruh
  ctx.save(); ctx.translate(W / 2, h * 0.27); ctx.rotate(-0.12); ctx.fillStyle = "#0b0b0b"; ctx.fillRect(-W, -h * 0.16, W * 2, h * 0.32); ctx.restore();
  // obří titulek na pozadí – 2 řádky
  const slova = (d.headline || d.prijmeni || "").replace(/\*/g, "").toUpperCase().split(/\s+/).filter(Boolean);
  const radky = slova.length > 2 ? [slova.slice(0, Math.ceil(slova.length / 2)).join(" "), slova.slice(Math.ceil(slova.length / 2)).join(" ")] : [slova.join(" ")];
  ctx.save(); ctx.translate(W / 2, h * 0.26); ctx.rotate(-0.12); ctx.textAlign = "center";
  const v = Math.min(...radky.map((r) => velikostNaSirku(ctx, r, (x) => `${x}px ${PISMO_H}`, h * 0.17, W * 0.98)));
  ctx.font = `${v}px ${PISMO_H}`;
  radky.forEach((r, i) => { ctx.fillStyle = i % 2 ? "#ffffff" : c2; ctx.fillText(r, 0, (i - (radky.length - 1) / 2) * v * 0.98 + v * 0.36); });
  ctx.restore();
  // hráč
  const r = polohaHrace(h, 0.74, 0.56);
  if (r) {
    const duo = duoton(vyrez, "#0a0a0a", "#ffffff");
    const obrys = silueta(vyrez, "#ffffff");
    const tl = Math.max(8, r.w * 0.018), m = r.w / vyrez.width;
    ctx.save(); ctx.shadowColor = "rgba(0,0,0,0.45)"; ctx.shadowBlur = 40; ctx.shadowOffsetY = 16;
    for (let a = 0; a < 16; a++) { const u = (a / 16) * Math.PI * 2; ctx.drawImage(obrys, r.x + Math.cos(u) * tl, r.y + Math.sin(u) * tl, r.w, r.h); if (a === 0) { ctx.shadowColor = "transparent"; } }
    ctx.restore();
    ctx.drawImage(duo, r.x, r.y, r.w, r.h);
    void m;
  } else if (foto) {
    ctx.save(); ctx.globalAlpha = 0.9; ctx.beginPath(); ctx.rect(80, h * 0.12, W - 160, h * 0.62); ctx.clip(); celaFoto(ctx, h, "grayscale(1) contrast(1.3)"); ctx.restore();
  }
  // jmenovka dole
  const jm = (d.jmeno || d.prijmeni || "").toUpperCase();
  const yBar = h * 0.86;
  ctx.fillStyle = "#0b0b0b"; ctx.fillRect(0, yBar, W, h * 0.14);
  ctx.fillStyle = c2; ctx.fillRect(0, yBar, W, 10);
  if (jm) {
    const vj = velikostNaSirku(ctx, jm, (x) => `${x}px ${PISMO_H}`, h * 0.065, W - 260);
    ctx.font = `${vj}px ${PISMO_H}`; ctx.textAlign = "left"; ctx.fillStyle = "#ffffff"; ctx.fillText(jm, 56, yBar + h * 0.088);
  }
  if (d.cislo) { ctx.font = `${Math.round(h * 0.09)}px ${PISMO_H}`; ctx.textAlign = "right"; ctx.fillStyle = c2; ctx.fillText(`#${d.cislo}`, W - 50, yBar + h * 0.1); }
  if (d.podtitul) {
    ctx.font = `italic 800 ${Math.round(h * 0.022)}px ${PISMO_T}`; ctx.textAlign = "left";
    const sw = Math.min(W - 112, ctx.measureText(d.podtitul).width + 40);
    ctx.fillStyle = "#ffffff"; ctx.fillRect(56, yBar - h * 0.058, sw, h * 0.042);
    ctx.fillStyle = "#0b0b0b"; ctx.fillText(d.podtitul, 76, yBar - h * 0.03, sw - 40);
  }
  kresliLogoPromo(ctx);
  kresliZrno(ctx, W, h, 0.08);
}

// 📊 Statistiky: hráč vpravo, vlevo jméno a velká čísla kariéry
function sablonaStaty(ctx, h) {
  const [c1, c2] = st.barvy, d = st.data;
  ctx.fillStyle = "#08080b"; ctx.fillRect(0, 0, W, h);
  // diagonální panel v barvě týmu
  ctx.save(); ctx.beginPath(); ctx.moveTo(W * 0.42, 0); ctx.lineTo(W, 0); ctx.lineTo(W, h); ctx.lineTo(W * 0.24, h); ctx.closePath();
  const g = ctx.createLinearGradient(W * 0.3, 0, W, h); g.addColorStop(0, hex(c1, 0.95)); g.addColorStop(1, hex(c1, 0.35));
  ctx.fillStyle = g; ctx.fill(); ctx.clip();
  ctx.strokeStyle = "rgba(255,255,255,0.07)"; ctx.lineWidth = 2;
  for (let x = -h; x < W; x += 36) { ctx.beginPath(); ctx.moveTo(x, h); ctx.lineTo(x + h * 0.6, 0); ctx.stroke(); }
  ctx.restore();
  if (d.cislo) { ctx.save(); ctx.font = `${Math.round(h * 0.5)}px ${PISMO_H}`; ctx.textAlign = "right"; ctx.fillStyle = "rgba(255,255,255,0.10)"; ctx.fillText(d.cislo, W - 30, h * 0.5); ctx.restore(); }
  const r = polohaHrace(h, 0.86, 0.68);
  if (r) {
    ctx.save(); ctx.shadowColor = "rgba(0,0,0,0.6)"; ctx.shadowBlur = 50; ctx.shadowOffsetX = -20; ctx.drawImage(vyrez, r.x, r.y, r.w, r.h); ctx.restore();
    ctx.save(); ctx.shadowColor = hex(c2, 0.6); ctx.shadowBlur = 16; ctx.drawImage(vyrez, r.x, r.y, r.w, r.h); ctx.restore();
  } else if (foto) {
    ctx.save(); ctx.beginPath(); ctx.moveTo(W * 0.42, 0); ctx.lineTo(W, 0); ctx.lineTo(W, h); ctx.lineTo(W * 0.24, h); ctx.closePath(); ctx.clip();
    ctx.globalAlpha = 0.85; celaFoto(ctx, h, "contrast(1.1)"); ctx.restore();
  }
  // levý sloupec
  const x0 = 60;
  let y = h * 0.16;
  ctx.textAlign = "left";
  if (d.prezdivka) { ctx.font = `700 ${Math.round(h * 0.022)}px ${PISMO_U}`; ctx.fillStyle = c2; ctx.fillText(d.prezdivka.toUpperCase(), x0, y); y += h * 0.012; }
  const jmeno = (d.jmeno || "").toUpperCase().split(/\s+/);
  const prij = jmeno.pop() || "", krest = jmeno.join(" ");
  if (krest) { ctx.font = `${Math.round(h * 0.045)}px ${PISMO_H}`; ctx.fillStyle = "#ffffff"; y += h * 0.05; ctx.fillText(krest, x0, y); }
  if (prij) { const v = velikostNaSirku(ctx, prij, (x) => `${x}px ${PISMO_H}`, h * 0.1, W * 0.5); ctx.font = `${v}px ${PISMO_H}`; y += v * 0.95; ctx.fillStyle = "#ffffff"; ctx.fillText(prij, x0, y); }
  ctx.fillStyle = c2; ctx.fillRect(x0, y + h * 0.02, 90, 8);
  y += h * 0.09;
  for (const s of d.staty.filter((q) => q.hodnota).slice(0, 4)) {
    ctx.font = `${Math.round(h * 0.075)}px ${PISMO_H}`; ctx.fillStyle = c2;
    ctx.shadowColor = "rgba(0,0,0,0.5)"; ctx.shadowBlur = 16;
    ctx.fillText(s.hodnota.toUpperCase(), x0, y + h * 0.05); ctx.shadowBlur = 0;
    ctx.font = `700 ${Math.round(h * 0.021)}px ${PISMO_U}`; ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.fillText(s.popis.toUpperCase(), x0, y + h * 0.083, W * 0.42);
    y += h * 0.13;
  }
  // titulek dole přes celou šířku
  const gg = ctx.createLinearGradient(0, h * 0.8, 0, h); gg.addColorStop(0, "rgba(0,0,0,0)"); gg.addColorStop(1, "rgba(0,0,0,0.85)");
  ctx.fillStyle = gg; ctx.fillRect(0, h * 0.8, W, h * 0.2);
  if (d.headline) {
    const t = d.headline.toUpperCase();
    const v = velikostNaSirku(ctx, t.replace(/\*/g, ""), (x) => `${x}px ${PISMO_H}`, h * 0.07, W - 120);
    ctx.font = `${v}px ${PISMO_H}`; radekZvyrazneni(ctx, t, x0, h * 0.95, "#ffffff", c2, "left");
  }
  kresliLogoPromo(ctx);
  vineta(ctx, W, h, 0.35);
  kresliZrno(ctx, W, h, 0.08);
}

function kresliDo(c, sablona = st.sablona) {
  const h = vyska();
  c.width = W; c.height = h;
  const ctx = c.getContext("2d");
  ctx.textBaseline = "alphabetic";
  ({ plakat: sablonaPlakat, sticker: sablonaSticker, staty: sablonaStaty }[sablona] || sablonaPlakat)(ctx, h);
}

let kresliCekani = null;
function vykresli() {
  cancelAnimationFrame(kresliCekani);
  kresliCekani = requestAnimationFrame(() => {
    const c = $("#prPlatno");
    if (!c) return;
    kresliDo(c);
    $$("[data-pr-nahled]").forEach((m) => {
      const t = document.createElement("canvas");
      kresliDo(t, m.dataset.prNahled);
      m.width = 216; m.height = Math.round(216 * (t.height / t.width));
      m.getContext("2d").drawImage(t, 0, 0, m.width, m.height);
    });
  });
}

// ------------------------------------------------------------------ UI --

function zprava(t, druh = "") {
  const el = $("#prZprava");
  if (!el) return;
  el.innerHTML = t; el.className = `zprava ${druh}`; el.hidden = !t;
}

function vykresliFormular() {
  const d = st.data;
  const el = $("#prFormular");
  if (!el) return;
  el.innerHTML = `
    <div class="filtry tri">
      <label>Velké příjmení<input data-pr="prijmeni" value="${esc(d.prijmeni)}"></label>
      <label>Celé jméno<input data-pr="jmeno" value="${esc(d.jmeno)}"></label>
      <label>Číslo dresu<input data-pr="cislo" value="${esc(d.cislo)}" inputmode="numeric" maxlength="2"></label>
      <label>Titulek (*slovo* = barva)<input data-pr="headline" value="${esc(d.headline)}"></label>
      <label>Podtitul<input data-pr="podtitul" value="${esc(d.podtitul)}"></label>
      <label>Přezdívka / štítek<input data-pr="prezdivka" value="${esc(d.prezdivka)}"></label>
    </div>
    <h3 class="pr-h3">Čísla <span class="muted">(zkontroluj je – zobrazí se na grafice)</span></h3>
    <div class="pr-staty">${[0, 1, 2, 3].map((i) => `<div class="pr-stat"><input data-pr-stat="${i}" data-k="hodnota" value="${esc(d.staty[i]?.hodnota || "")}" placeholder="např. 766"><input data-pr-stat="${i}" data-k="popis" value="${esc(d.staty[i]?.popis || "")}" placeholder="GÓLŮ V NHL"></div>`).join("")}</div>
    ${d.zdroje?.length ? `<p class="muted" style="font-size:12.5px;margin:10px 0 0">Zdroje: ${d.zdroje.map((z) => `<a href="${esc(z.uri)}" target="_blank" rel="noopener">${esc(z.titulek || z.uri)}</a>`).join(" · ")}</p>` : ""}
    ${st.kredit ? `<p class="muted" style="font-size:12.5px;margin:6px 0 0">${esc(st.kredit)} – autor fotky se přidá do popisku.</p>` : ""}`;
  $("#prPopisek").value = popisekSKreditem();
  $("#prBarva1").value = st.barvy[0]; $("#prBarva2").value = st.barvy[1];
  $("#prUhel").value = st.uhel; $("#prFormat").value = st.format; $("#prLogo").checked = st.logo;
  $("#prZoom").value = st.hrac.zoom; $("#prX").value = st.hrac.x; $("#prY").value = st.hrac.y;
  $$("[data-pr-sablona]").forEach((b) => b.classList.toggle("on", b.dataset.prSablona === st.sablona));
}

function popisekSKreditem() {
  const d = st.data;
  return [d.popisek, (d.hashtagy || []).join(" "), st.kredit].filter(Boolean).join("\n\n");
}

async function exportuj() {
  const c = document.createElement("canvas");
  kresliDo(c);
  const blob = await new Promise((ok) => c.toBlob(ok, "image/png"));
  G().stahniBlob(blob, `promo-${G().slug(st.data.prijmeni || st.jmeno || "hrac")}-${st.sablona}.png`);
  toast("Grafika stažená ✓");
}

function init() {
  const el = $("#promoObsah");
  if (!el) return;
  el.innerHTML = `
  <div class="pr-mrizka">
    <div>
      <div class="card">
        <h2>🔥 Promo hráče</h2>
        <p class="muted" style="margin-top:0">Napiš jméno – AI dohledá na webu čísla a vymyslí úderné texty, hráče vyřízneme ze skutečné fotky a poskládáme grafiku, kterou lidi sdílí.</p>
        <div class="filtry">
          <label>Jméno hráče<input id="prJmeno" value="${esc(st.jmeno)}" placeholder="např. Jaromír Jágr" autocomplete="off"></label>
          <label>Úhel<select id="prUhel">${Object.entries(UHLY).map(([k, n]) => `<option value="${k}">${n}</option>`).join("")}</select></label>
        </div>
        <div class="akce">
          <button type="button" class="btn" id="prNavrhni">🔥 Vytvořit promo</button>
          <button type="button" class="btn ghost" id="prNajdiFoto">🔍 Najít fotku</button>
          <label class="btn ghost">📷 Nahrát fotku<input type="file" id="prSoubor" accept="image/*"></label>
        </div>
        <div class="zprava" id="prZprava" hidden></div>
        <p class="muted" style="font-size:12.5px;margin:10px 0 0">Používá jen skutečné fotky (z Wikimedia Commons s autorem, nebo tvoje vlastní) – tvář se nijak negeneruje ani neupravuje. Výřez hráče běží zdarma přímo v prohlížeči.</p>
      </div>
      <div class="card">
        <h2>Texty a čísla</h2>
        <div id="prFormular"></div>
      </div>
      <div class="card">
        <h2>Popisek pod post</h2>
        <textarea id="prPopisek" rows="7"></textarea>
        <div class="akce">
          <button type="button" class="btn ghost" id="prKopiruj">📋 Zkopírovat popisek</button>
          <button type="button" class="btn ghost" id="prPlan">📅 Do plánu</button>
        </div>
      </div>
    </div>
    <div>
      <div class="card pr-nahled-karta">
        <div class="pr-sablony">${Object.entries(SABLONY).map(([k, s]) => `<button type="button" class="pr-sablona" data-pr-sablona="${k}"><canvas data-pr-nahled="${k}" width="216" height="270"></canvas><b>${s.nazev}</b><small>${s.popis}</small></button>`).join("")}</div>
        <canvas id="prPlatno" class="pr-platno" width="1080" height="1350"></canvas>
        <div class="filtry tri" style="margin-top:12px">
          <label>Formát<select id="prFormat">${Object.entries(FORMATY).map(([k, f]) => `<option value="${k}">${f.nazev}</option>`).join("")}</select></label>
          <label>Barva týmu<input type="color" id="prBarva1"></label>
          <label>Akcent<input type="color" id="prBarva2"></label>
          <label>Velikost hráče<input type="range" id="prZoom" min="0.6" max="1.5" step="0.01"></label>
          <label>Hráč vodorovně<input type="range" id="prX" min="-1" max="1" step="0.01"></label>
          <label>Hráč svisle<input type="range" id="prY" min="-1" max="1" step="0.01"></label>
          <label class="check"><input type="checkbox" id="prLogo"> Logo Deníku hokeje</label>
        </div>
        <div class="akce">
          <button type="button" class="btn" id="prStahnout">⬇️ Stáhnout PNG</button>
          <button type="button" class="btn ghost" id="prVyrizni">✂️ Vyříznout znovu</button>
          <button type="button" class="btn ghost" id="prNovy">↺ Nový hráč</button>
        </div>
      </div>
    </div>
  </div>`;

  $("#prNavrhni").addEventListener("click", navrhni);
  $("#prJmeno").addEventListener("keydown", (e) => { if (e.key === "Enter") navrhni(); });
  $("#prUhel").addEventListener("change", (e) => { st.uhel = e.target.value; uloz(); });
  $("#prNajdiFoto").addEventListener("click", () => najdiFoto(false));
  $("#prSoubor").addEventListener("change", async (e) => { const f = e.target.files[0]; e.target.value = ""; if (f) await nastavFoto(f, ""); });
  $("#prVyrizni").addEventListener("click", vyrizni);
  $("#prStahnout").addEventListener("click", exportuj);
  $("#prNovy").addEventListener("click", () => { if (!confirm("Začít s novým hráčem? Současná grafika se smaže.")) return; st = prazdna(); foto = null; vyrez = null; uloz(); $("#prJmeno").value = ""; vykresliFormular(); vykresli(); zprava(""); });
  $("#prKopiruj").addEventListener("click", async () => { try { await navigator.clipboard.writeText($("#prPopisek").value); toast("Popisek zkopírován ✓"); } catch { $("#prPopisek").select(); } });
  $("#prPlan").addEventListener("click", () => {
    window.DHPlan?.pridej({ nazev: `Promo: ${st.data.jmeno || st.jmeno}`, format: "post", zadani: $("#prPopisek").value });
    toast("Přidáno do plánu ✓");
  });
  $("#prPopisek").addEventListener("input", (e) => { st.data.popisek = e.target.value; uloz(); });
  for (const [id, f] of [["#prBarva1", (v) => { st.barvy[0] = v; }], ["#prBarva2", (v) => { st.barvy[1] = v; }], ["#prFormat", (v) => { st.format = v; }],
    ["#prZoom", (v) => { st.hrac.zoom = +v; }], ["#prX", (v) => { st.hrac.x = +v; }], ["#prY", (v) => { st.hrac.y = +v; }]]) {
    $(id).addEventListener("input", (e) => { f(e.target.value); uloz(); vykresli(); });
  }
  $("#prLogo").addEventListener("change", (e) => { st.logo = e.target.checked; uloz(); vykresli(); });
  el.addEventListener("click", (e) => {
    const s = e.target.closest("[data-pr-sablona]");
    if (s) { st.sablona = s.dataset.prSablona; uloz(); $$("[data-pr-sablona]").forEach((b) => b.classList.toggle("on", b === s)); vykresli(); }
  });
  el.addEventListener("input", (e) => {
    const t = e.target;
    if (t.dataset.pr) { st.data[t.dataset.pr] = t.value; uloz(); vykresli(); }
    if (t.dataset.prStat !== undefined) {
      const i = +t.dataset.prStat;
      while (st.data.staty.length <= i) st.data.staty.push({ hodnota: "", popis: "" });
      st.data.staty[i][t.dataset.k] = t.value; uloz(); vykresli();
    }
  });
  vykresliFormular();
  // obnovit fotku a výřez z minula
  (async () => {
    try {
      if (st.fotoId) foto = await U().obrazekImg(st.fotoId);
      if (st.vyrezId) { const img = await U().obrazekImg(st.vyrezId); const c = document.createElement("canvas"); c.width = img.naturalWidth; c.height = img.naturalHeight; c.getContext("2d").drawImage(img, 0, 0); vyrez = c; }
    } catch { /* nic */ }
    if (document.fonts?.ready) await document.fonts.ready;
    vykresli();
  })();
  document.addEventListener("dh:zalozka", (e) => { if (e.detail === "promo") vykresli(); });
}

window.DHPromo = { get stav() { return st; }, vykresli, nastavFoto, kresliDo };
init();
})();
