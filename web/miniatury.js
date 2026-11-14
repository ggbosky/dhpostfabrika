// YouTube Thumbnail Factory – miniatury 1280 × 720 pro kanál Deník hokeje.
// AI kreativní ředitel (Claude/Gemini, i s analýzou referenčních obrázků) → 3–5 konceptů →
// pozadí: a) AI (Gemini Nano Banana) se skutečnými fotkami jako referencí, b) AI scéna bez tváří,
// c) kompozice jen ze skutečných fotek (zdarma, bez AI) → editor s texty jako vrstvami → hodnocení → export.
(() => {
"use strict";

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const AI = () => window.DHAI;
const U = () => window.DHYtUloziste;
const G = () => window.DHG;
const toast = (t, d) => window.DHToast?.(t, d);

const W = 1280, H = 720;
const MAX_YT = 2 * 1024 * 1024; // YouTube: miniatura max. 2 MB

const STYLY = {
  A: { nazev: "Filmový dokument", popis: "dramatické světlo, tmavé pozadí, filmové barvy, vysoký kontrast", en: "dramatic cinematic lighting, dark background, film color grade, high contrast", grade: "film" },
  B: { nazev: "Historický archiv", popis: "autentická dobová atmosféra, archivní textura, dobová výstroj", en: "authentic vintage era atmosphere, archival film texture, period hockey equipment", grade: "archiv" },
  C: { nazev: "Extrémní CTR", popis: "jeden dominantní subjekt, silná emoce, max. kontrast, minimum textu", en: "one dominant subject, strong emotion, maximum contrast, minimal clutter", grade: "ctr" },
  D: { nazev: "Historická koláž", popis: "víc skutečných osobností, jasná hierarchie, redakční kompozice", en: "editorial collage feel, clear hierarchy", grade: "film" },
  E: { nazev: "Temná záhada", popis: "temná atmosféra, napětí, jedna akcentní barva", en: "dark mysterious atmosphere, tension, a single accent color", grade: "zahada" },
};
const GRADY = {
  zadny: { nazev: "Bez úprav", filtr: "none" },
  film: { nazev: "Filmový (teal & orange)", filtr: "contrast(1.14) saturate(1.08)", tonovani: ["rgba(0,90,110,0.20)", "rgba(255,140,40,0.14)"] },
  archiv: { nazev: "Archiv (sépie, zrno)", filtr: "grayscale(0.55) sepia(0.38) contrast(1.12) brightness(0.98)", zrno: 0.11 },
  ctr: { nazev: "Extrémní kontrast", filtr: "contrast(1.24) saturate(1.28) brightness(1.04)" },
  zahada: { nazev: "Temný (červený akcent)", filtr: "contrast(1.2) saturate(0.55) brightness(0.86)", tonovani: ["rgba(10,10,20,0.25)", "rgba(180,10,20,0.16)"], zrno: 0.06 },
};
const REF_TYPY = {
  hrac: "Fotka hráče / osobnosti",
  historicka: "Historická fotka",
  nase: "Naše dřívější miniatura",
  styl: "Vzor stylu / kompozice",
  konkurence: "Miniatura jiného kanálu",
};
const PISMA = { Anton: "Anton", Montserrat: "Montserrat", Oswald: "Oswald", "Roboto Condensed": "Roboto Condensed" };
const REZIMY = {
  "ai-foto": "AI kompozice ze skutečné fotky",
  "ai-scena": "AI scéna bez tváří skutečných lidí",
  foto: "Jen skutečné fotky (bez AI, zdarma)",
};

// Popisky režimů, když je vybraný bezplatný generátor (jen text, bez referenčních fotek).
const REZIMY_ZDARMA = {
  "ai-foto": "Skutečná fotka na AI pozadí (zdarma)",
  "ai-scena": "AI scéna bez tváří (zdarma)",
};

let p = null;            // otevřený projekt
let krok = "zadani";
let aktivni = null;      // index konceptu v editoru
let vybranaVrstva = 0;
let ukladaniCasovac = null;

// ------------------------------------------------------------------ projekt --

function novyProjekt() {
  return {
    id: U().noveId("thumb"), vytvoreno: Date.now(), upraveno: Date.now(),
    vstup: { tema: "", titulek: "", popis: "", hlavni: "", smer: "auto", poznamka: "" },
    reference: [], analyza: null, koncepty: [], finalni: null, ab: [], youtube: {},
  };
}

async function ulozHned() {
  clearTimeout(ukladaniCasovac);
  ukladaniCasovac = null;
  if (!p) return;
  p.upraveno = Date.now();
  try { await U().uloz("miniatury", p); localStorage.setItem("dhpf_thumb_posledni", p.id); } catch (e) { toast(`Uložení projektu se nepovedlo: ${esc(e.message)}`, "chyba"); }
}
function ulozPozdeji() {
  clearTimeout(ukladaniCasovac);
  ukladaniCasovac = setTimeout(ulozHned, 500);
}

function vychoziEditor(k) {
  const pozice = k?.text_pozice || "vlevo";
  const x = pozice === "vpravo" ? 0.72 : pozice === "stred" ? 0.5 : 0.06;
  const y = pozice === "dole" ? 0.8 : pozice === "nahore" ? 0.16 : 0.62;
  const zarovnani = pozice === "vpravo" ? "right" : pozice === "stred" ? "center" : "left";
  const akcent = /^#[0-9a-f]{6}$/i.test(k?.akcent || "") ? k.akcent : "#ffc000";
  const texty = (k?.texty || []).filter(Boolean).slice(0, 2);
  return {
    pohled: { zoom: 1, cx: 0.5, cy: 0.45 },
    grade: STYLY[k?.styl]?.grade || "film",
    vineta: 0.45, ztmaveniTextu: 0.55, logo: "bila",
    vrstvy: texty.map((t, i) => ({
      text: t, x: pozice === "vpravo" ? 0.94 : x, y: y + i * 0.17, velikost: i === 0 ? 128 : 84,
      pismo: "Anton", barva: i === 0 ? "#ffffff" : akcent, zvyrazneni: akcent,
      obrys: "#000000", obrysSirka: 10, stin: 0.6, zarovnani: pozice === "vpravo" ? "right" : zarovnani, verzalky: true,
    })),
  };
}

// ------------------------------------------------------------- vykreslení --

let zrnoCanvas = null;
function zrno() {
  if (zrnoCanvas) return zrnoCanvas;
  zrnoCanvas = document.createElement("canvas");
  zrnoCanvas.width = 256; zrnoCanvas.height = 256;
  const c = zrnoCanvas.getContext("2d");
  const d = c.createImageData(256, 256);
  let s = 12345;
  for (let i = 0; i < d.data.length; i += 4) {
    s = (s * 16807) % 2147483647;
    const v = (s / 2147483647) * 255;
    d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255;
  }
  c.putImageData(d, 0, 0);
  return zrnoCanvas;
}

// Slovo v *hvězdičkách* = zvýrazněná barva.
function useky(radek) {
  const out = [];
  radek.split(/(\*[^*]+\*)/).forEach((u) => { if (u) out.push(u.startsWith("*") && u.endsWith("*") ? { t: u.slice(1, -1), z: true } : { t: u, z: false }); });
  return out;
}

function kresliVrstvu(ctx, v, vybrana) {
  const radky = String(v.verzalky ? v.text.toLocaleUpperCase("cs-CZ") : v.text).split("\n");
  ctx.save();
  ctx.font = `${v.pismo === "Montserrat" ? "900 " : v.pismo === "Oswald" || v.pismo === "Roboto Condensed" ? "700 " : ""}${v.velikost}px "${v.pismo}", Impact, sans-serif`;
  ctx.textBaseline = "alphabetic";
  ctx.lineJoin = "round";
  const vyska = v.velikost * 0.98;
  const sirky = radky.map((r) => ctx.measureText(r.replace(/\*/g, "")).width);
  const maxW = Math.max(...sirky, 1);
  const x0 = v.x * W, yTop = v.y * H - vyska * 0.8;
  let bbox = { x: 0, y: yTop - vyska * 0.2, w: maxW, h: vyska * radky.length + vyska * 0.2 };
  radky.forEach((r, i) => {
    const w = sirky[i];
    let x = v.zarovnani === "right" ? x0 - w : v.zarovnani === "center" ? x0 - w / 2 : x0;
    const y = yTop + vyska * (i + 1) - vyska * 0.2;
    if (i === 0) bbox.x = v.zarovnani === "right" ? x0 - maxW : v.zarovnani === "center" ? x0 - maxW / 2 : x0;
    for (const u of useky(r)) {
      const sw = ctx.measureText(u.t).width;
      if (v.stin > 0) { ctx.shadowColor = `rgba(0,0,0,${v.stin})`; ctx.shadowBlur = v.velikost * 0.18; ctx.shadowOffsetY = v.velikost * 0.05; }
      if (v.obrysSirka > 0) { ctx.strokeStyle = v.obrys; ctx.lineWidth = v.obrysSirka * 2; ctx.strokeText(u.t, x, y); }
      ctx.shadowColor = "transparent";
      ctx.fillStyle = u.z ? v.zvyrazneni : v.barva;
      ctx.fillText(u.t, x, y);
      x += sw;
    }
  });
  if (vybrana) { ctx.strokeStyle = "rgba(77,184,255,.9)"; ctx.lineWidth = 3; ctx.setLineDash([10, 8]); ctx.strokeRect(bbox.x - 10, bbox.y - 6, bbox.w + 20, bbox.h + 12); }
  ctx.restore();
  return bbox;
}

// Vykreslí miniaturu: pozadí (+ výřez) → barevné ladění → vinětace/ztmavení pod textem → logo → texty.
function vykresli(ctx, img, ed, { vyber = -1 } = {}) {
  ctx.save();
  ctx.fillStyle = "#0a0a0a"; ctx.fillRect(0, 0, W, H);
  const g = GRADY[ed.grade] || GRADY.zadny;
  if (img) {
    ctx.filter = g.filtr;
    G().kresliFoto(ctx, img, ed.pohled, W, H);
    ctx.filter = "none";
  }
  if (g.tonovani) {
    const tg = ctx.createLinearGradient(0, 0, W, H);
    tg.addColorStop(0, g.tonovani[0]); tg.addColorStop(1, g.tonovani[1]);
    ctx.globalCompositeOperation = "soft-light"; ctx.fillStyle = tg; ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = "source-over";
  }
  if (g.zrno) { ctx.globalAlpha = g.zrno; ctx.globalCompositeOperation = "overlay"; ctx.fillStyle = ctx.createPattern(zrno(), "repeat"); ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over"; }
  if (ed.vineta > 0) {
    const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.75);
    vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, `rgba(0,0,0,${ed.vineta})`);
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  }
  // ztmavení na straně textu = čitelnost
  if (ed.ztmaveniTextu > 0 && ed.vrstvy.length) {
    const prum = ed.vrstvy.reduce((a, v) => a + v.x, 0) / ed.vrstvy.length;
    const zg = prum < 0.4 ? ctx.createLinearGradient(0, 0, W * 0.7, 0) : prum > 0.6 ? ctx.createLinearGradient(W, 0, W * 0.3, 0) : ctx.createLinearGradient(0, H, 0, H * 0.35);
    zg.addColorStop(0, `rgba(0,0,0,${ed.ztmaveniTextu})`); zg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = zg; ctx.fillRect(0, 0, W, H);
  }
  ctx.restore();
  if (ed.logo !== "vypnuto") G().kresliLogo(ctx, ed.logo, { x: W - 150, y: 24, sirka: 120 });
  return ed.vrstvy.map((v, i) => kresliVrstvu(ctx, v, i === vyber));
}

async function pozadiKonceptu(k) {
  const v = k?.varianty?.find((x) => x.id === k.vybranaVarianta) || k?.varianty?.[k.varianty.length - 1];
  return v ? U().obrazekImg(v.obrazekId) : null;
}

async function renderNaCanvas(k, sirka = W) {
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  vykresli(c.getContext("2d"), await pozadiKonceptu(k), k.editor);
  if (sirka === W) return c;
  const m = document.createElement("canvas");
  m.width = sirka; m.height = Math.round(sirka * 9 / 16);
  m.getContext("2d").drawImage(c, 0, 0, m.width, m.height);
  return m;
}

// --------------------------------------------------------- kompozice z fotek --

function kresliCover(ctx, img, x, y, w, h, cy = 0.4) {
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  const m = Math.max(w / iw, h / ih);
  const sw = w / m, sh = h / m;
  ctx.drawImage(img, (iw - sw) / 2, Math.min(Math.max(ih * cy - sh / 2, 0), ih - sh), sw, sh, x, y, w, h);
}

// Pozadí jen ze skutečných fotek – bez generování, bez úprav tváří.
// pozadi (volitelné) = AI scéna bez lidí; skutečná fotka se na ni jen položí, tvář se nijak nemění.
async function slozZFotek(k, fotky, pozadi = null) {
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const ctx = c.getContext("2d");
  const akcent = /^#[0-9a-f]{6}$/i.test(k.akcent || "") ? k.akcent : "#b0121a";
  if (pozadi) {
    kresliCover(ctx, pozadi, 0, 0, W, H, 0.5);
    ctx.fillStyle = "rgba(0,0,0,0.22)"; ctx.fillRect(0, 0, W, H);
  } else {
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, "#050505"); bg.addColorStop(1, akcent + "55");
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  }
  const strana = k.text_pozice === "vpravo" ? "vlevo" : "vpravo";
  let rozvrzeni = k.rozvrzeni || (fotky.length >= 3 ? "kolaz" : fotky.length === 2 ? "duel" : strana);
  if (pozadi && rozvrzeni === "plna") rozvrzeni = strana;
  if (rozvrzeni === "kolaz" && fotky.length >= 2) {
    const n = Math.min(fotky.length, 4), sirka = W / n, sk = 70;
    const hrana = (j, nahore) => (j <= 0 ? 0 : j >= n ? W : j * sirka + (nahore ? sk / 2 : -sk / 2));
    fotky.slice(0, n).forEach((f, i) => {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(hrana(i, true), 0); ctx.lineTo(hrana(i + 1, true), 0);
      ctx.lineTo(hrana(i + 1, false), H); ctx.lineTo(hrana(i, false), H);
      ctx.closePath(); ctx.clip();
      const x0 = Math.max(0, i * sirka - sk / 2), x1 = Math.min(W, (i + 1) * sirka + sk / 2);
      kresliCover(ctx, f, x0, 0, x1 - x0, H);
      ctx.restore();
    });
    ctx.strokeStyle = "#000"; ctx.lineWidth = 10;
    for (let j = 1; j < n; j++) { ctx.beginPath(); ctx.moveTo(hrana(j, true), 0); ctx.lineTo(hrana(j, false), H); ctx.stroke(); }
  } else if (rozvrzeni === "duel" && fotky.length >= 2) {
    ctx.save(); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(W * 0.56, 0); ctx.lineTo(W * 0.44, H); ctx.lineTo(0, H); ctx.closePath(); ctx.clip();
    kresliCover(ctx, fotky[0], 0, 0, W * 0.56, H); ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.moveTo(W * 0.56, 0); ctx.lineTo(W, 0); ctx.lineTo(W, H); ctx.lineTo(W * 0.44, H); ctx.closePath(); ctx.clip();
    kresliCover(ctx, fotky[1], W * 0.44, 0, W * 0.56, H); ctx.restore();
    ctx.strokeStyle = akcent; ctx.lineWidth = 10; ctx.shadowColor = akcent; ctx.shadowBlur = 30;
    ctx.beginPath(); ctx.moveTo(W * 0.56, 0); ctx.lineTo(W * 0.44, H); ctx.stroke(); ctx.shadowBlur = 0;
  } else {
    const f = fotky[0];
    const vpravo = rozvrzeni !== "vlevo";
    const x = vpravo ? W * 0.36 : 0, w = W * 0.64;
    if (rozvrzeni === "plna") kresliCover(ctx, f, 0, 0, W, H);
    else if (pozadi) {
      // fotka plynule přechází do AI pozadí (maska do průhledna)
      const v = document.createElement("canvas");
      v.width = W; v.height = H;
      const vc = v.getContext("2d");
      kresliCover(vc, f, x, 0, w, H);
      vc.globalCompositeOperation = "destination-in";
      const m = vc.createLinearGradient(vpravo ? x : x + w, 0, vpravo ? x + w * 0.5 : x + w * 0.5, 0);
      m.addColorStop(0, "rgba(0,0,0,0)"); m.addColorStop(1, "rgba(0,0,0,1)");
      vc.fillStyle = m; vc.fillRect(x, 0, w, H);
      ctx.drawImage(v, 0, 0);
    } else {
      kresliCover(ctx, f, x, 0, w, H);
      const pr = ctx.createLinearGradient(vpravo ? x : x + w, 0, vpravo ? x + w * 0.45 : x + w * 0.55, 0);
      pr.addColorStop(0, "rgba(5,5,5,1)"); pr.addColorStop(1, "rgba(5,5,5,0)");
      ctx.fillStyle = pr; ctx.fillRect(x, 0, w, H);
    }
  }
  return new Promise((ok) => c.toBlob(ok, "image/jpeg", 0.94));
}

