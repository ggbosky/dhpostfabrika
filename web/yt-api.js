// YouTube Data API v3 + YouTube Analytics API – přihlášení přes Google OAuth 2.0 (Google Identity Services).
// Aplikace je statická (GitHub Pages, bez serveru): používá oficiální „token model“ pro webové aplikace –
// žádné tajemství klienta v kódu, přístupový token jen v paměti (cca 1 hodina), nikdy v localStorage.
(() => {
"use strict";

const KLIC_CLIENT = "dhpf_yt_client_id";
const KLIC_KANAL = "dhpf_yt_kanal";        // jen jméno a avatar pro zobrazení „naposledy připojeno“ – žádný token
const API = "https://www.googleapis.com/youtube/v3";
const UPLOAD = "https://www.googleapis.com/upload/youtube/v3";
const ANALYTICS = "https://youtubeanalytics.googleapis.com/v2";

// Minimální oprávnění pro jednotlivé funkce (Google se na každou skupinu zeptá až při prvním použití).
const SCOPE = {
  cteni: ["https://www.googleapis.com/auth/youtube.readonly", "https://www.googleapis.com/auth/yt-analytics.readonly"],
  sprava: ["https://www.googleapis.com/auth/youtube.upload", "https://www.googleapis.com/auth/youtube"],
  komentare: ["https://www.googleapis.com/auth/youtube.force-ssl"],
};

let token = null;          // { access_token, expires_at, scopes:Set }
let klient = null;
let gisSlib = null;

const clientId = () => { try { return (localStorage.getItem(KLIC_CLIENT) || "").trim(); } catch { return ""; } };
const nastavClientId = (v) => { try { v ? localStorage.setItem(KLIC_CLIENT, v.trim()) : localStorage.removeItem(KLIC_CLIENT); } catch { /* nic */ } klient = null; };
const pripojeno = () => !!token && token.expires_at > Date.now() + 30e3;
const maScope = (s) => pripojeno() && s.every((x) => token.scopes.has(x));
const posledniKanal = () => { try { return JSON.parse(localStorage.getItem(KLIC_KANAL) || "null"); } catch { return null; } };

class YtChyba extends Error {
  constructor(zprava, kod) { super(zprava); this.kod = kod; }
}

function nactiGis() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (!gisSlib) {
    gisSlib = new Promise((ok, chyba) => {
      const s = document.createElement("script");
      s.src = "https://accounts.google.com/gsi/client";
      s.async = true;
      s.onload = () => ok();
      s.onerror = () => { gisSlib = null; chyba(new YtChyba("Nepodařilo se načíst přihlášení Google (jsi online?).")); };
      document.head.appendChild(s);
    });
  }
  return gisSlib;
}

// Získá přístupový token s danými oprávněními. Volat z kliknutí (Google otevře okno pro přihlášení/souhlas).
async function prihlas(skupiny = ["cteni"]) {
  const scopes = [...new Set(skupiny.flatMap((g) => SCOPE[g] || []))];
  if (maScope(scopes)) return token;
  if (!clientId()) throw new YtChyba("Chybí OAuth Client ID – nastav ho v YouTube Studiu → Připojení (návod je tam).", "client");
  await nactiGis();
  return new Promise((ok, chyba) => {
    const vse = [...new Set([...(token?.scopes || []), ...scopes])];
    klient = google.accounts.oauth2.initTokenClient({
      client_id: clientId(),
      scope: vse.join(" "),
      include_granted_scopes: true,
      callback: (r) => {
        if (r.error) { chyba(new YtChyba(r.error === "access_denied" ? "Přístup nebyl povolen." : `Přihlášení se nepovedlo: ${r.error_description || r.error}`, r.error)); return; }
        const udelene = new Set(String(r.scope || "").split(/\s+/).filter(Boolean));
        const chybi = scopes.filter((s) => !udelene.has(s));
        token = { access_token: r.access_token, expires_at: Date.now() + (Number(r.expires_in) || 3600) * 1000, scopes: udelene };
        if (chybi.length) { chyba(new YtChyba("Některá oprávnění nebyla povolena – v okně Google zaškrtni všechna požadovaná políčka.", "scope")); return; }
        document.dispatchEvent(new CustomEvent("dh:youtube", { detail: { pripojeno: true } }));
        ok(token);
      },
      error_callback: (e) => chyba(new YtChyba(e?.type === "popup_closed" ? "Okno přihlášení bylo zavřeno. Pokud Google ukázal „Access blocked … Error 403: access_denied“, přidej svůj Google účet v Google Cloud Console → Google Auth Platform → Audience → Test users a zkus to znovu." : e?.type === "popup_failed_to_open" ? "Prohlížeč zablokoval okno přihlášení – povol vyskakovací okna pro tuhle stránku." : `Přihlášení se nepovedlo (${e?.type || "chyba"}).`, e?.type)),
    });
    klient.requestAccessToken({ prompt: token ? "" : undefined });
  });
}

async function odhlas() {
  const t = token?.access_token;
  token = null;
  try { localStorage.removeItem(KLIC_KANAL); } catch { /* nic */ }
  if (t && window.google?.accounts?.oauth2) await new Promise((ok) => google.accounts.oauth2.revoke(t, ok));
  document.dispatchEvent(new CustomEvent("dh:youtube", { detail: { pripojeno: false } }));
}

function chybaZOdpovedi(status, j) {
  const e = j?.error || {};
  const duvod = e.errors?.[0]?.reason || e.status || "";
  const zprava = e.message || "";
  if (status === 401) { token = null; document.dispatchEvent(new CustomEvent("dh:youtube", { detail: { pripojeno: false } })); return new YtChyba("Přihlášení k YouTube vypršelo – klikni na Připojit YouTube.", "auth"); }
  if (/quotaExceeded|dailyLimitExceeded|uploadLimitExceeded/i.test(duvod)) return new YtChyba("Denní kvóta YouTube API je vyčerpaná (obnoví se o půlnoci tichomořského času). Zkus to zítra.", "kvota");
  if (/rateLimitExceeded|userRateLimitExceeded/i.test(duvod)) return new YtChyba("YouTube API: moc požadavků najednou, zkus to za chvíli.", "limit");
  if (/insufficientPermissions|forbidden|ACCESS_TOKEN_SCOPE_INSUFFICIENT/i.test(duvod + zprava)) return new YtChyba("Chybí oprávnění pro tuhle akci – klikni znovu a v okně Google povol požadovaný přístup.", "scope");
  if (/accessNotConfigured|SERVICE_DISABLED|has not been used/i.test(duvod + zprava)) return new YtChyba("V Google Cloud projektu není zapnuté potřebné API (YouTube Data API v3 / YouTube Analytics API). Zapni ho podle návodu.", "api");
  if (/youtubeSignupRequired/i.test(duvod)) return new YtChyba("Účet Google nemá YouTube kanál.", "kanal");
  return new YtChyba(`YouTube API (${status}${duvod ? ` ${duvod}` : ""}): ${zprava.slice(0, 200)}`, duvod);
}

async function api(cesta, { metoda = "GET", params = {}, telo, host = API, skupiny = ["cteni"] } = {}) {
  if (!pripojeno()) await prihlas(skupiny);
  else if (!maScope(skupiny.flatMap((g) => SCOPE[g]))) await prihlas(skupiny);
  const u = new URL(`${host}/${cesta.replace(/^\//, "")}`);
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== "") u.searchParams.set(k, v); });
  let r;
  try {
    r = await fetch(u, { method: metoda, headers: { Authorization: `Bearer ${token.access_token}`, ...(telo ? { "Content-Type": "application/json" } : {}) }, body: telo ? JSON.stringify(telo) : undefined });
  } catch { throw new YtChyba("YouTube API je nedostupné (síť)."); }
  if (r.status === 204) return {};
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw chybaZOdpovedi(r.status, j);
  return j;
}

