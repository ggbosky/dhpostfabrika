// Volitelný AI pomocník: Google Gemini (zdarma, vlastní klíč uložený jen v prohlížeči)
// a hledání volně použitelných fotek na Wikimedia Commons (bez klíče).
(() => {
"use strict";

const $ = (s, el = document) => el.querySelector(s);
const KLIC = "dhpf_gemini_klic";
const MODELY = [
  "gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.6-flash",
  "gemini-3.5-flash", "gemini-2.5-flash", "gemini-3.1-flash-lite",
];

const nacti = (k) => { try { return localStorage.getItem(k) || ""; } catch { return ""; } };
const uloz = (k, v) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch { /* nic */ } };

const klic = () => nacti(KLIC).trim();
const maKlic = () => !!klic();

class AIChyba extends Error {}

// ------------------------------------------------------------------ Gemini --

async function gemini({ system, zadani, schema, teplota = 0.9 }) {
  if (!maKlic()) throw new AIChyba("Chybí Gemini klíč – vlož ho v záložce Můj styl → AI pomocník.");
  const posledni = nacti("dhpf_gemini_model");
  const poradi = [...new Set([posledni, ...MODELY].filter(Boolean))];
  let limit = false, chyba = null;

  for (const model of poradi) {
    let odpoved;
    try {
      odpoved = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": klic() },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: zadani }] }],
          generationConfig: { responseMimeType: "application/json", responseJsonSchema: schema, temperature: teplota },
        }),
      });
    } catch (e) {
      chyba = e;
      continue; // síť / přetížení – zkus další model
    }
    if (odpoved.ok) {
      const data = await odpoved.json();
      const text = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
      if (!text) { chyba = new AIChyba("AI nevrátila žádný text."); continue; }
      try {
        const vysledek = JSON.parse(text);
        uloz("dhpf_gemini_model", model);
        return vysledek;
      } catch { chyba = new AIChyba("AI vrátila neplatnou odpověď."); continue; }
    }
    const telo = await odpoved.text();
    if (odpoved.status === 404) continue;
    if (odpoved.status === 429) { limit = true; continue; }
    if (odpoved.status >= 500) { chyba = new AIChyba(`Model ${model} je přetížený.`); continue; }
    if (odpoved.status === 400 && /API key|API_KEY/i.test(telo)) throw new AIChyba("Neplatný Gemini klíč. Zkontroluj ho v záložce Můj styl → AI pomocník.");
    if (odpoved.status === 403) throw new AIChyba("Google klíč odmítl (403). Zkontroluj, že je to klíč z aistudio.google.com/apikey.");
    chyba = new AIChyba(`Gemini chyba ${odpoved.status}: ${telo.slice(0, 200)}`);
  }
  if (limit) throw new AIChyba("Dnešní bezplatný limit Gemini je vyčerpaný u všech modelů. Obnoví se v 9:00 českého času – do té doby tvoř ručně.");
  throw chyba instanceof AIChyba ? chyba : new AIChyba("Gemini teď neodpovídá, zkus to za chvíli.");
}

