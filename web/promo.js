// Promo hráče – čistá „tribute“ grafika na sdílení: oblíbený (i historický) hokejista, skutečná fotka,
// jméno, tým a roky, jedna věta. Žádné statistiky, žádné efekty navíc. Texty se skládají pod sebe
// podle změřené výšky, takže se nikdy nepřekrývají.
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
const W = 1080;
const FORMATY = { "4x5": { nazev: "Post 4:5", h: 1350 }, "1x1": { nazev: "Čtverec 1:1", h: 1080 }, "9x16": { nazev: "Story 9:16", h: 1920 } };
const SABLONY = {
  ikona: { nazev: "Ikona", popis: "hráč před obřím jménem, barvy týmu" },
  plakat: { nazev: "Plakát", popis: "duotón v rámu, jméno dole" },
  vertikal: { nazev: "Vertikál", popis: "fotka + svislé jméno v barvě týmu" },
  karta: { nazev: "Karta", popis: "sběratelská kartička" },
};
const P_JMENO = '"Anton", "Oswald", Impact, sans-serif';
const P_TEXT = '"Inter", "Helvetica Neue", Arial, sans-serif';
const P_UZKE = '"Roboto Condensed", "Oswald", Arial, sans-serif';

const prazdna = () => ({
  verze: 2, jmeno: "", sablona: "ikona", format: "4x5", logo: true, cb: false, barva: "#c8102e", barva2: "#ffffff", vyrezZap: true,
  data: { krestni: "", prijmeni: "", nahore: "", roky: "", veta: "", popisek: "", hashtagy: [], zdroje: [] },
  fotoId: null, vyrezId: null, kredit: "", foto: { zoom: 1, x: 0, y: 0 },
});
let st = prazdna();
try {
  const ulozeny = JSON.parse(localStorage.getItem(KLIC) || "{}");
  // starší verze (s čísly a výřezem) – zachovat jen jméno a fotku
  if (ulozeny.sablona && !["ikona", "plakat", "vertikal", "karta"].includes(ulozeny.sablona)) ulozeny.sablona = "ikona";
  st = ulozeny.verze === 2 ? { ...prazdna(), ...ulozeny } : { ...prazdna(), jmeno: ulozeny.jmeno || "", fotoId: ulozeny.fotoId || null, kredit: ulozeny.kredit || "" };
} catch { /* nic */ }
const uloz = () => { try { localStorage.setItem(KLIC, JSON.stringify(st)); } catch { /* nic */ } };

let foto = null;  // HTMLImageElement
let vyrez = null; // canvas – hráč bez pozadí
const vyska = () => FORMATY[st.format]?.h || 1350;

// ------------------------------------------------------------------ AI --

