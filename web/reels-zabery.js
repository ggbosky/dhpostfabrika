// Reels Factory – hledání autentických historických záběrů a knihovna klipů.
// Zdroje: Wikimedia Commons (volné licence, lze použít přímo), Internet Archive (náhled + ruční stažení),
// YouTube Data API (volitelný bezplatný klíč, jen náhled/odkaz), web přes AI hledání (odkazy k ověření).
// Nic se neobchází: kde zdroj nepovoluje stažení, aplikace dá odkaz a možnost importovat vlastní soubor.
(() => {
"use strict";

const U = () => window.DHReelsUloziste;
const UA = "DHPostFabrika/1.0 (https://ggbosky.github.io/dhpostfabrika/)";
const pockej = (ms) => new Promise((r) => setTimeout(r, ms));
const JAZYKY = { cs: "čeština", en: "angličtina", ru: "ruština", sv: "švédština", fi: "finština", de: "němčina", fr: "francouzština", sk: "slovenština" };

const textZHtml = (html) => new DOMParser().parseFromString(html || "", "text/html").body.textContent.replace(/\s+/g, " ").trim();
const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function jeVolnaLicence(text) {
  return /\b(cc[- ]?by|cc0|cc[- ]?zero|public domain|pd|volné dílo|creativecommons|publicdomain|attribution|share ?alike)\b/i.test(text || "");
}

// --------------------------------------------------------------- Commons --

async function hledejCommons(dotaz, pocet = 12) {
  const url = "https://commons.wikimedia.org/w/api.php?" + new URLSearchParams({
    action: "query", format: "json", origin: "*",
    generator: "search", gsrsearch: `${dotaz} filetype:video`, gsrnamespace: "6", gsrlimit: String(pocet),
    prop: "imageinfo|videoinfo",
    iiprop: "url|size|mime|extmetadata", iiurlwidth: "320",
    iiextmetadatafilter: "LicenseShortName|Artist|DateTimeOriginal|ImageDescription|UsageTerms",
    viprop: "derivatives",
  });
  let r;
  for (let pokus = 0; pokus < 2; pokus++) {
    r = await fetch(url, { headers: { "Api-User-Agent": UA } });
    if (r.status !== 429) break;
    await pockej(1500);
  }
  if (!r.ok) throw new Error(`Wikimedia Commons ${r.status}`);
  const data = await r.json();
  return Object.values(data.query?.pages || {}).sort((a, b) => (a.index || 0) - (b.index || 0)).map((s) => {
    const ii = s.imageinfo?.[0];
    if (!ii || !/video|ogg|webm/.test(ii.mime || "")) return null;
    const m = ii.extmetadata || {};
    const der = s.videoinfo?.[0]?.derivatives || [];
    const vyber = (re) => der.find((d) => re.test(d.transcodekey || ""));
    const prehratelne = vyber(/^720p\.mp4|^1080p\.mp4/) || vyber(/^720p\.vp9\.webm/) || vyber(/^1080p\.vp9\.webm/) || vyber(/^480p\.vp9\.webm|^480p\.webm/) || vyber(/webm|mp4/);
    const licence = textZHtml(m.LicenseShortName?.value) || textZHtml(m.UsageTerms?.value) || "viz Commons";
    return {
      zdroj: "commons", platforma: "Wikimedia Commons",
      id: `commons:${s.pageid}`,
      nazev: s.title.replace(/^File:/, "").replace(/\.[a-z0-9]+$/i, ""),
      popis: textZHtml(m.ImageDescription?.value).slice(0, 220),
      url: prehratelne?.src || ii.url,
      zalozniUrl: ii.url,
      stranka: ii.descriptionurl,
      nahled: ii.thumburl || "",
      delka: ii.duration || null,
      sirka: ii.width, vyska: ii.height,
      jazyk: "", rok: (textZHtml(m.DateTimeOriginal?.value).match(/\b(18|19|20)\d{2}\b/) || [""])[0],
      licence: { stav: jeVolnaLicence(licence) ? "volna" : "neovereno", nazev: licence, autor: textZHtml(m.Artist?.value) || "neznámý autor", odkaz: ii.descriptionurl },
      lze: { sledovat: true, stahnout: true, pouzit: jeVolnaLicence(licence) },
      casy: [],
    };
  }).filter(Boolean);
}

// ---------------------------------------------------------- Internet Archive --

function delkaZTextu(t) {
  if (!t) return null;
  const s = String(Array.isArray(t) ? t[0] : t).trim();
  const m = s.match(/^(?:(\d+):)?(\d+):(\d+)/);
  if (m) return (+(m[1] || 0)) * 3600 + +m[2] * 60 + +m[3];
  const min = s.match(/(\d+)\s*min/);
  if (min) return +min[1] * 60;
  return /^\d+(\.\d+)?$/.test(s) ? +s : null;
}

async function hledejArchiv(dotaz, pocet = 10) {
  const r = await fetch("https://archive.org/advancedsearch.php?" + new URLSearchParams({
    q: `(${dotaz}) AND mediatype:(movies)`,
    "fl[]": ["identifier", "title", "description", "licenseurl", "year", "language", "runtime"].join(","),
    rows: String(pocet), output: "json",
  }));
  if (!r.ok) throw new Error(`Internet Archive ${r.status}`);
  const d = await r.json();
  return (d.response?.docs || []).map((x) => {
    const lic = x.licenseurl || "";
    const volna = /creativecommons|publicdomain/i.test(lic);
    return {
      zdroj: "archiv", platforma: "Internet Archive",
      id: `archiv:${x.identifier}`,
      nazev: String(Array.isArray(x.title) ? x.title[0] : x.title || x.identifier),
      popis: textZHtml(Array.isArray(x.description) ? x.description[0] : x.description).slice(0, 220),
      stranka: `https://archive.org/details/${x.identifier}`,
      embed: `https://archive.org/embed/${x.identifier}`,
      nahled: `https://archive.org/services/img/${x.identifier}`,
      delka: delkaZTextu(x.runtime),
      jazyk: String(Array.isArray(x.language) ? x.language[0] : x.language || ""),
      rok: String(x.year || ""),
      licence: { stav: volna ? "volna" : "neovereno", nazev: volna ? lic.replace(/^https?:\/\/(www\.)?/, "") : "licence neuvedena – práva neověřena", autor: "", odkaz: lic || `https://archive.org/details/${x.identifier}` },
      // Archive.org z cizí stránky nepovoluje načíst soubor (CORS) → stáhnout ručně a importovat.
      lze: { sledovat: true, stahnout: "rucne", pouzit: false },
      casy: [],
    };
  });
}

// ---------------------------------------------------------------- YouTube --

const ytKlic = () => { try { return localStorage.getItem("dhpf_youtube_klic") || ""; } catch { return ""; } };

function isoDelka(iso) {
  const m = /P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso || "");
  return m ? (+(m[1] || 0)) * 86400 + (+(m[2] || 0)) * 3600 + (+(m[3] || 0)) * 60 + (+(m[4] || 0)) : null;
}

function casyZPopisu(popis) {
  const out = [];
  for (const r of String(popis || "").split("\n")) {
    const m = r.match(/(?:^|\s)((?:\d{1,2}:)?\d{1,2}:\d{2})\s*[-–—:]?\s*(.{3,80})/);
    if (m) out.push({ cas: m[1], popis: m[2].trim() });
    if (out.length >= 12) break;
  }
  return out;
}

async function hledejYouTube(dotaz, jazyk = "en", pocet = 8) {
  const klic = ytKlic();
  if (!klic) return null; // bez klíče se YouTube neprohledává
  const s = await fetch("https://www.googleapis.com/youtube/v3/search?" + new URLSearchParams({
    part: "snippet", q: dotaz, type: "video", maxResults: String(pocet), relevanceLanguage: jazyk, safeSearch: "none", key: klic,
  }));
  if (s.status === 403) throw new Error("YouTube klíč odmítnut nebo vyčerpána denní kvóta (10 000 jednotek).");
  if (!s.ok) throw new Error(`YouTube ${s.status}`);
  const sd = await s.json();
  const ids = (sd.items || []).map((i) => i.id.videoId).filter(Boolean);
  if (!ids.length) return [];
  const v = await fetch("https://www.googleapis.com/youtube/v3/videos?" + new URLSearchParams({ part: "snippet,contentDetails,status", id: ids.join(","), key: klic }));
  const vd = v.ok ? await v.json() : { items: [] };
  return (vd.items || []).map((x) => {
    const cc = x.status?.license === "creativeCommon";
    return {
      zdroj: "youtube", platforma: `YouTube · ${x.snippet.channelTitle}`,
      id: `youtube:${x.id}`,
      nazev: x.snippet.title,
      popis: (x.snippet.description || "").slice(0, 220),
      stranka: `https://www.youtube.com/watch?v=${x.id}`,
      embed: `https://www.youtube-nocookie.com/embed/${x.id}`,
      nahled: x.snippet.thumbnails?.medium?.url || x.snippet.thumbnails?.default?.url || "",
      delka: isoDelka(x.contentDetails?.duration),
      jazyk: x.snippet.defaultAudioLanguage || x.snippet.defaultLanguage || jazyk,
      rok: (x.snippet.publishedAt || "").slice(0, 4),
      licence: cc
        ? { stav: "cc-yt", nazev: "Creative Commons (YouTube) – stažení jen se svolením / ručně", autor: x.snippet.channelTitle, odkaz: `https://www.youtube.com/watch?v=${x.id}` }
        : { stav: "chranena", nazev: "Standardní licence YouTube – bez svolení nelze použít", autor: x.snippet.channelTitle, odkaz: `https://www.youtube.com/watch?v=${x.id}` },
      lze: { sledovat: x.status?.embeddable !== false, stahnout: false, pouzit: false },
      casy: casyZPopisu(x.snippet.description),
    };
  });
}

// YouTube odkaz z AI ověříme přes oEmbed (bez klíče): existuje → název a náhled.
async function overYouTube(url) {
  try {
    const r = await fetch("https://www.youtube.com/oembed?" + new URLSearchParams({ url, format: "json" }));
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

// -------------------------------------------------------- web přes AI --
// Jedno hledání pro celý scénář: AI (Gemini + Google) hledá konkrétní videa ve více jazycích.
async function hledejWebAI(projekt, jazyky) {
  const AI = window.DHAI;
  if (!AI?.maKlic()) throw new Error("Hledání na webu přes AI potřebuje Gemini klíč (Můj styl → AI pomocník).");
  const sceny = projekt.sceny.map((s, i) => ({ scena: i + 1, zaber: s.zaber, dotazy: s.dotazy }));
  const r = await AI.hledatNaWebu({
    casovyLimit: 45000,
    system: `Jsi archivář sportovních videí. Hledáš na internetu (YouTube, NHL.com, IIHF, iVysílání ČT, archivy televizí, kluby,
dokumenty) KONKRÉTNÍ videa s autentickými historickými záběry hokeje. Hledej ve více jazycích (${jazyky.map((j) => JAZYKY[j] || j).join(", ")}).
Uváděj jen videa, která jsi skutečně našel ve výsledcích hledání, s přesnou URL. Nic si nevymýšlej.`,
    zadani: `Téma reelu: ${projekt.tema}
Pro tyto scény najdi videa, která danou chvíli opravdu ukazují:
${JSON.stringify(sceny, null, 1)}

Odpověz POUZE řádky JSON Lines, jedno video na řádek:
{"scena": 1, "nazev": "název videa", "url": "https://…", "platforma": "YouTube / NHL.com / ČT…", "jazyk": "en", "cas": "m:ss kde je moment (pokud víš)", "popis": "co je vidět"}`,
  });
  const polozky = AI.objektyZTextu(r.text).filter((x) => x && /^https?:\/\//.test(x.url || ""));
  const out = [];
  for (const x of polozky.slice(0, 30)) {
    const yt = /youtube\.com|youtu\.be/.test(x.url) ? await overYouTube(x.url) : null;
    if (/youtube\.com|youtu\.be/.test(x.url) && !yt) continue; // neexistující YouTube odkaz zahodíme
    const ytId = (x.url.match(/(?:v=|youtu\.be\/|shorts\/)([\w-]{11})/) || [])[1];
    out.push({
      zdroj: "web", platforma: x.platforma || new URL(x.url).hostname.replace(/^www\./, ""),
      id: `web:${x.url}`,
      scena: Number(x.scena) - 1,
      nazev: yt?.title || x.nazev || x.url,
      popis: x.popis || "",
      stranka: x.url,
      embed: ytId ? `https://www.youtube-nocookie.com/embed/${ytId}` : "",
      nahled: yt?.thumbnail_url || "",
      delka: null,
      jazyk: x.jazyk || "",
      rok: "",
      licence: { stav: "neovereno", nazev: "práva neověřena – jen ke sledování", autor: yt?.author_name || "", odkaz: x.url },
      lze: { sledovat: true, stahnout: false, pouzit: false },
      casy: x.cas ? [{ cas: x.cas, popis: x.popis || "" }] : [],
      odAI: !yt,
    });
  }
  return { vysledky: out, zdroje: r.zdroje };
}

// ---------------------------------------------------------------- skóre --

function relevance(v, scena, projekt) {
  const klice = new Set(norm([scena.zaber, scena.text, projekt.tema, ...Object.values(scena.dotazy || {})].join(" "))
    .split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !["hokej", "hockey", "video", "zabery", "footage", "nebo", "kdyz"].includes(w)));
  const text = norm(`${v.nazev} ${v.popis}`);
  let shoda = 0;
  klice.forEach((k) => { if (text.includes(k)) shoda++; });
  let skore = Math.min(70, (shoda / Math.max(4, Math.min(10, klice.size))) * 90);
  const roky = norm(scena.text + " " + scena.zaber).match(/\b(18|19|20)\d{2}\b/g) || [];
  if (roky.some((r) => text.includes(r) || v.rok === r)) skore += 20;
  if (/hockey|hokej|хоккей|ishockey|jääkiekko|eishockey|nhl|iihf/.test(text)) skore += 10;
  if (v.lze?.pouzit) skore += 5;
  return Math.max(1, Math.min(100, Math.round(skore)));
}

// Hledání pro jednu scénu ve všech zdrojích a jazycích.
async function hledejProScenu(projekt, scena, jazyky, priZdroji = () => {}) {
  const dotazy = jazyky.map((j) => [j, scena.dotazy?.[j]]).filter(([, q]) => q);
  if (!dotazy.length) dotazy.push(["en", scena.zaber || projekt.tema]);
  const en = scena.dotazy?.en || dotazy[0][1];
  const ulohy = [
    ["Wikimedia Commons", hledejCommons(`${en}`).then((a) => a.length ? a : hledejCommons(`${en.split(" ").slice(0, 3).join(" ")} hockey`))],
    ["Internet Archive", hledejArchiv(`${en} hockey`)],
  ];
  if (ytKlic()) {
    for (const [j, q] of dotazy.slice(0, 3)) ulohy.push([`YouTube (${j})`, hledejYouTube(q, j, 6)]);
  }
  const vysledky = [], chyby = [];
  await Promise.all(ulohy.map(async ([nazev, slib]) => {
    try {
      const v = await slib;
      if (v) vysledky.push(...v);
      priZdroji(nazev, v ? v.length : 0);
    } catch (e) { chyby.push(`${nazev}: ${e.message}`); priZdroji(nazev, -1); }
  }));
  const videno = new Set();
  return {
    vysledky: vysledky.filter((v) => !videno.has(v.id) && videno.add(v.id))
      .map((v) => ({ ...v, relevance: relevance(v, scena, projekt) }))
      .sort((a, b) => b.lze.pouzit - a.lze.pouzit || b.relevance - a.relevance),
    chyby,
  };
}

// ------------------------------------------------------------- knihovna --

function metaVidea(url) {
  return new Promise((ok) => {
    const v = document.createElement("video");
    v.preload = "metadata"; v.muted = true; v.crossOrigin = "anonymous";
    v.onloadedmetadata = () => {
      const meta = { delka: v.duration, sirka: v.videoWidth, vyska: v.videoHeight };
      v.currentTime = Math.min(1, v.duration / 3);
      v.onseeked = () => {
        let nahled = "";
        try {
          const c = document.createElement("canvas");
          c.width = 240; c.height = Math.round(240 * (v.videoHeight / v.videoWidth || 0.56));
          c.getContext("2d").drawImage(v, 0, 0, c.width, c.height);
          nahled = c.toDataURL("image/jpeg", 0.7);
        } catch { /* zdroj bez CORS */ }
        ok({ ...meta, nahled, prehratelne: true });
      };
    };
    v.onerror = () => ok({ prehratelne: false });
    v.src = url;
    setTimeout(() => ok({ prehratelne: false, casovyLimit: true }), 20000);
  });
}

// Import vlastních (autorizovaných) souborů.
async function importujSoubor(projekt, soubor) {
  const typ = soubor.type.startsWith("image/") ? "foto" : soubor.type.startsWith("video/") || /\.(mp4|webm|mov|m4v|mkv)$/i.test(soubor.name) ? "video" : null;
  if (!typ) throw new Error(`„${soubor.name}“ není video ani obrázek.`);
  const souborId = await U().ulozSoubor(soubor, { nazev: soubor.name });
  const url = await U().souborUrl(souborId);
  let meta = {};
  if (typ === "video") {
    meta = await metaVidea(url);
    if (!meta.prehratelne) throw new Error(`Video „${soubor.name}“ tenhle prohlížeč neumí přehrát. Převeď ho na MP4 (H.264) nebo WebM.`);
  } else {
    meta = await new Promise((ok) => { const i = new Image(); i.onload = () => ok({ sirka: i.naturalWidth, vyska: i.naturalHeight, nahled: url }); i.onerror = () => ok({}); i.src = url; });
  }
  const id = U().noveId("k");
  projekt.klipy[id] = {
    id, typ, zdroj: "import", nazev: soubor.name.replace(/\.[a-z0-9]+$/i, ""), souborId,
    nahled: meta.nahled || "", delka: meta.delka || null, sirka: meta.sirka, vyska: meta.vyska,
    licence: { stav: "neovereno", nazev: "vlastní import – potvrď práva", autor: "", odkaz: "" },
    puvod: "",
  };
  return projekt.klipy[id];
}

// Výsledek z Commons → klip v knihovně (ověří, že jde načíst do střihu).
async function pridejZVysledku(projekt, v) {
  const existuje = Object.values(projekt.klipy).find((k) => k.vysledekId === v.id);
  if (existuje) return existuje;
  if (!v.lze.stahnout || v.lze.stahnout === "rucne" || !v.url) throw new Error("Tenhle zdroj nejde načíst přímo – otevři ho, stáhni (pokud to licence dovoluje) a importuj soubor.");
  let url = v.url;
  let meta = await metaVidea(url);
  if (!meta.prehratelne && v.zalozniUrl && v.zalozniUrl !== url) { url = v.zalozniUrl; meta = await metaVidea(url); }
  if (!meta.prehratelne) throw new Error("Video se nepodařilo načíst (formát, nebo zdroj teď omezuje počet stažení). Zkus to za chvíli nebo jiný výsledek.");
  const id = U().noveId("k");
  projekt.klipy[id] = {
    id, typ: "video", zdroj: v.zdroj, vysledekId: v.id, nazev: v.nazev, url,
    nahled: v.nahled || meta.nahled, delka: meta.delka || v.delka, sirka: meta.sirka, vyska: meta.vyska,
    licence: { ...v.licence }, puvod: v.stranka,
  };
  return projekt.klipy[id];
}

window.DHReelsZabery = { JAZYKY, hledejCommons, hledejArchiv, hledejYouTube, hledejWebAI, hledejProScenu, relevance, importujSoubor, pridejZVysledku, metaVidea, ytKlic, casyZPopisu, isoDelka };
})();