// ------------------------------------------------------- AI kreativní ředitel --

const SCHEMA_KONCEPTY = {
  type: "object",
  properties: {
    analyza: {
      type: "object",
      properties: {
        publikum: { type: "string" }, emoce: { type: "string" }, detail: { type: "string" },
        unikatnost: { type: "string" }, okamzity_vizual: { type: "string" },
        doporuceny_styl: { type: "string", enum: ["A", "B", "C", "D", "E"] }, proc_styl: { type: "string" },
        poznatky_z_referenci: { type: "string" },
      },
      required: ["publikum", "emoce", "detail", "unikatnost", "okamzity_vizual", "doporuceny_styl", "proc_styl", "poznatky_z_referenci"],
    },
    koncepty: {
      type: "array",
      items: {
        type: "object",
        properties: {
          nazev: { type: "string" },
          styl: { type: "string", enum: ["A", "B", "C", "D", "E"] },
          kompozice: { type: "string", description: "česky: co přesně je na obrázku, kde je subjekt, co v pozadí" },
          proc_klikne: { type: "string" },
          rezim: { type: "string", enum: ["ai-foto", "ai-scena", "foto"] },
          prompt_en: { type: "string", description: "anglický prompt pro fotorealistický generátor, bez textu v obraze" },
          foto_dotazy: { type: "array", items: { type: "string" } },
          rozvrzeni: { type: "string", enum: ["plna", "vpravo", "vlevo", "duel", "kolaz"] },
          texty: { type: "array", items: { type: "string" }, description: "0–2 textové vrstvy, celkem max 4 slova, správná čeština" },
          text_pozice: { type: "string", enum: ["vlevo", "vpravo", "stred", "dole", "nahore"] },
          akcent: { type: "string", description: "hex akcentní barva" },
        },
        required: ["nazev", "styl", "kompozice", "proc_klikne", "rezim", "prompt_en", "foto_dotazy", "rozvrzeni", "texty", "text_pozice", "akcent"],
      },
    },
  },
  required: ["analyza", "koncepty"],
};