async function navrhni() {
  const jmeno = $("#prJmeno").value.trim();
  if (!jmeno) { zprava("Napiš jméno hráče.", "chyba"); return; }
  st.jmeno = jmeno; uloz();
  if (!AI()?.maKlic()) { predvyplnRucne(jmeno); zprava("Bez AI klíče doplň tým, roky a větu ručně níž (AI klíč: Můj styl → AI pomocník).", "varovani"); if (!foto) najdiFoto(true, jmeno); return; }
  const b = $("#prNavrhni"); b.disabled = true;
  zprava("AI hledá na webu, za jaký tým a v jakých letech hrál… (15–40 s)");
  try {
    const r = await AI().hledatNaWebu({
      casovyLimit: 60000,
      system: `Jsi editor českého hokejového Instagramu „Deník hokeje“. Děláš jednoduché, stylové „tribute“ grafiky oblíbených hokejistů (i historických),
které fanoušci sdílí, protože toho hráče mají rádi. Fakta (tým, roky) ber JEN z výsledků hledání; když si nejsi jistý, nech pole prázdné. Žádné statistiky.`,
      zadani: `Hráč: ${jmeno}

Vrať POUZE JSON:
{
 "krestni": "křestní jméno s diakritikou",
 "prijmeni": "příjmení",
 "tym": "tým, se kterým je nejvíc spojený (oficiální název)",
 "roky": "roky jeho kariéry v NHL (nebo celé kariéry), formát 1989–2011; jinak prázdné",
 "barva": "#hex hlavní barva toho týmu (tmavší, ať je čitelná)",
 "barva2": "#hex druhá (akcentní) barva toho týmu",
 "veta": "JEDNA krátká věta česky (max 9 slov), proč ho lidi milovali – jeho styl, charakter nebo ikonický moment. Bez čísel, bez klišé typu ‚legenda neumírá‘. Např. ‚Elegance, kterou si Dallas pamatuje dodnes.‘",
 "popisek": "popisek pod post česky: 1. řádek krátký nostalgický háček, pak 1–2 krátké řádky o něm (bez čísel), pak ‚Pošli to někomu, kdo ho taky miloval 🫡‘ a otázka do komentářů (např. jaký moment s ním si pamatují). Emoji střídmě.",
 "hashtagy": ["#denikhokeje", "…3–4 další relevantní"],
 "foto_dotaz": "anglický dotaz na Wikimedia Commons pro jeho fotku (celé jméno + tým), bez diakritiky"
}`,
    });
    const d = AI().jsonZTextu(r.text);
    const krestni = d.krestni || jmeno.split(/\s+/).slice(0, -1).join(" ");
    const prijmeni = d.prijmeni || jmeno.split(/\s+/).pop();
    st.data = {
      krestni, prijmeni,
      nahore: d.tym ? String(d.tym).toUpperCase() : "",
      roky: d.roky || "",
      veta: d.veta || "",
      popisek: d.popisek || "",
      hashtagy: AI().cisteHashtagy ? AI().cisteHashtagy(d.hashtagy || []) : (d.hashtagy || []),
      zdroje: (r.zdroje || []).slice(0, 6),
    };
    if (/^#[0-9a-f]{6}$/i.test(d.barva || "")) st.barva = d.barva;
    if (/^#[0-9a-f]{6}$/i.test(d.barva2 || "")) st.barva2 = d.barva2;
    uloz();
    vykresliFormular();
    vykresli();
    zprava(`Hotovo ✓ Zkontroluj tým a roky (zdroje jsou pod texty).${foto ? "" : " Teď vyber fotku."}`, "ok");
    if (!foto) najdiFoto(true, d.foto_dotaz || `${krestni} ${prijmeni}`);
  } catch (e) { zprava(esc(e.message), "chyba"); predvyplnRucne(jmeno); }
  finally { b.disabled = false; }
}

function predvyplnRucne(jmeno) {
  const casti = jmeno.split(/\s+/);
  if (!st.data.prijmeni) { st.data.prijmeni = casti.pop() || ""; st.data.krestni = casti.join(" "); }
  uloz(); vykresliFormular(); vykresli();
}

// ---------------------------------------------------------------- fotka --

async function nastavFoto(blob, kredit = "") {
  st.fotoId = await U().ulozObrazek(blob, { kredit, promo: true });
  st.kredit = kredit; st.foto = { zoom: 1, x: 0, y: 0 }; st.vyrezId = null;
  uloz();
  foto = await U().obrazekImg(st.fotoId);
  vyrez = null;
  vykresliFormular();
  vykresli();
  await vyrizni();
}

async function vyrizni() {
  if (!foto || !window.DHVyrez) return;
  zprava("✂️ Vyřezávám hráče z fotky… (poprvé se stáhne model ~25 MB, pak pár sekund)");
  try {
    vyrez = await window.DHVyrez.vyrizni(await U().obrazekBlob(st.fotoId));
    const blob = await new Promise((ok) => vyrez.toBlob(ok, "image/png"));
    st.vyrezId = await U().ulozObrazek(blob, { promoVyrez: true });
    uloz();
    zprava("Hotovo ✓ Hráč je vyříznutý. Táhnutím v náhledu ho posuneš, posuvníkem zvětšíš.", "ok");
  } catch (e) {
    vyrez = null;
    zprava(`Hráče se nepodařilo vyříznout (${esc(e.message)}) – šablony použijí celou fotku.`, "varovani");
  }
  vykresli();
}

async function najdiFoto(tiche = false, dotaz = "") {
  const q = dotaz || [st.data.krestni, st.data.prijmeni].filter(Boolean).join(" ") || st.jmeno || $("#prJmeno").value.trim();
  if (!q) return;
  try {
    const v = await AI().vyberFoto(/hockey/i.test(q) ? q : `${q} ice hockey`);
    if (!v) return;
    const blob = await new Promise((ok) => { const c = document.createElement("canvas"); c.width = v.img.naturalWidth; c.height = v.img.naturalHeight; c.getContext("2d").drawImage(v.img, 0, 0); c.toBlob(ok, "image/jpeg", 0.94); });
    await nastavFoto(blob, AI().kredit(v.foto));
  } catch (e) { if (!tiche) zprava(esc(e.message), "chyba"); }
}

// ------------------------------------------------------------- kreslení --

const hex = (h, a = 1) => { const n = parseInt(String(h).slice(1), 16) || 0; return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };
function jas(h) { const n = parseInt(String(h).slice(1), 16) || 0; return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; }
// akcent čitelný na tmavém pozadí (příliš tmavou týmovou barvu zesvětlí)
const akcent = () => (jas(st.barva) < 0.25 ? "#ffffff" : st.barva);

// animace pro MP4: anim = čas v s, jinak null
let anim = null;
const ease = (x) => 1 - Math.pow(1 - x, 3);
const vidim = (od, trvani = 0.6) => (anim == null ? 1 : ease(Math.max(0, Math.min(1, (anim - od) / trvani))));

let zrno = null;
function kresliZrno(ctx, w, h, sila) {
  if (!zrno) {
    zrno = document.createElement("canvas"); zrno.width = zrno.height = 256;
    const z = zrno.getContext("2d"), id = z.createImageData(256, 256);
    for (let i = 0; i < id.data.length; i += 4) { const v = Math.random() * 255; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255; }
    z.putImageData(id, 0, 0);
  }
  ctx.save(); ctx.globalAlpha = sila; ctx.globalCompositeOperation = "overlay";
  ctx.fillStyle = ctx.createPattern(zrno, "repeat"); ctx.fillRect(0, 0, w, h); ctx.restore();
}

// Fotka do obdélníku (cover) s posunem a přiblížením; ve videu pomalý nájezd kamery.
function kresliFoto(ctx, x, y, w, h, cb = false) {
  if (!foto) {
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, "#2a2a2e"); g.addColorStop(1, "#0b0b0d");
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = "rgba(255,255,255,0.35)"; ctx.font = `600 ${Math.round(w * 0.035)}px ${P_TEXT}`; ctx.textAlign = "center";
    ctx.fillText("sem přijde fotka hráče", x + w / 2, y + h * 0.42);
    return;
  }
  const iw = foto.naturalWidth, ih = foto.naturalHeight;
  const kamera = anim == null ? 1 : 1 + 0.07 * Math.min(1, anim / DELKA_ANIM);
  const m = Math.max(w / iw, h / ih) * (st.foto.zoom || 1) * kamera;
  const sw = w / m, sh = h / m;
  const fx = Math.min(1, Math.max(0, 0.5 + (st.foto.x || 0) / 2));
  const fy = Math.min(1, Math.max(0, 0.3 + (st.foto.y || 0) * 0.7));
  const sx = (iw - sw) * fx, sy = (ih - sh) * fy;
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.filter = cb ? "grayscale(1) contrast(1.12) brightness(0.96)" : "contrast(1.05) saturate(1.04)";
  ctx.drawImage(foto, Math.max(0, sx), Math.max(0, sy), Math.min(sw, iw), Math.min(sh, ih), x, y, w, h);
  ctx.filter = "none";
  if (cb) { ctx.fillStyle = "rgba(255,226,190,0.06)"; ctx.fillRect(x, y, w, h); }
  ctx.restore();
}

// zalomení textu do řádků (max šířka)
function zalom(ctx, text, max) {
  const out = []; let r = "";
  for (const w of String(text || "").split(/\s+/).filter(Boolean)) {
    const z = r ? `${r} ${w}` : w;
    if (r && ctx.measureText(z).width > max) { out.push(r); r = w; } else r = z;
  }
  if (r) out.push(r);
  return out;
}
// velikost písma, aby text (1 řádek) nepřesáhl šířku
function vejdeSe(ctx, text, font, max, sirka, min = 40) {
  let v = max;
  for (; v > min; v -= 2) { ctx.font = font(v); if (ctx.measureText(text).width <= sirka) break; }
  return v;
}
// text s mezerami mezi písmeny (Canvas letterSpacing)
function rozprostreny(ctx, text, x, y, mezery) {
  ctx.letterSpacing = `${mezery}px`;
  ctx.fillText(text, x, y);
  ctx.letterSpacing = "0px";
}
function logo(ctx, rezim, poloha) { if (st.logo) G().kresliLogo(ctx, rezim, poloha); }
const kickerText = () => [st.data.nahore, st.data.roky].filter(Boolean).join("  ·  ");

// pomocné barvy
function mix(h1, h2, t) {
  const a = parseInt(h1.slice(1), 16), b = parseInt(h2.slice(1), 16);
  const k = (x, y) => Math.round(x + (y - x) * t);
  const r = k((a >> 16) & 255, (b >> 16) & 255), g = k((a >> 8) & 255, (b >> 8) & 255), bl = k(a & 255, b & 255);
  return `#${((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1)}`;
}
const tmavsi = (h, t) => mix(h, "#000000", t);
const svetlejsi = (h, t) => mix(h, "#ffffff", t);
const maVyrez = () => !!(vyrez && st.vyrezZap !== false);

// Hráč (výřez) – velikost a poloha z posuvníků / tažení; ve videu jemný nájezd.
function polohaVyrezu(h, vyskaPodil, stredX = 0.5, spodek = 0) {
  const kamera = anim == null ? 1 : 1 + 0.05 * Math.min(1, anim / DELKA_ANIM);
  let vh = h * vyskaPodil * (st.foto.zoom || 1) * kamera;
  let vw = vh * (vyrez.width / vyrez.height);
  if (vw > W * 1.1) { vw = W * 1.1; vh = vw * (vyrez.height / vyrez.width); }
  const x = W * stredX - vw / 2 + (st.foto.x || 0) * W * 0.35;
  const y = h - vh - spodek + (st.foto.y || 0) * h * 0.25;
  return { x, y, w: vw, h: vh };
}
function duoton(zdroj, tmava, svetla) {
  const c = document.createElement("canvas"); c.width = zdroj.width; c.height = zdroj.height;
  const x = c.getContext("2d"); x.drawImage(zdroj, 0, 0);
  const id = x.getImageData(0, 0, c.width, c.height), d = id.data;
  const A = [1, 3, 5].map((i) => parseInt(tmava.slice(i, i + 2), 16)), B = [1, 3, 5].map((i) => parseInt(svetla.slice(i, i + 2), 16));
  for (let i = 0; i < d.length; i += 4) {
    let l = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
    l = Math.min(1, Math.max(0, (l - 0.08) * 1.25));
    d[i] = A[0] + (B[0] - A[0]) * l; d[i + 1] = A[1] + (B[1] - A[1]) * l; d[i + 2] = A[2] + (B[2] - A[2]) * l;
  }
  x.putImageData(id, 0, 0);
  return c;
}
let duotonCache = { klic: "", c: null };
function duotonVyrezu() {
  const klic = `${st.vyrezId}|${st.barva}`;
  if (duotonCache.klic !== klic) duotonCache = { klic, c: duoton(vyrez, tmavsi(st.barva, 0.82), "#f4f1ea") };
  return duotonCache.c;
}

// Spodní textový blok (na střed nebo vlevo), skládaný odspodu – vrací horní hranu bloku.
function textBlok(ctx, { spodek, zarovnani = "center", L = 76, maxJmeno = 120, barvaKicker = "rgba(255,255,255,0.8)" }) {
  const d = st.data;
  const x = zarovnani === "center" ? W / 2 : L;
  const sirka = W - 2 * L;
  ctx.textAlign = zarovnani; ctx.textBaseline = "alphabetic";
  let y = spodek;
  ctx.font = `500 34px ${P_TEXT}`;
  const vety = d.veta ? zalom(ctx, d.veta, sirka).slice(0, 2) : [];
  ctx.save(); ctx.globalAlpha = vidim(1.4); ctx.fillStyle = "rgba(255,255,255,0.88)";
  for (let i = vety.length - 1; i >= 0; i--) { ctx.fillText(vety[i], x, y); y -= 46; }
  ctx.restore();
  if (vety.length) y -= 20;
  const cele = [d.krestni, d.prijmeni].filter(Boolean).join(" ").toUpperCase();
  if (cele) {
    const v = vejdeSe(ctx, cele, (q) => `${q}px ${P_JMENO}`, maxJmeno, sirka);
    ctx.save(); ctx.globalAlpha = vidim(0.8); ctx.font = `${v}px ${P_JMENO}`; ctx.fillStyle = "#ffffff";
    ctx.fillText(cele, x, y); ctx.restore();
    y -= (ctx.measureText(cele).actualBoundingBoxAscent || v * 0.75) + 22;
  }
  const k = kickerText();
  if (k) {
    ctx.save(); ctx.globalAlpha = vidim(0.4);
    ctx.font = `700 26px ${P_UZKE}`; ctx.fillStyle = barvaKicker;
    rozprostreny(ctx, k.toUpperCase(), x, y, 5);
    ctx.restore();
    y -= 26;
  }
  ctx.textAlign = "left";
  return y;
}

// 1) IKONA – hráč (výřez) před obřím příjmením, pozadí v barvách týmu
function sablonaIkona(ctx, h) {
  const d = st.data, c = st.barva;
  const bg = ctx.createRadialGradient(W / 2, h * 0.32, 20, W / 2, h * 0.45, h * 0.85);
  bg.addColorStop(0, svetlejsi(c, 0.18)); bg.addColorStop(0.45, c); bg.addColorStop(1, tmavsi(c, 0.7));
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, h);
  // jemný světelný pruh
  ctx.save(); ctx.translate(W * 0.2, 0); ctx.rotate(0.35);
  const pruh = ctx.createLinearGradient(-200, 0, 200, 0);
  pruh.addColorStop(0, "rgba(255,255,255,0)"); pruh.addColorStop(0.5, "rgba(255,255,255,0.07)"); pruh.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = pruh; ctx.fillRect(-200, -h, 400, h * 3); ctx.restore();
  // obří příjmení za hráčem
  const prijmeni = (d.prijmeni || "").toUpperCase();
  if (prijmeni) {
    ctx.save(); ctx.globalAlpha = vidim(0.1, 0.8);
    const v = vejdeSe(ctx, prijmeni, (q) => `${q}px ${P_JMENO}`, h * 0.36, W * 0.94, 60);
    ctx.font = `${v}px ${P_JMENO}`; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
    const yJ = h * 0.155 + (ctx.measureText(prijmeni).actualBoundingBoxAscent || v * 0.8);
    ctx.fillStyle = "rgba(255,255,255,0.16)"; ctx.fillText(prijmeni, W / 2, yJ);
    ctx.lineWidth = 2.5; ctx.strokeStyle = "rgba(255,255,255,0.42)"; ctx.strokeText(prijmeni, W / 2, yJ);
    ctx.restore();
  }
  if (maVyrez()) {
    const r = polohaVyrezu(h, 0.84);
    ctx.save(); ctx.shadowColor = "rgba(0,0,0,0.45)"; ctx.shadowBlur = 50; ctx.shadowOffsetY = 18;
    ctx.filter = st.cb ? "grayscale(1) contrast(1.1)" : "contrast(1.06) saturate(1.05)";
    ctx.drawImage(vyrez, r.x, r.y, r.w, r.h); ctx.restore();
  } else {
    ctx.save(); ctx.globalAlpha = 0.9; kresliFoto(ctx, 0, h * 0.2, W, h * 0.8, st.cb); ctx.restore();
  }
  const g = ctx.createLinearGradient(0, h * 0.62, 0, h);
  g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(0.55, "rgba(0,0,0,0.7)"); g.addColorStop(1, "rgba(0,0,0,0.92)");
  ctx.fillStyle = g; ctx.fillRect(0, h * 0.62, W, h * 0.38);
  kresliZrno(ctx, W, h, 0.06);
  textBlok(ctx, { spodek: h - (h > 1500 ? 140 : 84), maxJmeno: 110 });
  ctx.fillStyle = st.barva2 && jas(st.barva2) > 0.15 ? st.barva2 : "#ffffff";
  ctx.fillRect(W / 2 - 40, h - 36, 80, 6);
  logo(ctx, "bila", { x: 56, y: 52, sirka: 130 });
}