// ---------------------------------------------------------------- data --

async function kanal() {
  const j = await api("channels", { params: { part: "snippet,statistics,contentDetails,brandingSettings", mine: "true" } });
  const c = j.items?.[0];
  if (!c) throw new YtChyba("K účtu Google není přiřazený žádný YouTube kanál (nebo jsi vybral jiný účet).", "kanal");
  const k = {
    id: c.id, nazev: c.snippet.title, avatar: c.snippet.thumbnails?.default?.url || "", vlastniUrl: c.snippet.customUrl || "",
    odberatele: c.statistics.hiddenSubscriberCount ? null : Number(c.statistics.subscriberCount),
    zhlednuti: Number(c.statistics.viewCount), videi: Number(c.statistics.videoCount),
    uploads: c.contentDetails?.relatedPlaylists?.uploads,
  };
  try { localStorage.setItem(KLIC_KANAL, JSON.stringify({ nazev: k.nazev, avatar: k.avatar })); } catch { /* nic */ }
  return k;
}

async function videa(uploads, max = 50) {
  const ids = [];
  let stranka = "";
  do {
    const j = await api("playlistItems", { params: { part: "contentDetails", playlistId: uploads, maxResults: 50, pageToken: stranka } });
    ids.push(...(j.items || []).map((x) => x.contentDetails.videoId));
    stranka = j.nextPageToken || "";
  } while (stranka && ids.length < max);
  return videaPodleId(ids.slice(0, max));
}

