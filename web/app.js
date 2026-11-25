// DH Post Fabrika – verze bez AI a bez klíčů. Vše běží jen v prohlížeči.
(() => {
"use strict";

const { SABLONY, SOUTEZE, SPOLECNA_POLE, hashtag, nahodne, veta } = window.DH;
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

// ------------------------------------------------------------- úložiště --

function nacti(klic, vychozi) {
  try {
    const v = localStorage.getItem(klic);
    return v ? JSON.parse(v) : vychozi;
  } catch { return vychozi; }
}
function uloz(klic, hodnota) {
  try { localStorage.setItem(klic, JSON.stringify(hodnota)); } catch { /* soukromé okno apod. */ }
}

const VYCHOZI_NASTAVENI = { barva: "#ab0707", logo: "auto", titulekZap: true, styl: "dh", zvyrazneni: "#ffc000", kategorie: "zajimavosti", cernobila: false };
let nastaveni = { ...VYCHOZI_NASTAVENI, ...nacti("dhpf_nastaveni", {}) };
if (!["auto", "bila", "cerna", "vypnuto"].includes(nastaveni.logo)) nastaveni.logo = "auto";
if (nastaveni.stylVerze !== 3) { nastaveni.styl = "dh"; nastaveni.cernobila = false; nastaveni.stylVerze = 3; } // výchozí je šablona DH postů podle kategorií
let profil = nacti("dhpf_profil", null);
let historie = nacti("dhpf_historie", []);
let typ = "vysledek";
const hodnotyFormulare = {}; // typ -> {pole: hodnota}

const STALE_VYCHOZI = ["#hokej"];
const DOPLNKOVE_VYCHOZI = ["#ceskyhokej", "#hockey", "#icehockey", "#hokejovyfanousek"];
const EMOJI = /(?:\p{Extended_Pictographic}|\p{Regional_Indicator})(?:️|‍(?:\p{Extended_Pictographic}|\p{Regional_Indicator})|\p{Regional_Indicator})*/gu;

// --------------------------------------------------------------- formulář --

function vykresliTypy() {
  $("#typy").innerHTML = Object.entries(SABLONY).map(([k, s]) =>
    `<button type="button" class="chip${k === typ ? " on" : ""}" data-typ="${k}">${s.ikona} ${s.nazev}</button>`).join("");
  $$("#typy .chip").forEach((b) => b.addEventListener("click", () => {
    ulozHodnoty();
    typ = b.dataset.typ;
    vykresliTypy();
    vykresliFormular();
  }));
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function vykresliFormular() {
  const pole = [...SABLONY[typ].pole, ...SPOLECNA_POLE];
  const ulozene = hodnotyFormulare[typ] || {};
  $("#pole").innerHTML = pole.map(([klic, popisek, druh, extra, povinne]) => {
    const id = `f_${klic}`;
    const hodnota = ulozene[klic] ?? "";
    let vstup;
    if (druh === "select" || druh === "soutez") {
      const moznosti = druh === "soutez"
        ? Object.fromEntries(Object.keys(SOUTEZE).map((s) => [s, s]))
        : extra;
      const vybrana = hodnota || (druh === "soutez" ? (typ === "milnik" ? "NHL" : "Extraliga") : Object.keys(moznosti)[0]);
      vstup = `<select id="${id}" name="${klic}">${Object.entries(moznosti).map(([v, l]) =>
        `<option value="${esc(v)}"${v === vybrana ? " selected" : ""}>${esc(l)}</option>`).join("")}</select>`;
    } else if (druh === "textarea") {
      vstup = `<textarea id="${id}" name="${klic}" rows="3" placeholder="${esc(extra)}">${esc(hodnota)}</textarea>`;
    } else {
      vstup = `<input id="${id}" name="${klic}" value="${esc(hodnota)}" placeholder="např. ${esc(extra)}"${povinne ? " required" : ""} autocomplete="off">`;
    }
    return `<label class="${druh === "textarea" ? "cela" : ""}" for="${id}"><span>${esc(popisek)}${povinne ? ' <b class="req">*</b>' : ""}</span>${vstup}</label>`;
  }).join("");
}

function ulozHodnoty() {
  const d = {};
  $$("#pole [name]").forEach((el) => { d[el.name] = el.value; });
  hodnotyFormulare[typ] = d;
  return d;
}

// ---------------------------------------------------------------- tvorba --

function hashtagy(tagy, soutez) {
  if (profil && profil.pocetTagu === 0) return [];
  const stale = profil?.stale?.length ? profil.stale : STALE_VYCHOZI;
  const cil = profil?.pocetTagu || 8;
  const povinne = [...stale, ...(SOUTEZE[soutez] || []), ...tagy.map(hashtag).filter(Boolean)];
  const doplnky = profil?.hashtagy?.length ? profil.hashtagy : DOPLNKOVE_VYCHOZI;
  const vysledek = [];
  const videne = new Set();
  const pridej = (h) => {
    const k = h.toLowerCase();
    if (!videne.has(k)) { videne.add(k); vysledek.push(h); }
  };
  povinne.forEach(pridej);
  for (const h of doplnky) {
    if (vysledek.length >= cil) break;
    pridej(h);
  }
  return vysledek.slice(0, 30);
}

function bezEmoji(s) {
  return s.replace(EMOJI, "").replace(/[ \t]{2,}/g, " ").replace(/^[ \t]+/gm, "").trim();
}

function vytvor() {
  window.DHKoncepty?.zapomen("post");
  const d = ulozHodnoty();
  $$("#pole [name]").forEach((el) => el.classList.remove("chyba"));
  const chybi = $$("#pole [required]").filter((el) => !el.value.trim());
  if (chybi.length) {
    chybi.forEach((el) => el.classList.add("chyba"));
    chybi[0].focus();
    zprava("Vyplň povinná pole označená hvězdičkou.", true);
    return;
  }
  for (const k of Object.keys(d)) d[k] = d[k].trim();

  let r;
  try { r = SABLONY[typ].tvor(d); } catch (e) { zprava(e.message, true); return; }

  const ctaZprofilu = profil?.cta?.length >= 3 && Math.random() < 0.5;
  const cta = ctaZprofilu ? nahodne(profil.cta) : nahodne(r.cta);
  let casti = [r.hook, ...r.telo, veta(d.poznamka), cta];
  if (profil && profil.emojiNaPost < 1) casti = casti.map(bezEmoji);
  const tagy = hashtagy(r.tagy.filter(Boolean), d.soutez);
  const text = [...casti, tagy.join(" ")].filter(Boolean).join("\n\n");

  $("#text").value = text;
  $("#titulek").value = r.titulek;
  prepocitej();
  kresli();
  zprava("");
  $("#vysledek").hidden = false;
  if (window.matchMedia("(max-width: 900px)").matches) $("#vysledek").scrollIntoView({ behavior: "smooth" });

  historie.unshift({ cas: new Date().toISOString(), typ, text, titulek: r.titulek });
  historie = historie.slice(0, 20);
  uloz("dhpf_historie", historie);
  vykresliHistorii();
}

function prepocitej() {
  const text = $("#text").value;
  const znaky = [...text].length;
  const tagy = (text.match(/#[\p{L}\p{N}_]+/gu) || []).length;
  $("#pocty").innerHTML =
    `<span class="${znaky > 2200 ? "spatne" : ""}">${znaky} / 2200 znaků</span>` +
    `<span class="${tagy > 30 ? "spatne" : ""}">${tagy} / 30 hashtagů</span>`;
}

function zprava(text, chyba = false) {
  const el = $("#zprava");
  el.textContent = text;
  el.className = chyba ? "zprava chyba" : "zprava";
  el.hidden = !text;
}

// ---------------------------------------------------------------- obrázek --

const W = 1080, H = 1350;
const platno = $("#platno");
const ctx = platno.getContext("2d");
let foto = null;           // HTMLImageElement
let pohled = { zoom: 1, cx: 0.5, cy: 0.45 };
const PISMO = '"Oswald", "Arial Narrow", Impact, "Helvetica Neue", Arial, sans-serif';

function vyrez() {
  const iw = foto.naturalWidth, ih = foto.naturalHeight;
  const meritko = Math.max(W / iw, H / ih) * pohled.zoom;
  const sw = W / meritko, sh = H / meritko;
  const sx = Math.min(Math.max(pohled.cx * iw - sw / 2, 0), iw - sw);
  const sy = Math.min(Math.max(pohled.cy * ih - sh / 2, 0), ih - sh);
  return { sx, sy, sw, sh, meritko };
}

function zalom(text, maxSirka) {
  const radky = [];
  let aktualni = "";
  for (const slovo of text.split(/[ \t\n]+/).filter(Boolean)) {
    const zkus = aktualni ? `${aktualni} ${slovo}` : slovo;
    if (ctx.measureText(zkus).width <= maxSirka || !aktualni) aktualni = zkus;
    else { radky.push(aktualni); aktualni = slovo; }
  }
  if (aktualni) radky.push(aktualni);
  return radky;
}

function kresli() {
  ctx.clearRect(0, 0, W, H);
  if (foto) {
    const { sx, sy, sw, sh } = vyrez();
    ctx.drawImage(foto, sx, sy, sw, sh, 0, 0, W, H);
  } else {
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, "#4a0a0e");
    g.addColorStop(0.55, "#160607");
    g.addColorStop(1, "#050505");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  const titulek = $("#titulek").value.trim().toUpperCase();
  if (nastaveni.styl === "dh") { kresliDH(titulek); return; }
  if (nastaveni.titulekZap && titulek) {
    if (nastaveni.styl === "obalka") kresliObalku(titulek);
    else if (nastaveni.styl === "klasik") kresliKlasik(titulek);
    else kresliVyroci(titulek);
  }
  window.DHG.kresliLogo(ctx, nastaveni.logo);
}

// Šablona DH postů: kategorie (barva + ikona vpravo nahoře), barevný nádech fotky, velký nadpis kategorie
// a pod ním podtitulek verzálkami s *klíčovými slovy* v barvě kategorie.
// Ikony: iOS emoji z odkazů (em-content.zobj.net) – načítají se přes images.weserv.nl, protože em-content
// nepovoluje CORS a obrázek by pak nešel stáhnout. Záloha: Apple emoji z jsDelivr (64 px), pak Fluent Emoji.
const FLUENT = "https://cdn.jsdelivr.net/gh/microsoft/fluentui-emoji@main/assets/";
const KATEGORIE = {
  zajimavosti: { nazev: "Zajímavosti", barva: "#0f3ccd", ios: "81/electric-light-bulb_1f4a1.png", kod: "1f4a1", ikona: "Light%20bulb/3D/light_bulb_3d.png" },
  rekordy: { nazev: "Rekordy", barva: "#bb0000", ios: "354/books_1f4da.png", kod: "1f4da", ikona: "Books/3D/books_3d.png" },
  hraci: { nazev: "Hráči", barva: "#36c000", ios: "81/busts-in-silhouette_1f465.png", kod: "1f465", ikona: "Busts%20in%20silhouette/3D/busts_in_silhouette_3d.png" },
  historie: { nazev: "Historie", barva: "#ffc000", ios: "118/classical-building_1f3db.png", kod: "1f3db-fe0f", ikona: "Classical%20building/3D/classical_building_3d.png" },
  tymy: { nazev: "Týmy", barva: "#9c00ff", ios: "354/ice-hockey_1f3d2.png", kod: "1f3d2", ikona: "Ice%20hockey/3D/ice_hockey_3d.png" },
};
const zdrojeIkony = (k) => [
  `https://images.weserv.nl/?url=em-content.zobj.net/source/apple/${KATEGORIE[k].ios}`,
  `https://cdn.jsdelivr.net/npm/emoji-datasource-apple@15.1.2/img/apple/64/${KATEGORIE[k].kod}.png`,
  FLUENT + KATEGORIE[k].ikona,
];
const ikonyCache = {};
function ikonaKategorie(k) {
  const vlastni = (() => { try { return localStorage.getItem(`dhpf_ikona_${k}`) || ""; } catch { return ""; } })();
  const zdroje = vlastni ? [vlastni] : zdrojeIkony(k);
  const klic = zdroje[0];
  const z = ikonyCache[k];
  if (z && z.klic === klic) return z.hotovo ? z.img : null;
  const zaznam = { klic, img: new Image(), hotovo: false };
  ikonyCache[k] = zaznam;
  let i = 0;
  const zkus = () => {
    if (i >= zdroje.length) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => { if (ikonyCache[k] !== zaznam) return; zaznam.img = img; zaznam.hotovo = true; kresli(); };
    img.onerror = () => { i++; zkus(); };
    img.src = zdroje[i];
  };
  zkus();
  return null;
}
const hexA = (h, a) => { const n = parseInt(h.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };

function kresliDH(text) {
  const G = window.DHG;
  const kat = KATEGORIE[nastaveni.kategorie] || KATEGORIE.zajimavosti;
  const barva = kat.barva;
  // fotka (černobílá) + barevný nádech zleva shora
  ctx.clearRect(0, 0, W, H);
  if (foto) {
    const { sx, sy, sw, sh } = vyrez();
    ctx.save(); if (nastaveni.cernobila) ctx.filter = "grayscale(1) contrast(1.05)";
    ctx.drawImage(foto, sx, sy, sw, sh, 0, 0, W, H); ctx.restore();
  } else {
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, "#2a2a2a"); g.addColorStop(1, "#050505");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  let g = ctx.createLinearGradient(0, 0, W * 0.78, H * 0.62);
  g.addColorStop(0, hexA(barva, 1)); g.addColorStop(0.45, hexA(barva, 0.55)); g.addColorStop(1, hexA(barva, 0));
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = "source-over";
  g = ctx.createLinearGradient(0, 0, W * 0.7, H * 0.55);
  g.addColorStop(0, hexA(barva, 0.38)); g.addColorStop(1, hexA(barva, 0));
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.restore();

  // nadpis kategorie (Poppins Bold) + pod ním podtitulek (Roboto Medium, verzálky)
  const okraj = 64, sirka = W - 2 * okraj;
  let v = 68, radky = [];
  const vejde = (max) => radky.length <= max && radky.every((r) => G.sirkaRadku(ctx, r) <= sirka);
  // nejdřív zkusit 3 řádky v plné velikosti, teprve pak zmenšovat na 4
  for (const [od, doV, max] of [[68, 54, 3], [56, 42, 4]]) {
    for (v = od; v >= doV; v -= 2) {
      ctx.font = `500 ${v}px ${ROBOTO}`;
      radky = text ? G.zalomBohaty(ctx, text, sirka) : [];
      if (vejde(max)) break;
    }
    if (vejde(max)) break;
  }
  const rozestup = Math.round(v * 1.24);
  const posledni = H - 58;
  const prvni = posledni - Math.max(0, radky.length - 1) * rozestup;
  const vNadpis = 94;
  const yNadpis = radky.length ? prvni - v - 28 : posledni;
  // Ztmavení jako u postů účtu: žádná plná černá plocha. Fotka postupně tmavne od poloviny
  // obrázku, pod nadpisem je ještě znát (cca 75 %) a teprve úplně dole je skoro černá.
  // Jeden spojitý přechod bez plató → není vidět hrana ani „obdélník“.
  const hlavaY = yNadpis - vNadpis * 0.75;             // horní hrana nadpisu
  const odY = Math.max(0, Math.min(hlavaY - 520, H * 0.42));
  const alfa = (y) => {
    if (y <= odY) return 0;
    if (y <= hlavaY) { const t = (y - odY) / (hlavaY - odY); return 0.74 * t * t * (3 - 2 * t); }
    const t = (y - hlavaY) / Math.max(1, H - hlavaY);
    return 0.74 + (0.93 - 0.74) * Math.sqrt(t);
  };
  const zt = ctx.createLinearGradient(0, odY, 0, H);
  for (let i = 0; i <= 40; i++) {
    const y = odY + (H - odY) * (i / 40);
    zt.addColorStop(i / 40, `rgba(0,0,0,${alfa(y).toFixed(3)})`);
  }
  ctx.fillStyle = zt;
  ctx.fillRect(0, odY, W, H - odY);
  ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.55)"; ctx.shadowBlur = 22; ctx.shadowOffsetY = 2;
  if (nastaveni.titulekZap) {
    ctx.font = `700 ${vNadpis}px ${POPPINS}`;
    ctx.fillStyle = "#ffffff";
    ctx.fillText(kat.nazev.toUpperCase(), okraj - 3, yNadpis);
  }
  ctx.font = `500 ${v}px ${ROBOTO}`;
  radky.forEach((r, i) => G.kresliBohatyRadek(ctx, r, okraj, prvni + i * rozestup, barva));
  ctx.restore();

  // ikona vpravo nahoře
  const ik = ikonaKategorie(nastaveni.kategorie in KATEGORIE ? nastaveni.kategorie : "zajimavosti");
  if (ik) { ctx.save(); ctx.shadowColor = "rgba(0,0,0,0.3)"; ctx.shadowBlur = 12; ctx.drawImage(ik, W - 50 - 84, 46, 84, 84); ctx.restore(); }
  window.DHG.kresliLogo(ctx, nastaveni.logo);
}

// Styl „Dnes před lety“: Anton vlevo dole, *slova* v barvě zvýraznění, plynulé ztmavení.
const ANTON = '"Anton", "Impact", "Arial Narrow", sans-serif';
const MONT = '"Montserrat", "Arial Black", Impact, sans-serif';
const POPPINS = '"Poppins", "Montserrat", "Arial Black", sans-serif'; // nadpis kategorie (šablona DH)
const ROBOTO = '"Roboto", "Helvetica Neue", Arial, sans-serif';    // podtitulek (šablona DH)
function kresliVyroci(titulek) {
  const G = window.DHG;
  const sirka = W - 2 * 40 - 20;
  let v = 118, radky = [];
  for (; v >= 52; v -= 2) {
    ctx.font = `400 ${v}px ${ANTON}`;
    ctx.letterSpacing = `${(0.02 * v).toFixed(1)}px`;
    radky = G.zalomBohaty(ctx, titulek, sirka);
    if (radky.length <= 3 && radky.every((r) => G.sirkaRadku(ctx, r) <= sirka)) break;
  }
  const rozestup = Math.round(v * 1.1);
  const posledni = H - 110;
  const prvni = posledni - (radky.length - 1) * rozestup;
  const horni = prvni - v * 0.86;
  G.ztmaveni(ctx, horni - 520, horni + 200, W, H);
  ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  ctx.font = `400 ${v}px ${ANTON}`;
  ctx.letterSpacing = `${(0.02 * v).toFixed(1)}px`;
  ctx.shadowColor = "rgba(0,0,0,0.35)"; ctx.shadowBlur = 10;
  radky.forEach((r, i) => G.kresliBohatyRadek(ctx, r, 40, prvni + i * rozestup, nastaveni.zvyrazneni));
  ctx.shadowBlur = 0; ctx.letterSpacing = "0px";
}

// Styl „Obálka carouselu“: dva řádky na střed – horní v barvě (velký), dolní bílý.
function kresliObalku(titulek) {
  const G = window.DHG;
  let [horni, dolni] = titulek.includes("/") || titulek.includes("\n") ? titulek.split(/\s*[/\n]\s*/) : [titulek, ""];
  if (!dolni) {
    const slova = horni.split(/\s+/);
    if (slova.length > 1) { const pul = Math.ceil(slova.length / 2); horni = slova.slice(0, pul).join(" "); dolni = slova.slice(pul).join(" "); }
  }
  const sirka = W - 120;
  const velikost = (t) => { let v = 170; for (; v > 40; v -= 4) { ctx.font = `900 ${v}px ${MONT}`; if (ctx.measureText(t.replace(/\*/g, "")).width <= sirka) break; } return v; };
  const vD = dolni ? velikost(dolni) : 0, vH = horni ? velikost(horni) : 0;
  const yD = H - 100, yH = dolni ? yD - vD * 0.72 - 75 : H - 110;
  G.ztmaveni(ctx, (horni ? yH - vH * 0.72 : yD - vD * 0.72) - 600, (horni ? yH - vH * 0.72 : yD) + 150, W, H);
  ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  const radek = (t, v, y, barva) => {
    ctx.font = `900 ${v}px ${MONT}`;
    const r = G.zalomBohaty(ctx, t, 99999)[0] || [];
    G.kresliBohatyRadek(ctx, r, (W - G.sirkaRadku(ctx, r)) / 2, y, nastaveni.zvyrazneni, barva);
  };
  if (horni) radek(horni, vH, yH, nastaveni.barva);
  if (dolni) radek(dolni, vD, yD, "#ffffff");
}

// Původní styl (Oswald s proužkem) – zůstává jako volba.
function kresliKlasik(titulek) {
  titulek = titulek.replace(/\*/g, "");
  const okraj = 72;
  if (foto) {
    const g = ctx.createLinearGradient(0, H * 0.42, 0, H);
    g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(0.55, "rgba(0,0,0,0.62)"); g.addColorStop(1, "rgba(0,0,0,0.9)");
    ctx.fillStyle = g; ctx.fillRect(0, H * 0.42, W, H * 0.58);
  }
  let velikost = foto ? 104 : 132, radky;
  const maxRadku = foto ? 4 : 6;
  for (;;) {
    ctx.font = `700 ${velikost}px ${PISMO}`;
    radky = zalom(titulek, W - 2 * okraj);
    if ((radky.length <= maxRadku && radky.every((r) => ctx.measureText(r).width <= W - 2 * okraj)) || velikost <= 48) break;
    velikost -= 4;
  }
  const vyskaRadku = Math.round(velikost * 1.08);
  let y = H - 92 - vyskaRadku * (radky.length - 1);
  ctx.fillStyle = nastaveni.barva;
  ctx.fillRect(okraj, y - velikost - 34, 120, 12);
  ctx.fillStyle = "#fff"; ctx.textBaseline = "alphabetic";
  ctx.shadowColor = "rgba(0,0,0,0.35)"; ctx.shadowBlur = 12;
  for (const r of radky) { ctx.fillText(r, okraj, y); y += vyskaRadku; }
  ctx.shadowBlur = 0;
}

function vykresliKategorie() {
  const dh = nastaveni.styl === "dh";
  $$(".jen-dh").forEach((el) => { el.hidden = !dh; });
  $$(".mimo-dh").forEach((el) => { el.hidden = dh; });
  const vlastni = (() => { try { return !!localStorage.getItem(`dhpf_ikona_${nastaveni.kategorie}`); } catch { return false; } })();
  const b = $("#ikonaReset"); if (b) b.hidden = !vlastni;
}

function pouzijFoto(img) {
  foto = img;
  pohled = { zoom: 1, cx: 0.5, cy: 0.4 };
  $("#zoom").value = 1;
  $("#fotoOvl").hidden = false;
  $("#fotoMalo").hidden = Math.min(img.naturalWidth / W, img.naturalHeight / H) >= 0.75;
  kresli();
}

function nactiFoto(soubor) {
  if (!soubor || !soubor.type.startsWith("image/")) { zprava("Tohle není obrázek.", true); return; }
  const img = new Image();
  img.onload = () => { pouzijFoto(img); nastavKredit(""); };
  img.onerror = () => zprava("Obrázek se nepodařilo načíst.", true);
  img.src = URL.createObjectURL(soubor);
}

// Řádek „📸 Foto: autor / Wikimedia Commons, licence“ v textu postu.
function nastavKredit(novy) { nastavRadek("📸 Foto:", novy); }

// Odstavec začínající `prefix` (kredit fotky, zdroje) těsně před hashtagy.
function nastavRadek(prefix, novy) {
  const el = $("#text");
  let odstavce = el.value.split(/\n{2,}/).filter((o) => !o.startsWith(prefix));
  if (novy) {
    const i = odstavce.length && odstavce[odstavce.length - 1].trim().startsWith("#") ? odstavce.length - 1 : odstavce.length;
    odstavce.splice(i, 0, novy);
  }
  el.value = odstavce.join("\n\n");
  prepocitej();
}

// ------------------------------------------------------------------- AI --

const SCHEMA_POST = {
  type: "object",
  properties: {
    hook: { type: "string", description: "úvod (první odstavec): podmět a tečka, pak jedna definující věta – např. „IIHF. Organizace, bez které…“; nikdy nezačíná číslem, datem, otázkou ani emoji" },
    dalsi_hooky: { type: "array", items: { type: "string" }, description: "3 další varianty úvodu, každá z jiného úhlu (stejný tvar: podmět. definující věta)" },
    telo: { type: "string", description: "2–4 odstavce (1–3 věty) oddělené prázdným řádkem: souvislosti, fakta ve větách, vysvětlení v závorkách, závěr s významem; bez otázky a bez emoji; celkem cca 300–700 znaků" },
    cta: { type: "string", description: "vždy prázdný řetězec – popisky účtu nekončí otázkou ani výzvou" },
    hashtagy: { type: "array", items: { type: "string" }, description: "4–6 hashtagů malými písmeny bez diakritiky (#hokej, druh, konkrétní téma)" },
    titulek: { type: "string", description: "podtitulek do obrázku (pod velký nadpis kategorie): 1–2 krátké věty, celkem 8–16 slov (např. „Ten, kdo přinesl trend zahnuté čepele od Mikity do Evropy.“), bez emoji, neopakuje hook doslova; 2–4 klíčová slova dej do *hvězdiček* (zvýrazní se barvou kategorie)" },
    kategorie: { type: "string", enum: ["zajimavosti", "rekordy", "hraci", "historie", "tymy"], description: "kategorie postu: zajímavosti, rekordy, hráči, historie, týmy" },
    foto_dotazy: { type: "array", items: { type: "string" }, description: "2–3 dotazy pro Wikimedia Commons" },
    k_overeni: { type: "array", items: { type: "string" } },
  },
  required: ["hook", "dalsi_hooky", "telo", "cta", "hashtagy", "titulek", "kategorie", "foto_dotazy", "k_overeni"],
};
let fotoDotazy = [];
let zdrojeNavrhu = []; // zdroje z hledání (záložka Témata)

function aiZprava(text, druh = "") {
  const el = $("#aiZprava");
  el.innerHTML = text;
  el.className = "zprava " + druh;
  el.hidden = !text;
}

// Návrh postu od AI (bez UI) – používá ho editor i „🎲 Překvap mě“ (hotové nápady na pozadí).
async function vytvorNavrhPostu(zadani) {
  const AI = window.DHAI;
  const r = await AI.gemini({
    system: `Jsi redaktor Instagram účtu @denik_hokeje (český hokej). Píšeš vyprávěcí popisky jako hokejový dokument – znalé, věcné a čtivé.\n\n${AI.COPY}\n\n${AI.stylDoPromptu()}\n\n${AI.PRAVIDLA}\n- Dnešní datum: ${AI.dnes()}.`,
    zadani: `ZADÁNÍ OD REDAKTORA:\n${zadani}\n\nNapiš nový příspěvek.`,
    schema: SCHEMA_POST,
  });
  // Úvod nesmí začínat číslem, datem, otázkou ani otřepanou frází – vezmi lepší variantu.
  if (AI.spatnyZacatek(r.hook)) {
    const lepsi = (r.dalsi_hooky || []).find((h) => h && !AI.spatnyZacatek(h));
    if (lepsi) { r.dalsi_hooky = [r.hook, ...(r.dalsi_hooky || []).filter((h) => h !== lepsi)]; r.hook = lepsi; }
  }
  r.cta = ""; // nový styl: bez otázky na konci
  return r;
}
let hotovyNavrh = null; // už napsaný návrh (z hotových nápadů) – editor ho jen převezme

async function navrhniPost() {
  window.DHKoncepty?.zapomen("post");
  const zadani = $("#aiZadani").value.trim();
  if (!zadani) { aiZprava("Napiš, o čem má post být.", "chyba"); $("#aiZadani").focus(); return; }
  if (!window.DHAI.maKlic()) {
    aiZprava('AI pomocník potřebuje AI klíč (Claude nebo Gemini). <a href="#" data-jdi-na-ai>Nastavit klíč</a>', "chyba");
    return;
  }
  const b = $("#aiNavrhni");
  b.disabled = true;
  b.textContent = "Píšu…";
  aiZprava("AI píše text… (obvykle 5–15 s)");
  try {
    const AI = window.DHAI;
    const r = hotovyNavrh || await vytvorNavrhPostu(zadani);
    hotovyNavrh = null;
    const tagy = window.DHAI.cisteHashtagy(r.hashtagy);
    const zdrojeRadek = zdrojeNavrhu.length ? `ℹ️ Zdroj: ${zdrojeNavrhu.map((z) => z.titulek).join(", ")}` : "";
    $("#text").value = [r.hook, r.telo, r.cta, zdrojeRadek, tagy.join(" ")].map((x) => (x || "").trim()).filter(Boolean).join("\n\n");
    $("#titulek").value = r.titulek || "";
    if (KATEGORIE[r.kategorie]) { nastaveni.kategorie = r.kategorie; uloz("dhpf_nastaveni", nastaveni); $("#kategoriePostu").value = r.kategorie; vykresliKategorie(); }
    AI.nabidniHooky("#text", [r.hook, ...(r.dalsi_hooky || [])]);
    fotoDotazy = r.foto_dotazy || [];
    prepocitej();
    kresli();
    $("#vysledek").hidden = false;
    historie.unshift({ cas: new Date().toISOString(), typ: "ai", text: $("#text").value, titulek: $("#titulek").value });
    historie = historie.slice(0, 20);
    uloz("dhpf_historie", historie);
    vykresliHistorii();

    const overit = (r.k_overeni || []).filter(Boolean);
    const seznam = overit.length ? `<br><b>Před zveřejněním ověř:</b><ul>${overit.map((o) => `<li>${esc(o)}</li>`).join("")}</ul>` : "";
    aiZprava(`Text je hotový, hledám fotku…${seznam}`, overit.length ? "varovani" : "ok");
    const nalez = await AI.prvniFoto(fotoDotazy);
    if (nalez) {
      pouzijFoto(nalez.img);
      nastavKredit(AI.kredit(nalez.foto));
      aiZprava(`Hotovo ✓ Fotka je volně použitelná, autor a licence jsou v textu. Nesedí? Klikni na <b>🔍 Najít jinou fotku</b>.${seznam}`, overit.length ? "varovani" : "ok");
    } else {
      aiZprava(`Text je hotový. Vhodnou volnou fotku jsem nenašel – nahraj vlastní, nebo zkus <b>🔍 Najít jinou fotku</b>.${seznam}`, "varovani");
    }
    if (window.matchMedia("(max-width: 900px)").matches) $("#vysledek").scrollIntoView({ behavior: "smooth" });
  } catch (e) {
    aiZprava(esc(e.message), "chyba");
  } finally {
    b.disabled = false;
    b.textContent = "✨ Navrhnout post";
  }
}

async function jinaFoto() {
  const vychozi = fotoDotazy[0] || $("#titulek").value;
  const v = await window.DHAI.vyberFoto(vychozi);
  if (!v) return;
  pouzijFoto(v.img);
  nastavKredit(window.DHAI.kredit(v.foto));
}

function nastavTahani() {
  let start = null;
  platno.addEventListener("pointerdown", (e) => {
    if (!foto) return;
    start = { x: e.clientX, y: e.clientY, cx: pohled.cx, cy: pohled.cy };
    platno.setPointerCapture(e.pointerId);
  });
  platno.addEventListener("pointermove", (e) => {
    if (!start) return;
    const naPlatno = W / platno.getBoundingClientRect().width;
    const { meritko } = vyrez();
    pohled.cx = start.cx - ((e.clientX - start.x) * naPlatno) / meritko / foto.naturalWidth;
    pohled.cy = start.cy - ((e.clientY - start.y) * naPlatno) / meritko / foto.naturalHeight;
    omezPohled();
    kresli();
  });
  const konec = () => { start = null; };
  platno.addEventListener("pointerup", konec);
  platno.addEventListener("pointercancel", konec);
}

function omezPohled() {
  if (!foto) return;
  const { sw, sh } = vyrez();
  const iw = foto.naturalWidth, ih = foto.naturalHeight;
  pohled.cx = Math.min(Math.max(pohled.cx, sw / 2 / iw), 1 - sw / 2 / iw);
  pohled.cy = Math.min(Math.max(pohled.cy, sh / 2 / ih), 1 - sh / 2 / ih);
}

function stahni() {
  kresli();
  const nazev = ($("#titulek").value || "post").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "post";
  platno.toBlob((blob) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `denik-hokeje-${nazev}.jpg`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }, "image/jpeg", 0.92);
}

async function kopiruj() {
  const text = $("#text").value;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    $("#text").select();
    document.execCommand("copy");
  }
  const b = $("#kopiruj");
  b.textContent = "Zkopírováno ✓";
  setTimeout(() => { b.textContent = "Kopírovat text"; }, 1600);
}

// ------------------------------------------------------------- můj styl --

function opravKodovani(s) {
  // Instagram export ukládá češtinu jako UTF-8 bajty v latin-1 („Ä\u008d“ místo „č“).
  if (!/[Â-ô][\u0080-¿]/.test(s)) return s;
  try { return decodeURIComponent(escape(s)); } catch { return s; }
}

function textyZJsonu(data) {
  const out = [];
  (function projdi(x) {
    if (Array.isArray(x)) x.forEach(projdi);
    else if (x && typeof x === "object") {
      for (const [k, v] of Object.entries(x)) {
        if (k === "title" && typeof v === "string") out.push(v);
        else projdi(v);
      }
    }
  })(data);
  return out;
}

const rozdelText = (s) => s.split(/^\s*---\s*$/m);

async function nactiPrispevky() {
  let texty = rozdelText($("#stylText").value);
  for (const f of $("#stylSoubory").files) {
    const obsah = await f.text();
    if (f.name.toLowerCase().endsWith(".json")) {
      try { texty = texty.concat(textyZJsonu(JSON.parse(obsah))); } catch { throw new Error(`Soubor ${f.name} není platný JSON.`); }
    } else texty = texty.concat(rozdelText(obsah));
  }
  const videne = new Set();
  return texty.map((s) => opravKodovani(s).trim())
    .filter((s) => s.length >= 25 && !videne.has(s) && videne.add(s));
}

function analyzuj(posty) {
  const n = posty.length;
  const vyskyt = new Map(), emoji = new Map(), cta = new Map();
  const poctyTagu = [];
  let emojiCelkem = 0, znaku = 0;
  for (const p of posty) {
    const tagy = [...new Set((p.match(/#[\p{L}\p{N}_]+/gu) || []).map((h) => h.toLowerCase()))];
    poctyTagu.push(tagy.length);
    tagy.forEach((h) => vyskyt.set(h, (vyskyt.get(h) || 0) + 1));
    const em = p.match(EMOJI) || [];
    emojiCelkem += em.length;
    em.forEach((e) => emoji.set(e, (emoji.get(e) || 0) + 1));
    znaku += [...p].length;

    const bezTagu = p.split("\n").filter((r) => !/^\s*(#[\p{L}\p{N}_]+\s*)+$/u.test(r)).join("\n").trim();
    const odstavce = bezTagu.split(/\n\s*\n/);
    const posledni = (odstavce[odstavce.length - 1] || "").trim();
    const vety = posledni.split(/(?<=[.!?…])\s+(?=\p{L})/u);
    const kandidat = (vety[vety.length - 1] || "").replace(/#[\p{L}\p{N}_]+/gu, "").trim();
    const obecna = !/\s[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ]/.test(kandidat) && !/\d/.test(kandidat);
    if (kandidat.length >= 8 && kandidat.length <= 90 && obecna && (/\?/.test(kandidat) || /👇/.test(kandidat))) {
      cta.set(kandidat, (cta.get(kandidat) || 0) + 1);
    }
  }
  const serazene = (m) => [...m.entries()].sort((a, b) => b[1] - a[1]);
  poctyTagu.sort((a, b) => a - b);
  const median = poctyTagu[Math.floor(n / 2)];
  return {
    pocet: n,
    stale: serazene(vyskyt).filter(([, c]) => c >= n * 0.5).slice(0, 6).map(([h]) => h),
    hashtagy: serazene(vyskyt).slice(0, 30).map(([h]) => h),
    pocetTagu: Math.min(30, median),
    emojiNaPost: Math.round((emojiCelkem / n) * 10) / 10,
    emoji: serazene(emoji).slice(0, 10).map(([e]) => e),
    cta: serazene(cta).slice(0, 15).map(([c]) => c),
    prumerZnaku: Math.round(znaku / n),
    cas: new Date().toISOString(),
  };
}

async function naucStyl() {
  try {
    const posty = await nactiPrispevky();
    if (posty.length < 3) throw new Error(`Našel jsem jen ${posty.length} příspěvků – potřebuju aspoň 3 (ideálně 20 a víc).`);
    profil = analyzuj(posty);
    uloz("dhpf_profil", profil);
    vykresliProfil();
    zpravaStyl(`Hotovo – naučeno z ${profil.pocet} příspěvků. Od teď je použiju při tvorbě postů.`);
  } catch (e) {
    zpravaStyl(e.message, true);
  }
}

function zpravaStyl(text, chyba = false) {
  const el = $("#stylZprava");
  el.textContent = text;
  el.className = chyba ? "zprava chyba" : "zprava ok";
  el.hidden = !text;
}

function vykresliProfil() {
  const el = $("#profil");
  $("#pStyl").textContent = profil ? `Styl: naučený (${profil.pocet} postů)` : "Styl: výchozí";
  $("#pStyl").className = "pill " + (profil ? "ok" : "warn");
  if (!profil) {
    el.innerHTML = `<p class="muted">Zatím se používá výchozí styl: hashtagy ${STALE_VYCHOZI.join(" ")} + druh a konkrétní téma, vyprávěcí popisky bez emoji a bez otázky na konci.</p>`;
    return;
  }
  el.innerHTML = `
    <dl>
      <dt>Analyzováno</dt><dd>${profil.pocet} příspěvků, průměrně ${profil.prumerZnaku} znaků</dd>
      <dt>Hashtagy v každém postu</dt><dd>${esc(profil.stale.join(" ") || "žádné stálé")}</dd>
      <dt>Počet hashtagů</dt><dd>obvykle ${profil.pocetTagu}</dd>
      <dt>Nejčastější hashtagy</dt><dd>${esc(profil.hashtagy.slice(0, 15).join(" ") || "–")}</dd>
      <dt>Emoji</dt><dd>${profil.emojiNaPost} na post ${profil.emoji.length ? "· " + esc(profil.emoji.join(" ")) : ""}${profil.emojiNaPost < 1 ? " → posty budou bez emoji" : ""}</dd>
      <dt>Tvoje výzvy na konci</dt><dd>${profil.cta.length ? profil.cta.map((c) => `„${esc(c)}“`).join("<br>") : "nenašel jsem obecné otázky na konci postů"}</dd>
    </dl>
    <button type="button" class="btn ghost small" id="smazStyl">Zapomenout styl</button>`;
  $("#smazStyl").addEventListener("click", () => {
    profil = null;
    try { localStorage.removeItem("dhpf_profil"); } catch { /* nic */ }
    vykresliProfil();
    zpravaStyl("");
  });
}

// --------------------------------------------------------------- historie --

function vykresliHistorii() {
  const el = $("#historie");
  if (!historie.length) { el.innerHTML = '<p class="muted">Zatím nic.</p>'; return; }
  el.innerHTML = historie.map((h, i) => {
    const s = SABLONY[h.typ];
    const datum = new Date(h.cas).toLocaleString("cs-CZ", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });
    return `<button type="button" class="hist" data-i="${i}"><span>${s ? s.ikona : h.typ === "ai" ? "✨" : "📝"} ${esc(h.titulek)}</span><small>${datum}</small></button>`;
  }).join("");
  $$("#historie .hist").forEach((b) => b.addEventListener("click", () => {
    const h = historie[Number(b.dataset.i)];
    $("#text").value = h.text;
    $("#titulek").value = h.titulek;
    $("#vysledek").hidden = false;
    prepocitej();
    kresli();
    $("#vysledek").scrollIntoView({ behavior: "smooth" });
  }));
}

// ------------------------------------------------------------------ start --

function prepniZalozku(kam) {
  $$(".tab").forEach((b) => b.classList.toggle("on", b.dataset.tab === kam));
  $$("[data-zalozka]").forEach((s) => { s.hidden = s.dataset.zalozka !== kam; });
  try { localStorage.setItem("dhpf_zalozka", kam); } catch { /* nic */ }
  document.dispatchEvent(new CustomEvent("dh:zalozka", { detail: kam }));
}

// Koncepty: uložení a obnovení rozpracovaného postu.
window.DHKoncepty?.registruj("post", {
  async ziskej() {
    ulozHodnoty();
    kresli();
    const text = $("#text").value;
    return {
      nazev: $("#titulek").value.trim() || text.split("\n")[0].trim() || "Post",
      data: { typ, hodnoty: hodnotyFormulare, text, titulek: $("#titulek").value, pohled,
        nastaveni: { barva: nastaveni.barva, logo: nastaveni.logo, titulekZap: nastaveni.titulekZap, styl: nastaveni.styl, zvyrazneni: nastaveni.zvyrazneni, kategorie: nastaveni.kategorie, cernobila: nastaveni.cernobila } },
      obrazky: { foto },
      platno,
    };
  },
  async obnov(d, obrazky) {
    typ = d.typ || "vysledek";
    Object.keys(hodnotyFormulare).forEach((k) => delete hodnotyFormulare[k]);
    Object.assign(hodnotyFormulare, d.hodnoty || {});
    vykresliTypy();
    vykresliFormular();
    $("#text").value = d.text || "";
    $("#titulek").value = d.titulek || "";
    Object.assign(nastaveni, d.nastaveni || {});
    $("#barva").value = nastaveni.barva;
    $("#logo").value = nastaveni.logo;
    $("#titulekZap").checked = nastaveni.titulekZap;
    $("#stylPostu").value = nastaveni.styl || "dh";
    $("#kategoriePostu").value = nastaveni.kategorie || "zajimavosti";
    $("#cernobilaPostu").checked = nastaveni.cernobila !== false;
    vykresliKategorie();
    $("#zvyrazneniPostu").value = nastaveni.zvyrazneni || "#ffc000";
    if (obrazky.foto) { pouzijFoto(obrazky.foto); pohled = d.pohled || pohled; $("#zoom").value = pohled.zoom; }
    else { foto = null; $("#fotoOvl").hidden = true; $("#fotoMalo").hidden = true; }
    $("#vysledek").hidden = false;
    prepocitej();
    kresli();
  },
});

window.DHPost = {
  prepniZalozku: (kam) => prepniZalozku(kam),
  navrhni(zadani, zdroje = []) {
    prepniZalozku("post");
    $("#aiZadani").value = zadani;
    zdrojeNavrhu = zdroje;
    window.scrollTo({ top: 0, behavior: "smooth" });
    navrhniPost();
  },
  vytvorNavrh: vytvorNavrhPostu,
  // otevře už hotový návrh (bez dalšího volání AI) – text, titulek do obrázku, kategorie a fotka
  otevriHotovy(r, zadani, zdroje = []) {
    hotovyNavrh = JSON.parse(JSON.stringify(r));
    window.DHPost.navrhni(zadani, zdroje);
  },
};

function init() {
  vykresliTypy();
  vykresliFormular();
  vykresliProfil();
  vykresliHistorii();

  $$(".tab").forEach((b) => b.addEventListener("click", () => prepniZalozku(b.dataset.tab)));
  $("#formular").addEventListener("submit", (e) => { e.preventDefault(); vytvor(); });
  $("#varianta").addEventListener("click", vytvor);
  $("#text").addEventListener("input", prepocitej);
  $("#titulek").addEventListener("input", kresli);
  $("#kopiruj").addEventListener("click", kopiruj);
  $("#stahni").addEventListener("click", stahni);
  $("#foto").addEventListener("change", (e) => nactiFoto(e.target.files[0]));
  $("#aiNavrhni").addEventListener("click", navrhniPost);
  $("#aiZadani").addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) navrhniPost(); });
  $("#aiZadani").addEventListener("input", () => { zdrojeNavrhu = []; });
  $("#webFoto").addEventListener("click", jinaFoto);
  $("#odeberFoto").addEventListener("click", () => {
    foto = null; $("#foto").value = ""; $("#fotoOvl").hidden = true; $("#fotoMalo").hidden = true; nastavKredit(""); kresli();
  });
  $("#zoom").addEventListener("input", (e) => { pohled.zoom = Number(e.target.value); omezPohled(); kresli(); });

  const nastav = (id, klic, vlastnost = "value") => {
    const el = $(id);
    el[vlastnost] = nastaveni[klic];
    el.addEventListener("input", () => { nastaveni[klic] = el[vlastnost]; uloz("dhpf_nastaveni", nastaveni); kresli(); });
  };
  nastav("#barva", "barva");
  nastav("#logo", "logo");
  nastav("#titulekZap", "titulekZap", "checked");
  nastav("#stylPostu", "styl");
  nastav("#kategoriePostu", "kategorie");
  nastav("#cernobilaPostu", "cernobila", "checked");
  $("#stylPostu").addEventListener("input", vykresliKategorie);
  $("#kategoriePostu").addEventListener("input", vykresliKategorie);
  $("#ikonaPostu").addEventListener("change", (e) => {
    const f = e.target.files[0]; e.target.value = "";
    if (!f) return;
    const r = new FileReader();
    r.onload = () => { try { localStorage.setItem(`dhpf_ikona_${nastaveni.kategorie}`, r.result); } catch { zprava("Ikona je moc velká na uložení.", true); return; } kresli(); vykresliKategorie(); };
    r.readAsDataURL(f);
  });
  $("#ikonaReset").addEventListener("click", () => { try { localStorage.removeItem(`dhpf_ikona_${nastaveni.kategorie}`); } catch { /* nic */ } kresli(); vykresliKategorie(); });
  vykresliKategorie();
  nastav("#zvyrazneniPostu", "zvyrazneni");

  $("#naucit").addEventListener("click", naucStyl);
  $("#smazHistorii").addEventListener("click", () => { historie = []; uloz("dhpf_historie", historie); vykresliHistorii(); });

  // Fotku jde do stránky i přetáhnout.
  const cil = $("#nahled");
  cil.addEventListener("dragover", (e) => { e.preventDefault(); cil.classList.add("drop"); });
  cil.addEventListener("dragleave", () => cil.classList.remove("drop"));
  cil.addEventListener("drop", (e) => { e.preventDefault(); cil.classList.remove("drop"); nactiFoto(e.dataTransfer.files[0]); });

  nastavTahani();
  kresli();
  if (document.fonts) Promise.all([document.fonts.load(`400 80px Anton`), document.fonts.load(`900 80px Montserrat`), document.fonts.load(`700 80px Poppins`), document.fonts.load(`500 60px Roboto`), document.fonts.load(`700 80px Oswald`)]).then(kresli).catch(() => {});
}

init();
})();