// 2) PLAKÁT – tmavé pozadí, barevný rám s hráčem v duotónu (hlava přesahuje rám), jméno dole vlevo
function sablonaPlakat(ctx, h) {
  const d = st.data, c = st.barva;
  ctx.fillStyle = tmavsi(c, 0.86); ctx.fillRect(0, 0, W, h);
  const M = 70, ramY = h * 0.13, ramH = h * 0.56;
  ctx.fillStyle = c; ctx.fillRect(M, ramY, W - 2 * M, ramH);
  ctx.save(); ctx.globalAlpha = 0.25; ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 2; ctx.strokeRect(M + 18, ramY + 18, W - 2 * M - 36, ramH - 36); ctx.restore();
  const spodekRamu = h - (ramY + ramH);
  if (maVyrez()) {
    const r = polohaVyrezu(h, 0.66, 0.5, spodekRamu);
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, ramY + ramH); ctx.clip();
    ctx.shadowColor = "rgba(0,0,0,0.4)"; ctx.shadowBlur = 40; ctx.shadowOffsetY = 14;
    ctx.drawImage(st.cb ? vyrez : duotonVyrezu(), r.x, r.y, r.w, r.h);
    ctx.restore();
  } else {
    ctx.save(); ctx.beginPath(); ctx.rect(M, ramY, W - 2 * M, ramH); ctx.clip();
    kresliFoto(ctx, M, ramY, W - 2 * M, ramH, true);
    ctx.globalCompositeOperation = "multiply"; ctx.fillStyle = c; ctx.fillRect(M, ramY, W - 2 * M, ramH);
    ctx.restore();
  }
  // text pod rámem (shora dolů, měřeno)
  const L = M;
  let y = ramY + ramH + 54;
  ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  const asc = (t) => ctx.measureText(t).actualBoundingBoxAscent || 0;
  if (d.krestni) {
    ctx.font = `700 32px ${P_TEXT}`; const t = d.krestni.toUpperCase(); y += asc(t);
    ctx.save(); ctx.globalAlpha = vidim(0.3); ctx.fillStyle = svetlejsi(c, 0.55); rozprostreny(ctx, t, L, y, 10); ctx.restore();
    y += 16;
  }
  const prijmeni = (d.prijmeni || "").toUpperCase();
  if (prijmeni) {
    const zbyva = h - y - 150;
    let v = vejdeSe(ctx, prijmeni, (q) => `${q}px ${P_JMENO}`, h > 1500 ? 230 : 180, W - 2 * L);
    ctx.font = `${v}px ${P_JMENO}`;
    while (v > 60 && asc(prijmeni) > zbyva) { v -= 4; ctx.font = `${v}px ${P_JMENO}`; }
    y += asc(prijmeni);
    ctx.save(); ctx.globalAlpha = vidim(0.6); ctx.fillStyle = "#ffffff"; ctx.fillText(prijmeni, L - 4, y); ctx.restore();
    y += 22;
  }
  const k = kickerText();
  if (k) {
    ctx.font = `700 26px ${P_UZKE}`; y += asc(k);
    ctx.save(); ctx.globalAlpha = vidim(0.9); ctx.fillStyle = "rgba(255,255,255,0.7)"; rozprostreny(ctx, k.toUpperCase(), L, y, 5); ctx.restore();
    y += 18;
  }
  if (d.veta) {
    ctx.font = `500 30px ${P_TEXT}`;
    const vety = zalom(ctx, d.veta, W - 2 * L).slice(0, 2);
    y += asc(vety[0] || "A") + 6;
    ctx.save(); ctx.globalAlpha = vidim(1.3); ctx.fillStyle = "rgba(255,255,255,0.85)";
    vety.forEach((r, i) => { if (y + i * 40 < h - 30) ctx.fillText(r, L, y + i * 40); }); ctx.restore();
  }
  kresliZrno(ctx, W, h, 0.07);
  logo(ctx, "bila", { x: M, y: Math.max(24, ramY - 92), sirka: 120 });
}

