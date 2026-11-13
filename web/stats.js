// Statistiky Instagramu: oficiální Instagram API (token) nebo import exportu z Meta Business Suite (CSV).
// Data i token zůstávají jen v tomhle prohlížeči. Grafy jsou čisté SVG.
(() => {
"use strict";

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const toast = (t, d) => window.DHToast?.(t, d);

const KLIC_TOKEN = "dhpf_ig_token";
const KLIC_DATA = "dhpf_ig_data";
const VERZE = "v27.0";
const MAX_POSTU = 100;      // kolik posledních příspěvků načíst
const MAX_INSIGHTS = 60;    // u kolika z nich stahovat dosah/uložení/sdílení

// Identitní barvy formátů (ověřené pro tmavý podklad: světlost, odstup i pro barvoslepé).
const FORMATY = {
  post: { nazev: "Post", barva: "#e01e26" },
  carousel: { nazev: "Carousel", barva: "#c98500" },
  reels: { nazev: "Reel", barva: "#9085e9" },
};
const DNY = ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"];
const OKNA = [[6, 9], [9, 12], [12, 15], [15, 18], [18, 21], [21, 24]];
const OBDOBI = { 30: "30 dní", 90: "90 dní", 365: "rok", 0: "vše" };

let data = nactiData();
let obdobi = 90;
let tabulka = false;
let razeni = { klic: "datum", smer: -1 };
let aiVysledek = null;

// --------------------------------------------------------------- formáty čísel --

const cislo = (n) => (n == null || Number.isNaN(n) ? "–" : Math.round(n).toLocaleString("cs-CZ"));
const kratce = (n) => {
  if (n == null || Number.isNaN(n)) return "–";
  const a = Math.abs(n);
  if (a >= 1e6) return `${(n / 1e6).toLocaleString("cs-CZ", { maximumFractionDigits: 1 })} mil.`;
  if (a >= 1e4) return `${Math.round(n / 1e3).toLocaleString("cs-CZ")} tis.`;
  if (a >= 1e3) return `${(n / 1e3).toLocaleString("cs-CZ", { maximumFractionDigits: 1 })} tis.`;
  return Math.round(n).toLocaleString("cs-CZ");
};
const procenta = (x) => (x == null || Number.isNaN(x) ? "–" : `${(x * 100).toLocaleString("cs-CZ", { maximumFractionDigits: 1 })} %`);
const datumKratce = (d) => d.toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric" });
const prvniRadek = (t) => String(t || "").split("\n").map((x) => x.trim()).find(Boolean) || "(bez popisku)";

// ----------------------------------------------------------------- úložiště --

function nactiData() {
  try { const d = JSON.parse(localStorage.getItem(KLIC_DATA) || "null"); return d?.posty ? d : null; } catch { return null; }
}
function ulozData(d) {
  data = d;
  try { localStorage.setItem(KLIC_DATA, JSON.stringify(d)); } catch { /* plné úložiště – data zůstanou jen do zavření */ }
  document.dispatchEvent(new CustomEvent("dh:statistiky"));
}
const token = () => { try { return (localStorage.getItem(KLIC_TOKEN) || "").trim(); } catch { return ""; } };

// Jednotný tvar příspěvku.
function normalizuj(p) {
  const likes = num(p.likes), komentare = num(p.komentare), ulozeni = num(p.ulozeni), sdileni = num(p.sdileni);
  const soucet = [likes, komentare, ulozeni, sdileni].filter((x) => x != null).reduce((a, b) => a + b, 0);
  const interakce = num(p.interakce) ?? (soucet || null);
  const dosah = num(p.dosah);
  return {
    id: String(p.id || `${p.datum}-${Math.random().toString(36).slice(2, 7)}`),
    datum: new Date(p.datum).toISOString(),
    typ: FORMATY[p.typ] ? p.typ : "post",
    popisek: String(p.popisek || ""),
    odkaz: p.odkaz || "",
    nahled: p.nahled || "",
    dosah, zobrazeni: num(p.zobrazeni), likes, komentare, ulozeni, sdileni, interakce,
    mira: dosah && interakce != null ? interakce / dosah : null,
  };
}
function num(x) {
  if (x == null || x === "") return null;
  const n = typeof x === "number" ? x : Number(String(x).replace(/\s| /g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

// ------------------------------------------------------------- Instagram API --

async function api(host, cesta, params = {}) {
  const u = new URL(`https://${host}/${VERZE}/${cesta.replace(/^\//, "")}`);
  Object.entries({ ...params, access_token: token() }).forEach(([k, v]) => u.searchParams.set(k, v));
  let r;
  try { r = await fetch(u); } catch { throw new Error("Instagram API je nedostupné (síť). Zkus to znovu."); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) {
    const e = j.error || {};
    if (e.code === 190) throw new Error("Token je neplatný nebo vypršel – vygeneruj nový (Statistiky → Připojení).");
    if (e.code === 10 || e.code === 200) throw new Error(`Token nemá potřebná oprávnění (${e.message || "permissions"}). Přidej instagram_business_basic + instagram_business_manage_insights.`);
    if (e.code === 4 || e.code === 17 || e.code === 32) throw new Error("Instagram API: dočasný limit požadavků, zkus to za chvíli.");
    const chyba = new Error(e.message || `Instagram API chyba ${r.status}`);
    chyba.kod = e.code;
    throw chyba;
  }
  return j;
}

// Instagram token (IG…) platí 60 dní; jde prodloužit bez app secretu → připojení vydrží napořád.
const KLIC_PRODLOUZENO = "dhpf_ig_token_prodlouzen";
async function prodlouzToken() {
  const t = token();
  if (!/^IG/.test(t)) return;
  let posledne = 0;
  try { posledne = +localStorage.getItem(KLIC_PRODLOUZENO) || 0; } catch { /* nic */ }
  if (Date.now() - posledne < 864e5) return;
  try {
    const r = await fetch(`https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(t)}`);
    const j = await r.json();
    if (j.access_token) localStorage.setItem(KLIC_TOKEN, j.access_token);
    localStorage.setItem(KLIC_PRODLOUZENO, String(Date.now()));
  } catch { /* zkusí se příště */ }
}

// lehce = jen profil a příspěvky (lajky, komentáře); dosah/uložení/sdílení se převezmou z minula
// a dotáhnou se jen u nových příspěvků. Šetří limity API při častém obnovování.
async function nactiZApi(pokrok = () => {}, { lehce = false, predchozi = null } = {}) {
  if (!token()) throw new Error("Chybí token – vlož ho v Připojení.");
  const ig = /^IG/.test(token());
  const host = ig ? "graph.instagram.com" : "graph.facebook.com";
  pokrok("Načítám profil…");
  let profil, id;
  const pole = "username,name,profile_picture_url,followers_count,media_count";
  if (ig) {
    const p = await api(host, "me", { fields: `user_id,${pole}` });
    id = p.user_id || p.id;
    profil = p;
  } else {
    const a = await api(host, "me/accounts", { fields: `name,instagram_business_account{id,${pole}}` });
    const ucet = (a.data || []).map((x) => x.instagram_business_account).find(Boolean);
    if (!ucet) throw new Error("K tokenu není připojený žádný Instagram Business účet (Facebook stránka musí být propojená s Instagramem).");
    id = ucet.id;
    profil = ucet;
  }
  pokrok("Načítám příspěvky…");
  const media = [];
  let dalsi = null;
  do {
    const j = dalsi
      ? await (await fetch(dalsi)).json()
      : await api(host, `${id}/media`, { fields: "id,caption,media_type,media_product_type,timestamp,permalink,thumbnail_url,media_url,like_count,comments_count", limit: 50 });
    if (j.error) throw new Error(j.error.message);
    media.push(...(j.data || []));
    dalsi = j.paging?.next || null;
  } while (dalsi && media.length < MAX_POSTU);

  const posty = media.slice(0, MAX_POSTU).map((m) => ({
    id: m.id, datum: m.timestamp, popisek: m.caption || "", odkaz: m.permalink || "",
    nahled: m.thumbnail_url || (m.media_type === "IMAGE" || m.media_type === "CAROUSEL_ALBUM" ? m.media_url : "") || "",
    typ: m.media_product_type === "REELS" || m.media_type === "VIDEO" ? "reels" : m.media_type === "CAROUSEL_ALBUM" ? "carousel" : "post",
    likes: m.like_count, komentare: m.comments_count,
  }));

  const stare = new Map((predchozi?.posty || []).map((p) => [p.id, p]));
  if (lehce) {
    for (const p of posty) {
      const s = stare.get(p.id);
      if (!s) continue;
      Object.assign(p, { dosah: s.dosah, ulozeni: s.ulozeni, sdileni: s.sdileni, zobrazeni: s.zobrazeni });
      // total_interactions z minula + změna lajků a komentářů od té doby
      if (s.interakce != null) p.interakce = s.interakce + ((p.likes ?? 0) - (s.likes ?? 0)) + ((p.komentare ?? 0) - (s.komentare ?? 0));
    }
  }

  // Insights – souběžně po 4, s ústupem na menší sadu metrik.
  const SADY = ["reach,saved,shares,total_interactions,views", "reach,saved,shares,total_interactions", "reach"];
  let hotovo = 0;
  const fronta = (lehce ? posty.slice(0, MAX_INSIGHTS).filter((p) => !stare.has(p.id)).slice(0, 10) : posty.slice(0, MAX_INSIGHTS)).map((p) => p);
  const celkemInsights = fronta.length;
  const pracovnik = async () => {
    while (fronta.length) {
      const p = fronta.shift();
      for (const sada of SADY) {
        try {
          const j = await api(host, `${p.id}/insights`, { metric: sada });
          for (const m of j.data || []) {
            const v = m.values?.[0]?.value ?? m.total_value?.value;
            if (m.name === "reach") p.dosah = v;
            if (m.name === "saved") p.ulozeni = v;
            if (m.name === "shares") p.sdileni = v;
            if (m.name === "total_interactions") p.interakce = v;
            if (m.name === "views") p.zobrazeni = v;
          }
          break;
        } catch (e) { if (/oprávnění|neplatný|limit/.test(e.message)) throw e; }
      }
      hotovo++;
      pokrok(`Načítám statistiky příspěvků… ${hotovo} / ${celkemInsights}`);
    }
  };
  await Promise.all([pracovnik(), pracovnik(), pracovnik(), pracovnik()]);
  return {
    zdroj: "api", cas: Date.now(), plne: lehce ? (predchozi?.plne || Date.now()) : Date.now(),
    profil: { jmeno: profil.username || profil.name || "", foto: profil.profile_picture_url || "", sledujici: profil.followers_count ?? null, prispevku: profil.media_count ?? null },
    posty: posty.map(normalizuj),
  };
}

// ---------------------------------------------------------- CSV z Business Suite --

function parsujCSV(text) {
  text = text.replace(/^﻿/, "");
  const prvni = text.split(/\r?\n/)[0] || "";
  const odd = [";", ",", "\t"].map((o) => [o, prvni.split(o).length]).sort((a, b) => b[1] - a[1])[0][0];
  const radky = [];
  let radek = [], pole = "", uvozovky = false;
  for (let i = 0; i < text.length; i++) {
    const z = text[i];
    if (uvozovky) {
      if (z === '"' && text[i + 1] === '"') { pole += '"'; i++; }
      else if (z === '"') uvozovky = false;
      else pole += z;
    } else if (z === '"') uvozovky = true;
    else if (z === odd) { radek.push(pole); pole = ""; }
    else if (z === "\n" || z === "\r") {
      if (z === "\r" && text[i + 1] === "\n") i++;
      radek.push(pole); pole = "";
      if (radek.some((x) => x.trim())) radky.push(radek);
      radek = [];
    } else pole += z;
  }
  if (pole || radek.length) { radek.push(pole); if (radek.some((x) => x.trim())) radky.push(radek); }
  return radky;
}

const bezDiakritiky = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const SLOUPCE = {
  id: ["post id", "id prispevku", "id"],
  datum: ["publish time", "cas zverejneni", "datum zverejneni", "publish date", "date", "datum"],
  popisek: ["description", "popis", "caption", "text"],
  odkaz: ["permalink", "trvaly odkaz", "odkaz", "link"],
  typ: ["post type", "typ prispevku", "content type", "typ"],
  dosah: ["reach", "dosah"],
  zobrazeni: ["views", "zobrazeni", "impressions", "plays"],
  likes: ["likes", "to se mi libi", "libi se", "reactions", "reakce"],
  komentare: ["comments", "komentare"],
  sdileni: ["shares", "sdileni"],
  ulozeni: ["saves", "ulozeni"],
};

function datumZTextu(t) {
  t = String(t || "").trim();
  let m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/.exec(t);          // Meta: MM/DD/YYYY HH:MM
  if (m) return new Date(+m[3], +m[1] - 1, +m[2], +(m[4] || 12), +(m[5] || 0));
  m = /^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/.exec(t);          // DD.MM.YYYY HH:MM
  if (m) return new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 12), +(m[5] || 0));
  const d = new Date(t);
  return Number.isNaN(+d) ? null : d;
}

function zCSV(text) {
  const radky = parsujCSV(text);
  if (radky.length < 2) throw new Error("Soubor je prázdný nebo to není CSV.");
  // hlavička může být až na 3. řádku (některé exporty mají nahoře název přehledu)
  let h = 0;
  for (let i = 0; i < Math.min(5, radky.length); i++) {
    const n = radky[i].map(bezDiakritiky);
    if (n.some((x) => SLOUPCE.dosah.includes(x) || SLOUPCE.datum.includes(x))) { h = i; break; }
  }
  const hlavicka = radky[h].map(bezDiakritiky);
  const index = {};
  for (const [klic, nazvy] of Object.entries(SLOUPCE)) {
    let i = hlavicka.findIndex((x) => nazvy.includes(x));
    if (i < 0) i = hlavicka.findIndex((x) => nazvy.some((n) => n.length > 3 && x.includes(n)));
    if (i >= 0) index[klic] = i;
  }
  if (index.datum == null) throw new Error("V CSV chybí sloupec s datem zveřejnění (Publish time / Čas zveřejnění).");
  if (index.dosah == null && index.likes == null) throw new Error("V CSV nejsou čísla (dosah, lajky…). Exportuj z Meta Business Suite → Přehledy → Obsah.");
  const posty = [];
  for (const r of radky.slice(h + 1)) {
    const d = datumZTextu(r[index.datum]);
    if (!d) continue;
    const typText = bezDiakritiky(r[index.typ]);
    const typ = /reel|video|kratk/.test(typText) ? "reels" : /carousel|karusel|album|sada/.test(typText) ? "carousel" : "post";
    const p = { datum: d, typ };
    for (const k of ["id", "popisek", "odkaz", "dosah", "zobrazeni", "likes", "komentare", "sdileni", "ulozeni"]) if (index[k] != null) p[k] = r[index[k]];
    posty.push(normalizuj(p));
  }
  if (!posty.length) throw new Error("V CSV jsem nenašel žádné příspěvky s datem.");
  return { zdroj: "csv", cas: Date.now(), profil: { jmeno: "", foto: "", sledujici: null, prispevku: posty.length }, posty };
}

// --------------------------------------------------------------- ukázková data --

function demoData() {
  let s = 7;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const temata = ["44 zápasů bez porážky. Kometa píše historii.", "Nagano 1998: Hašek a pět nájezdů.", "Jágr a jeho první gól v NHL.",
    "Ruská pětka v Detroitu.", "Lokomotiv Jaroslavl: nezapomeneme.", "Pastrňák a 60 gólů za sezónu.", "Nejrychlejší hattrick v extralize.",
    "Brankář, který dal gól.", "Zlato z Vídně 2005.", "Hašek vs. Roy: souboj legend.", "Rekordní návštěva v O2 areně.", "Malý Jágr na Kladně."];
  const posty = [];
  const ted = Date.now();
  for (let i = 0; i < 48; i++) {
    const d = new Date(ted - i * 2.6 * 864e5 - rnd() * 864e5);
    d.setHours([8, 11, 13, 17, 19, 20, 21][Math.floor(rnd() * 7)], Math.floor(rnd() * 60));
    const typ = rnd() < 0.42 ? "carousel" : rnd() < 0.55 ? "reels" : "post";
    const vecer = d.getHours() >= 18 ? 1.35 : 1;
    const vikend = [0, 6].includes(d.getDay()) ? 1.15 : 1;
    const bonus = { carousel: 1.25, reels: 1.7, post: 0.85 }[typ];
    const dosah = Math.round((2500 + rnd() * 4500) * vecer * vikend * bonus);
    const likes = Math.round(dosah * (0.06 + rnd() * 0.05));
    const delka = rnd() < 0.5 ? 220 : 650;
    posty.push(normalizuj({
      id: `demo-${i}`, datum: d, typ,
      popisek: `${temata[i % temata.length]}\n\n${"Krátký příběh pro fanoušky. ".repeat(Math.round(delka / 30))}\n\n#denikhokeje #hokej ${["#nhl", "#extraliga", "#reprezentace", "#historie"][i % 4]}`,
      dosah, likes, komentare: Math.round(likes * (0.03 + rnd() * 0.05)),
      ulozeni: Math.round(dosah * (typ === "carousel" ? 0.025 : 0.008) * (delka < 300 ? 1.3 : 1)),
      sdileni: Math.round(dosah * (typ === "reels" ? 0.02 : 0.007)),
    }));
  }
  return { zdroj: "demo", cas: Date.now(), profil: { jmeno: "denik_hokeje", foto: "brand/dh-avatar.webp", sledujici: 18450, prispevku: 612 }, posty };
}

// ---------------------------------------------------------------- analýzy --

const prumer = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

function vObdobi() {
  if (!data) return [];
  const od = obdobi ? Date.now() - obdobi * 864e5 : 0;
  return data.posty.filter((p) => +new Date(p.datum) >= od).sort((a, b) => new Date(a.datum) - new Date(b.datum));
}

function souhrn(posty) {
  const s = (k) => posty.map((p) => p[k]).filter((x) => x != null);
  return {
    pocet: posty.length,
    dosah: prumer(s("dosah")),
    mira: prumer(s("mira")),
    ulozeni: s("ulozeni").reduce((a, b) => a + b, 0),
    sdileni: s("sdileni").reduce((a, b) => a + b, 0),
    interakce: prumer(s("interakce")),
    maDosah: s("dosah").length > 0,
  };
}

// Hodnotící metrika příspěvku: míra interakce, když chybí dosah, tak interakce.
const skore = (p) => p.mira ?? (p.interakce != null ? p.interakce / 1e4 : null);

function nejlepsiCas(posty) {
  const bunky = DNY.map(() => OKNA.map(() => []));
  for (const p of posty) {
    const d = new Date(p.datum);
    const den = (d.getDay() + 6) % 7, h = d.getHours();
    const o = OKNA.findIndex(([a, b]) => h >= a && h < b);
    const v = skore(p);
    if (o >= 0 && v != null) bunky[den][o].push(v);
  }
  const hodnoty = bunky.map((r) => r.map((c) => ({ n: c.length, v: prumer(c) })));
  let nej = null;
  hodnoty.forEach((r, d) => r.forEach((c, o) => { if (c.n >= 2 && (!nej || c.v > nej.v)) nej = { den: d, okno: o, v: c.v, n: c.n }; }));
  return { hodnoty, nej };
}

function poFormatech(posty) {
  return Object.keys(FORMATY).map((k) => {
    const t = posty.filter((p) => p.typ === k);
    return { klic: k, n: t.length, dosah: prumer(t.map((p) => p.dosah).filter((x) => x != null)), mira: prumer(t.map((p) => p.mira).filter((x) => x != null)), ulozeni: prumer(t.map((p) => p.ulozeni).filter((x) => x != null)) };
  }).filter((x) => x.n);
}

function podleDelky(posty) {
  const KOS = [["Krátký", 0, 300], ["Střední", 300, 700], ["Dlouhý", 700, 1e9]];
  return KOS.map(([nazev, a, b]) => {
    const t = posty.filter((p) => { const l = p.popisek.replace(/#[\p{L}\p{N}_]+/gu, "").trim().length; return l >= a && l < b; });
    return { nazev: `${nazev} (${b > 1e8 ? `${a}+` : `${a}–${b}`} znaků)`, n: t.length, mira: prumer(t.map(skore).filter((x) => x != null)) };
  }).filter((x) => x.n);
}

function hashtagy(posty) {
  const m = new Map();
  for (const p of posty) {
    for (const t of new Set((p.popisek.match(/#[\p{L}\p{N}_]+/gu) || []).map((x) => x.toLowerCase()))) {
      if (!m.has(t)) m.set(t, []);
      if (p.dosah != null) m.get(t).push(p.dosah);
    }
  }
  return [...m.entries()].filter(([, v]) => v.length >= 3).map(([tag, v]) => ({ tag, n: v.length, dosah: prumer(v) }))
    .sort((a, b) => b.dosah - a.dosah).slice(0, 8);
}

// ------------------------------------------------------------------- grafy --

function osaKroky(max) {
  if (!max) return [0, 1];
  const hrube = max / 4, mocnina = 10 ** Math.floor(Math.log10(hrube));
  const krok = [1, 2, 2.5, 5, 10].map((k) => k * mocnina).find((k) => hrube <= k);
  const out = [];
  for (let v = 0; v <= max + krok * 0.001; v += krok) out.push(v);
  if (out[out.length - 1] < max) out.push(out[out.length - 1] + krok);
  return out;
}

// Sloupcový graf dosahu po příspěvcích (barva = formát, šedá čára = průměr).
function grafDosahu(posty) {
  const el = $("#stGrafDosah");
  if (!el) return;
  const s = posty.filter((p) => p.dosah != null);
  if (!s.length) { el.innerHTML = `<p class="muted">Pro graf chybí dosah – u tokenu povol instagram_business_manage_insights.</p>`; return; }
  const W = Math.max(320, el.clientWidth || 800), H = 260, L = 52, R = 16, T = 14, B = 30;
  const kroky = osaKroky(Math.max(...s.map((p) => p.dosah)));
  const max = kroky[kroky.length - 1];
  const pas = (W - L - R) / s.length;
  const sirka = Math.max(2, Math.min(24, pas - 2));
  const y = (v) => T + (H - T - B) * (1 - v / max);
  const avg = prumer(s.map((p) => p.dosah));
  const r = 4;
  const sloupec = (x, v) => {
    const top = y(v), bot = y(0), w = sirka, rr = Math.min(r, (bot - top) / 2, w / 2);
    return `M${x},${bot}V${top + rr}Q${x},${top} ${x + rr},${top}H${x + w - rr}Q${x + w},${top} ${x + w},${top + rr}V${bot}Z`;
  };
  const popisky = [0, Math.floor(s.length / 2), s.length - 1].filter((v, i, a) => a.indexOf(v) === i);
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" role="img" aria-label="Dosah jednotlivých příspěvků v čase">
    ${kroky.map((k) => `<line x1="${L}" x2="${W - R}" y1="${y(k)}" y2="${y(k)}" class="st-gridline"/><text x="${L - 8}" y="${y(k) + 4}" class="st-osa" text-anchor="end">${kratce(k)}</text>`).join("")}
    ${s.map((p, i) => `<path d="${sloupec(L + i * pas + (pas - sirka) / 2, p.dosah)}" fill="${FORMATY[p.typ].barva}" class="st-sloupec" data-i="${i}"/>`).join("")}
    <line x1="${L}" x2="${W - R}" y1="${y(avg)}" y2="${y(avg)}" class="st-prumer"/>
    <text x="${W - R}" y="${y(avg) - 6}" class="st-osa st-prumer-text" text-anchor="end">průměr ${kratce(avg)}</text>
    ${popisky.map((i) => `<text x="${L + i * pas + pas / 2}" y="${H - 8}" class="st-osa" text-anchor="${i === 0 ? "start" : i === s.length - 1 ? "end" : "middle"}">${datumKratce(new Date(s[i].datum))}</text>`).join("")}
    ${s.map((p, i) => `<rect x="${L + i * pas}" y="${T}" width="${pas}" height="${H - T - B}" fill="transparent" data-tip="${i}"/>`).join("")}
  </svg><div class="st-tip" hidden></div>`;
  const tip = el.querySelector(".st-tip");
  el.querySelector("svg").addEventListener("pointermove", (e) => {
    const t = e.target.closest("[data-tip]");
    $$(".st-sloupec", el).forEach((c) => c.classList.toggle("tlumeny", !!t && c.dataset.i !== t?.dataset.tip));
    if (!t) { tip.hidden = true; return; }
    const p = s[+t.dataset.tip];
    tip.innerHTML = `<b>${esc(prvniRadek(p.popisek).slice(0, 70))}</b>
      <span><i style="background:${FORMATY[p.typ].barva}"></i>${FORMATY[p.typ].nazev} · ${new Date(p.datum).toLocaleString("cs-CZ", { weekday: "short", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
      <span>Dosah <b>${cislo(p.dosah)}</b> · interakce <b>${cislo(p.interakce)}</b> · míra <b>${procenta(p.mira)}</b></span>
      <span>Uložení ${cislo(p.ulozeni)} · sdílení ${cislo(p.sdileni)}</span>`;
    const box = el.getBoundingClientRect();
    tip.hidden = false;
    const x = Math.min(box.width - tip.offsetWidth - 4, Math.max(4, e.clientX - box.left + 14));
    tip.style.left = `${x}px`;
    tip.style.top = `${Math.max(0, e.clientY - box.top - tip.offsetHeight - 12)}px`;
  });
  el.querySelector("svg").addEventListener("pointerleave", () => { tip.hidden = true; $$(".st-sloupec", el).forEach((c) => c.classList.remove("tlumeny")); });
}

function vodorovneSloupce(radky, { hodnota, barva, popis, format = kratce, max: maxPevne }) {
  const max = maxPevne || Math.max(...radky.map(hodnota).filter((x) => x != null), 0) || 1;
  return `<div class="st-pruhy">${radky.map((r) => {
    const v = hodnota(r);
    return `<div class="st-pruh"><span class="st-pruh-nazev">${popis(r)}</span>
      <span class="st-pruh-draha"><i style="width:${v == null ? 0 : Math.max(2, (v / max) * 100)}%;background:${barva(r)}"></i></span>
      <b class="st-pruh-hodnota">${format(v)}</b></div>`;
  }).join("")}</div>`;
}

function heatmapa(cas) {
  const vals = cas.hodnoty.flat().filter((c) => c.n).map((c) => c.v);
  const min = Math.min(...vals), max = Math.max(...vals);
  const alfa = (v) => (max === min ? 0.6 : 0.12 + 0.88 * ((v - min) / (max - min)));
  return `<div class="st-heat" role="table" aria-label="Průměrná míra interakce podle dne a času zveřejnění">
    <span></span>${OKNA.map(([a, b]) => `<span class="st-heat-h">${a}–${b}</span>`).join("")}
    ${cas.hodnoty.map((r, d) => `<span class="st-heat-d">${DNY[d]}</span>${r.map((c, o) => {
      const nej = cas.nej && cas.nej.den === d && cas.nej.okno === o;
      return c.n
        ? `<span class="st-heat-c ${nej ? "nej" : ""}" style="--a:${alfa(c.v).toFixed(2)}" title="${DNY[d]} ${OKNA[o][0]}–${OKNA[o][1]} h: míra interakce ${procenta(c.v)} (${c.n} ${c.n === 1 ? "post" : c.n < 5 ? "posty" : "postů"})">${nej ? "🔥" : ""}</span>`
        : `<span class="st-heat-c prazdna" title="${DNY[d]} ${OKNA[o][0]}–${OKNA[o][1]} h: žádný post"></span>`;
    }).join("")}`).join("")}
  </div>
  <div class="st-heat-legenda"><span>nižší</span><i></i><span>vyšší míra interakce</span></div>`;
}

// ------------------------------------------------------------------ vykreslení --

function vykresli() {
  const el = $("#statistikyObsah");
  if (!el) return;
  if (!data) { el.innerHTML = uvodHtml(); return; }
  const posty = vObdobi();
  const sh = souhrn(posty);
  const cas = nejlepsiCas(posty);
  const formaty = poFormatech(posty);
  const delky = podleDelky(posty);
  const tagy = hashtagy(posty);
  const top = [...posty].filter((p) => skore(p) != null).sort((a, b) => skore(b) - skore(a)).slice(0, 5);
  const nejPost = top[0];
  const zdroj = { api: "Instagram API", csv: "import CSV", demo: "UKÁZKOVÁ DATA" }[data.zdroj];
  el.innerHTML = `
    ${data.zdroj === "demo" ? `<div class="zprava varovani st-demo"><b>Ukázková data</b> – čísla jsou vymyšlená, jen aby bylo vidět, jak statistiky vypadají. <a href="#" data-st="pripojeni">Připoj svůj Instagram</a>.</div>` : ""}
    <div class="st-lista card">
      <div class="st-profil">
        ${data.profil.foto ? `<img src="${esc(data.profil.foto)}" alt="" onerror="this.remove()">` : ""}
        <div><b>${data.profil.jmeno ? `@${esc(data.profil.jmeno)}` : "Instagram"}</b>
          <small>${data.profil.sledujici != null ? `${cislo(data.profil.sledujici)} sledujících · ` : ""}${zdroj} · ${new Date(data.cas).toLocaleString("cs-CZ", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" })}</small></div>
      </div>
      <div class="st-filtry" role="group" aria-label="Období">
        ${Object.entries(OBDOBI).map(([k, n]) => `<button type="button" class="chip ${+k === obdobi ? "on" : ""}" data-st-obdobi="${k}">${n}</button>`).join("")}
      </div>
      <div class="radek" style="gap:6px">
        ${data.zdroj === "api" ? `<span class="st-zive" id="stZive" title="Data se samy obnovují každých 5 minut, dokud máš aplikaci otevřenou">${zivePopis()}</span>
          <button type="button" class="btn small" data-st="obnovit">↻ Obnovit</button>` : ""}
        <button type="button" class="btn small ghost" data-st="pripojeni">⚙ Připojení</button>
      </div>
    </div>

    ${!posty.length ? `<div class="card" style="margin-top:18px"><p class="muted" style="margin:0">V tomhle období nejsou žádné příspěvky. Zkus delší období.</p></div>` : `
    <div class="st-dlazdice">
      ${dlazdice("Příspěvků", cislo(sh.pocet), `za ${OBDOBI[obdobi]}`)}
      ${dlazdice("Průměrný dosah", sh.maDosah ? kratce(sh.dosah) : "–", "lidí na příspěvek")}
      ${dlazdice("Míra interakce", procenta(sh.mira), "interakce / dosah")}
      ${dlazdice("Uložení", cislo(sh.ulozeni), "celkem – nejsilnější signál")}
      ${dlazdice("Sdílení", cislo(sh.sdileni), "celkem")}
    </div>

    <div class="st-mrizka">
      <div class="card st-siroka">
        <div class="st-hlava"><h2>Dosah příspěvků</h2>
          <div class="st-legenda">${Object.values(FORMATY).map((f) => `<span><i style="background:${f.barva}"></i>${f.nazev}</span>`).join("")}</div>
          <button type="button" class="btn small ghost" data-st="tabulka">${tabulka ? "📈 Graf" : "▦ Tabulka"}</button>
        </div>
        ${tabulka ? tabulkaHtml(posty) : `<div id="stGrafDosah" class="st-graf"></div>`}
      </div>

      <div class="card">
        <h2>Nejlepší čas na post</h2>
        ${cas.nej ? `<p class="st-tip-radek">🔥 <b>${DNY[cas.nej.den]} ${OKNA[cas.nej.okno][0]}–${OKNA[cas.nej.okno][1]} h</b> – nejvyšší míra interakce (${procenta(cas.nej.v)}, ${cas.nej.n} ${cas.nej.n < 5 ? "posty" : "postů"})
          <button type="button" class="btn small ghost" data-st="naplanovat">📆 Naplánovat</button></p>` : `<p class="muted">Na doporučení je zatím málo postů (potřeba aspoň 2 v jednom okně).</p>`}
        ${heatmapa(cas)}
      </div>

      <div class="card">
        <h2>Co funguje</h2>
        <h3 class="st-h3">Formáty · průměrný dosah</h3>
        ${vodorovneSloupce(formaty, { hodnota: (r) => r.dosah, barva: (r) => FORMATY[r.klic].barva, popis: (r) => `${FORMATY[r.klic].nazev} <small>${r.n}×</small>`, format: (v) => kratce(v) })}
        <h3 class="st-h3">Formáty · míra interakce</h3>
        ${vodorovneSloupce(formaty, { hodnota: (r) => r.mira, barva: (r) => FORMATY[r.klic].barva, popis: (r) => FORMATY[r.klic].nazev, format: procenta })}
        <h3 class="st-h3">Délka popisku · míra interakce</h3>
        ${vodorovneSloupce(delky, { hodnota: (r) => r.mira, barva: () => "#e01e26", popis: (r) => `${r.nazev} <small>${r.n}×</small>`, format: (v) => (data.posty.some((p) => p.mira != null) ? procenta(v) : kratce(v * 1e4)) })}
      </div>

      <div class="card">
        <h2>Hashtagy s nejvyšším dosahem</h2>
        ${tagy.length ? vodorovneSloupce(tagy, { hodnota: (r) => r.dosah, barva: () => "#e01e26", popis: (r) => `${esc(r.tag)} <small>${r.n}×</small>`, format: kratce })
          : `<p class="muted">Hashtag musí být aspoň ve 3 postech s dosahem, aby šlo srovnávat.</p>`}
      </div>

      <div class="card st-siroka">
        <div class="st-hlava"><h2>Top příspěvky</h2><span class="muted">podle míry interakce · zopakuj hit v jiném formátu</span></div>
        <div class="st-top">${top.map((p, i) => topHtml(p, i)).join("")}</div>
      </div>

      <div class="card ai-karta st-siroka">
        <div class="st-hlava"><h2>✨ Rozbor od AI</h2><span class="muted">co z čísel plyne a co dělat dál</span>
          <button type="button" class="btn small" data-st="ai">${aiVysledek ? "↻ Znovu" : "✨ Rozebrat statistiky"}</button></div>
        <div id="stAi">${aiVysledek ? aiHtml(aiVysledek) : `<p class="muted" style="margin:0">AI projde tvoje čísla (formáty, časy, témata, délky) a navrhne konkrétní kroky a nápady na další posty – rovnou je můžeš poslat do plánu.</p>`}</div>
      </div>
    </div>`}`;
  if (!tabulka && posty.length) requestAnimationFrame(() => grafDosahu(posty));
  window.__stTop = top;
}

const dlazdice = (nazev, hodnota, popis) => `<div class="st-dlazdice-k"><span>${nazev}</span><b>${hodnota}</b><small>${popis}</small></div>`;

function topHtml(p, i) {
  return `<article class="st-top-p">
    <div class="st-top-nahled">${p.nahled ? `<img src="${esc(p.nahled)}" alt="" loading="lazy" onerror="this.remove()">` : ""}<span>#${i + 1}</span></div>
    <div class="st-top-info">
      <span class="st-top-typ" style="--f:${FORMATY[p.typ].barva}">${FORMATY[p.typ].nazev} · ${new Date(p.datum).toLocaleDateString("cs-CZ")}</span>
      <b>${esc(prvniRadek(p.popisek).slice(0, 90))}</b>
      <small>Dosah ${kratce(p.dosah)} · míra ${procenta(p.mira)} · uložení ${cislo(p.ulozeni)} · sdílení ${cislo(p.sdileni)}</small>
      <div class="radek" style="gap:6px;margin-top:6px">
        <button type="button" class="btn small ghost" data-st-recykl="carousel" data-i="${i}">♻️ Jako carousel</button>
        <button type="button" class="btn small ghost" data-st-recykl="reels" data-i="${i}">♻️ Jako reel</button>
        ${p.odkaz ? `<a class="btn small ghost" href="${esc(p.odkaz)}" target="_blank" rel="noopener">Otevřít ↗</a>` : ""}
      </div>
    </div>
  </article>`;
}

function tabulkaHtml(posty) {
  const sloupce = [["datum", "Datum"], ["typ", "Formát"], ["popisek", "Popisek"], ["dosah", "Dosah"], ["interakce", "Interakce"], ["mira", "Míra"], ["ulozeni", "Uložení"], ["sdileni", "Sdílení"]];
  const s = [...posty].sort((a, b) => {
    const va = a[razeni.klic], vb = b[razeni.klic];
    return (va == null) - (vb == null) || (va > vb ? 1 : va < vb ? -1 : 0) * razeni.smer;
  });
  return `<div class="st-tabulka"><table>
    <thead><tr>${sloupce.map(([k, n]) => `<th><button type="button" data-st-radit="${k}">${n}${razeni.klic === k ? (razeni.smer > 0 ? " ▲" : " ▼") : ""}</button></th>`).join("")}</tr></thead>
    <tbody>${s.map((p) => `<tr><td>${new Date(p.datum).toLocaleDateString("cs-CZ")}</td><td>${FORMATY[p.typ].nazev}</td>
      <td class="st-tab-text">${p.odkaz ? `<a href="${esc(p.odkaz)}" target="_blank" rel="noopener">${esc(prvniRadek(p.popisek).slice(0, 60))}</a>` : esc(prvniRadek(p.popisek).slice(0, 60))}</td>
      <td>${cislo(p.dosah)}</td><td>${cislo(p.interakce)}</td><td>${procenta(p.mira)}</td><td>${cislo(p.ulozeni)}</td><td>${cislo(p.sdileni)}</td></tr>`).join("")}</tbody>
  </table></div>`;
}

function uvodHtml() {
  return `<div class="st-uvod">
    <div class="card ai-karta">
      <h2>📡 Připojit Instagram (živá data)</h2>
      <p>Oficiální Instagram API – dosah, uložení, sdílení a interakce každého příspěvku, <b>živě</b>: čísla se samy obnovují každých 5 minut a token si aplikace sama prodlužuje. Nastavuje se <b>jen jednou</b> (asi 5 minut), potřebuješ profesionální účet (Tvůrce nebo Firma).</p>
      <ol class="muted st-navod">
        <li>Otevři <a href="https://developers.facebook.com/apps" target="_blank" rel="noopener">developers.facebook.com/apps</a> → <b>Vytvořit aplikaci</b> (typ Business / „Jiné“).</li>
        <li>Přidej produkt <b>Instagram</b> → <b>API setup with Instagram login</b>.</li>
        <li>V části <b>Generate access tokens</b> přidej účet @denik_hokeje a klikni <b>Generate token</b> (oprávnění instagram_business_basic + instagram_business_manage_insights).</li>
        <li>Token (začíná <code>IG…</code>) vlož sem. Platí 60 dní, ale aplikace ho sama prodlužuje, takže tohle děláš jen jednou.</li>
      </ol>
      <label>Instagram access token<input id="stToken" type="password" autocomplete="off" placeholder="IGAA… nebo EAA…"></label>
      <div class="akce"><button type="button" class="btn" data-st="pripojit">Připojit a načíst</button></div>
      <p class="muted" style="font-size:12.5px;margin:10px 0 0">Funguje i token z Graph API Explorer (EAA…) s oprávněními instagram_basic, instagram_manage_insights, pages_read_engagement. Token zůstává jen v tomhle prohlížeči a posílá se jen Metě.</p>
    </div>
    <div class="card">
      <h2>📄 Nahrát export (bez tokenu)</h2>
      <p>V <b>Meta Business Suite → Přehledy → Obsah</b> zvol období a klikni <b>Exportovat data</b> (CSV). Soubor nahraj sem – funguje česky i anglicky.</p>
      <label class="btn">📄 Nahrát CSV<input type="file" id="stCsv" accept=".csv,text/csv"></label>
      <h2 style="margin-top:26px">👀 Jen se podívat</h2>
      <p class="muted">Ukázka s vymyšlenými čísly, ať vidíš, co statistiky umí.</p>
      <button type="button" class="btn ghost" data-st="demo">Zobrazit ukázku</button>
    </div>
    <div class="zprava" id="stZprava" hidden></div>
  </div>`;
}

// ---------------------------------------------------------------------- AI --

async function rozborAI() {
  const AI = window.DHAI;
  const el = $("#stAi");
  if (!AI?.maKlic()) { el.innerHTML = `<p class="zprava chyba">Rozbor potřebuje AI klíč – <a href="#" data-jdi-na-ai>nastavit</a>.</p>`; return; }
  const posty = vObdobi();
  const b = $('[data-st="ai"]');
  if (b) { b.disabled = true; b.textContent = "Analyzuju…"; }
  el.innerHTML = `<p class="muted">AI čte čísla… (obvykle do 20 s)</p>`;
  const radky = posty.slice(-70).map((p) => {
    const d = new Date(p.datum);
    return [d.toISOString().slice(0, 10), DNY[(d.getDay() + 6) % 7], d.getHours(), p.typ, p.dosah ?? "", p.interakce ?? "", p.ulozeni ?? "", p.sdileni ?? "",
      p.popisek.replace(/#[\p{L}\p{N}_]+/gu, "").trim().length, prvniRadek(p.popisek).slice(0, 90).replace(/\|/g, "/")].join(" | ");
  });
  try {
    const r = await AI.gemini({
      system: `Jsi datový analytik a stratég Instagramu @denik_hokeje (český hokej – zajímavosti, rekordy, historie).
Dostaneš statistiky příspěvků. Najdi, co skutečně funguje a co ne, a navrhni konkrétní kroky. Piš česky, stručně, s čísly z dat.
Nevymýšlej čísla, která v datech nejsou. Když je dat málo, řekni to.
Nápady na posty piš ve stylu účtu – krátký úderný titulek (hook), konkrétní téma z hokejové historie, které navazuje na to, co v datech fungovalo.
${AI.COPY || ""}`,
      zadani: `SOUHRN: ${posty.length} postů, průměrný dosah ${Math.round(souhrn(posty).dosah || 0)}, míra interakce ${procenta(souhrn(posty).mira)}.
DATA (datum | den | hodina | formát | dosah | interakce | uložení | sdílení | délka popisku bez hashtagů | první řádek):
${radky.join("\n")}

Vrať 3–5 zjištění, 3–5 doporučení a 5 nápadů na další posty.`,
      schema: {
        type: "object",
        properties: {
          zjisteni: { type: "array", items: { type: "string" } },
          doporuceni: { type: "array", items: { type: "string" } },
          napady: { type: "array", items: { type: "object", properties: { titulek: { type: "string" }, format: { type: "string", enum: ["post", "carousel", "vyroci", "reels"] }, proc: { type: "string" } }, required: ["titulek", "format", "proc"] } },
        },
        required: ["zjisteni", "doporuceni", "napady"],
      },
    });
    aiVysledek = r;
    el.innerHTML = aiHtml(r);
  } catch (e) {
    el.innerHTML = `<p class="zprava chyba">${esc(e.message)}</p>`;
  } finally {
    if (b) { b.disabled = false; b.textContent = "↻ Znovu"; }
  }
}

function aiHtml(r) {
  const F = { post: "Post", carousel: "Carousel", vyroci: "Dnes před lety", reels: "Reel" };
  return `<div class="st-ai">
    <div><h3 class="st-h3">Zjištění</h3><ul>${(r.zjisteni || []).map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>
    <div><h3 class="st-h3">Co dělat</h3><ul>${(r.doporuceni || []).map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>
  </div>
  <h3 class="st-h3">Nápady na další posty</h3>
  <div class="st-napady">${(r.napady || []).map((n, i) => `<div class="st-napad">
    <span class="st-top-typ">${F[n.format] || "Post"}</span><b>${esc(n.titulek)}</b><small class="muted">${esc(n.proc)}</small>
    <div class="radek" style="gap:6px;margin-top:6px"><button type="button" class="btn small" data-st-napad="tvor" data-i="${i}">Vytvořit</button>
    <button type="button" class="btn small ghost" data-st-napad="plan" data-i="${i}">📆 Do plánu</button></div></div>`).join("")}</div>`;
}

// ---------------------------------------------------------------- události --

function zprava(t, druh = "ok") {
  const el = $("#stZprava");
  if (!el) { toast(t, druh === "chyba" ? "chyba" : "ok"); return; }
  el.innerHTML = t; el.className = `zprava ${druh}`; el.hidden = !t;
}

async function pripojit() {
  const v = $("#stToken")?.value.trim();
  if (v) { try { localStorage.setItem(KLIC_TOKEN, v); } catch { /* nic */ } }
  if (!token()) { zprava("Vlož token.", "chyba"); return; }
  await obnovit();
}

// ------------------------------------------------------------- živé obnovování --

const LEHCE_PO = 5 * 60e3;   // lajky, komentáře, nové posty
const PLNE_PO = 60 * 60e3;   // dosah, uložení, sdílení u všech postů
let bezi = false, posledniChyba = "";

function zivePopis() {
  if (!data || data.zdroj !== "api") return "";
  if (bezi) return `<i class="nacita"></i> Aktualizuju…`;
  if (posledniChyba) return `<i class="chyba"></i> ${esc(posledniChyba)}`;
  const min = Math.round((Date.now() - data.cas) / 60e3);
  return `<i></i> Živě · ${min < 1 ? "právě teď" : `před ${min} min`}`;
}
const ukazZive = () => { const el = $("#stZive"); if (el) el.innerHTML = zivePopis(); };

async function tichaObnova(vynutitPlnou = false) {
  if (bezi || !data || data.zdroj !== "api" || !token()) return;
  const vek = Date.now() - data.cas;
  const plna = vynutitPlnou || Date.now() - (data.plne || 0) > PLNE_PO;
  if (!plna && vek < LEHCE_PO) return;
  bezi = true; ukazZive();
  try {
    await prodlouzToken();
    const d = await nactiZApi(() => {}, { lehce: !plna, predchozi: data });
    posledniChyba = "";
    ulozData(d);
    if (!$("#zalozkaStatistiky")?.hidden && !document.querySelector(".st-tip:not([hidden])")) vykresli();
  } catch (e) {
    posledniChyba = /neplatný|vypršel/.test(e.message) ? "Token vypršel – připoj znovu" : "Obnova se nepovedla";
  } finally { bezi = false; ukazZive(); }
}

async function obnovit() {
  const b = $('[data-st="obnovit"]') || $('[data-st="pripojit"]');
  if (b) b.disabled = true;
  try {
    await prodlouzToken();
    const d = await nactiZApi((t) => { if ($("#stZprava")) zprava(t, ""); else if (b) b.textContent = t.length > 34 ? `${t.slice(0, 32)}…` : t; });
    posledniChyba = "";
    ulozData(d);
    aiVysledek = null;
    vykresli();
    toast(`Statistiky načtené ✓ ${d.posty.length} příspěvků`);
  } catch (e) {
    if ($("#stZprava")) zprava(esc(e.message), "chyba"); else toast(esc(e.message), "chyba");
  } finally {
    if (b?.isConnected) { b.disabled = false; b.textContent = data?.zdroj === "api" ? "↻ Obnovit" : "Připojit a načíst"; }
  }
}

function init() {
  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-st], [data-st-obdobi], [data-st-recykl], [data-st-napad], [data-st-radit]");
    if (!t || !t.closest("#statistikyObsah")) return;
    const d = t.dataset;
    if (d.stObdobi !== undefined) { obdobi = +d.stObdobi; vykresli(); return; }
    if (d.stRadit) { razeni = { klic: d.stRadit, smer: razeni.klic === d.stRadit ? -razeni.smer : -1 }; vykresli(); return; }
    if (d.stRecykl) {
      const p = window.__stTop?.[+d.i];
      if (p) window.DHShell?.tvor(d.stRecykl, `Zpracuj znovu tohle téma, které u nás mělo velký úspěch (dosah ${cislo(p.dosah)}, uložení ${cislo(p.ulozeni)}). Nový úhel pohledu, žádné kopírování textu:\n\n${p.popisek.replace(/#[\p{L}\p{N}_]+/gu, "").trim().slice(0, 700)}`);
      return;
    }
    if (d.stNapad) {
      const n = aiVysledek?.napady?.[+d.i];
      if (!n) return;
      if (d.stNapad === "plan") { window.DHPlan?.pridej({ nazev: n.titulek, format: n.format, zadani: n.proc }); toast("Nápad je v zásobníku v Plánu 📆"); t.textContent = "✓ V plánu"; t.disabled = true; }
      else window.DHShell?.tvor(n.format, `${n.titulek}\n\n${n.proc}`);
      return;
    }
    e.preventDefault();
    ({
      pripojeni: () => { data = null; vykresli(); },
      pripojit, obnovit,
      demo: () => { ulozData(demoData()); vykresli(); },
      tabulka: () => { tabulka = !tabulka; vykresli(); },
      ai: rozborAI,
      naplanovat: () => {
        const cas = nejlepsiCas(vObdobi()).nej;
        if (!cas) return;
        const d = new Date(); d.setHours(12, 0, 0, 0);
        const dnes = (d.getDay() + 6) % 7;
        d.setDate(d.getDate() + ((cas.den - dnes + 7) % 7 || 7));
        const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        window.DHPlan?.upravit({ datum: iso, cas: `${String(OKNA[cas.okno][0] + 1).padStart(2, "0")}:00` });
      },
    })[d.st]?.();
  });
  document.addEventListener("change", async (e) => {
    if (e.target.id !== "stCsv") return;
    const f = e.target.files[0];
    if (!f) return;
    try {
      const d = zCSV(await f.text());
      ulozData(d); aiVysledek = null; vykresli();
      toast(`Načteno z CSV ✓ ${d.posty.length} příspěvků`);
    } catch (err) { zprava(esc(err.message), "chyba"); }
  });
  let casovac;
  window.addEventListener("resize", () => { clearTimeout(casovac); casovac = setTimeout(() => { if (!$("#zalozkaStatistiky")?.hidden && !tabulka && data) grafDosahu(vObdobi()); }, 150); });
  document.addEventListener("dh:zalozka", (e) => {
    if (e.detail === "statistiky") vykresli();
    if (e.detail === "statistiky" || e.detail === "prehled") tichaObnova();
  });
  // Živě: dokud je aplikace otevřená, každou minutu zkontroluje, jestli není čas obnovit.
  setInterval(() => { if (document.visibilityState === "visible") { tichaObnova(); ukazZive(); } }, 60e3);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") tichaObnova(); });
  vykresli();
  setTimeout(() => tichaObnova(), 1500);
}

// Pro Přehled a Plán: nejlepší čas a souhrn posledních 30 dní.
function prehled() {
  if (!data) return null;
  const od = Date.now() - 30 * 864e5;
  const posty = data.posty.filter((p) => +new Date(p.datum) >= od);
  const cas = nejlepsiCas(data.posty.filter((p) => +new Date(p.datum) >= Date.now() - 90 * 864e5)).nej;
  return {
    demo: data.zdroj === "demo", profil: data.profil, souhrn: souhrn(posty),
    nejCas: cas ? { den: cas.den, denNazev: DNY[cas.den], od: OKNA[cas.okno][0], do: OKNA[cas.okno][1] } : null,
  };
}

window.DHStatistiky = { prehled, zCSV, demoData, FORMATY };
init();
})();