function systemReditel(maFotkuHrace) {
  return `Jsi zkušený kreativní ředitel YouTube miniatur pro sportovní dokumenty (úroveň velkých sportovních dokumentárních kanálů).
Kanál: Deník hokeje – česká hokejová historie, legendy, rekordy, příběhy. Publikum: čeští a slovenští fanoušci hokeje 18–55 let.

Postup: nejdřív analyzuj téma (publikum, nejsilnější emoce, nejzajímavější historický detail, čím je příběh unikátní, jaký vizuál ho sdělí okamžitě),
pak navrhni 3–5 OPRAVDU RŮZNÝCH kompozic (ne jen jiná barva): např. detail tváře hlavního hráče · hráč vpravo s dramatickým historickým pozadím ·
dva protivníci proti sobě · koláž více osobností · ikonický akční moment · symbolická scéna příběhu. Každý koncept musí být specifický pro TOTO video.

Styly: A filmový dokument · B historický archiv · C extrémní CTR · D historická koláž · E temná záhada.

REALISMUS A PRAVDIVOST (nejdůležitější):
- Skutečné hráče NIKDY negeneruj „z hlavy“. ${maFotkuHrace
    ? "Uživatel dodal skutečné fotky – pro koncepty s hráčem použij režim \"ai-foto\" (fotka jde do generátoru jako reference, tvář se nesmí měnit) nebo \"foto\"."
    : "Uživatel nedodal fotky hráče – pro koncepty s konkrétním hráčem použij režim \"foto\" (skutečné fotky z Wikimedia Commons podle foto_dotazy)."}
- Režim "ai-scena" jen pro scény BEZ rozpoznatelných tváří skutečných lidí (aréna, led, výstroj, siluety zezadu, symbolické předměty, atmosféra).
- Nevytvářej falešné „historické fotky“ skutečných událostí.
- prompt_en: anglicky, fotorealistický popis (objektiv, světlo, textura kůže a látek, dobová výstroj, color grading), kompozice 16:9,
  volné místo pro titulek na straně text_pozice, a VŽDY: "no text, no letters, no logos, no watermarks, no team trademarks, natural skin texture, no plastic AI look".
  U "ai-foto" začni: "Use the person from the reference photo exactly as he is: keep his face, identity, hairstyle, jersey and equipment unchanged; do not beautify or alter facial features."
- foto_dotazy: 1–3 krátké dotazy pro Wikimedia Commons (celé jméno hráče / klubu / arény, bez diakritiky), i u AI režimů jako záloha.

TEXT: 0–2 vrstvy, dohromady max. 4 silná slova, bezchybná čeština, verzálky. Klíčové slovo můžeš dát do *hvězdiček* (akcentní barva).
Někdy je nejsilnější miniatura bez textu – pak texty prázdné. Text nesmí opakovat název videa doslova a nesmí být zavádějící.
Příklady: NEUVĚŘITELNÝ PŘÍBĚH · TOHLE NIKDO NEČEKAL · ZMĚNIL CELÝ HOKEJ · ZAPOMENUTÁ LEGENDA · NEJVĚTŠÍ ZRADA? · TAKHLE TO SKONČILO

Reference od uživatele (pokud jsou přiložené): rozeber kompozici, světlo, paletu, typografii, umístění subjektu, hloubku, kontrast a hierarchii
a použij PRINCIPY – nikdy je nekopíruj. Shrň to do poznatky_z_referenci (jinak napiš „bez referencí“).`;
}

async function referenceProAI(typy, max = 6) {
  const vybrane = p.reference.filter((r) => !typy || typy.includes(r.typ)).slice(0, max);
  const out = [];
  for (const r of vybrane) {
    try { out.push({ ...(await AI().obrazekProAI(await U().obrazekBlob(r.id), 1024)), typ: r.typ }); } catch { /* přeskoč */ }
  }
  return out;
}

async function navrhniKoncepty(jedenIndex = null) {
  const v = p.vstup;
  if (!v.tema.trim() && !v.titulek.trim()) { zprava("Napiš aspoň téma nebo název videa.", "chyba"); return; }
  if (!AI().maKlic()) { zprava('Kreativní ředitel potřebuje AI klíč (Claude nebo Gemini). <a href="#" data-jdi-na-ai>Nastavit</a>', "chyba"); return; }
  const maFotkuHrace = p.reference.some((r) => r.typ === "hrac" || r.typ === "historicka");
  zprava(jedenIndex === null ? "🎬 Kreativní ředitel analyzuje téma a reference… (obvykle 15–40 s)" : `Přepisuji koncept ${jedenIndex + 1}…`);
  try {
    const obrazky = await referenceProAI(null, 6);
    const zadani = `TÉMA: ${v.tema}
NÁZEV VIDEA: ${v.titulek}
HLAVNÍ HRÁČ / UDÁLOST: ${v.hlavni || "(neuvedeno)"}
PREFEROVANÝ STYL: ${v.smer === "auto" ? "vyber nejlepší sám" : `${v.smer} – ${STYLY[v.smer].nazev}`}
POPIS / SCÉNÁŘ: ${(v.popis || "(není)").slice(0, 6000)}
POZNÁMKA: ${v.poznamka || "-"}
PŘILOŽENÉ REFERENCE: ${obrazky.length ? obrazky.map((o, i) => `${i + 1}. ${REF_TYPY[o.typ]}`).join(", ") : "žádné"}
${jedenIndex !== null ? `\nVRAŤ PŘESNĚ 1 NOVÝ KONCEPT, který nahradí koncept „${p.koncepty[jedenIndex]?.nazev}“ – jiná kompozice než ostatní: ${p.koncepty.map((k) => k.nazev).join(", ")}.` : "\nNavrhni 4 koncepty (minimálně 3, nejvýš 5)."}`;
    const r = await AI().gemini({ system: systemReditel(maFotkuHrace), zadani, schema: SCHEMA_KONCEPTY, obrazky: obrazky.map(({ mime, data }) => ({ mime, data })) });
    const nove = (r.koncepty || []).map((k) => ({
      id: U().noveId("k"), ...k,
      rezim: !maFotkuHrace && k.rezim === "ai-foto" ? "foto" : k.rezim,
      varianty: [], vybranaVarianta: null, skore: null,
    }));
    nove.forEach((k) => { k.editor = vychoziEditor(k); });
    if (jedenIndex === null) { p.analyza = r.analyza; p.koncepty = nove.slice(0, 5); }
    else if (nove[0]) p.koncepty[jedenIndex] = nove[0];
    await ulozHned();
    krok = "koncepty";
    vykresliVse();
    const n = p.koncepty.length;
    zprava(jedenIndex === null ? `Hotovo ✓ ${n} ${n < 5 ? "koncepty" : "konceptů"}. U každého vyber, jak vytvořit pozadí.` : "Koncept je přepsaný ✓", "ok");
  } catch (e) { zprava(esc(e.message), "chyba"); }
}

// ---------------------------------------------------------- tvorba pozadí --

async function fotkyProKoncept(k) {
  const imgs = [];
  for (const r of p.reference.filter((x) => x.typ === "hrac" || x.typ === "historicka")) {
    try { imgs.push(await U().obrazekImg(r.id)); } catch { /* nic */ }
  }
  if (imgs.length) return imgs;
  // skutečné volně licencované fotky z Wikimedia Commons (autor se zapíše do projektu)
  for (const d of k.foto_dotazy || []) {
    try {
      const nalez = (await AI().hledejFotky(d, 6))[0];
      if (!nalez) continue;
      const img = await AI().nactiWebFoto(nalez.url);
      const blob = await new Promise((ok) => { const c = document.createElement("canvas"); c.width = img.naturalWidth; c.height = img.naturalHeight; c.getContext("2d").drawImage(img, 0, 0); c.toBlob(ok, "image/jpeg", 0.92); });
      const id = await U().ulozObrazek(blob, { kredit: AI().kredit(nalez) });
      p.reference.push({ id, typ: "hrac", nazev: nalez.nazev || d, kredit: AI().kredit(nalez) });
      imgs.push(await U().obrazekImg(id));
      if (imgs.length >= (k.rozvrzeni === "duel" ? 2 : k.rozvrzeni === "kolaz" ? 3 : 1)) break;
    } catch { /* další dotaz */ }
  }
  return imgs;
}