// 3) VERTIKÁL – fotka vlevo (černobílá), vpravo sloupec v barvě týmu se svislým jménem
function sablonaVertikal(ctx, h) {
  const d = st.data, c = st.barva;
  const sloupec = W * 0.34, fotoW = W - sloupec;
  kresliFoto(ctx, 0, 0, fotoW + 60, h, true);
  ctx.fillStyle = c; ctx.fillRect(fotoW, 0, sloupec, h);
  const g = ctx.createLinearGradient(fotoW - 160, 0, fotoW, 0);
  g.addColorStop(0, hex(c, 0)); g.addColorStop(1, hex(c, 1));
  ctx.fillStyle = g; ctx.fillRect(fotoW - 160, 0, 160, h);
  // svislé jméno (zdola nahoru)
  const prijmeni = (d.prijmeni || "").toUpperCase();
  ctx.save();
  ctx.translate(fotoW + sloupec * 0.5, h * 0.5); ctx.rotate(-Math.PI / 2);
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  if (prijmeni) {
    const v = vejdeSe(ctx, prijmeni, (q) => `${q}px ${P_JMENO}`, sloupec * 0.86, h * 0.86, 60);
    ctx.globalAlpha = vidim(0.4); ctx.font = `${v}px ${P_JMENO}`; ctx.fillStyle = "#ffffff";
    ctx.fillText(prijmeni, 0, sloupec * 0.06);
  }
  ctx.restore();
  // dole vlevo přes fotku: křestní, kicker, věta
  const gb = ctx.createLinearGradient(0, h * 0.6, 0, h);
  gb.addColorStop(0, "rgba(0,0,0,0)"); gb.addColorStop(1, "rgba(0,0,0,0.85)");
  ctx.fillStyle = gb; ctx.fillRect(0, h * 0.6, fotoW, h * 0.4);
  const L = 60, sirka = fotoW - L - 40;
  ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  let y = h - (h > 1500 ? 130 : 76);
  ctx.font = `500 32px ${P_TEXT}`;
  const vety = d.veta ? zalom(ctx, d.veta, sirka).slice(0, 3) : [];
  ctx.save(); ctx.globalAlpha = vidim(1.3); ctx.fillStyle = "rgba(255,255,255,0.9)";
  for (let i = vety.length - 1; i >= 0; i--) { ctx.fillText(vety[i], L, y); y -= 44; }
  ctx.restore();
  if (vety.length) y -= 18;
  const k = kickerText();
  if (k) {
    ctx.save(); ctx.globalAlpha = vidim(0.9); ctx.font = `700 24px ${P_UZKE}`; ctx.fillStyle = "rgba(255,255,255,0.75)";
    zalom(ctx, k.toUpperCase(), sirka).slice(0, 2).reverse().forEach((r) => { rozprostreny(ctx, r, L, y, 4); y -= 34; });
    ctx.restore();
    y -= 8;
  }
  if (d.krestni) {
    ctx.save(); ctx.globalAlpha = vidim(0.6); ctx.font = `700 44px ${P_TEXT}`; ctx.fillStyle = "#ffffff";
    rozprostreny(ctx, d.krestni.toUpperCase(), L, y, 10); ctx.restore();
  }
  ctx.fillStyle = "#ffffff"; ctx.fillRect(L, h - 40, 60, 5);
  kresliZrno(ctx, W, h, 0.05);
  logo(ctx, "bila", { x: 48, y: 46, sirka: 120 });
}

