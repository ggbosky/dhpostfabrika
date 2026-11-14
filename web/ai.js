// Volitelný AI pomocník: Claude (Anthropic, placený klíč) nebo Google Gemini (zdarma) – klíče jen v prohlížeči
// a hledání volně použitelných fotek na Wikimedia Commons (bez klíče).
(() => {
"use strict";

const $ = (s, el = document) => el.querySelector(s);
const KLIC = "dhpf_gemini_klic";
// Pořadí podle rychlosti a spolehlivosti ve free tieru (změřeno): 2.5 Flash bez „přemýšlení“ ~5 s,
// 3.1 Flash-Lite ~5 s, 3.6 Flash ~12 s; nejnovější 3.8 umí při přetížení „zamrznout“ i na minuty.
const MODELY = [
  "gemini-2.5-flash", "gemini-3.1-flash-lite", "gemini-3.6-flash",
  "gemini-3.5-flash", "gemini-3.7-flash", "gemini-3.8-flash",
];
const LIMIT_POKUSU_MS = 20000;   // jeden model nesmí čekat déle
const LIMIT_CELKEM_MS = 45000;   // celý návrh textu

const nacti = (k) => { try { return localStorage.getItem(k) || ""; } catch { return ""; } };
const uloz = (k, v) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch { /* nic */ } };

const klic = () => nacti(KLIC).trim();
const maGemini = () => !!klic();

// Claude (Anthropic API). Když je klíč vyplněný, má přednost; Gemini zůstává jako záloha.
const CLAUDE_KLIC = "dhpf_claude_klic";
const CLAUDE_MODEL = "dhpf_claude_model";
const CLAUDE_MODELY = {
  "claude-opus-5-5": "Claude Opus 5.5",
  "claude-sonnet-5-5": "Claude Sonnet 5.5",
  "claude-haiku-5-5": "Claude Haiku 5.5",
};
const claudeKlic = () => nacti(CLAUDE_KLIC).trim();
const maClaude = () => !!claudeKlic();
const claudeModel = () => (CLAUDE_MODELY[nacti(CLAUDE_MODEL)] ? nacti(CLAUDE_MODEL) : "claude-opus-5-5");

const maKlic = () => maClaude() || maGemini();

class AIChyba extends Error {}

// ------------------------------------------------------------------ Gemini --

async function geminiPrimo({ system, zadani, schema, teplota = 0.9, obrazky = [] }) {
  if (!maGemini()) throw new AIChyba("Chybí Gemini klíč – vlož ho v záložce Můj styl → AI pomocník.");
  const poradi = MODELY; // vždy od nejrychlejšího (přetížené / vyčerpané modely se přeskočí za pár sekund)
  const konec = Date.now() + LIMIT_CELKEM_MS;
  let limit = false, chyba = null;

  for (const model of poradi) {
    const zbyva = konec - Date.now();
    if (zbyva < 3000) break;
    const preruseni = new AbortController();
    const casovac = setTimeout(() => preruseni.abort(), Math.min(zbyva, LIMIT_POKUSU_MS));
    let odpoved, data;
    try {
      odpoved = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        signal: preruseni.signal,
        headers: { "Content-Type": "application/json", "x-goog-api-key": klic() },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [...obrazky.map((o) => ({ inlineData: { mimeType: o.mime, data: o.data } })), { text: zadani }] }],
          generationConfig: {
            responseMimeType: "application/json", responseJsonSchema: schema, temperature: teplota,
            // psaní textu podle zadaných faktů nepotřebuje dlouhé „přemýšlení“ – 2× rychlejší
            ...(model.startsWith("gemini-2.5") ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
          },
        }),
      });
      data = odpoved.ok ? await odpoved.json() : null;
    } catch (e) {
      clearTimeout(casovac);
      chyba = e.name === "AbortError" ? new AIChyba(`Model ${model} neodpověděl včas.`) : e;
      continue; // síť / zamrznutí – zkus další model
    }
    clearTimeout(casovac);
    if (odpoved.ok) {
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
  if (limit && !(chyba instanceof AIChyba && /neodpověděl|přetížený/.test(chyba.message))) {
    throw new AIChyba("Dnešní bezplatný limit Gemini je vyčerpaný u všech modelů. Obnoví se v 9:00 českého času – do té doby tvoř ručně.");
  }
  throw new AIChyba("Google teď odpovídá pomalu (modely jsou přetížené). Zkus to prosím znovu za chvíli.");
}