// Volání s vyhledáváním Google (grounding). Vrací text + zdroje, ze kterých model čerpal.
// Pozn.: hledání nejde kombinovat s JSON režimem, proto se JSON čte z textu.
async function hledatNaWebu({ system, zadani, teplota = 0.3 }) {
  if (!maKlic()) throw new AIChyba("Chybí Gemini klíč – vlož ho v záložce Můj styl → AI pomocník.");
  const posledni = nacti("dhpf_gemini_model_web");
  const poradi = [...new Set([posledni, "gemini-2.5-flash", ...MODELY].filter(Boolean))];
  let limit = false, chyba = null;
  for (const model of poradi) {
    let odpoved;
    try {
      odpoved = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": klic() },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: zadani }] }],
          tools: [{ google_search: {} }],
          generationConfig: { temperature: teplota },
        }),
      });
    } catch (e) { chyba = e; continue; }
    if (odpoved.ok) {
      const data = await odpoved.json();
      const kandidat = data.candidates?.[0] || {};
      const text = (kandidat.content?.parts || []).map((p) => p.text || "").join("");
      const gm = kandidat.groundingMetadata || {};
      const zdroje = (gm.groundingChunks || []).map((c) => ({ titulek: c.web?.title || c.web?.domain || "zdroj", uri: c.web?.uri || "" }));
      if (!text) { chyba = new AIChyba("AI nevrátila žádný text."); continue; }
      uloz("dhpf_gemini_model_web", model);
      return {
        text,
        zdroje,
        podpory: (gm.groundingSupports || []).map((s) => ({ text: s.segment?.text || "", indexy: s.groundingChunkIndices || [] })),
        dotazy: gm.webSearchQueries || [],
      };
    }
    const telo = await odpoved.text();
    if (odpoved.status === 404) continue;
    if (odpoved.status === 429) { limit = true; continue; }
    if (odpoved.status >= 500) { chyba = new AIChyba(`Model ${model} je přetížený.`); continue; }
    if (odpoved.status === 400 && /API key|API_KEY/i.test(telo)) throw new AIChyba("Neplatný Gemini klíč. Zkontroluj ho v záložce Můj styl → AI pomocník.");
    if (odpoved.status === 403) throw new AIChyba("Google klíč odmítl (403).");
    chyba = new AIChyba(`Gemini chyba ${odpoved.status}: ${telo.slice(0, 160)}`);
  }
  if (limit) throw new AIChyba("Dnešní bezplatný limit Gemini je vyčerpaný. Obnoví se v 9:00 českého času.");
  throw chyba instanceof AIChyba ? chyba : new AIChyba("Gemini teď neodpovídá, zkus to za chvíli.");
}