// 3) KARTA – fotka v rámečku na krémovém papíře, jméno pod ní (sběratelská kartička)
function sablonaKarta(ctx, h) {
  const d = st.data;
  const PAPIR = "#f1ece3", TMAVA = "#141414";
  ctx.fillStyle = PAPIR; ctx.fillRect(0, 0, W, h);
  const M = 56;
  const vyskaTextu = h > 1500 ? 470 : h < 1200 ? 300 : 360;
  const fx = M, fy = M, fw = W - 2 * M, fh = h - M - vyskaTextu;
  ctx.save(); ctx.shadowColor = "rgba(0,0,0,0.25)"; ctx.shadowBlur = 24; ctx.shadowOffsetY = 8;
  ctx.fillStyle = "#000"; ctx.fillRect(fx, fy, fw, fh); ctx.restore();
  kresliFoto(ctx, fx, fy, fw, fh, st.cb);
  ctx.fillStyle = st.barva; ctx.fillRect(fx, fy + fh - 12, fw, 12);
  // text pod fotkou – pozice podle skutečné výšky písmen (nic se nepřekrývá)
  const L = M + 4, sirka = W - 2 * M;
  ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  const asc = (t) => ctx.measureText(t).actualBoundingBoxAscent || 0;
  let y = fy + fh + 40;
  if (d.krestni) {
    ctx.font = `700 34px ${P_TEXT}`;
    const t = d.krestni.toUpperCase();
    y += asc(t);
    ctx.save(); ctx.globalAlpha = vidim(0.3);
    ctx.fillStyle = jas(st.barva) > 0.85 ? TMAVA : st.barva;
    rozprostreny(ctx, t, L, y, 9);
    ctx.restore();
    y += 20;
  }
  const prijmeni = (d.prijmeni || "").toUpperCase();
  const k = kickerText();
  ctx.font = `700 26px ${P_UZKE}`;
  const sirkaK = k ? Math.min(sirka * 0.42, ctx.measureText(k.toUpperCase()).width + 30) : 0;
  // příjmení nesmí vytlačit větu pod spodní okraj
  const radkyVety = (() => { ctx.font = `500 32px ${P_TEXT}`; return d.veta ? zalom(ctx, d.veta, sirka).slice(0, 2) : []; })();
  const mistoProVetu = radkyVety.length ? 26 + radkyVety.length * 42 : 0;
  const maxVyska = Math.max(60, h - M - mistoProVetu - y);
  let vP = prijmeni ? vejdeSe(ctx, prijmeni, (v) => `${v}px ${P_JMENO}`, h > 1500 ? 190 : h < 1200 ? 120 : 150, sirka - sirkaK - 24) : 0;
  if (prijmeni) {
    ctx.font = `${vP}px ${P_JMENO}`;
    while (vP > 50 && asc(prijmeni) > maxVyska) { vP -= 4; ctx.font = `${vP}px ${P_JMENO}`; }
    y += asc(prijmeni);
    ctx.save(); ctx.globalAlpha = vidim(0.6);
    ctx.fillStyle = TMAVA; ctx.fillText(prijmeni, L - 3, y);
    ctx.restore();
  }
  if (k) {
    ctx.save(); ctx.globalAlpha = vidim(0.9);
    ctx.font = `700 26px ${P_UZKE}`; ctx.fillStyle = "#555"; ctx.textAlign = "right";
    const radky = zalom(ctx, k.toUpperCase(), sirkaK).slice(0, 2);
    radky.forEach((r, i) => ctx.fillText(r, W - M, y - (radky.length - 1 - i) * 32));
    ctx.restore();
  }
  if (radkyVety.length) {
    y += 26;
    ctx.save(); ctx.globalAlpha = vidim(1.3);
    ctx.font = `500 32px ${P_TEXT}`; ctx.fillStyle = "#3a3a3a"; ctx.textAlign = "left";
    y += asc(radkyVety[0]);
    radkyVety.forEach((r, i) => ctx.fillText(r, L, y + i * 42));
    ctx.restore();
  }
  // logo do rohu fotky (text pod fotkou má volné místo)
  logo(ctx, "bila", { x: fx + 28, y: fy + 26, sirka: 120 });
}