async function videaPodleId(ids) {
  const out = [];
  for (let i = 0; i < ids.length; i += 50) {
    const j = await api("videos", { params: { part: "snippet,statistics,contentDetails,status,processingDetails", id: ids.slice(i, i + 50).join(",") } });
    out.push(...(j.items || []));
  }
  return out.map((v) => ({
    id: v.id, nazev: v.snippet.title, popis: v.snippet.description, tagy: v.snippet.tags || [], kategorie: v.snippet.categoryId,
    publikovano: v.snippet.publishedAt, nahled: v.snippet.thumbnails?.medium?.url || v.snippet.thumbnails?.default?.url || "",
    viditelnost: v.status.privacyStatus, naplanovano: v.status.publishAt || null, stavNahrani: v.status.uploadStatus,
    zpracovani: v.processingDetails?.processingStatus || null, delka: iso8601(v.contentDetails?.duration),
    zhlednuti: Number(v.statistics?.viewCount ?? NaN), lajky: Number(v.statistics?.likeCount ?? NaN), komentare: Number(v.statistics?.commentCount ?? NaN),
    jazyk: v.snippet.defaultLanguage || "", raw: v,
  }));
}

function iso8601(d) {
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(d || "");
  return m ? (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0) : null;
}

const playlisty = async () => {
  const out = [];
  let stranka = "";
  do {
    const j = await api("playlists", { params: { part: "snippet,contentDetails,status", mine: "true", maxResults: 50, pageToken: stranka } });
    out.push(...(j.items || []).map((x) => ({ id: x.id, nazev: x.snippet.title, popis: x.snippet.description, pocet: x.contentDetails?.itemCount ?? 0, viditelnost: x.status?.privacyStatus })));
    stranka = j.nextPageToken || "";
  } while (stranka);
  return out;
};
const vytvorPlaylist = (nazev, popis = "", viditelnost = "public") =>
  api("playlists", { metoda: "POST", params: { part: "snippet,status" }, telo: { snippet: { title: nazev, description: popis, defaultLanguage: "cs" }, status: { privacyStatus: viditelnost } }, skupiny: ["sprava"] });
const upravPlaylist = (id, nazev, popis) =>
  api("playlists", { metoda: "PUT", params: { part: "snippet" }, telo: { id, snippet: { title: nazev, description: popis } }, skupiny: ["sprava"] });
const pridejDoPlaylistu = (playlistId, videoId) =>
  api("playlistItems", { metoda: "POST", params: { part: "snippet" }, telo: { snippet: { playlistId, resourceId: { kind: "youtube#video", videoId } } }, skupiny: ["sprava"] });

const kategorie = async () => {
  const j = await api("videoCategories", { params: { part: "snippet", regionCode: "CZ", hl: "cs" } });
  return (j.items || []).filter((x) => x.snippet.assignable).map((x) => ({ id: x.id, nazev: x.snippet.title }));
};