async function vytvorPozadi(i, rezim = null) {
  const k = p.koncepty[i];
  rezim = rezim || k.rezim;
  const karta = $(`.mt-koncept[data-i="${i}"]`);
  const stav = (t) => { const el = karta?.querySelector(".mt-stav"); if (el) el.innerHTML = t; };
  const tlacitka = karta ? $$("button", karta) : [];
  tlacitka.forEach((b) => { b.disabled = true; });
  try {
    let blob, zdroj, cena = null;
    if (rezim === "foto") {
      stav("Skládám ze skutečných fotek…");
      const fotky = await fotkyProKoncept(k);
      if (!fotky.length) throw new Error("Nenašel jsem vhodnou skutečnou fotku – nahraj ji v kroku Zadání (Fotka hráče).");
      blob = await slozZFotek(k, fotky);
      zdroj = "foto";
    } else if (AI().obrZdarma()) {
      // Zdarma (Pollinations): generátor bere jen text, žádné referenční fotky.
      const strana = { vlevo: "left", vpravo: "right", stred: "center", dole: "bottom", nahore: "top" }[k.text_pozice] || "left";
      const bezLidi = rezim === "ai-foto";
      let fotky = [];
      if (bezLidi) {
        fotky = await fotkyProKoncept(k);
        if (!fotky.length) throw new Error("Režim AI kompozice ze skutečné fotky potřebuje fotku hráče – nahraj ji v kroku Zadání (Fotka hráče).");
      }
      const scena = String(k.prompt_en || "").split(/(?<=[.!?])\s+/).filter((v) => !bezLidi || !/reference|person|player|face|he |his |him /i.test(v)).join(" ") || "Dark atmospheric empty ice hockey arena, spotlight on the ice.";
      const prompt = `${bezLidi ? "Empty background plate only, absolutely no people, no players, no faces, no silhouettes. " : ""}${scena}
${STYLY[k.styl]?.en || ""}. Cinematic documentary photograph, 16:9 YouTube thumbnail background, dramatic lighting, strong contrast, clean empty space on the ${bezLidi ? (strana === "right" ? "right" : "left") : strana} side.
No text, no letters, no numbers, no logos, no watermark, no recognizable real people.`;
      const r = await AI().generujObrazek({ prompt, onStav: stav });
      if (bezLidi) {
        stav("Skládám skutečnou fotku na AI pozadí…");
        const pozadi = await U().blobNaImg(r.blob);
        blob = await slozZFotek(k, fotky, pozadi);
      } else blob = r.blob;
      zdroj = rezim; cena = 0;
    } else {
      const obrazky = [];
      if (rezim === "ai-foto") {
        const hraci = await referenceProAI(["hrac", "historicka"], 3);
        if (!hraci.length) throw new Error("Režim AI kompozice ze skutečné fotky potřebuje nahranou fotku hráče (krok Zadání).");
        obrazky.push(...hraci);
      }
      const styl = await referenceProAI(["styl", "nase", "konkurence"], 2);
      obrazky.push(...styl);
      stav(`Generuji obrázek (${esc(AI().OBR_MODELY[AI().obrModel()]?.nazev.split(" – ")[0] || "Gemini")})… obvykle 20–60 s`);
      const prompt = `${k.prompt_en}

Composition: 16:9 YouTube thumbnail, 1280x720, strong single focal point, readable at small size, leave clean negative space on the ${{ vlevo: "left", vpravo: "right", stred: "center", dole: "bottom", nahore: "top" }[k.text_pozice] || "left"} side for a headline that will be added later.
Style: ${STYLY[k.styl]?.popis || ""}. Photorealistic, authentic, documentary photography, natural skin texture and pores, correct hockey equipment of the era, believable lighting.
${styl.length ? `The last ${styl.length} image(s) are STYLE references only (composition, lighting, color) – do not copy them, do not copy any person or text from them.` : ""}
Strictly: no text, no letters, no numbers, no logos, no watermarks, no team trademarks, no plastic AI look, no extra fingers, no distorted faces.`;
      const r = await AI().generujObrazek({ prompt, obrazky: obrazky.map(({ mime, data }) => ({ mime, data })) });
      blob = r.blob; zdroj = rezim; cena = r.cena;
    }
    const obrazekId = await U().ulozObrazek(blob, { koncept: k.id, zdroj });
    const varianta = { id: U().noveId("v"), obrazekId, zdroj, vytvoreno: Date.now(), cena };
    k.varianty.push(varianta);
    k.vybranaVarianta = varianta.id;
    k.skore = null;
    await ulozHned();
    vykresliKoncepty();
    vykresliPorovnani();
    toast(`Koncept „${esc(k.nazev)}“: pozadí hotové ✓${cena ? ` (~${cena.toLocaleString("cs-CZ")} USD)` : ""}`);
  } catch (e) {
    stav(`<span class="bez-zdroje">${esc(e.message)}</span>`);
  } finally {
    tlacitka.forEach((b) => { b.disabled = false; });
  }
}

// ------------------------------------------------------------- hodnocení --

const SCHEMA_SKORE = {
  type: "object",
  properties: {
    dopad: { type: "integer" }, jasnost_subjektu: { type: "integer" }, emoce: { type: "integer" }, citelnost_mobil: { type: "integer" },
    kontrast: { type: "integer" }, kompozice: { type: "integer" }, relevance: { type: "integer" }, originalita: { type: "integer" },
    zvedavost: { type: "integer" }, realismus: { type: "integer" },
    problemy_realismu: { type: "array", items: { type: "string" } },
    silne_stranky: { type: "array", items: { type: "string" } },
    doporuceni: { type: "array", items: { type: "string" } },
  },
  required: ["dopad", "jasnost_subjektu", "emoce", "citelnost_mobil", "kontrast", "kompozice", "relevance", "originalita", "zvedavost", "realismus", "problemy_realismu", "silne_stranky", "doporuceni"],
};
const KRITERIA = { dopad: "Vizuální dopad", jasnost_subjektu: "Jasnost subjektu", emoce: "Emoce", citelnost_mobil: "Čitelnost na mobilu", kontrast: "Kontrast", kompozice: "Kompozice", relevance: "Relevance k videu", originalita: "Originalita", zvedavost: "Zvědavost", realismus: "Realismus" };