function kresliDo(c, sablona = st.sablona) {
  const h = vyska();
  c.width = W; c.height = h;
  const ctx = c.getContext("2d");
  ctx.textBaseline = "alphabetic";
  ({ ikona: sablonaIkona, plakat: sablonaPlakat, vertikal: sablonaVertikal, karta: sablonaKarta }[sablona] || sablonaIkona)(ctx, h);
}

// ---------------------------------------------------------- animované MP4 --
const DELKA_ANIM = 6, FPS_ANIM = 30;
const MUXER_URL = "https://cdn.jsdelivr.net/npm/mp4-muxer@5.2.2/build/mp4-muxer.js";
function nactiMuxer() {
  if (window.Mp4Muxer) return Promise.resolve(window.Mp4Muxer);
  return new Promise((ok, chyba) => { const sc = document.createElement("script"); sc.src = MUXER_URL; sc.onload = () => ok(window.Mp4Muxer); sc.onerror = () => chyba(new Error("Nepodařilo se načíst knihovnu pro MP4.")); document.head.appendChild(sc); });
}
async function exportujVideo() {
  if (typeof VideoEncoder === "undefined") { zprava("Tenhle prohlížeč neumí vytvořit video – použij Chrome nebo Edge.", "chyba"); return; }
  const b = $("#prVideo"); b.disabled = true;
  try {
    const h = vyska();
    const Mp4Muxer = await nactiMuxer();
    let kodek = "avc1.640028";
    try { kodek = (await window.DHReelsRender?.zjistiFormat?.())?.video || kodek; } catch { /* výchozí */ }
    const muxer = new Mp4Muxer.Muxer({ target: new Mp4Muxer.ArrayBufferTarget(), video: { codec: "avc", width: W, height: h, frameRate: FPS_ANIM }, fastStart: "in-memory", firstTimestampBehavior: "offset" });
    let chyba = null;
    const enc = new VideoEncoder({ output: (c, m) => muxer.addVideoChunk(c, m), error: (e) => { chyba = e; } });
    enc.configure({ codec: kodek, width: W, height: h, bitrate: 8_000_000, framerate: FPS_ANIM, avc: { format: "avc" } });
    const c = document.createElement("canvas");
    const n = DELKA_ANIM * FPS_ANIM;
    for (let i = 0; i < n; i++) {
      if (chyba) throw chyba;
      anim = i / FPS_ANIM;
      kresliDo(c);
      const fr = new VideoFrame(c, { timestamp: Math.round((i / FPS_ANIM) * 1e6), duration: Math.round(1e6 / FPS_ANIM) });
      enc.encode(fr, { keyFrame: i % 60 === 0 }); fr.close();
      while (enc.encodeQueueSize > 6) await new Promise((ok) => setTimeout(ok, 5));
      if (i % 15 === 0) zprava(`🎬 Skládám video… ${Math.round((i / n) * 100)} %`);
    }
    await enc.flush();
    if (chyba) throw chyba;
    muxer.finalize();
    G().stahniBlob(new Blob([muxer.target.buffer], { type: "video/mp4" }), `promo-${G().slug(st.data.prijmeni || st.jmeno || "hrac")}-${st.sablona}.mp4`);
    zprava(`Video staženo ✓ ${DELKA_ANIM} s – pomalý nájezd na fotku a postupně se objeví texty. Hudbu přidej přímo v Instagramu.`, "ok");
  } catch (e) { zprava(`Video se nepovedlo: ${esc(e.message)}`, "chyba"); }
  finally { anim = null; b.disabled = false; vykresli(); }
}