// Volání s vyhledáváním Google (grounding). Vrací text + zdroje, ze kterých model čerpal.
// Pozn.: hledání nejde kombinovat s JSON režimem, proto se JSON čte z textu.
// casovyLimit: celkový čas na odpověď (ms). Gemini 2.5 Flash bez „přemýšlení“ odpoví i s hledáním
// obvykle do 10 s; při přetížení se zkusí znovu / jiný model, ale nikdy déle než limit.
async function hledatNaWebuGemini({ system, zadani, teplota = 0.3, casovyLimit = 30000 }) {
  if (!maGemini()) throw new AIChyba("Chybí Gemini klíč – vlož ho v záložce Můj styl → AI pomocník.");
  const konec = Date.now() + casovyLimit;
  const poradi = ["gemini-2.5-flash", "gemini-2.5-flash", ...MODELY.filter((m) => m !== "gemini-2.5-flash")];
  let limit = false, chyba = null, bezHledani = null, rozpocet = 512;
  for (const model of poradi) {
    const zbyva = konec - Date.now();
    if (zbyva < 3000) break;
    const preruseni = new AbortController();
    const casovac = setTimeout(() => preruseni.abort(), Math.min(zbyva, 30000));
    let odpoved;
    try {
      odpoved = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        signal: preruseni.signal,
        headers: { "Content-Type": "application/json", "x-goog-api-key": klic() },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: zadani }] }],
          tools: [{ google_search: {} }],
          generationConfig: {
            temperature: teplota,
            // bez dlouhého „přemýšlení“ – výrazně rychlejší odpověď
            // Bez „přemýšlení“ model často vůbec nehledá a odpoví z paměti (bez zdrojů) – proto aspoň krátké.
            ...(model.startsWith("gemini-2.5") ? { thinkingConfig: { thinkingBudget: rozpocet } } : {}),
          },
        }),
      });
    } catch (e) {
      clearTimeout(casovac);
      chyba = e.name === "AbortError" ? new AIChyba("Hledání trvalo moc dlouho.") : e;
      continue;
    }
    clearTimeout(casovac);
    if (odpoved.ok) {
      const data = await odpoved.json();
      const kandidat = data.candidates?.[0] || {};
      const text = (kandidat.content?.parts || []).map((p) => p.text || "").join("");
      const gm = kandidat.groundingMetadata || {};
      const zdroje = (gm.groundingChunks || []).map((c) => ({ titulek: c.web?.title || c.web?.domain || "zdroj", uri: c.web?.uri || "" }));
      if (!text) { chyba = new AIChyba("AI nevrátila žádný text."); continue; }
      const vysledek = {
        text,
        zdroje,
        podpory: (gm.groundingSupports || []).map((s) => ({ text: s.segment?.text || "", indexy: s.groundingChunkIndices || [] })),
        dotazy: gm.webSearchQueries || [],
      };
      // Model odpověděl bez hledání na webu → jeden pokus s delším přemýšlením (pokud zbývá čas).
      if (!zdroje.length && !bezHledani && konec - Date.now() > 12000) { bezHledani = vysledek; rozpocet = 1024; continue; }
      uloz("dhpf_gemini_model_web", model);
      return zdroje.length || !bezHledani ? vysledek : bezHledani;
    }
    const telo = await odpoved.text();
    if (odpoved.status === 404) continue;
    if (odpoved.status === 429) { limit = true; continue; }
    if (odpoved.status >= 500) { chyba = new AIChyba(`Model ${model} je přetížený.`); continue; }
    if (odpoved.status === 400 && /API key|API_KEY/i.test(telo)) throw new AIChyba("Neplatný Gemini klíč. Zkontroluj ho v záložce Můj styl → AI pomocník.");
    if (odpoved.status === 403) throw new AIChyba("Google klíč odmítl (403).");
    chyba = new AIChyba(`Gemini chyba ${odpoved.status}: ${telo.slice(0, 160)}`);
  }
  if (bezHledani) return bezHledani;
  if (Date.now() >= konec - 3000) throw new AIChyba("Google teď odpovídá pomalu (je přetížený). Zkus to prosím znovu za chvíli.");
  if (limit) throw new AIChyba("Dnešní bezplatný limit Gemini je vyčerpaný. Obnoví se v 9:00 českého času.");
  throw chyba instanceof AIChyba ? chyba : new AIChyba("Gemini teď neodpovídá, zkus to za chvíli.");
}