// JSON z odpovědi typu "…```json [ … ] ```…".
function jsonZTextu(text) {
  const blok = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  let kus = blok ? blok[1] : text;
  const zacatek = kus.search(/[[{]/);
  const konec = Math.max(kus.lastIndexOf("]"), kus.lastIndexOf("}"));
  if (zacatek < 0 || konec < zacatek) throw new AIChyba("AI nevrátila data v očekávaném tvaru, zkus to znovu.");
  kus = kus.slice(zacatek, konec + 1);
  try { return JSON.parse(kus); } catch { throw new AIChyba("AI vrátila poškozená data, zkus to znovu."); }
}

const normalizuj = (s) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// Zdroje, o které se opírá daný kus textu (podle groundingSupports).
// Úsek odpovědi se přiřadí, když většina jeho slov je i v textu položky.
function zdrojeProText(vysledek, textPolozky) {
  const slovaCile = new Set(normalizuj(textPolozky).split(" ").filter((w) => w.length >= 3));
  const indexy = new Set();
  for (const p of vysledek.podpory) {
    const slova = normalizuj(p.text.replace(/"[a-z_]+"\s*:/gi, " ")).split(" ").filter((w) => w.length >= 3);
    if (slova.length < 3) continue;
    const shoda = slova.filter((w) => slovaCile.has(w)).length / slova.length;
    if (shoda >= 0.7) p.indexy.forEach((i) => indexy.add(i));
  }
  const videne = new Set();
  return [...indexy].map((i) => vysledek.zdroje[i]).filter((z) => z && !videne.has(z.titulek) && videne.add(z.titulek));
}

// Popis stylu z naučeného profilu pro prompt.
function stylDoPromptu() {
  let p = null;
  try { p = JSON.parse(localStorage.getItem("dhpf_profil")); } catch { /* nic */ }
  if (!p) {
    return "Styl účtu (výchozí odhad): úderný zpravodajsko-fanouškovský tón, hook s 1 emoji, " +
      "2–4 krátké odstavce, střídmě emoji (🏒 🚨 🔥 🇨🇿 👇), na konci otázka na fanoušky, " +
      "hashtagy #denikhokeje #hokej + soutěž a týmy (celkem 6–10).";
  }
  return [
    `Styl naučený z ${p.pocet} reálných postů účtu:`,
    `- průměrná délka ${p.prumerZnaku} znaků`,
    `- hashtagy v každém postu: ${p.stale.join(" ") || "žádné"}; obvykle ${p.pocetTagu} hashtagů; časté: ${p.hashtagy.slice(0, 15).join(" ")}`,
    `- emoji: ${p.emojiNaPost} na post${p.emoji.length ? ` (${p.emoji.join(" ")})` : ""}`,
    p.cta.length ? `- typické výzvy na konci: ${p.cta.slice(0, 6).map((c) => `„${c}“`).join(", ")}` : "",
  ].filter(Boolean).join("\n");
}

function dnes() {
  const d = new Date();
  return `${d.getDate()}. ${d.getMonth() + 1}. ${d.getFullYear()}`;
}

const PRAVIDLA = `Pravidla:
- Piš česky, přirozeně, bez AI frází („v dnešním příspěvku“, „pojďme se podívat“).
- NEVYMÝŠLEJ fakta. Výsledky, statistiky, citace, přestupy, data a jména uváděj jen ze zadání nebo
  z toho, co bezpečně víš z historie. Kde údaj chybí, napiš [DOPLNIT: co] a uveď to v k_overeni.
- Do k_overeni dej i každé tvrzení, které by si měl redaktor před zveřejněním ověřit.
- Dotazy na fotky jsou pro Wikimedia Commons: KRÁTKÉ, 2–4 slova, bez diakritiky, hlavně celé jméno
  hráče, klubu nebo arény (např. "Dominik Hasek", "David Pastrnak", "HC Kometa Brno", "O2 Arena Prague",
  "Lokomotiv Yaroslavl"). Žádné roky, popisy situací ani emoji.`;

// --------------------------------------------------------- Wikimedia Commons --

function textZHtml(html) {
  return new DOMParser().parseFromString(html || "", "text/html").body.textContent.replace(/\s+/g, " ").trim();
}

const UA = "DHPostFabrika/1.0 (https://ggbosky.github.io/dhpostfabrika/)";
const pockej = (ms) => new Promise((r) => setTimeout(r, ms));
const mezipamet = new Map();

async function hledejWikimedia(q, pocet) {
  const url = "https://commons.wikimedia.org/w/api.php?" + new URLSearchParams({
    action: "query", format: "json", origin: "*",
    generator: "search", gsrsearch: `${q} filetype:bitmap`, gsrnamespace: "6", gsrlimit: String(pocet),
    prop: "imageinfo", iiprop: "url|size|extmetadata|mime", iiurlwidth: "1600",
    iiextmetadatafilter: "Artist|LicenseShortName",
  });
  let r;
  for (let pokus = 0; pokus < 2; pokus++) {
    r = await fetch(url, { headers: { "Api-User-Agent": UA } });
    if (r.status !== 429) break;
    await pockej(1500);
  }
  if (!r.ok) throw new AIChyba(`Wikimedia ${r.status}`);
  const data = await r.json();
  const stranky = Object.values(data.query?.pages || {}).sort((a, b) => (a.index || 0) - (b.index || 0));
  return stranky.map((s) => {
    const ii = s.imageinfo?.[0];
    if (!ii || !/jpeg|png|webp/.test(ii.mime || "") || Math.min(ii.width, ii.height) < 500) return null;
    const m = ii.extmetadata || {};
    const velka = ii.thumburl || ii.url;
    return {
      url: velka,
      nahled: velka.replace(/\/\d+px-([^/]+)$/, "/400px-$1"),
      stranka: ii.descriptionurl,
      autor: textZHtml(m.Artist?.value) || "neznámý autor",
      licence: textZHtml(m.LicenseShortName?.value) || "viz Wikimedia",
      zdroj: "Wikimedia Commons",
      nazev: s.title.replace(/^File:/, "").replace(/\.[a-z]+$/i, ""),
    };
  }).filter(Boolean);
}

function licenceOpenverse(r) {
  const l = (r.license || "").toLowerCase();
  if (l === "cc0") return "CC0";
  if (l === "pdm") return "volné dílo";
  return `CC ${l.toUpperCase()} ${r.license_version || ""}`.trim();
}

async function hledejOpenverse(q, pocet) {
  const r = await fetch("https://api.openverse.org/v1/images/?" + new URLSearchParams({
    q, page_size: String(Math.min(pocet, 20)), license_type: "commercial,modification", mature: "false",
  }));
  if (!r.ok) throw new AIChyba(`Openverse ${r.status}`);
  const data = await r.json();
  return (data.results || [])
    .filter((x) => x.url && !(x.width && x.height && Math.min(x.width, x.height) < 500))
    .map((x) => ({
      url: x.url,
      nahled: x.thumbnail || x.url,
      stranka: x.foreign_landing_url,
      autor: x.creator || "neznámý autor",
      licence: licenceOpenverse(x),
      zdroj: x.source === "wikimedia" || x.provider === "wikimedia" ? "Wikimedia Commons" : (x.source || x.provider || "Openverse").replace(/^./, (c) => c.toUpperCase()),
      nazev: x.title || "fotka",
    }));
}

// Volně použitelné fotky: nejdřív Wikimedia Commons, při chybě nebo prázdném výsledku Openverse.
async function hledejFotky(dotaz, pocet = 16) {
  const q = (dotaz || "").trim();
  if (!q) return [];
  if (mezipamet.has(q)) return mezipamet.get(q);
  let vysledky = [];
  try { vysledky = await hledejWikimedia(q, pocet); } catch { /* zkus Openverse */ }
  if (!vysledky.length) {
    try { vysledky = await hledejOpenverse(q, pocet); } catch (e) {
      if (!vysledky.length) throw new AIChyba("Hledání fotek teď nefunguje (Wikimedia i Openverse odmítly). Zkus to za chvíli, nebo nahraj vlastní fotku.");
    }
  }
  mezipamet.set(q, vysledky);
  return vysledky;
}

function nactiWebFotoJednou(url) {
  return new Promise((ok, chyba) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => ok(img);
    img.onerror = () => chyba(new AIChyba("Fotku se nepodařilo stáhnout."));
    img.src = url;
  });
}

async function nactiWebFoto(url) {
  try { return await nactiWebFotoJednou(url); } catch {
    await pockej(1500); // Wikimedia občas krátce omezí počet stažení
    return nactiWebFotoJednou(url);
  }
}

// "#denikhokeje壮#hokej", "hokej", "#Hokej" → ["#denikhokeje", "#hokej"]
function staleHashtagy() {
  try {
    const p = JSON.parse(localStorage.getItem("dhpf_profil"));
    if (p?.stale?.length) return p.stale;
  } catch { /* nic */ }
  return ["#denikhokeje", "#hokej"];
}

function cisteHashtagy(seznam) {
  const out = [], videne = new Set();
  const stale = staleHashtagy().map((t) => t.replace(/^#/, "").toLowerCase());
  for (const polozka of [...staleHashtagy(), ...(seznam || [])]) {
    for (const kus of String(polozka).split(/[#,]+/)) {
      const tag = kus.replace(/[^\p{Script=Latin}\p{N}_]/gu, "");
      if (tag.length < 2 || videne.has(tag.toLowerCase())) continue;
      // překlepy značkových hashtagů typu #denikhokejeme
      if (stale.some((s) => s.length >= 6 && tag.toLowerCase() !== s && tag.toLowerCase().startsWith(s))) continue;
      videne.add(tag.toLowerCase());
      out.push("#" + tag);
    }
  }
  return out.slice(0, 30);
}

const kredit = (f) => `📸 Foto: ${f.autor} / ${f.zdroj}, ${f.licence}`;

// Dialog s mřížkou fotek. Vrací {img, foto} nebo null.
function vyberFoto(vychoziDotaz) {
  return new Promise((hotovo) => {
    let dlg = $("#fotoDialog");
    if (!dlg) {
      dlg = document.createElement("dialog");
      dlg.id = "fotoDialog";
      dlg.innerHTML = `
        <form method="dialog" class="dlg-hlava">
          <b>Najít fotku (volně použitelné fotky z Wikimedia Commons a Openverse)</b>
          <button class="ikona" value="zavrit" aria-label="Zavřít">✕</button>
        </form>
        <div class="radek dlg-hledat"><input id="fdDotaz" placeholder="např. Kometa Brno ice hockey"><button type="button" class="btn small" id="fdHledej">Hledat</button></div>
        <p class="muted dlg-info" id="fdInfo"></p>
        <div class="dlg-mrizka" id="fdMrizka"></div>`;
      document.body.appendChild(dlg);
    }
    const info = $("#fdInfo", dlg), mrizka = $("#fdMrizka", dlg), vstup = $("#fdDotaz", dlg);
    let vysledky = [];
    let poradi = 0;
    const hledej = async () => {
      const moje = ++poradi;
      info.textContent = "Hledám…";
      mrizka.innerHTML = "";
      try {
        const nalezene = await hledejFotky(vstup.value);
        if (moje !== poradi) return; // mezitím začalo novější hledání
        vysledky = nalezene;
        info.textContent = vysledky.length
          ? "Klikni na fotku. U každé se do popisku přidá autor a licence (podmínka použití)."
          : "Nic jsem nenašel. Zkus jiný dotaz – celé jméno hráče, klubu nebo arény, případně anglicky.";
        mrizka.innerHTML = vysledky.map((f, i) =>
          `<button type="button" data-i="${i}" title="${f.nazev.replace(/"/g, "&quot;")}"><img src="${f.nahled}" alt="" loading="lazy" referrerpolicy="no-referrer"><span>${f.licence}</span></button>`).join("");
      } catch (e) { if (moje === poradi) info.textContent = e.message; }
    };
    $("#fdHledej", dlg).onclick = hledej;
    vstup.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); hledej(); } };
    mrizka.onclick = async (e) => {
      const b = e.target.closest("button[data-i]");
      if (!b) return;
      const foto = vysledky[Number(b.dataset.i)];
      info.textContent = "Načítám fotku…";
      try {
        const img = await nactiWebFoto(foto.url);
        dlg.onclose = null;
        dlg.close();
        hotovo({ img, foto });
      } catch (err) { info.textContent = err.message; }
    };
    dlg.onclose = () => hotovo(null);
    vstup.value = vychoziDotaz || "";
    dlg.showModal();
    if (vstup.value) hledej(); else vstup.focus();
  });
}

// Automaticky první použitelná fotka pro seznam dotazů.
// Z "Dominik Hasek Nagano 1998 goalie" udělá i kratší dotazy ("Dominik Hasek Nagano", "Dominik Hasek").
function zjednodusene(dotazy) {
  const out = [];
  for (const d of dotazy.filter(Boolean)) {
    const slova = d.trim().split(/\s+/);
    out.push(slova.join(" "));
    if (slova.length > 3) out.push(slova.slice(0, 3).join(" "));
    if (slova.length > 2) out.push(slova.slice(0, 2).join(" "));
  }
  return [...new Set(out)];
}

async function prvniFoto(dotazy, vynechat = new Set()) {
  for (const d of zjednodusene(dotazy)) {
    try {
      const nalezene = (await hledejFotky(d, 10)).filter((f) => !vynechat.has(f.url));
      for (const foto of nalezene.slice(0, 3)) {
        try { return { img: await nactiWebFoto(foto.url), foto, dotaz: d }; } catch { /* další */ }
      }
    } catch { /* další dotaz */ }
  }
  return null;
}

// --------------------------------------------------------- nastavení klíče --

function vykresliStav() {
  const pill = $("#pAI");
  if (pill) {
    pill.textContent = maKlic() ? "AI: zapnuto" : "AI: vypnuto";
    pill.className = "pill " + (maKlic() ? "ok" : "");
  }
  document.querySelectorAll("[data-ai-bez-klice]").forEach((el) => { el.hidden = maKlic(); });
  const vstup = $("#aiKlic");
  if (vstup && !vstup.value && maKlic()) vstup.placeholder = "•••••••• (klíč je uložený)";
}

function init() {
  vykresliStav();
  const zprava = (t, chyba) => {
    const el = $("#aiKlicZprava");
    el.textContent = t;
    el.className = "zprava " + (chyba ? "chyba" : "ok");
    el.hidden = !t;
  };
  $("#aiUlozit")?.addEventListener("click", async () => {
    const v = $("#aiKlic").value.trim();
    if (!v) { zprava("Vlož klíč.", true); return; }
    uloz(KLIC, v);
    $("#aiKlic").value = "";
    vykresliStav();
    zprava("Ověřuju klíč…");
    try {
      await gemini({ system: "Odpověz JSON.", zadani: "Vrať {\"ok\": true}.", schema: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] }, teplota: 0 });
      zprava("Klíč funguje ✓ AI pomocník je zapnutý.");
    } catch (e) {
      zprava(e.message, true);
    }
  });
  $("#aiSmazat")?.addEventListener("click", () => {
    uloz(KLIC, "");
    uloz("dhpf_gemini_model", "");
    $("#aiKlic").placeholder = "AIza…";
    vykresliStav();
    zprava("Klíč je smazaný z tohoto prohlížeče.");
  });
  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-jdi-na-ai]")) {
      e.preventDefault();
      document.querySelector('.tab[data-tab="styl"]')?.click();
      $("#aiKarta")?.scrollIntoView({ behavior: "smooth" });
    }
  });
}

window.DHAI = { hledatNaWebu, jsonZTextu, zdrojeProText, cisteHashtagy, maKlic, gemini, stylDoPromptu, dnes, PRAVIDLA, hledejFotky, nactiWebFoto, vyberFoto, prvniFoto, kredit, AIChyba };
init();
})();