// ------------------------------------------------------------------ UI --

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
    <div class="filtry">
      <label>Křestní jméno<input data-pr="krestni" value="${esc(d.krestni)}" placeholder="Mike"></label>
      <label>Příjmení (velké)<input data-pr="prijmeni" value="${esc(d.prijmeni)}" placeholder="Modano"></label>
      <label>Tým<input data-pr="nahore" value="${esc(d.nahore)}" placeholder="DALLAS STARS"></label>
      <label>Roky<input data-pr="roky" value="${esc(d.roky)}" placeholder="1989–2011"></label>
      <label class="cela">Věta (proč ho lidi milovali)<input data-pr="veta" value="${esc(d.veta)}" maxlength="90" placeholder="Elegance, kterou si Dallas pamatuje dodnes."></label>
    </div>
    ${d.zdroje?.length ? `<p class="muted" style="font-size:12.5px;margin:10px 0 0">Zdroje: ${d.zdroje.map((z) => `<a href="${esc(z.uri)}" target="_blank" rel="noopener">${esc(z.titulek || z.uri)}</a>`).join(" · ")}</p>` : ""}
    ${st.kredit ? `<p class="muted" style="font-size:12.5px;margin:6px 0 0">${esc(st.kredit)} – autor fotky se přidá do popisku.</p>` : ""}`;
  $("#prPopisek").value = popisekSKreditem();
  $("#prBarva").value = st.barva; $("#prBarva2").value = st.barva2 || "#ffffff"; $("#prVyrezZap").checked = st.vyrezZap !== false;
  $("#prFormat").value = st.format; $("#prLogo").checked = st.logo; $("#prCb").checked = !!st.cb;
  $("#prZoom").value = st.foto.zoom;
  $$("[data-pr-sablona]").forEach((b) => b.classList.toggle("on", b.dataset.prSablona === st.sablona));
}

function popisekSKreditem() {
  const d = st.data;
  return [d.popisek, (d.hashtagy || []).join(" "), st.kredit].filter(Boolean).join("\n\n");
}

async function exportuj() {
  const c = document.createElement("canvas");
  kresliDo(c);
  const blob = await new Promise((ok) => c.toBlob(ok, "image/jpeg", 0.95));
  G().stahniBlob(blob, `promo-${G().slug(st.data.prijmeni || st.jmeno || "hrac")}-${st.sablona}.jpg`);
  toast("Grafika stažená ✓");
}

// tažení fotky v náhledu
function nastavTahani(c) {
  let start = null;
  c.addEventListener("pointerdown", (e) => { if (!foto) return; start = { x: e.clientX, y: e.clientY, fx: st.foto.x, fy: st.foto.y }; c.setPointerCapture(e.pointerId); });
  c.addEventListener("pointermove", (e) => {
    if (!start) return;
    const r = c.getBoundingClientRect();
    st.foto.x = Math.max(-1, Math.min(1, start.fx - ((e.clientX - start.x) / r.width) * 2.2));
    st.foto.y = Math.max(-0.45, Math.min(1, start.fy - ((e.clientY - start.y) / r.height) * 1.6));
    vykresli();
  });
  const konec = () => { if (start) { start = null; uloz(); } };
  c.addEventListener("pointerup", konec); c.addEventListener("pointercancel", konec);
}

function init() {
  const el = $("#promoObsah");
  if (!el) return;
  el.innerHTML = `
  <div class="pr-mrizka">
    <div>
      <div class="card">
        <h2>🔥 Promo hráče</h2>
        <p class="muted" style="margin-top:0">Jednoduchá stylová grafika na oblíbeného hráče – i historického (Modano, Shanahan, Hašek…). Skutečná fotka, jméno, tým, roky a jedna věta. Lidi ji sdílí, protože toho hráče mají rádi.</p>
        <div class="filtry">
          <label class="cela">Jméno hráče<input id="prJmeno" value="${esc(st.jmeno)}" placeholder="např. Mike Modano" autocomplete="off"></label>
        </div>
        <div class="akce">
          <button type="button" class="btn" id="prNavrhni">✨ Vytvořit</button>
          <button type="button" class="btn ghost" id="prNajdiFoto">🔍 Najít fotku</button>
          <label class="btn ghost">📷 Nahrát fotku<input type="file" id="prSoubor" accept="image/*"></label>
        </div>
        <div class="zprava" id="prZprava" hidden></div>
        <p class="muted" style="font-size:12.5px;margin:10px 0 0">Jen skutečné fotky (Wikimedia Commons s autorem, nebo tvoje vlastní) – nic se negeneruje.</p>
      </div>
      <div class="card">
        <h2>Texty</h2>
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
        <div class="pr-sablony pr-sablony-3">${Object.entries(SABLONY).map(([k, s]) => `<button type="button" class="pr-sablona" data-pr-sablona="${k}"><canvas data-pr-nahled="${k}" width="216" height="270"></canvas><b>${s.nazev}</b><small>${s.popis}</small></button>`).join("")}</div>
        <canvas id="prPlatno" class="pr-platno" width="1080" height="1350" title="Táhnutím posuneš fotku"></canvas>
        <div class="filtry tri" style="margin-top:12px">
          <label>Formát<select id="prFormat">${Object.entries(FORMATY).map(([k, f]) => `<option value="${k}">${f.nazev}</option>`).join("")}</select></label>
          <label>Barva týmu<input type="color" id="prBarva"></label>
          <label>Druhá barva<input type="color" id="prBarva2"></label>
          <label>Přiblížení fotky<input type="range" id="prZoom" min="1" max="2.2" step="0.01"></label>
          <label class="check"><input type="checkbox" id="prCb"> Černobílá fotka</label>
          <label class="check"><input type="checkbox" id="prVyrezZap"> Vyříznutý hráč</label>
          <label class="check"><input type="checkbox" id="prLogo"> Logo Deníku hokeje</label>
        </div>
        <div class="akce">
          <button type="button" class="btn" id="prStahnout">⬇️ Stáhnout obrázek</button>
          <button type="button" class="btn ghost" id="prVideo" title="6 s: pomalý nájezd na fotku a postupné objevení textů – do Reels a Stories">🎬 Video 6 s</button>
          <button type="button" class="btn ghost" id="prNovy">↺ Nový hráč</button>
        </div>
      </div>
    </div>
  </div>`;

  $("#prNavrhni").addEventListener("click", navrhni);
  $("#prJmeno").addEventListener("keydown", (e) => { if (e.key === "Enter") navrhni(); });
  $("#prNajdiFoto").addEventListener("click", () => najdiFoto(false));
  $("#prSoubor").addEventListener("change", async (e) => { const f = e.target.files[0]; e.target.value = ""; if (f) await nastavFoto(f, ""); });
  $("#prStahnout").addEventListener("click", exportuj);
  $("#prVideo").addEventListener("click", exportujVideo);
  $("#prNovy").addEventListener("click", () => { if (!confirm("Začít s novým hráčem?")) return; st = prazdna(); foto = null; vyrez = null; uloz(); $("#prJmeno").value = ""; vykresliFormular(); vykresli(); zprava(""); });
  $("#prKopiruj").addEventListener("click", async () => { try { await navigator.clipboard.writeText($("#prPopisek").value); toast("Popisek zkopírován ✓"); } catch { $("#prPopisek").select(); } });
  $("#prPlan").addEventListener("click", () => {
    window.DHPlan?.pridej({ nazev: `Promo: ${[st.data.krestni, st.data.prijmeni].filter(Boolean).join(" ") || st.jmeno}`, format: "post", zadani: $("#prPopisek").value });
    toast("Přidáno do plánu ✓");
  });
  $("#prPopisek").addEventListener("input", (e) => { st.data.popisek = e.target.value; uloz(); });
  $("#prBarva").addEventListener("input", (e) => { st.barva = e.target.value; uloz(); vykresli(); });
  $("#prBarva2").addEventListener("input", (e) => { st.barva2 = e.target.value; uloz(); vykresli(); });
  $("#prVyrezZap").addEventListener("change", (e) => { st.vyrezZap = e.target.checked; uloz(); vykresli(); });
  $("#prFormat").addEventListener("change", (e) => { st.format = e.target.value; uloz(); vykresli(); });
  $("#prZoom").addEventListener("input", (e) => { st.foto.zoom = +e.target.value; uloz(); vykresli(); });
  $("#prCb").addEventListener("change", (e) => { st.cb = e.target.checked; uloz(); vykresli(); });
  $("#prLogo").addEventListener("change", (e) => { st.logo = e.target.checked; uloz(); vykresli(); });
  el.addEventListener("click", (e) => {
    const s = e.target.closest("[data-pr-sablona]");
    if (s) { st.sablona = s.dataset.prSablona; uloz(); $$("[data-pr-sablona]").forEach((b) => b.classList.toggle("on", b === s)); vykresli(); }
  });
  el.addEventListener("input", (e) => {
    const t = e.target;
    if (t.dataset.pr) { st.data[t.dataset.pr] = t.value; uloz(); vykresli(); }
  });
  nastavTahani($("#prPlatno"));
  vykresliFormular();
  (async () => {
    try {
      if (st.fotoId) foto = await U().obrazekImg(st.fotoId);
      if (st.vyrezId) { const img = await U().obrazekImg(st.vyrezId); const c = document.createElement("canvas"); c.width = img.naturalWidth; c.height = img.naturalHeight; c.getContext("2d").drawImage(img, 0, 0); vyrez = c; }
      else if (foto) vyrizni();
    } catch { /* nic */ }
    if (document.fonts?.ready) await document.fonts.ready;
    vykresli();
  })();
  document.addEventListener("dh:zalozka", (e) => { if (e.detail === "promo") vykresli(); });
}

window.DHPromo = { get stav() { return st; }, vykresli, nastavFoto, kresliDo, exportujVideo };
init();
})();