// Kontrast textu vůči pozadí (WCAG poměr) – měřeno z pixelů pod textem.
function kontrastTextu(c, bboxy, ed) {
  const ctx = c.getContext("2d");
  const jas = (r, g, b) => { const f = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  return bboxy.map((b, i) => {
    const v = ed.vrstvy[i];
    try {
      const x = Math.max(0, Math.round(b.x)), y = Math.max(0, Math.round(b.y)), w = Math.min(W - x, Math.round(b.w)), h = Math.min(H - y, Math.round(b.h));
      const d = ctx.getImageData(x, y, Math.max(1, w), Math.max(1, h)).data;
      let s = 0, n = 0;
      for (let k = 0; k < d.length; k += 64) { s += jas(d[k], d[k + 1], d[k + 2]); n++; }
      const pozadi = s / n;
      const hx = parseInt(v.barva.slice(1), 16);
      const text = jas((hx >> 16) & 255, (hx >> 8) & 255, hx & 255);
      const pomer = (x, y) => (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
      let kr = pomer(text, pozadi);
      // silný obrys (≥ 6 px) dělá text čitelným i na pestrém pozadí → rozhoduje kontrast vůči obrysu
      if (v.obrysSirka >= 6) {
        const ho = parseInt(v.obrys.slice(1), 16);
        kr = Math.max(kr, pomer(text, jas((ho >> 16) & 255, (ho >> 8) & 255, ho & 255)));
      }
      return kr;
    } catch { return null; }
  });
}

async function ohodnot(i) {
  const k = p.koncepty[i];
  if (!k.varianty.length) { toast("Nejdřív vytvoř pozadí.", "info"); return; }
  const el = $("#mtSkore");
  if (el) el.innerHTML = `<p class="muted">Hodnotím…</p>`;
  // pozadí + texty bez výběrového rámečku
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const bboxy = vykresli(c.getContext("2d"), await pozadiKonceptu(k), k.editor);
  const slov = k.editor.vrstvy.map((v) => v.text.replace(/\*/g, "").split(/\s+/).filter(Boolean).length).reduce((a, b) => a + b, 0);
  const kontrasty = kontrastTextu(c, bboxy, k.editor);
  const kontroly = [
    [slov <= 4, `Text: ${slov} ${slov === 1 ? "slovo" : slov < 5 ? "slova" : "slov"} ${slov <= 4 ? "(do 4 – dobře)" : "– zkrať na max. 4 silná slova"}`],
    ...k.editor.vrstvy.map((v, j) => [v.velikost >= 72, `Vrstva ${j + 1}: velikost ${v.velikost} px ${v.velikost >= 72 ? "– na mobilu čitelné" : "– na mobilu bude malá, zvětši aspoň na 72 px"}`]),
    ...kontrasty.map((kr, j) => kr == null ? null : [kr >= 4.5, `Kontrast vrstvy ${j + 1}: ${kr.toFixed(1)}:1 ${kr >= 4.5 ? "– výborný" : kr >= 3 ? "– hraniční, přidej obrys/ztmavení" : "– špatně čitelné"}`]).filter(Boolean),
  ];
  let ai = null, chybaAI = "";
  if (AI().maKlic()) {
    try {
      const velka = await AI().obrazekProAI(c, 1280);
      const m = document.createElement("canvas"); m.width = 246; m.height = 138; m.getContext("2d").drawImage(c, 0, 0, 246, 138);
      const mala = await AI().obrazekProAI(m, 246);
      ai = await AI().gemini({
        system: `Jsi přísný hodnotitel YouTube miniatur pro sportovní dokumenty. Hodnotíš DESIGN, ne skutečné CTR (to umí jen YouTube).
Dostaneš miniaturu v plné velikosti a v mobilní velikosti (246×138). Každé kritérium 1–10. Buď konkrétní a kritický.
Realismus: hledej AI artefakty (plastová kůže, divné tváře, prsty, nesmyslná výstroj, špatné dresy, rozmazaná loga, falešný historický vzhled).
Doporučení piš česky, konkrétně a proveditelně (např. „zvětši text o 20 %“, „posuň hráče doprava“, „ztmav pozadí za textem“).`,
        zadani: `Téma videa: ${p.vstup.tema}\nNázev videa: ${p.vstup.titulek}\nKoncept: ${k.nazev} – ${k.kompozice}\nText na miniatuře: ${k.editor.vrstvy.map((v) => v.text).join(" / ") || "(bez textu)"}`,
        schema: SCHEMA_SKORE, obrazky: [velka, mala],
      });
    } catch (e) { chybaAI = e.message; }
  }
  const hodnoty = ai ? Object.keys(KRITERIA).map((x) => ai[x]).filter((x) => typeof x === "number") : [];
  k.skore = { cas: Date.now(), kontroly, ai, celkem: hodnoty.length ? Math.round((hodnoty.reduce((a, b) => a + b, 0) / hodnoty.length) * 10) / 10 : null, chybaAI };
  ulozPozdeji();
  vykresliSkore(k);
  vykresliPorovnani();
}

function vykresliSkore(k) {
  const el = $("#mtSkore");
  if (!el) return;
  const s = k?.skore;
  if (!s) { el.innerHTML = `<p class="muted" style="margin:0">Zatím nehodnoceno. Klikni na <b>📊 Ohodnotit</b>.</p>`; return; }
  el.innerHTML = `
    ${s.celkem != null ? `<div class="mt-celkem"><b>${s.celkem.toLocaleString("cs-CZ")}</b><span>/ 10 · hodnocení designu</span></div>` : ""}
    <p class="muted mt-pozn">Skóre hodnotí design a čitelnost. <b>Skutečné CTR předpovědět neumí</b> – to ukáže až YouTube (Analytics / Test & Compare).</p>
    <ul class="mt-kontroly">${s.kontroly.map(([ok, t]) => `<li class="${ok ? "ok" : "warn"}">${ok ? "✓" : "!"} ${esc(t)}</li>`).join("")}</ul>
    ${s.ai ? `<div class="mt-kriteria">${Object.entries(KRITERIA).map(([kl, n]) => `<div><span>${n}</span><i><b style="width:${(s.ai[kl] || 0) * 10}%"></b></i><em>${s.ai[kl] ?? "–"}</em></div>`).join("")}</div>
      ${s.ai.problemy_realismu?.length ? `<h4>⚠️ Realismus – zkontroluj</h4><ul>${s.ai.problemy_realismu.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
      ${s.ai.silne_stranky?.length ? `<h4>Silné stránky</h4><ul>${s.ai.silne_stranky.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
      ${s.ai.doporuceni?.length ? `<h4>Doporučení</h4><ul>${s.ai.doporuceni.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}`
      : `<p class="muted">${s.chybaAI ? `AI hodnocení selhalo: ${esc(s.chybaAI)}` : "AI hodnocení potřebuje AI klíč – výše jsou jen automatické kontroly."}</p>`}`;
}

// ---------------------------------------------------------------- export --

async function exportuj(i, format = "png") {
  const k = p.koncepty[i];
  const c = await renderNaCanvas(k);
  let blob = await new Promise((ok) => c.toBlob(ok, format === "png" ? "image/png" : "image/jpeg", 0.95));
  let pozn = "";
  if (blob.size > MAX_YT) {
    for (const q of [0.92, 0.88, 0.82, 0.75]) {
      blob = await new Promise((ok) => c.toBlob(ok, "image/jpeg", q));
      if (blob.size <= MAX_YT) break;
    }
    pozn = " (PNG by bylo přes 2 MB – YouTube limit – uloženo jako JPG)";
  }
  const nazev = `miniatura-${G().slug(p.vstup.titulek || p.vstup.tema)}-${i + 1}.${blob.type === "image/png" ? "png" : "jpg"}`;
  G().stahniBlob(blob, nazev);
  const finalniId = await U().ulozObrazek(blob, { finalni: true, koncept: k.id });
  p.finalni = { obrazekId: finalniId, koncept: k.id, cas: Date.now(), velikost: blob.size, typ: blob.type };
  await ulozHned();
  document.dispatchEvent(new CustomEvent("dh:miniatura", { detail: { projekt: p.id } }));
  toast(`Miniatura uložena ✓ ${W}×${H}, ${(blob.size / 1024).toFixed(0)} kB${pozn}. Najdeš ji i v YouTube Studiu při publikaci.`);
}

// ------------------------------------------------------------------ UI --

function zprava(t, druh = "") {
  const el = $("#mtZprava");
  if (!el) return;
  el.innerHTML = t; el.className = `zprava ${druh}`; el.hidden = !t;
}

const KROKY = [["zadani", "1 · Zadání"], ["koncepty", "2 · Koncepty"], ["porovnani", "3 · Porovnání"], ["editor", "4 · Editor"], ["historie", "5 · Historie & A/B"]];

function kostra() {
  const el = $("#miniaturyObsah");
  el.innerHTML = `
    <nav class="r-kroky mt-kroky">${KROKY.map(([k, n]) => `<button type="button" class="r-krok" data-mt-krok="${k}">${n}</button>`).join("")}
      <button type="button" class="r-krok" data-mt="novy" style="margin-left:auto">＋ Nový projekt</button></nav>
    <div class="zprava" id="mtZprava" hidden></div>
    <div data-mt-panel="zadani"></div>
    <div data-mt-panel="koncepty" hidden></div>
    <div data-mt-panel="porovnani" hidden></div>
    <div data-mt-panel="editor" hidden></div>
    <div data-mt-panel="historie" hidden></div>`;
}

function vykresliVse() {
  if (!$("#miniaturyObsah [data-mt-panel]")) kostra();
  $$("[data-mt-krok]").forEach((b) => b.classList.toggle("on", b.dataset.mtKrok === krok));
  $$("[data-mt-panel]").forEach((d) => { d.hidden = d.dataset.mtPanel !== krok; });
  ({ zadani: vykresliZadani, koncepty: vykresliKoncepty, porovnani: vykresliPorovnani, editor: vykresliEditor, historie: vykresliHistorii })[krok]?.();
}

async function vykresliZadani() {
  const el = $('[data-mt-panel="zadani"]');
  const v = p.vstup;
  el.innerHTML = `
    <div class="mt-mrizka">
      <div class="card">
        <h2>Video</h2>
        <div class="filtry">
          <label class="cela">Téma videa <span class="req">*</span><input data-mt-v="tema" value="${esc(v.tema)}" placeholder="např. Ruská pětka v Detroitu"></label>
          <label class="cela">Název videa na YouTube<input data-mt-v="titulek" value="${esc(v.titulek)}" placeholder="např. Jak pět Rusů změnilo NHL navždy" maxlength="100"></label>
          <label>Hlavní hráč / událost<input data-mt-v="hlavni" value="${esc(v.hlavni)}" placeholder="např. Igor Larionov, Sergej Fedorov"></label>
          <label>Vizuální směr<select data-mt-v="smer"><option value="auto">Ať vybere AI</option>${Object.entries(STYLY).map(([k, s]) => `<option value="${k}" ${v.smer === k ? "selected" : ""}>${k} – ${s.nazev}</option>`).join("")}</select></label>
          <label class="cela">Popis videa nebo celý scénář (nepovinné)<textarea data-mt-v="popis" rows="5" placeholder="Čím víc AI ví o příběhu, tím konkrétnější miniatura.">${esc(v.popis)}</textarea></label>
          <label class="cela">Poznámka pro kreativního ředitele<input data-mt-v="poznamka" value="${esc(v.poznamka)}" placeholder="např. chci Larionova vpravo, bez textu, temné"></label>
        </div>
      </div>
      <div class="card">
        <h2>Reference <span class="muted">${p.reference.length} obrázků</span></h2>
        <p class="muted" style="margin-top:0;font-size:13.5px">Skutečné fotky hráče = základ realistické miniatury (tvář se nemění). Vzory stylu a cizí miniatury AI jen rozebere – nekopíruje je.</p>
        <label class="r-drop" id="mtDrop">📥 Přetáhni obrázky sem nebo klikni<input type="file" id="mtSoubory" accept="image/*" multiple></label>
        <div class="radek" style="margin-top:10px;gap:8px">
          <input id="mtHledej" placeholder="Najít skutečnou fotku (Wikimedia), např. Igor Larionov" style="flex:1;min-width:200px">
          <button type="button" class="btn small ghost" data-mt="hledej">🔍 Najít fotku</button>
        </div>
        <div class="mt-reference" id="mtReference"></div>
      </div>
    </div>
    <div class="akce"><button type="button" class="btn" data-mt="navrhni">🎬 Analyzovat a navrhnout koncepty</button>
      <span class="muted" style="align-self:center;font-size:13px">AI kreativní ředitel: rozbor tématu → 3–5 různých kompozic.</span></div>`;
  const ref = $("#mtReference");
  ref.innerHTML = p.reference.length ? "" : `<p class="muted" style="margin:0">Zatím žádné reference.</p>`;
  for (const [i, r] of p.reference.entries()) {
    let src = "";
    try { src = (await U().obrazekImg(r.id)).src; } catch { /* nic */ }
    const d = document.createElement("div");
    d.className = "mt-ref";
    d.innerHTML = `<img src="${src}" alt=""><select data-mt-reftyp="${i}">${Object.entries(REF_TYPY).map(([k, n]) => `<option value="${k}" ${r.typ === k ? "selected" : ""}>${n}</option>`).join("")}</select>
      ${r.kredit ? `<small class="muted">${esc(r.kredit)}</small>` : ""}<button type="button" class="ikona" data-mt-refsmaz="${i}" title="Odebrat">✕</button>`;
    ref.appendChild(d);
  }
}

async function pridejReference(soubory, typ = null) {
  for (const f of soubory) {
    if (!f.type.startsWith("image/")) continue;
    const id = await U().ulozObrazek(f, { nazev: f.name });
    const n = f.name.toLowerCase();
    p.reference.push({ id, nazev: f.name, typ: typ || (/thumb|miniat|yt|youtube/.test(n) ? "styl" : "hrac") });
  }
  ulozPozdeji();
  vykresliZadani();
}

async function vykresliKoncepty() {
  const el = $('[data-mt-panel="koncepty"]');
  if (!el) return;
  if (!p.koncepty.length) { el.innerHTML = `<div class="card"><p class="muted" style="margin:0">Zatím žádné koncepty – v kroku Zadání klikni na <b>🎬 Analyzovat a navrhnout koncepty</b>.</p></div>`; return; }
  const a = p.analyza;
  const cena = AI().OBR_MODELY[AI().obrModel()]?.cena ?? 0.05;
  el.innerHTML = `
    ${a ? `<div class="card ai-karta mt-analyza"><h2>🎬 Kreativní ředitel</h2>
      <dl><dt>Publikum</dt><dd>${esc(a.publikum)}</dd><dt>Nejsilnější emoce</dt><dd>${esc(a.emoce)}</dd><dt>Klíčový detail</dt><dd>${esc(a.detail)}</dd>
      <dt>Čím je unikátní</dt><dd>${esc(a.unikatnost)}</dd><dt>Okamžitý vizuál</dt><dd>${esc(a.okamzity_vizual)}</dd>
      <dt>Doporučený styl</dt><dd><b>${esc(a.doporuceny_styl)} – ${esc(STYLY[a.doporuceny_styl]?.nazev || "")}</b>: ${esc(a.proc_styl)}</dd>
      ${a.poznatky_z_referenci && !/bez referencí/i.test(a.poznatky_z_referenci) ? `<dt>Z referencí</dt><dd>${esc(a.poznatky_z_referenci)}</dd>` : ""}</dl></div>` : ""}
    <div class="akce" style="margin:14px 0"><button type="button" class="btn small" data-mt="vse">⚡ Vytvořit pozadí u všech</button>
      <span class="muted" style="align-self:center;font-size:13px">${AI().obrZdarma() ? "AI obrázky zdarma (Pollinations) · 1 obrázek za ~15 s · placený Gemini jde zapnout v Můj styl" : `AI obrázek ≈ ${cena.toLocaleString("cs-CZ")} USD · „Jen skutečné fotky“ je zdarma`}</span></div>
    <div class="mt-koncepty">${p.koncepty.map((k, i) => `
      <article class="card mt-koncept" data-i="${i}">
        <div class="mt-koncept-hlava"><span class="mt-styl">${esc(k.styl)} · ${esc(STYLY[k.styl]?.nazev || "")}</span><b>${esc(k.nazev)}</b></div>
        <div class="mt-nahled" data-mt-nahled="${i}"></div>
        <p>${esc(k.kompozice)}</p>
        <p class="mt-proc">💡 ${esc(k.proc_klikne)}</p>
        <p class="muted" style="font-size:13px;margin:0">Text: ${k.texty?.filter(Boolean).length ? k.texty.filter(Boolean).map((t) => `<b>${esc(t)}</b>`).join(" / ") : "<i>bez textu</i>"}</p>
        <label style="margin-top:8px">Jak vytvořit pozadí<select data-mt-rezim="${i}">${Object.entries(REZIMY).map(([r, n]) => `<option value="${r}" ${k.rezim === r ? "selected" : ""}>${AI().obrZdarma() && REZIMY_ZDARMA[r] || n}</option>`).join("")}</select></label>
        <div class="mt-stav muted"></div>
        <div class="radek" style="gap:6px;margin-top:8px">
          <button type="button" class="btn small" data-mt-vytvor="${i}">${k.varianty.length ? "↻ Nová varianta" : "Vytvořit pozadí"}</button>
          <button type="button" class="btn small ghost" data-mt-edit="${i}" ${k.varianty.length ? "" : "disabled"}>✎ Upravit</button>
          <button type="button" class="btn small ghost" data-mt-prepis="${i}" title="Nový koncept místo tohoto">↻ Jiný koncept</button>
        </div>
        ${k.varianty.length > 1 ? `<div class="mt-varianty">${k.varianty.map((v, j) => `<button type="button" class="${v.id === k.vybranaVarianta ? "on" : ""}" data-mt-var="${i}:${v.id}">${j + 1}</button>`).join("")}</div>` : ""}
      </article>`).join("")}</div>`;
  for (const [i, k] of p.koncepty.entries()) {
    const box = $(`[data-mt-nahled="${i}"]`);
    if (!box) continue;
    if (!k.varianty.length) { box.innerHTML = `<span>zatím bez pozadí</span>`; continue; }
    const c = await renderNaCanvas(k, 480);
    box.innerHTML = ""; box.appendChild(c);
  }
}

async function vykresliPorovnani() {
  const el = $('[data-mt-panel="porovnani"]');
  if (!el || el.hidden) return;
  const hotove = p.koncepty.map((k, i) => [k, i]).filter(([k]) => k.varianty.length);
  if (!hotove.length) { el.innerHTML = `<div class="card"><p class="muted" style="margin:0">Až vytvoříš pozadí u konceptů, uvidíš je tady vedle sebe – ve velikosti pro počítač i pro mobil.</p></div>`; return; }
  el.innerHTML = `<p class="muted" style="margin:0 0 12px">Takhle je uvidí lidé: velká verze (domovská stránka) a malá (mobil, doporučená videa). Skóre = kvalita designu, ne předpověď CTR.</p>
    <div class="mt-porovnani">${hotove.map(([k, i]) => `<article class="card mt-por" data-i="${i}">
      <div class="mt-por-velka" data-mt-velka="${i}"></div>
      <div class="mt-por-info"><div class="mt-por-mala" data-mt-mala="${i}"></div>
        <div><b>${esc(k.nazev)}</b><small class="muted">${esc(STYLY[k.styl]?.nazev || "")}${k.skore?.celkem != null ? ` · design ${k.skore.celkem.toLocaleString("cs-CZ")}/10` : ""}</small>
        <small class="muted yt-titulek">${esc(p.vstup.titulek || p.vstup.tema)}</small></div></div>
      <div class="radek" style="gap:6px;margin-top:8px"><button type="button" class="btn small" data-mt-edit="${i}">✎ Upravit a exportovat</button>
        <button type="button" class="btn small ghost" data-mt-skore="${i}">📊 Ohodnotit</button></div>
    </article>`).join("")}</div>`;
  for (const [k, i] of hotove) {
    const v = await renderNaCanvas(k, 640), m = await renderNaCanvas(k, 168);
    $(`[data-mt-velka="${i}"]`)?.replaceChildren(v);
    $(`[data-mt-mala="${i}"]`)?.replaceChildren(m);
  }
}

// --------------------------------------------------------------- editor --

let editorImg = null;
let bboxy = [];

async function vykresliEditor() {
  const el = $('[data-mt-panel="editor"]');
  if (!el) return;
  if (aktivni === null || !p.koncepty[aktivni]?.varianty.length) {
    aktivni = p.koncepty.findIndex((k) => k.varianty.length);
    if (aktivni < 0) { aktivni = null; el.innerHTML = `<div class="card"><p class="muted" style="margin:0">Nejdřív vytvoř pozadí u některého konceptu.</p></div>`; return; }
  }
  const k = p.koncepty[aktivni];
  const ed = k.editor;
  el.innerHTML = `
    <div class="mt-editor">
      <div class="card">
        <div class="st-hlava"><h2>${esc(k.nazev)}</h2>
          <select id="mtKoncept" style="width:auto">${p.koncepty.map((x, i) => x.varianty.length ? `<option value="${i}" ${i === aktivni ? "selected" : ""}>${esc(x.nazev)}</option>` : "").join("")}</select></div>
        <div class="mt-platno"><canvas id="mtPlatno" width="${W}" height="${H}"></canvas></div>
        <p class="muted" style="font-size:12.5px;margin:8px 0 0">Táhni text myší / prstem. Táhnutím mimo text posuneš fotku. Kolečkem nebo posuvníkem přiblížíš.</p>
        <div class="mt-mobil"><div><span class="muted">Mobil (168 px)</span><canvas id="mtMobil" width="168" height="95"></canvas></div>
          <div><span class="muted">Doporučená videa (246 px)</span><canvas id="mtMobil2" width="246" height="138"></canvas></div></div>
        <div class="akce">
          <button type="button" class="btn" data-mt-export="png">⬇️ Stáhnout PNG</button>
          <button type="button" class="btn ghost" data-mt-export="jpg">⬇️ JPG</button>
          <button type="button" class="btn ghost" data-mt-skore="${aktivni}">📊 Ohodnotit</button>
          <button type="button" class="btn ghost" data-mt-vytvor="${aktivni}">↻ Nové pozadí</button>
        </div>
      </div>
      <div>
        <div class="card">
          <h2>Pozadí</h2>
          <div class="filtry">
            <label>Barevné ladění<select data-mt-ed="grade">${Object.entries(GRADY).map(([g, x]) => `<option value="${g}" ${ed.grade === g ? "selected" : ""}>${x.nazev}</option>`).join("")}</select></label>
            <label>Logo Deník hokeje<select data-mt-ed="logo">${[["bila", "Bílé"], ["cerna", "Černé"], ["auto", "Automaticky"], ["vypnuto", "Bez loga"]].map(([v, n]) => `<option value="${v}" ${ed.logo === v ? "selected" : ""}>${n}</option>`).join("")}</select></label>
            <label>Přiblížení <input type="range" data-mt-ed="zoom" min="1" max="2.5" step="0.01" value="${ed.pohled.zoom}"></label>
            <label>Vinětace <input type="range" data-mt-ed="vineta" min="0" max="0.9" step="0.05" value="${ed.vineta}"></label>
            <label class="cela">Ztmavení pod textem <input type="range" data-mt-ed="ztmaveniTextu" min="0" max="0.9" step="0.05" value="${ed.ztmaveniTextu}"></label>
          </div>
          ${k.varianty.length > 1 ? `<div class="mt-varianty" style="margin-top:10px"><span class="muted">Varianta pozadí:</span>${k.varianty.map((v, j) => `<button type="button" class="${v.id === k.vybranaVarianta ? "on" : ""}" data-mt-var="${aktivni}:${v.id}">${j + 1}</button>`).join("")}</div>` : ""}
        </div>
        <div class="card" style="margin-top:18px">
          <div class="st-hlava"><h2>Texty</h2><button type="button" class="btn small ghost" data-mt="vrstva">＋ Vrstva</button></div>
          ${ed.vrstvy.length ? `<div class="mt-vrstvy">${ed.vrstvy.map((v, i) => `<button type="button" class="${i === vybranaVrstva ? "on" : ""}" data-mt-vrstva="${i}">${esc(v.text.replace(/\*/g, "").slice(0, 18) || "(prázdná)")}</button>`).join("")}</div>` : `<p class="muted">Bez textu – i to může být nejsilnější varianta.</p>`}
          ${ed.vrstvy[vybranaVrstva] ? vrstvaFormular(ed.vrstvy[vybranaVrstva]) : ""}
        </div>
        <div class="card" style="margin-top:18px"><h2>Hodnocení</h2><div id="mtSkore"></div></div>
      </div>
    </div>`;
  editorImg = await pozadiKonceptu(k);
  prekresliEditor();
  vykresliSkore(k);
  nastavTahani();
}

function vrstvaFormular(v) {
  const o = (pole, n, typ = "text", extra = "") => `<label>${n}<input type="${typ}" data-mt-vr="${pole}" value="${esc(v[pole])}" ${extra}></label>`;
  return `<div class="filtry mt-vrstva-form">
    <label class="cela">Text (*slovo* = akcentní barva, Enter = nový řádek)<textarea data-mt-vr="text" rows="2">${esc(v.text)}</textarea></label>
    <label>Písmo<select data-mt-vr="pismo">${Object.keys(PISMA).map((f) => `<option ${v.pismo === f ? "selected" : ""}>${f}</option>`).join("")}</select></label>
    <label>Zarovnání<select data-mt-vr="zarovnani">${[["left", "Vlevo"], ["center", "Na střed"], ["right", "Vpravo"]].map(([a, n]) => `<option value="${a}" ${v.zarovnani === a ? "selected" : ""}>${n}</option>`).join("")}</select></label>
    ${o("velikost", "Velikost (px)", "range", 'min="36" max="220" step="2"')}
    ${o("obrysSirka", "Obrys (px)", "range", 'min="0" max="24" step="1"')}
    ${o("barva", "Barva", "color")}${o("zvyrazneni", "Akcent", "color")}
    ${o("obrys", "Barva obrysu", "color")}
    ${o("stin", "Stín", "range", 'min="0" max="1" step="0.05"')}
    <label class="check cela"><input type="checkbox" data-mt-vr="verzalky" ${v.verzalky ? "checked" : ""}> VERZÁLKY</label>
    <div class="radek cela" style="gap:6px"><button type="button" class="btn small ghost" data-mt="vrstva-smaz">Smazat vrstvu</button></div>
  </div>`;
}

function prekresliEditor() {
  const k = p.koncepty[aktivni];
  const c = $("#mtPlatno");
  if (!c || !k) return;
  bboxy = vykresli(c.getContext("2d"), editorImg, k.editor, { vyber: vybranaVrstva });
  for (const [id, w, h] of [["#mtMobil", 168, 95], ["#mtMobil2", 246, 138]]) {
    const m = $(id);
    if (!m) continue;
    const t = document.createElement("canvas"); t.width = W; t.height = H;
    vykresli(t.getContext("2d"), editorImg, k.editor);
    m.getContext("2d").drawImage(t, 0, 0, w, h);
  }
}

function nastavTahani() {
  const c = $("#mtPlatno");
  if (!c) return;
  let tah = null;
  const bod = (e) => { const r = c.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H }; };
  c.addEventListener("pointerdown", (e) => {
    const b = bod(e);
    const ed = p.koncepty[aktivni].editor;
    const i = bboxy.findIndex((x) => b.x >= x.x - 14 && b.x <= x.x + x.w + 14 && b.y >= x.y - 10 && b.y <= x.y + x.h + 10);
    if (i >= 0) {
      if (i !== vybranaVrstva) { vybranaVrstva = i; vykresliEditor(); return; }
      tah = { typ: "text", i, x: b.x, y: b.y, vx: ed.vrstvy[i].x, vy: ed.vrstvy[i].y };
    } else tah = { typ: "foto", x: b.x, y: b.y, cx: ed.pohled.cx, cy: ed.pohled.cy };
    c.setPointerCapture(e.pointerId);
  });
  c.addEventListener("pointermove", (e) => {
    if (!tah) return;
    const b = bod(e), ed = p.koncepty[aktivni].editor;
    if (tah.typ === "text") {
      ed.vrstvy[tah.i].x = Math.min(0.98, Math.max(0.02, tah.vx + (b.x - tah.x) / W));
      ed.vrstvy[tah.i].y = Math.min(0.98, Math.max(0.08, tah.vy + (b.y - tah.y) / H));
    } else if (editorImg) {
      const { sw, sh, iw, ih } = G().vyrez(editorImg, ed.pohled, W, H);
      ed.pohled.cx = tah.cx - ((b.x - tah.x) / W) * (sw / iw);
      ed.pohled.cy = tah.cy - ((b.y - tah.y) / H) * (sh / ih);
      G().omezPohled(editorImg, ed.pohled, W, H);
    }
    prekresliEditor();
  });
  const konec = () => { if (tah) { tah = null; p.koncepty[aktivni].skore = null; ulozPozdeji(); } };
  c.addEventListener("pointerup", konec);
  c.addEventListener("pointercancel", konec);
  c.addEventListener("wheel", (e) => {
    if (!editorImg) return;
    e.preventDefault();
    const ed = p.koncepty[aktivni].editor;
    ed.pohled.zoom = Math.min(2.5, Math.max(1, ed.pohled.zoom * (e.deltaY < 0 ? 1.05 : 0.95)));
    G().omezPohled(editorImg, ed.pohled, W, H);
    const z = $('[data-mt-ed="zoom"]'); if (z) z.value = ed.pohled.zoom;
    prekresliEditor(); ulozPozdeji();
  }, { passive: false });
}

// ---------------------------------------------------------- historie & A/B --

async function vykresliHistorii() {
  const el = $('[data-mt-panel="historie"]');
  if (!el) return;
  let vse = [];
  try { vse = (await U().vsechny("miniatury")).sort((a, b) => b.upraveno - a.upraveno); } catch { /* nic */ }
  el.innerHTML = `
    <div class="card">
      <h2>A/B záznamy · ${esc(p.vstup.titulek || p.vstup.tema || "tento projekt")}</h2>
      <p class="muted" style="margin-top:0;font-size:13.5px">Zapiš si, jak která miniatura fungovala (čísla z YouTube Studia → Analytics → Dosah). Imprese a CTR miniatur
        YouTube API nevydává, proto se zapisují ručně. Na skutečné A/B testování použij v YouTube Studiu u videa funkci <b>Test & Compare (Testovat a porovnat)</b> – nahraješ tam až 3 miniatury a YouTube vybere vítěze podle sledovanosti.
        <b>Vyšší CTR neznamená automaticky lepší miniaturu</b> – sleduj i průměrnou dobu sledování; klamavá miniatura zvedne CTR a srazí udržení.</p>
      <div class="filtry tri mt-ab-form">
        <label>Miniatura<select id="mtAbKoncept">${p.koncepty.map((k) => `<option value="${k.id}">${esc(k.nazev)}</option>`).join("")}<option value="">(jiná)</option></select></label>
        <label>Datum<input type="date" id="mtAbDatum" value="${new Date().toISOString().slice(0, 10)}"></label>
        <label>Imprese<input id="mtAbImprese" inputmode="numeric" placeholder="12500"></label>
        <label>CTR (%)<input id="mtAbCtr" inputmode="decimal" placeholder="6,4"></label>
        <label>Zhlédnutí<input id="mtAbZhl" inputmode="numeric" placeholder="800"></label>
        <label>Prům. doba sledování (mm:ss)<input id="mtAbDoba" placeholder="3:45"></label>
      </div>
      <div class="akce"><button type="button" class="btn small" data-mt="ab-pridej">＋ Zapsat</button></div>
      ${p.ab.length ? abTabulka() : ""}
    </div>
    <div class="card" style="margin-top:18px">
      <h2>Historie miniatur <span class="muted">${vse.length} projektů</span></h2>
      <div class="mt-historie" id="mtHistorie">${vse.map((x) => `<article class="mt-hist ${x.id === p.id ? "on" : ""}" data-mt-hist="${x.id}">
        <div class="mt-hist-nahled" data-mt-hist-img="${x.finalni?.obrazekId || x.koncepty?.find((k) => k.varianty?.length)?.varianty.at(-1)?.obrazekId || ""}"></div>
        <b>${esc(x.vstup?.titulek || x.vstup?.tema || "Bez názvu")}</b>
        <small class="muted">${new Date(x.upraveno).toLocaleString("cs-CZ", { day: "numeric", month: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })} · ${x.koncepty?.length || 0} konceptů${x.finalni ? " · ✔ export" : ""}</small>
        <div class="radek" style="gap:6px"><button type="button" class="btn small ghost" data-mt-otevri="${x.id}">Otevřít</button>
        ${x.id !== p.id ? `<button type="button" class="btn small ghost" data-mt-hist-smaz="${x.id}">Smazat</button>` : ""}</div></article>`).join("") || `<p class="muted">Zatím nic.</p>`}</div>
    </div>`;
  for (const box of $$("[data-mt-hist-img]")) {
    if (!box.dataset.mtHistImg) continue;
    try { const img = await U().obrazekImg(box.dataset.mtHistImg); box.innerHTML = `<img src="${img.src}" alt="">`; } catch { /* nic */ }
  }
}

const sekundy = (t) => { const m = /^(\d+):(\d{1,2})$/.exec(String(t || "").trim()); return m ? +m[1] * 60 + +m[2] : null; };
function abTabulka() {
  const nazev = (id) => p.koncepty.find((k) => k.id === id)?.nazev || "(jiná)";
  const radky = [...p.ab].sort((a, b) => (b.ctr ?? -1) - (a.ctr ?? -1));
  const nejDoba = Math.max(...p.ab.map((x) => x.doba || 0));
  return `<div class="st-tabulka"><table><thead><tr><th>Miniatura</th><th>Datum</th><th>Imprese</th><th>CTR</th><th>Zhlédnutí</th><th>Prům. doba</th><th></th></tr></thead>
    <tbody>${radky.map((x) => `<tr><td>${esc(nazev(x.koncept))}</td><td>${esc(x.datum)}</td><td>${x.imprese?.toLocaleString("cs-CZ") ?? "–"}</td>
      <td>${x.ctr != null ? `${x.ctr.toLocaleString("cs-CZ")} %` : "–"}</td><td>${x.zhlednuti?.toLocaleString("cs-CZ") ?? "–"}</td>
      <td>${x.doba ? `${Math.floor(x.doba / 60)}:${String(x.doba % 60).padStart(2, "0")}${x.doba === nejDoba && p.ab.length > 1 ? " 🏆" : ""}` : "–"}</td>
      <td><button type="button" class="ikona" data-mt-ab-smaz="${x.id}">✕</button></td></tr>`).join("")}</tbody></table></div>
    <p class="muted" style="font-size:12.5px">Seřazeno podle CTR; 🏆 = nejdelší průměrná doba sledování. Rozdíly v CTR do ~1 p. b. bývají jen náhoda.</p>`;
}

// ------------------------------------------------------------------ události --

async function otevri(id) {
  const z = id ? await U().nacti("miniatury", id) : null;
  p = z || novyProjekt();
  p.ab = p.ab || []; p.youtube = p.youtube || {};
  aktivni = null; vybranaVrstva = 0;
  krok = z ? (p.koncepty.length ? "koncepty" : "zadani") : "zadani";
  vykresliVse();
}

function init() {
  const el = $("#miniaturyObsah");
  if (!el) return;
  el.addEventListener("click", async (e) => {
    const t = e.target.closest("button, [data-mt-krok]");
    if (!t) return;
    const d = t.dataset;
    if (d.mtKrok) { krok = d.mtKrok; vykresliVse(); return; }
    if (d.mt === "novy") { if (p.koncepty.length || p.vstup.tema) ulozPozdeji(); p = novyProjekt(); krok = "zadani"; aktivni = null; vykresliVse(); return; }
    if (d.mt === "navrhni") return navrhniKoncepty();
    if (d.mt === "hledej") {
      const q = $("#mtHledej").value.trim() || p.vstup.hlavni;
      if (!q) return;
      try {
        const v = await AI().vyberFoto(q);
        if (!v) return;
        const blob = await new Promise((ok) => { const c = document.createElement("canvas"); c.width = v.img.naturalWidth; c.height = v.img.naturalHeight; c.getContext("2d").drawImage(v.img, 0, 0); c.toBlob(ok, "image/jpeg", 0.92); });
        const id = await U().ulozObrazek(blob, { kredit: AI().kredit(v.foto) });
        p.reference.push({ id, typ: "hrac", nazev: v.foto.nazev || q, kredit: AI().kredit(v.foto) });
        ulozPozdeji(); vykresliZadani();
      } catch (er) { zprava(esc(er.message), "chyba"); }
      return;
    }
    if (d.mtRefsmaz !== undefined) { p.reference.splice(+d.mtRefsmaz, 1); ulozPozdeji(); vykresliZadani(); return; }
    if (d.mt === "vse") {
      const ai = p.koncepty.filter((k) => k.rezim !== "foto").length;
      const cena = (AI().OBR_MODELY[AI().obrModel()]?.cena || 0.05) * ai;
      if (ai && !AI().obrZdarma() && !confirm(`Vytvořit pozadí u ${p.koncepty.length} konceptů? ${ai}× AI obrázek ≈ ${cena.toFixed(2)} USD (účtuje Google).`)) return;
      for (let i = 0; i < p.koncepty.length; i++) await vytvorPozadi(i);
      return;
    }
    if (d.mtVytvor !== undefined) {
      const i = +d.mtVytvor, k = p.koncepty[i];
      if (k.rezim !== "foto" && !AI().obrZdarma() && !confirm(`Vygenerovat AI obrázek? ≈ ${(AI().OBR_MODELY[AI().obrModel()]?.cena || 0.05).toLocaleString("cs-CZ")} USD (účtuje Google).`)) return;
      await vytvorPozadi(i);
      if (krok === "editor") vykresliEditor();
      return;
    }
    if (d.mtPrepis !== undefined) return navrhniKoncepty(+d.mtPrepis);
    if (d.mtEdit !== undefined) { aktivni = +d.mtEdit; vybranaVrstva = 0; krok = "editor"; vykresliVse(); return; }
    if (d.mtVar) { const [i, id] = d.mtVar.split(":"); p.koncepty[+i].vybranaVarianta = id; p.koncepty[+i].skore = null; ulozPozdeji(); if (krok === "editor") vykresliEditor(); else vykresliKoncepty(); return; }
    if (d.mtSkore !== undefined) { if (krok !== "editor") { aktivni = +d.mtSkore; krok = "editor"; await vykresliVse(); } t.disabled = true; await ohodnot(+d.mtSkore); t.disabled = false; return; }
    if (d.mtExport) return exportuj(aktivni, d.mtExport);
    if (d.mtVrstva !== undefined) { vybranaVrstva = +d.mtVrstva; vykresliEditor(); return; }
    if (d.mt === "vrstva") {
      const ed = p.koncepty[aktivni].editor;
      const dole = ed.vrstvy.some((v) => v.y > 0.45);
      const hore = ed.vrstvy.some((v) => v.y < 0.35);
      ed.vrstvy.push({ ...vychoziEditor({ texty: ["NOVÝ TEXT"] }).vrstvy[0], y: !hore ? 0.22 : !dole ? 0.82 : 0.5, velikost: 96 });
      vybranaVrstva = ed.vrstvy.length - 1; ulozPozdeji(); vykresliEditor(); return;
    }
    if (d.mt === "vrstva-smaz") { p.koncepty[aktivni].editor.vrstvy.splice(vybranaVrstva, 1); vybranaVrstva = 0; ulozPozdeji(); vykresliEditor(); return; }
    if (d.mt === "ab-pridej") {
      const cislo = (s) => { const n = Number(String($(s).value).replace(/\s/g, "").replace(",", ".")); return $(s).value.trim() && Number.isFinite(n) ? n : null; };
      p.ab.push({ id: U().noveId("ab"), koncept: $("#mtAbKoncept").value, datum: $("#mtAbDatum").value, imprese: cislo("#mtAbImprese"), ctr: cislo("#mtAbCtr"), zhlednuti: cislo("#mtAbZhl"), doba: sekundy($("#mtAbDoba").value) });
      ulozPozdeji(); vykresliHistorii(); return;
    }
    if (d.mtAbSmaz) { p.ab = p.ab.filter((x) => x.id !== d.mtAbSmaz); ulozPozdeji(); vykresliHistorii(); return; }
    if (d.mtOtevri) return otevri(d.mtOtevri);
    if (d.mtHistSmaz) { if (!confirm("Smazat tenhle projekt miniatur?")) return; await U().smaz("miniatury", d.mtHistSmaz); vykresliHistorii(); }
  });
  el.addEventListener("input", (e) => {
    const t = e.target, d = t.dataset;
    if (d.mtV) { p.vstup[d.mtV] = t.value; ulozPozdeji(); return; }
    if (aktivni === null) return;
    const k = p.koncepty[aktivni];
    if (d.mtEd) {
      if (d.mtEd === "zoom") { k.editor.pohled.zoom = +t.value; if (editorImg) G().omezPohled(editorImg, k.editor.pohled, W, H); }
      else k.editor[d.mtEd] = ["vineta", "ztmaveniTextu"].includes(d.mtEd) ? +t.value : t.value;
      k.skore = null; prekresliEditor(); ulozPozdeji(); return;
    }
    if (d.mtVr) {
      const v = k.editor.vrstvy[vybranaVrstva];
      v[d.mtVr] = t.type === "checkbox" ? t.checked : t.type === "range" ? +t.value : t.value;
      k.skore = null; prekresliEditor(); ulozPozdeji();
      if (d.mtVr === "text") { const b = $(`[data-mt-vrstva="${vybranaVrstva}"]`); if (b) b.textContent = v.text.replace(/\*/g, "").slice(0, 18) || "(prázdná)"; }
    }
  });
  el.addEventListener("change", async (e) => {
    const t = e.target, d = t.dataset;
    if (t.id === "mtSoubory") { await pridejReference([...t.files]); return; }
    if (d.mtReftyp !== undefined) { p.reference[+d.mtReftyp].typ = t.value; ulozPozdeji(); return; }
    if (d.mtRezim !== undefined) { p.koncepty[+d.mtRezim].rezim = t.value; ulozPozdeji(); return; }
    if (t.id === "mtKoncept") { aktivni = +t.value; vybranaVrstva = 0; vykresliEditor(); return; }
    if (d.mtEd || d.mtVr) vykresliEditor();
  });
  el.addEventListener("dragover", (e) => { const z = e.target.closest("#mtDrop"); if (z) { e.preventDefault(); z.classList.add("drop"); } });
  el.addEventListener("dragleave", (e) => e.target.closest("#mtDrop")?.classList.remove("drop"));
  el.addEventListener("drop", (e) => { const z = e.target.closest("#mtDrop"); if (!z) return; e.preventDefault(); z.classList.remove("drop"); pridejReference([...e.dataTransfer.files]); });
  document.addEventListener("dh:zalozka", (e) => { if (e.detail === "miniatury" && p) vykresliVse(); });
  const flush = () => { if (ukladaniCasovac) ulozHned(); };
  window.addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flush(); });
  let posledni = null;
  try { posledni = localStorage.getItem("dhpf_thumb_posledni"); } catch { /* nic */ }
  otevri(posledni);
  if (document.fonts) document.fonts.load('100px "Anton"').then(() => { if (krok === "editor") prekresliEditor(); }).catch(() => {});
}

// Pro YouTube Studio: finální miniatury k výběru.
async function finalniMiniatury() {
  const vse = await U().vsechny("miniatury");
  return vse.filter((x) => x.finalni).sort((a, b) => b.finalni.cas - a.finalni.cas)
    .map((x) => ({ projekt: x.id, nazev: x.vstup.titulek || x.vstup.tema, obrazekId: x.finalni.obrazekId, cas: x.finalni.cas, typ: x.finalni.typ }));
}
function predvyplnZVidea({ tema = "", titulek = "", popis = "" } = {}) {
  p = novyProjekt();
  Object.assign(p.vstup, { tema, titulek, popis });
  krok = "zadani";
  ulozPozdeji();
  vykresliVse();
}

window.DHMiniatury = { finalniMiniatury, predvyplnZVidea, get projekt() { return p; } };
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