// Hledání s průběžnou odpovědí (streaming): priTextu(text) se volá s každým kouskem textu,
// zdroje přijdou v posledním kousku. Po vypršení limitu vrátí to, co stihlo dorazit.
async function hledatNaWebuProudGemini({ system, zadani, priTextu = () => {}, teplota = 0.3, casovyLimit = 30000 }) {
  if (!maGemini()) throw new AIChyba("Chybí Gemini klíč – vlož ho v záložce Můj styl → AI pomocník.");
  const konec = Date.now() + casovyLimit;
  const poradi = ["gemini-2.5-flash", "gemini-2.5-flash", ...MODELY.filter((m) => m !== "gemini-2.5-flash")];
  let limit = false, chyba = null;
  for (const model of poradi) {
    if (konec - Date.now() < 4000) break;
    const preruseni = new AbortController();
    const casovac = setTimeout(() => preruseni.abort(), konec - Date.now());
    let text = "", gm = null;
    try {
      const odpoved = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`, {
        method: "POST",
        signal: preruseni.signal,
        headers: { "Content-Type": "application/json", "x-goog-api-key": klic() },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: zadani }] }],
          tools: [{ google_search: {} }],
          generationConfig: {
            temperature: teplota,
            // krátké „přemýšlení“: přesnější fakta, ale pořád odpověď kolem 15–20 s
            ...(model.startsWith("gemini-2.5") ? { thinkingConfig: { thinkingBudget: 512 } } : {}),
          },
        }),
      });
      if (!odpoved.ok) {
        clearTimeout(casovac);
        const telo = await odpoved.text();
        if (odpoved.status === 429) { limit = true; continue; }
        if (odpoved.status === 404 || odpoved.status >= 500) { chyba = new AIChyba(`Model ${model} je přetížený.`); continue; }
        if (odpoved.status === 400 && /API key|API_KEY/i.test(telo)) throw new AIChyba("Neplatný Gemini klíč. Zkontroluj ho v záložce Můj styl → AI pomocník.");
        chyba = new AIChyba(`Gemini chyba ${odpoved.status}: ${telo.slice(0, 160)}`);
        continue;
      }
      const ctenar = odpoved.body.getReader();
      const dekoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await ctenar.read();
        if (done) break;
        buffer += dekoder.decode(value, { stream: true });
        let i;
        while ((i = buffer.indexOf("\n")) >= 0) {
          const radek = buffer.slice(0, i).trim();
          buffer = buffer.slice(i + 1);
          if (!radek.startsWith("data:")) continue;
          let kus;
          try { kus = JSON.parse(radek.slice(5)); } catch { continue; }
          const k = kus.candidates?.[0] || {};
          const novy = (k.content?.parts || []).map((p) => p.text || "").join("");
          if (novy) { text += novy; priTextu(text); }
          if (k.groundingMetadata?.groundingChunks?.length) gm = k.groundingMetadata;
        }
      }
      clearTimeout(casovac);
    } catch (e) {
      clearTimeout(casovac);
      if (e instanceof AIChyba) throw e;
      if (!text) { chyba = e.name === "AbortError" ? new AIChyba("Hledání trvalo moc dlouho.") : e; continue; }
      // vypršel limit uprostřed odpovědi – vrátíme, co stihlo dorazit
    }
    if (!text) { chyba = new AIChyba("AI nevrátila žádný text."); continue; }
    gm = gm || {};
    return {
      text,
      zdroje: (gm.groundingChunks || []).map((c) => ({ titulek: c.web?.title || c.web?.domain || "zdroj", uri: c.web?.uri || "" })),
      podpory: (gm.groundingSupports || []).map((s) => ({ text: s.segment?.text || "", indexy: s.groundingChunkIndices || [] })),
      dotazy: gm.webSearchQueries || [],
      preruseno: Date.now() >= konec - 50,
    };
  }
  if (limit) throw new AIChyba("Dnešní bezplatný limit Gemini je vyčerpaný. Obnoví se v 9:00 českého času.");
  if (Date.now() >= konec - 4000) throw new AIChyba("Google teď odpovídá pomalu (je přetížený). Zkus to prosím znovu za chvíli.");
  throw chyba instanceof AIChyba ? chyba : new AIChyba("Gemini teď neodpovídá, zkus to za chvíli.");
}


// ------------------------------------------------------------------ Claude --
// Oficiální Anthropic SDK přímo v prohlížeči (klíč zůstává v tomhle prohlížeči a jde jen na api.anthropic.com).

let sdkSlib = null;
async function claudeKlient() {
  if (!sdkSlib) {
    sdkSlib = import("https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@1.8.0/+esm").catch(() => {
      sdkSlib = null;
      throw new AIChyba("Nepodařilo se načíst knihovnu pro Claude – zkontroluj připojení a zkus to znovu.");
    });
  }
  const m = await sdkSlib;
  const Anthropic = m.default || m.Anthropic;
  return new Anthropic({ apiKey: claudeKlic(), dangerouslyAllowBrowser: true, maxRetries: 1 });
}

function claudeChyba(e) {
  if (e instanceof AIChyba) return e;
  const s = e?.status;
  const text = String(e?.error?.error?.message || e?.message || "");
  if (e?.name === "AbortError" || e?.name === "APIUserAbortError") return new AIChyba("Claude neodpověděl včas, zkus to znovu.");
  if (s === 401) return new AIChyba("Neplatný Claude klíč. Zkontroluj ho v záložce Můj styl → AI pomocník.");
  if (/credit balance/i.test(text)) return new AIChyba("Na Anthropic účtu došel kredit. Dobij ho v Anthropic Console → Billing.");
  if (s === 403) return new AIChyba("Anthropic klíč odmítl (403) – klíč nemá oprávnění.");
  if (s === 429) return new AIChyba("Claude: moc požadavků najednou, zkus to za minutu.");
  if (s === 529 || s >= 500) return new AIChyba("Claude je teď přetížený, zkus to za chvíli.");
  if (s === 400) return new AIChyba(`Claude odmítl požadavek: ${text.slice(0, 200)}`);
  if (!s) return new AIChyba("Claude je teď nedostupný (síť). Zkus to znovu.");
  return new AIChyba(`Claude chyba ${s}: ${text.slice(0, 200)}`);
}

// Strukturovaný výstup Claude chce u každého objektu additionalProperties: false
// a nepodporuje číselné/délkové limity → schéma z Gemini se upraví.
const NEPODPOROVANE = new Set(["minimum", "maximum", "minLength", "maxLength", "maxItems", "pattern", "propertyOrdering", "nullable"]);
function prisneSchema(s) {
  if (Array.isArray(s)) return s.map(prisneSchema);
  if (!s || typeof s !== "object") return s;
  const o = {};
  for (const [k, v] of Object.entries(s)) {
    if (NEPODPOROVANE.has(k) || (k === "minItems" && v > 1)) continue;
    o[k] = k === "properties"
      ? Object.fromEntries(Object.entries(v).map(([n, p]) => [n, prisneSchema(p)]))
      : prisneSchema(v);
  }
  if (o.type === "object") {
    o.additionalProperties = false;
    if (o.properties) o.required = Object.keys(o.properties);
  }
  return o;
}

// Jedno volání se streamováním. Text chodí průběžně do priTextu; po vypršení limitu
// se vrátí, co stihlo dorazit. pause_turn (dlouhé hledání) se automaticky dokončí.
async function claudeVolani({ system, zadani, nastaveni = {}, casovyLimit, priTextu, obrazky = [] }) {
  const klient = await claudeKlient();
  const preruseni = new AbortController();
  const casovac = setTimeout(() => preruseni.abort(), casovyLimit);
  const obsah = obrazky.length
    ? [...obrazky.map((o) => ({ type: "image", source: { type: "base64", media_type: o.mime, data: o.data } })), { type: "text", text: zadani }]
    : zadani;
  const zpravy = [{ role: "user", content: obsah }];
  const bloky = [];
  let text = "", posledni = null;
  try {
    for (let kolo = 0; kolo < 4; kolo++) {
      const proud = klient.messages.stream({
        model: claudeModel(),
        max_tokens: 16000,
        system,
        messages: zpravy,
        ...nastaveni,
      }, { signal: preruseni.signal });
      proud.on("text", (kus) => { text += kus; try { priTextu?.(text); } catch { /* UI */ } });
      proud.on("contentBlock", (b) => bloky.push(b));
      posledni = await proud.finalMessage();
      if (posledni.stop_reason !== "pause_turn") break;
      zpravy.push({ role: "assistant", content: posledni.content });
    }
  } catch (e) {
    clearTimeout(casovac);
    if (preruseni.signal.aborted) {
      if (text) return { text, bloky, preruseno: true };
      throw new AIChyba("Claude neodpověděl včas, zkus to znovu.");
    }
    throw claudeChyba(e);
  }
  clearTimeout(casovac);
  if (posledni?.stop_reason === "refusal") throw new AIChyba("Claude tenhle požadavek odmítl zpracovat. Zkus ho přeformulovat.");
  if (!text.trim()) throw new AIChyba("Claude nevrátil žádný text, zkus to znovu.");
  return { text, bloky, preruseno: false };
}

async function claudeJson({ system, zadani, schema, obrazky = [] }) {
  const r = await claudeVolani({
    system,
    zadani,
    obrazky,
    casovyLimit: 120000,
    nastaveni: { output_config: { effort: "low", format: { type: "json_schema", schema: prisneSchema(schema) } } },
  });
  if (r.preruseno) throw new AIChyba("Claude neodpověděl včas, zkus to znovu.");
  try { return JSON.parse(r.text); } catch { return jsonZTextu(r.text); }
}

const POKYN_ZDROJE = `

Fakta hledej nástrojem web_search. Do každého JSON objektu, který obsahuje fakta, přidej pole "zdroje_url":
seznam přesných URL z výsledků hledání, které ta fakta dokládají (jen URL, které ti hledání opravdu vrátilo).
Odpověz jen požadovaným výstupem, bez úvodu a bez komentáře.`;

const klicUrl = (u) => String(u || "").trim().replace(/#.*$/, "").replace(/\/+$/, "").replace(/^http:/, "https:");
const domena = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return "zdroj"; } };

function textObjektu(x) {
  if (Array.isArray(x)) return x.map(textObjektu).join(" ");
  if (x && typeof x === "object") return Object.entries(x).filter(([k]) => k !== "zdroje_url").map(([, v]) => textObjektu(v)).join(" ");
  return typeof x === "string" || typeof x === "number" ? String(x) : "";
}

// Odpověď Claude → stejný tvar jako u Gemini: { text, zdroje, podpory, dotazy }.
function claudeVysledek({ text, bloky, preruseno }) {
  const nalezene = new Map(); // klíč URL → URL z výsledků hledání
  const dotazy = [];
  for (const b of bloky) {
    if (b.type === "server_tool_use" && b.input?.query) dotazy.push(b.input.query);
    if (b.type === "web_search_tool_result" && Array.isArray(b.content)) {
      b.content.forEach((r) => { if (r?.url) nalezene.set(klicUrl(r.url), r.url); });
    }
  }
  const zdroje = [], index = new Map();
  const pridej = (url) => {
    const k = klicUrl(url);
    if (!/^https:\/\//.test(k)) return -1;
    if (nalezene.size && !nalezene.has(k)) return -1; // jen URL, které hledání opravdu vrátilo
    if (!index.has(k)) {
      const uri = nalezene.get(k) || url;
      index.set(k, zdroje.length);
      zdroje.push({ titulek: domena(uri), uri });
    }
    return index.get(k);
  };
  const podpory = [];
  for (const b of bloky) {
    if (b.type !== "text" || !b.citations?.length) continue;
    const indexy = b.citations.map((c) => pridej(c.url)).filter((i) => i >= 0);
    if (indexy.length) podpory.push({ text: b.text, indexy });
  }
  const projdi = (x) => {
    if (Array.isArray(x)) { x.forEach(projdi); return; }
    if (!x || typeof x !== "object") return;
    if (Array.isArray(x.zdroje_url)) {
      const indexy = x.zdroje_url.map(pridej).filter((i) => i >= 0);
      if (indexy.length) podpory.push({ text: textObjektu(x), indexy });
    }
    Object.entries(x).forEach(([k, v]) => { if (k !== "zdroje_url") projdi(v); });
  };
  objektyZTextu(text).forEach(projdi);
  const blok = text.match(/```(?:json)?\s*(\[[\s\S]*?\])\s*```/i) || text.match(/^\s*(\[[\s\S]*\])\s*$/);
  if (blok) { try { projdi(JSON.parse(blok[1])); } catch { /* objekty už prošly výše */ } }
  return { text, zdroje, podpory, dotazy, preruseno };
}

async function claudeWeb({ system, zadani, priTextu, casovyLimit, hledani = 4 }) {
  const r = await claudeVolani({
    system: system + POKYN_ZDROJE,
    zadani,
    priTextu,
    casovyLimit,
    nastaveni: {
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: hledani }],
      output_config: { effort: "low" },
    },
  });
  return claudeVysledek(r);
}

// --------------------------------------------- výběr poskytovatele + záloha --

async function sZalohou(claudeFn, geminiFn) {
  if (maClaude()) {
    try { return await claudeFn(); } catch (e) {
      if (!maGemini()) throw e;
      console.warn("Claude selhal, zkouším Gemini:", e?.message);
      try { return await geminiFn(); } catch (e2) {
        throw new AIChyba(`${e.message} (Záloha Gemini taky selhala: ${e2.message})`);
      }
    }
  }
  if (!maGemini()) throw new AIChyba("Chybí AI klíč – vlož Claude nebo Gemini klíč v záložce Můj styl → AI pomocník.");
  return geminiFn();
}

const gemini = (o) => sZalohou(() => claudeJson(o), () => geminiPrimo(o));
const hledatNaWebu = (o) => sZalohou(
  () => claudeWeb({ ...o, casovyLimit: Math.max(o.casovyLimit || 30000, 90000) }),
  () => hledatNaWebuGemini(o));
const hledatNaWebuProud = (o) => sZalohou(
  () => claudeWeb({ ...o, casovyLimit: Math.max(o.casovyLimit || 30000, 40000), hledani: 3 }),
  () => hledatNaWebuProudGemini(o));

// ------------------------------------------------------ obrázky pro AI a z AI --

// Libovolný obrázek (HTMLImageElement / canvas / Blob / File) → JPEG base64 pro AI (max. delší strana `max` px).
async function obrazekProAI(zdroj, max = 1280, kvalita = 0.85) {
  let el = zdroj;
  if (zdroj instanceof Blob) {
    el = await new Promise((ok, chyba) => {
      const img = new Image();
      img.onload = () => ok(img);
      img.onerror = () => chyba(new AIChyba("Obrázek se nepodařilo načíst."));
      img.src = URL.createObjectURL(zdroj);
    });
  }
  const w = el.naturalWidth || el.width, h = el.naturalHeight || el.height;
  const k = Math.min(1, max / Math.max(w, h));
  const c = document.createElement("canvas");
  c.width = Math.round(w * k); c.height = Math.round(h * k);
  c.getContext("2d").drawImage(el, 0, 0, c.width, c.height);
  let url;
  try { url = c.toDataURL("image/jpeg", kvalita); } catch { throw new AIChyba("Obrázek z cizího webu nejde poslat AI (chybí povolení CORS) – nahraj ho jako soubor."); }
  return { mime: "image/jpeg", data: url.split(",")[1] };
}

// Generování obrázků: Gemini (Nano Banana). Bezplatný tier obrázky negeneruje – je potřeba placení v Google AI Studio.
const KLIC_OBR_MODEL = "dhpf_obr_model";
const OBR_MODELY = {
  "gemini-nano-banana-2.1": { nazev: "Nano Banana 2.1 – nejlepší poměr cena/kvalita (doporučeno)", cena: 0.0504 },
  "gemini-3-pro-image": { nazev: "Nano Banana Pro – nejvyšší kvalita, složité kompozice", cena: 0.134 },
  "gemini-3.1-flash-image": { nazev: "Nano Banana 2 (3.1 Flash Image)", cena: 0.101 },
  "gemini-3.1-flash-lite-image": { nazev: "Nano Banana 2 Lite – nejlevnější (jen 1K)", cena: 0.0336, velikost: "1K" },
};
const obrModel = () => (OBR_MODELY[nacti(KLIC_OBR_MODEL)] ? nacti(KLIC_OBR_MODEL) : "gemini-nano-banana-2.1");

async function generujObrazek({ prompt, obrazky = [], model = obrModel(), pomer = "16:9", velikost, casovyLimit = 150000 }) {
  if (!maGemini()) throw new AIChyba("Generování obrázků běží přes Google Gemini – vlož Gemini klíč v Můj styl → AI pomocník (a v Google AI Studio zapni placení).");
  velikost = velikost || OBR_MODELY[model]?.velikost || "2K";
  const casti = [...obrazky.map((o) => ({ inlineData: { mimeType: o.mime, data: o.data } })), { text: prompt }];
  // Pokusy od nejúplnějšího nastavení; když API nějaké pole nezná, zkusí se bez něj.
  const varianty = [
    { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: pomer, imageSize: velikost } },
    { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: pomer } },
    { responseModalities: ["TEXT", "IMAGE"] },
  ];
  let posledni = null;
  for (const generationConfig of varianty) {
    const preruseni = new AbortController();
    const casovac = setTimeout(() => preruseni.abort(), casovyLimit);
    let r, j;
    try {
      r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        signal: preruseni.signal,
        headers: { "Content-Type": "application/json", "x-goog-api-key": klic() },
        body: JSON.stringify({ contents: [{ role: "user", parts: casti }], generationConfig }),
      });
      j = await r.json().catch(() => ({}));
    } catch (e) {
      clearTimeout(casovac);
      throw new AIChyba(e.name === "AbortError" ? "Generování obrázku trvalo moc dlouho, zkus to znovu." : "Gemini je nedostupný (síť).");
    }
    clearTimeout(casovac);
    const zprava = String(j?.error?.message || "");
    if (!r.ok) {
      if (r.status === 400 && /imageSize|imageConfig|aspectRatio|responseModalities|Unknown name|Invalid JSON payload/i.test(zprava)) { posledni = zprava; continue; }
      if (r.status === 404) throw new AIChyba(`Model ${model} není dostupný – vyber jiný v Můj styl → AI pomocník.`);
      if (/free.?tier|billing|limit: ?0|paid/i.test(zprava) || r.status === 403) {
        throw new AIChyba("Gemini klíč nemá zapnuté placení – obrázky se v bezplatném režimu negenerují. V Google AI Studio (aistudio.google.com → Billing) zapni placení; jeden obrázek stojí cca 0,03–0,13 USD.");
      }
      if (r.status === 429) throw new AIChyba("Gemini: vyčerpaný limit požadavků, zkus to za chvíli.");
      if (r.status === 400 && /API key/i.test(zprava)) throw new AIChyba("Neplatný Gemini klíč.");
      throw new AIChyba(`Gemini (obrázek) chyba ${r.status}: ${zprava.slice(0, 200)}`);
    }
    if (j.promptFeedback?.blockReason) throw new AIChyba(`Gemini odmítl zadání (${j.promptFeedback.blockReason}). Zkus jiný koncept nebo použij skutečnou fotku.`);
    const casti2 = j.candidates?.[0]?.content?.parts || [];
    const obr = casti2.find((p) => (p.inlineData || p.inline_data)?.data);
    if (!obr) {
      const duvod = j.candidates?.[0]?.finishReason;
      const text = casti2.map((p) => p.text || "").join(" ").trim();
      throw new AIChyba(`Model nevrátil obrázek${duvod && duvod !== "STOP" ? ` (${duvod})` : ""}${text ? `: ${text.slice(0, 160)}` : ""}. Zkus koncept upravit nebo použít skutečnou fotku.`);
    }
    const d = obr.inlineData || obr.inline_data;
    const bin = Uint8Array.from(atob(d.data), (c) => c.charCodeAt(0));
    return { blob: new Blob([bin], { type: d.mimeType || d.mime_type || "image/png" }), model, cena: OBR_MODELY[model]?.cena ?? null };
  }
  throw new AIChyba(`Gemini nepřijal nastavení obrázku: ${String(posledni).slice(0, 200)}`);
}

// Všechny celé JSON objekty nejvyšší úrovně z (i nedokončeného) textu.
function objektyZTextu(text) {
  const out = [];
  let hloubka = 0, zacatek = -1, vRetezci = false, escape = false;
  for (let i = 0; i < text.length; i++) {
    const z = text[i];
    if (vRetezci) {
      if (escape) escape = false;
      else if (z === "\\") escape = true;
      else if (z === '"') vRetezci = false;
      continue;
    }
    if (z === '"') vRetezci = true;
    else if (z === "{") { if (hloubka === 0) zacatek = i; hloubka++; }
    else if (z === "}" && hloubka > 0) {
      hloubka--;
      if (hloubka === 0 && zacatek >= 0) {
        try { out.push(JSON.parse(text.slice(zacatek, i + 1))); } catch { /* poškozený kus */ }
        zacatek = -1;
      }
    }
  }
  return out;
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
    // úsek odpovědi může pokrývat víc položek najednou → stačí, když položka leží celá v úseku
    const slovaUseku = new Set(slova);
    const pokryti = slovaCile.size ? [...slovaCile].filter((w) => slovaUseku.has(w)).length / slovaCile.size : 0;
    if (shoda >= 0.7 || pokryti >= 0.75) p.indexy.forEach((i) => indexy.add(i));
  }
  const videne = new Set();
  return [...indexy].map((i) => vysledek.zdroje[i]).filter((z) => z && !videne.has(z.titulek) && videne.add(z.titulek));
}

// Popis stylu z naučeného profilu pro prompt.
function stylDoPromptu() {
  let p = null;
  try { p = JSON.parse(localStorage.getItem("dhpf_profil")); } catch { /* nic */ }
  if (!p) {
    return "Styl účtu (výchozí odhad): úderný fanouškovský tón, hook s 1 emoji, " +
      "2–3 krátké odstavce, střídmě emoji (🏒 🚨 🔥 🇨🇿 👇), na konci otázka na fanoušky, " +
      "hashtagy #denikhokeje #hokej + 1–3 k tématu (celkem 3–5).";
  }
  return [
    `Styl naučený z ${p.pocet} reálných postů účtu:`,
    `- průměrná délka ${p.prumerZnaku} znaků (jen horní mez – piš kratší a údernější)`,
    `- hashtagy v každém postu: ${p.stale.join(" ") || "žádné"}; obvykle ${p.pocetTagu} hashtagů; časté: ${p.hashtagy.slice(0, 15).join(" ")}`,
    `- emoji: ${p.emojiNaPost} na post${p.emoji.length ? ` (${p.emoji.join(" ")})` : ""}`,
    p.cta.length ? `- typické výzvy na konci: ${p.cta.slice(0, 6).map((c) => `„${c}“`).join(", ")}` : "",
  ].filter(Boolean).join("\n");
}

function dnes() {
  const d = new Date();
  return `${d.getDate()}. ${d.getMonth() + 1}. ${d.getFullYear()}`;
}


// Pravidla copywritingu pro všechny texty: krátce, úderně, s hookem.
const COPY = `JAK PSÁT PRO @denik_hokeje – krátce, úderně, s hookem. Kratší je vždycky lepší než delší.

HOOK (první řádek) rozhoduje, jestli člověk přestane scrollovat:
- Max 10 slov / 70 znaků – ve feedu musí být vidět celý. Žádný úvod, rovnou to nejsilnější z celého příběhu.
- Postav ho na jednom z těchto vzorců:
  • šokující číslo: „44 zápasů. Ani jedna prohra.“
  • kontrast / paradox: „V Naganu chytal jako bůh. Doma ho nechtěli.“
  • konkrétní okamžik: „63. minuta. Zbořil sám před brankou.“
  • odvážné tvrzení: „Nejlepší sezóna, jakou kdy Čech v NHL odehrál.“
  • nedokončená zápletka: „Nastoupil se zlomenou rukou. A pak…“
- Konkrétní jméno, číslo nebo detail místo obecných slov. Nejvýš 1 emoji.
- ZAKÁZÁNO: „Věděli jste, že…“, „Dnes si připomeneme…“, „Pojďme se podívat“, „Neuvěřitelný příběh“,
  „legenda“ bez konkrétního důvodu, vykřičníky za každou větou, clickbait, který text nesplní.

TĚLO:
- Nejvýš 3 krátké odstavce po 1–2 větách. Věta do 15 slov. Jedna věta = jedna informace.
- Nejsilnější detail hned za hookem. Žádná vata, žádné opakování hooku, nevysvětluj samozřejmosti.
- Tón: fanoušek, který ví víc – sebevědomě, živě, spisovně, bez patosu a bez zbytečných superlativů.
- Poslední věta těla = pointa (překvapení, emoce nebo souvislost s dneškem).

VÝZVA: jedna krátká otázka, na kterou jde odpovědět jedním slovem nebo názorem
(„Lepší gólman: Hašek, nebo Vokoun? 👇“). Nikdy „Co na to říkáte?“.

HASHTAGY: 3–5 (stálé hashtagy účtu + 1–3 k tématu). Žádné obecné #sport #instagood.
DÉLKA celého textu bez hashtagů: ideálně 250–450 znaků. Délku z naučeného stylu ber jen jako horní mez.
EMOJI: celkem 1–3, nikdy na začátku každého řádku.`;

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

// Fotka nejdéle za ~12 s – jinak null (uživatel si ji pak najde ručně).
function prvniFoto(dotazy, vynechat = new Set(), limitMs = 12000) {
  return Promise.race([prvniFotoBezLimitu(dotazy, vynechat), pockej(limitMs).then(() => null)]);
}

async function prvniFotoBezLimitu(dotazy, vynechat) {
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
    pill.textContent = maClaude() ? `AI: ${CLAUDE_MODELY[claudeModel()]}` : maGemini() ? "AI: Gemini" : "AI: vypnuto";
    pill.className = "pill " + (maKlic() ? "ok" : "");
  }
  const cVstup = $("#aiClaudeKlic");
  if (cVstup && !cVstup.value) cVstup.placeholder = maClaude() ? "•••••••• (klíč je uložený)" : "sk-ant-…";
  const volba = $("#aiClaudeModel");
  if (volba) volba.value = claudeModel();
  const stav = $("#aiPoskytovatel");
  if (stav) {
    stav.className = "zprava " + (maKlic() ? "ok" : "");
    stav.textContent = maClaude()
      ? `Teď pracuje ${CLAUDE_MODELY[claudeModel()]}${maGemini() ? " (Gemini je záloha, kdyby Claude selhal)" : ""}.`
      : maGemini() ? "Teď pracuje Google Gemini (zdarma, s denním limitem)." : "AI je vypnutá – vlož aspoň jeden klíč.";
  }
  document.querySelectorAll("[data-ai-bez-klice]").forEach((el) => { el.hidden = maKlic(); });
  const vstup = $("#aiKlic");
  if (vstup && !vstup.value && maKlic()) vstup.placeholder = "•••••••• (klíč je uložený)";
}

// ------------------------------------------------ nástroje na texty postů --
// Pod popisky postu / carouselu / výročí: jiný hook, zkrátit, úderněji (+ vrátit zpět).

const CILE_TEXTU = { post: "#text", carousel: "#cPopisek", vyroci: "#vPopisek" };
const CHRANENE = /^\s*(#|📸|ℹ️)/u;

function rozdelText(text) {
  const obsah = [], chranene = [];
  for (const o of text.split(/\n{2,}/)) (CHRANENE.test(o) ? chranene : obsah).push(o.trim());
  return { obsah: obsah.filter(Boolean), chranene: chranene.filter(Boolean) };
}
const slozText = (obsah, chranene) => [...obsah, ...chranene].filter(Boolean).join("\n\n");

function nastavText(ta, text) {
  ta.value = text;
  ta.dispatchEvent(new Event("input", { bubbles: true }));
}

function boxNastroju(ta) {
  return ta.parentElement.querySelector(`.text-nastroje[data-pro="${ta.id}"]`);
}

function nabidniHooky(cil, hooky) {
  const ta = typeof cil === "string" ? $(cil) : cil;
  const box = ta && boxNastroju(ta);
  if (!box) return;
  const seznam = [...new Set((hooky || []).map((h) => String(h || "").trim()).filter(Boolean))];
  const el = box.querySelector(".tn-hooky");
  el.innerHTML = seznam.length > 1
    ? `<span class="muted">Hook:</span>${seznam.map((h) => `<button type="button" class="tn-hook" data-tn-hook="${h.replace(/"/g, "&quot;")}">${h.replace(/</g, "&lt;")}</button>`).join("")}`
    : "";
  zvyrazniHook(ta);
}

function zvyrazniHook(ta) {
  const box = boxNastroju(ta);
  if (!box) return;
  const prvni = (rozdelText(ta.value).obsah[0] || "").trim();
  box.querySelectorAll(".tn-hook").forEach((b) => b.classList.toggle("on", b.dataset.tnHook.trim() === prvni));
}

async function upravText(ta, akce, tlacitko) {
  const box = boxNastroju(ta);
  const stav = box.querySelector(".tn-stav");
  const { obsah, chranene } = rozdelText(ta.value);
  if (!obsah.length) { stav.textContent = "Nejdřív je potřeba nějaký text."; return; }
  if (!maKlic()) { stav.innerHTML = 'Potřebuje AI klíč – <a href="#" data-jdi-na-ai>nastavit</a>.'; return; }
  const tlacitka = box.querySelectorAll("button");
  tlacitka.forEach((b) => { b.disabled = true; });
  const puvodniPopis = tlacitko.textContent;
  tlacitko.textContent = "Píšu…";
  stav.textContent = "";
  const system = `Jsi nejlepší copywriter Instagramu @denik_hokeje (český hokej).\n\n${COPY}\n\n${stylDoPromptu()}\n\n` +
    "Fakta, čísla, jména a data NIKDY neměň ani nepřidávej nová. Neměň význam. Hashtagy ani zdroje nepiš (přidají se samy).";
  try {
    if (akce === "hook") {
      const r = await gemini({
        system,
        zadani: `TEXT POSTU:\n${obsah.join("\n\n")}\n\nNapiš 5 nových hooků (první řádek) – každý podle jiného vzorce, max 10 slov, nejvýš 1 emoji. Seřaď od nejsilnějšího.`,
        schema: { type: "object", properties: { hooky: { type: "array", items: { type: "string" } } }, required: ["hooky"] },
      });
      const hooky = (r.hooky || []).filter(Boolean);
      if (!hooky.length) throw new AIChyba("AI žádný hook nevymyslela, zkus to znovu.");
      box.dataset.zpet = ta.value;
      nastavText(ta, slozText([hooky[0], ...obsah.slice(1)], chranene));
      nabidniHooky(ta, [obsah[0], ...hooky]);
      stav.innerHTML = "Nový hook je nahoře ✓ Další varianty máš tady pod tím.";
    } else {
      const ukol = akce === "kratsi"
        ? "Zkrať tenhle text zhruba na polovinu. Zachovej hook (můžeš ho zlepšit), nejsilnější fakta, pointu a výzvu na konci. Vyhoď všechno, co nic nepřidává."
        : "Přepiš tenhle text tak, aby byl úderný a čtivý podle pravidel výše: silnější hook, kratší věty, žádná vata, pointa, výzva na konci. Nesmí být delší než originál.";
      const r = await gemini({
        system,
        zadani: `TEXT POSTU:\n${obsah.join("\n\n")}\n\n${ukol}\nOdstavce odděl prázdným řádkem. První odstavec = hook (jeden řádek).`,
        schema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] },
      });
      const novy = String(r.text || "").replace(/\n\s*#[\p{L}\p{N}_]+(\s+#[\p{L}\p{N}_]+)*\s*$/u, "").trim();
      if (!novy) throw new AIChyba("AI nevrátila text, zkus to znovu.");
      box.dataset.zpet = ta.value;
      nastavText(ta, slozText(rozdelText(novy).obsah, chranene));
      stav.textContent = `Hotovo ✓ ${obsah.join("\n\n").length} → ${rozdelText(novy).obsah.join("\n\n").length} znaků.`;
      zvyrazniHook(ta);
    }
    box.querySelector("[data-tn=zpet]").hidden = false;
  } catch (e) {
    stav.textContent = e.message;
  } finally {
    tlacitka.forEach((b) => { b.disabled = false; });
    tlacitko.textContent = puvodniPopis;
  }
}

function initNastroje() {
  for (const sel of Object.values(CILE_TEXTU)) {
    const ta = $(sel);
    if (!ta || boxNastroju(ta)) continue;
    const box = document.createElement("div");
    box.className = "text-nastroje";
    box.dataset.pro = ta.id;
    box.innerHTML = `<div class="tn-radek">
        <button type="button" class="tn-btn" data-tn="hook" title="AI napíše nové varianty prvního řádku">🔁 Jiný hook</button>
        <button type="button" class="tn-btn" data-tn="kratsi" title="Zkrátí text zhruba na polovinu">✂️ Zkrátit</button>
        <button type="button" class="tn-btn" data-tn="udernejsi" title="Přepíše text úderněji, fakta nechá">🔥 Úderněji</button>
        <button type="button" class="tn-btn" data-tn="zpet" hidden>↶ Vrátit</button>
        <span class="tn-stav muted"></span>
      </div>
      <div class="tn-hooky"></div>`;
    ta.insertAdjacentElement("afterend", box);
    ta.addEventListener("input", () => zvyrazniHook(ta));
    box.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      if (b.dataset.tnHook !== undefined) {
        const { obsah, chranene } = rozdelText(ta.value);
        box.dataset.zpet = ta.value;
        nastavText(ta, slozText([b.dataset.tnHook, ...obsah.slice(1)], chranene));
        box.querySelector("[data-tn=zpet]").hidden = false;
      } else if (b.dataset.tn === "zpet") {
        if (box.dataset.zpet !== undefined) nastavText(ta, box.dataset.zpet);
        b.hidden = true;
        box.querySelector(".tn-stav").textContent = "Vráceno.";
      } else if (b.dataset.tn) upravText(ta, b.dataset.tn, b);
    });
  }
}

function init() {
  initNastroje();
  const sel = $("#aiObrModel");
  if (sel) {
    sel.innerHTML = Object.entries(OBR_MODELY).map(([k, m]) => `<option value="${k}">${m.nazev} · ~${m.cena.toLocaleString("cs-CZ")} USD/obrázek</option>`).join("");
    sel.value = obrModel();
    sel.addEventListener("change", () => uloz(KLIC_OBR_MODEL, sel.value));
  }
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
      await geminiPrimo({ system: "Odpověz JSON.", zadani: "Vrať {\"ok\": true}.", schema: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] }, teplota: 0 });
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
  const zpravaC = (t, chyba) => {
    const el = $("#aiClaudeZprava");
    el.textContent = t;
    el.className = "zprava " + (chyba ? "chyba" : "ok");
    el.hidden = !t;
  };
  $("#aiClaudeModel")?.addEventListener("change", (e) => {
    uloz(CLAUDE_MODEL, e.target.value);
    vykresliStav();
  });
  $("#aiClaudeUlozit")?.addEventListener("click", async () => {
    const v = $("#aiClaudeKlic").value.trim();
    if (!v && !maClaude()) { zpravaC("Vlož klíč (začíná sk-ant-).", true); return; }
    if (v && !/^sk-ant-/.test(v)) { zpravaC("Tohle nevypadá jako Anthropic klíč – ten začíná „sk-ant-“.", true); return; }
    if (v) uloz(CLAUDE_KLIC, v);
    $("#aiClaudeKlic").value = "";
    vykresliStav();
    zpravaC("Ověřuju klíč…");
    try {
      await claudeJson({ system: "Odpověz JSON.", zadani: "Vrať {\"ok\": true}.", schema: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] } });
      zpravaC(`Klíč funguje ✓ Teď pracuje ${CLAUDE_MODELY[claudeModel()]}.`);
    } catch (e) {
      zpravaC(e.message, true);
    }
  });
  $("#aiClaudeSmazat")?.addEventListener("click", () => {
    uloz(CLAUDE_KLIC, "");
    vykresliStav();
    zpravaC("Claude klíč je smazaný z tohoto prohlížeče.");
  });
  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-jdi-na-ai]")) {
      e.preventDefault();
      document.querySelector('.tab[data-tab="styl"]')?.click();
      $("#aiKarta")?.scrollIntoView({ behavior: "smooth" });
    }
  });
}

window.DHAI = { obrazekProAI, generujObrazek, OBR_MODELY, obrModel, nastavObrModel: (m) => uloz(KLIC_OBR_MODEL, m), COPY, nabidniHooky, maClaude, maGemini, hledatNaWebuProud, objektyZTextu, hledatNaWebu, jsonZTextu, zdrojeProText, cisteHashtagy, maKlic, gemini, stylDoPromptu, dnes, PRAVIDLA, hledejFotky, nactiWebFoto, vyberFoto, prvniFoto, kredit, AIChyba };
init();
})();