async function upravVideo(id, { snippet, status }) {
  const parts = [snippet && "snippet", status && "status"].filter(Boolean).join(",");
  return api("videos", { metoda: "PUT", params: { part: parts }, telo: { id, ...(snippet ? { snippet } : {}), ...(status ? { status } : {}) }, skupiny: ["sprava"] });
}

// Miniatura: max. 2 MB, JPG/PNG, doporučeno 1280×720. Kanál musí mít ověřený telefon (vlastní miniatury).
async function nastavMiniaturu(videoId, blob) {
  if (!/image\/(jpeg|png)/.test(blob.type)) throw new YtChyba("Miniatura musí být JPG nebo PNG.");
  if (blob.size > 2 * 1024 * 1024) throw new YtChyba("Miniatura má víc než 2 MB – YouTube ji nepřijme. Exportuj ji jako JPG.");
  if (!maScope(SCOPE.sprava)) await prihlas(["cteni", "sprava"]);
  let r;
  try {
    r = await fetch(`${UPLOAD}/thumbnails/set?videoId=${encodeURIComponent(videoId)}&uploadType=media`, { method: "POST", headers: { Authorization: `Bearer ${token.access_token}`, "Content-Type": blob.type }, body: blob });
  } catch { throw new YtChyba("Nahrání miniatury selhalo (síť)."); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (/forbidden|customThumbnail/i.test(JSON.stringify(j))) throw new YtChyba("YouTube nepovolil vlastní miniaturu – kanál musí mít ověřené telefonní číslo (youtube.com/verify).", "overeni");
    throw chybaZOdpovedi(r.status, j);
  }
  return j;
}

// ------------------------------------------------------- nahrávání videa --
// Resumable upload: 1) založí relaci (URL relace se uloží – po přerušení jde navázat), 2) pošle data
// po částech po 8 MB; po chybě sítě zjistí, kolik YouTube už má, a pokračuje.

const CAST = 8 * 1024 * 1024;

async function zalozRelaci(soubor, metadata, { part, notifikace = true }) {
  if (!maScope(SCOPE.sprava)) await prihlas(["cteni", "sprava"]);
  const u = `${UPLOAD}/videos?uploadType=resumable&part=${encodeURIComponent(part)}&notifySubscribers=${notifikace ? "true" : "false"}`;
  let r;
  try {
    r = await fetch(u, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token.access_token}`, "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Length": String(soubor.size), "X-Upload-Content-Type": soubor.type || "video/mp4",
      },
      body: JSON.stringify(metadata),
    });
  } catch { throw new YtChyba("Nahrávání se nepodařilo zahájit (síť)."); }
  if (!r.ok) throw chybaZOdpovedi(r.status, await r.json().catch(() => ({})));
  const loc = r.headers.get("Location");
  const id = r.headers.get("X-GUploader-UploadID");
  const url = loc || (id ? `${u}&upload_id=${encodeURIComponent(id)}` : null);
  if (!url) throw new YtChyba("YouTube nevrátil adresu relace nahrávání.");
  return url;
}

function xhr(metoda, url, telo, hlavicky, onPokrok) {
  return new Promise((ok, chyba) => {
    const x = new XMLHttpRequest();
    x.open(metoda, url);
    Object.entries(hlavicky).forEach(([k, v]) => x.setRequestHeader(k, v));
    if (onPokrok && x.upload) x.upload.onprogress = (e) => { if (e.lengthComputable) onPokrok(e.loaded); };
    x.onload = () => ok({ status: x.status, text: x.responseText, range: x.getResponseHeader("Range") });
    x.onerror = () => chyba(new YtChyba("Spojení se přerušilo.", "sit"));
    x.ontimeout = () => chyba(new YtChyba("Spojení vypršelo.", "sit"));
    x.send(telo);
  });
}

// Kolik bajtů už YouTube má (308 + Range), nebo hotové video (200/201).
async function stavRelace(url, velikost) {
  const r = await xhr("PUT", url, null, { Authorization: `Bearer ${token.access_token}`, "Content-Range": `bytes */${velikost}` });
  if (r.status === 200 || r.status === 201) return { hotovo: JSON.parse(r.text) };
  if (r.status === 308) {
    const m = /bytes=0-(\d+)/.exec(r.range || "");
    return { offset: m ? +m[1] + 1 : r.range === null ? null : 0 };
  }
  if (r.status === 404 || r.status === 410) return { vyprsela: true };
  throw chybaZOdpovedi(r.status, (() => { try { return JSON.parse(r.text); } catch { return {}; } })());
}

async function nahrajVideo({ soubor, metadata, part = "snippet,status", notifikace = true, relace = null, ulozRelaci = () => {}, onPokrok = () => {} }) {
  let url = relace;
  let offset = 0;
  if (url) {
    if (!maScope(SCOPE.sprava)) await prihlas(["cteni", "sprava"]);
    const s = await stavRelace(url, soubor.size);
    if (s.hotovo) return s.hotovo;
    if (s.vyprsela || s.offset === null) url = null; else offset = s.offset;
  }
  if (!url) { url = await zalozRelaci(soubor, metadata, { part, notifikace }); offset = 0; await ulozRelaci(url); }
  let pokusy = 0;
  while (true) {
    const konec = Math.min(offset + CAST, soubor.size);
    try {
      const r = await xhr("PUT", url, soubor.slice(offset, konec), {
        Authorization: `Bearer ${token.access_token}`, "Content-Type": soubor.type || "video/mp4",
        "Content-Range": `bytes ${offset}-${konec - 1}/${soubor.size}`,
      }, (n) => onPokrok(Math.min(soubor.size, offset + n), soubor.size));
      if (r.status === 200 || r.status === 201) { onPokrok(soubor.size, soubor.size); return JSON.parse(r.text); }
      if (r.status === 308) {
        const m = /bytes=0-(\d+)/.exec(r.range || "");
        offset = m ? +m[1] + 1 : konec;
        pokusy = 0;
        onPokrok(offset, soubor.size);
        continue;
      }
      if (r.status === 401) throw chybaZOdpovedi(401, {});
      if (r.status >= 500) throw new YtChyba(`Server YouTube (${r.status})`, "sit");
      throw chybaZOdpovedi(r.status, (() => { try { return JSON.parse(r.text); } catch { return {}; } })());
    } catch (e) {
      if (e.kod !== "sit" || ++pokusy > 6) throw e;
      await new Promise((ok) => setTimeout(ok, Math.min(30000, 1000 * 2 ** pokusy)));
      const s = await stavRelace(url, soubor.size).catch(() => ({}));
      if (s.hotovo) return s.hotovo;
      if (s.vyprsela) throw new YtChyba("Relace nahrávání vypršela – spusť nahrávání znovu.", "relace");
      if (typeof s.offset === "number") offset = s.offset;
    }
  }
}

// ------------------------------------------------------------ komentáře --

async function komentare({ videoId, kanalId, max = 50 }) {
  const j = await api("commentThreads", { params: { part: "snippet,replies", maxResults: Math.min(100, max), order: "relevance", textFormat: "plainText", ...(videoId ? { videoId } : { allThreadsRelatedToChannelId: kanalId }) } });
  return (j.items || []).map((t) => {
    const s = t.snippet.topLevelComment.snippet;
    return { id: t.snippet.topLevelComment.id, vlakno: t.id, videoId: t.snippet.videoId, autor: s.authorDisplayName, text: s.textOriginal || s.textDisplay, lajky: s.likeCount, cas: s.publishedAt, odpovedi: t.snippet.totalReplyCount };
  });
}
const odpovez = (parentId, text) => api("comments", { metoda: "POST", params: { part: "snippet" }, telo: { snippet: { parentId, textOriginal: text } }, skupiny: ["komentare"] });

// ------------------------------------------------------------ analytika --

const report = (params) => api("reports", { host: ANALYTICS, params: { ids: "channel==MINE", ...params } });

window.DHYouTube = {
  SCOPE, clientId, nastavClientId, pripojeno, posledniKanal, prihlas, odhlas, api, kanal, videa, videaPodleId, playlisty, vytvorPlaylist,
  upravPlaylist, pridejDoPlaylistu, kategorie, upravVideo, nastavMiniaturu, nahrajVideo, komentare, odpovez, report, iso8601, YtChyba,
};
})();
