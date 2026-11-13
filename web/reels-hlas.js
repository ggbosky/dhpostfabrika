// Reels Factory – český hlas (Piper TTS v prohlížeči, mikrofon), hudba a smíchání zvuku.
(() => {
"use strict";

const VZORKOVANI = 48000;
// Piper (open-source, zdarma, běží v prohlížeči přes ONNX). Model se stáhne jednou (~60 MB) z Hugging Face
// a prohlížeč si ho uloží; pak funguje i bez dalšího stahování.
const HLASY = {
  eleven: "🎙️ ElevenLabs (tvůj hlas z nastavení)",
  "cs_CZ-jirka-medium": "Jirka – lepší kvalita (Piper, zdarma)",
  "cs_CZ-jirka-low": "Jirka – rychlejší, menší model (Piper, zdarma)",
};

// ---------------------------------------------------------- ElevenLabs --
// Klíč a nastavení hlasu jsou jen v tomhle prohlížeči; požadavky jdou přímo na api.elevenlabs.io.
const EL_API = "https://api.elevenlabs.io";
const EL_KLIC = "dhpf_eleven_klic";
const EL_NAST = "dhpf_eleven_nastaveni";
const EL_MODELY = {
  eleven_v4: "Eleven v4 – nejpřirozenější (jako tvoje ukázka)",
  eleven_v3: "Eleven v3 – nejvíc emocí, umí [tagy]",
  eleven_multilingual_v2: "Multilingual v2 – stabilní",
  eleven_flash_v2_5: "Flash v2.5 – rychlý a levný",
};
const EL_VYCHOZI = { voiceId: "", voiceName: "", model: "eleven_v4", stability: 0.5, similarity: 0.75, style: 0, speed: 1 };

const elKlic = () => { try { return (localStorage.getItem(EL_KLIC) || "").trim(); } catch { return ""; } };
const maEleven = () => !!elKlic() && !!elNastaveni().voiceId;
function elNastaveni() {
  try { return { ...EL_VYCHOZI, ...JSON.parse(localStorage.getItem(EL_NAST) || "{}") }; } catch { return { ...EL_VYCHOZI }; }
}
function elUloz(klic, nastaveni) {
  try {
    if (klic !== undefined) klic ? localStorage.setItem(EL_KLIC, klic) : localStorage.removeItem(EL_KLIC);
    if (nastaveni) localStorage.setItem(EL_NAST, JSON.stringify({ ...elNastaveni(), ...nastaveni }));
  } catch { /* nic */ }
}

async function elChyba(r) {
  let detail = "";
  try { const j = await r.json(); detail = j?.detail?.message || j?.detail?.status || (typeof j?.detail === "string" ? j.detail : JSON.stringify(j?.detail || j)); } catch { /* nic */ }
  if (r.status === 401) return new Error(/quota|credit/i.test(detail) ? "Na ElevenLabs účtu došly kredity (znaky) – dobij je nebo počkej na další měsíc." : "Neplatný ElevenLabs klíč – zkontroluj ho v Můj styl → Hlas pro reels.");
  if (r.status === 402 || /quota/i.test(detail)) return new Error("Na ElevenLabs účtu došly kredity (znaky) – dobij je nebo počkej na další měsíc.");
  if (r.status === 404) return new Error("Hlas na ElevenLabs nenašel – přidej si ho do „My Voices“ a vyber ho znovu v Můj styl → Hlas pro reels.");
  if (r.status === 429) return new Error("ElevenLabs: moc požadavků najednou, zkus to za chvíli.");
  return new Error(`ElevenLabs chyba ${r.status}: ${String(detail).slice(0, 200)}`);
}

async function elHlasy(klic = elKlic()) {
  const r = await fetch(`${EL_API}/v1/voices`, { headers: { "xi-api-key": klic } });
  if (!r.ok) throw await elChyba(r);
  const j = await r.json();
  return (j.voices || []).map((v) => ({ id: v.voice_id, nazev: v.name, druh: v.category || "" }));
}

// [tagy] emocí umí jen v3; ostatní modely by je přečetly nahlas.
function textProEleven(text, model) {
  let t = String(text || "").replace(/\*/g, "")
    .replace(/(?:\p{Extended_Pictographic}|\p{Regional_Indicator})(?:\uFE0F|\u200D\p{Extended_Pictographic})*/gu, "");
  if (!/^eleven_v3/.test(model)) t = t.replace(/\[[^\]]{1,40}\]/g, " ");
  return t.replace(/\s+/g, " ").trim();
}

async function elevenTTS(text, { predchozi = "", dalsi = "", nastaveni = elNastaveni(), klic = elKlic() } = {}) {
  if (!klic) throw new Error("Chybí ElevenLabs klíč – vlož ho v Můj styl → Hlas pro reels.");
  if (!nastaveni.voiceId) throw new Error("Není vybraný hlas – vyber ho v Můj styl → Hlas pro reels.");
  const cisty = textProEleven(text, nastaveni.model);
  if (!cisty) throw new Error("Prázdný text pro hlas.");
  const telo = {
    text: cisty,
    model_id: nastaveni.model,
    language_code: nastaveni.model === "eleven_multilingual_v2" ? undefined : "cs",
    voice_settings: { stability: nastaveni.stability, similarity_boost: nastaveni.similarity, style: nastaveni.style, speed: nastaveni.speed, use_speaker_boost: true },
  };
  if (predchozi) telo.previous_text = textProEleven(predchozi, nastaveni.model);
  if (dalsi) telo.next_text = textProEleven(dalsi, nastaveni.model);
  let r;
  try {
    r = await fetch(`${EL_API}/v1/text-to-speech/${encodeURIComponent(nastaveni.voiceId)}?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "xi-api-key": klic, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify(telo),
    });
  } catch { throw new Error("ElevenLabs je nedostupný (síť). Zkus to znovu."); }
  if (!r.ok) throw await elChyba(r);
  return new Blob([await r.arrayBuffer()], { type: "audio/mpeg" });
}
const VITS_URL = "https://cdn.jsdelivr.net/npm/@diffusionstudio/vits-web@1.0.3/+esm";

let vits = null;
async function knihovnaTTS() {
  if (!vits) vits = import(VITS_URL).catch((e) => { vits = null; throw new Error("Nepodařilo se načíst hlasový modul (jsi online?). " + e.message); });
  return vits;
}

// Text pro syntézu: bez značek *zvýraznění*, bez emoji, sjednocené mezery.
function textProHlas(text) {
  return String(text || "")
    .replace(/\*/g, "")
    .replace(/(?:\p{Extended_Pictographic}|\p{Regional_Indicator})(?:️|‍\p{Extended_Pictographic})*/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function syntetizuj(text, hlasId = "cs_CZ-jirka-medium", pokrok = () => {}, kontext = {}) {
  if (hlasId === "eleven") return elevenTTS(text, kontext);
  const tts = await knihovnaTTS();
  const cisty = textProHlas(text);
  if (!cisty) throw new Error("Prázdný text pro hlas.");
  return tts.predict({ text: cisty, voiceId: hlasId }, (p) => {
    if (p && p.total) pokrok(Math.round((p.loaded / p.total) * 100));
  });
}

// ------------------------------------------------------------- mikrofon --

async function nahravkaZMikrofonu() {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error("Prohlížeč neumí nahrávat z mikrofonu.");
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  const typ = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find((t) => MediaRecorder.isTypeSupported(t)) || "";
  const rec = new MediaRecorder(stream, typ ? { mimeType: typ } : undefined);
  const kusy = [];
  rec.ondataavailable = (e) => { if (e.data.size) kusy.push(e.data); };
  rec.start();
  return {
    zastav: () => new Promise((ok) => {
      rec.onstop = () => { stream.getTracks().forEach((t) => t.stop()); ok(new Blob(kusy, { type: rec.mimeType || "audio/webm" })); };
      rec.stop();
    }),
  };
}

// ------------------------------------------------------------- dekódování --

let ctxDekoder = null;
const bufferCache = new Map();
async function dekoduj(klic, nacistBlob) {
  if (bufferCache.has(klic)) return bufferCache.get(klic);
  const slib = (async () => {
    const blob = await nacistBlob();
    const data = await blob.arrayBuffer();
    ctxDekoder = ctxDekoder || new (window.AudioContext || window.webkitAudioContext)({ sampleRate: VZORKOVANI });
    return ctxDekoder.decodeAudioData(data);
  })();
  bufferCache.set(klic, slib);
  slib.catch(() => bufferCache.delete(klic));
  return slib;
}
const zapomen = (klic) => bufferCache.delete(klic);

async function delkaZvuku(blob) {
  const b = await dekoduj(`tmp-${Date.now()}-${Math.random()}`, async () => blob);
  return b.duration;
}

// ---------------------------------------------------------------- mix --
// stopy: [{ buffer, od, offset=0, delka, hlasitost=1, rychlost=1, prolnuti=0.08 }]
async function smichej({ celkem, stopy = [], hudba = null }) {
  const delkaVzorku = Math.max(1, Math.ceil(celkem * VZORKOVANI));
  const ctx = new OfflineAudioContext(2, delkaVzorku, VZORKOVANI);
  for (const s of stopy) {
    if (!s.buffer || s.delka <= 0) continue;
    const src = ctx.createBufferSource();
    src.buffer = s.buffer;
    src.playbackRate.value = s.rychlost || 1;
    const g = ctx.createGain();
    const h = s.hlasitost ?? 1;
    const p = Math.min(s.prolnuti ?? 0.08, s.delka / 3);
    g.gain.setValueAtTime(0, s.od);
    g.gain.linearRampToValueAtTime(h, s.od + p);
    g.gain.setValueAtTime(h, Math.max(s.od + p, s.od + s.delka - p));
    g.gain.linearRampToValueAtTime(0, s.od + s.delka);
    src.connect(g).connect(ctx.destination);
    src.start(s.od, s.offset || 0, s.delka * (s.rychlost || 1));
  }
  if (hudba?.buffer && hudba.hlasitost > 0) {
    const src = ctx.createBufferSource();
    src.buffer = hudba.buffer;
    src.loop = true;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, 0);
    g.gain.linearRampToValueAtTime(hudba.hlasitost, 1);
    g.gain.setValueAtTime(hudba.hlasitost, Math.max(1, celkem - 2.5));
    g.gain.linearRampToValueAtTime(0, celkem);
    src.connect(g).connect(ctx.destination);
    src.start(0);
  }
  // Jemný limiter, aby se součet stop nepřebudil.
  return ctx.startRendering().then((buf) => {
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const d = buf.getChannelData(c);
      let max = 0;
      for (let i = 0; i < d.length; i++) max = Math.max(max, Math.abs(d[i]));
      if (max > 0.98) { const k = 0.98 / max; for (let i = 0; i < d.length; i++) d[i] *= k; }
    }
    return buf;
  });
}

// Přehrání smíchaného zvuku v náhledu.
function prehraj(buffer, odCasu = 0) {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.connect(ctx.destination);
  const start = ctx.currentTime + 0.05;
  src.start(start, odCasu);
  return {
    cas: () => Math.max(0, ctx.currentTime - start) + odCasu,
    zastav: () => { try { src.stop(); } catch { /* nic */ } ctx.close(); },
  };
}

// AudioBuffer → WAV Blob (pro export samotného voiceoveru).
function naWav(buffer) {
  const kanaly = buffer.numberOfChannels, delka = buffer.length, sr = buffer.sampleRate;
  const data = new DataView(new ArrayBuffer(44 + delka * kanaly * 2));
  const str = (o, s) => [...s].forEach((c, i) => data.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF"); data.setUint32(4, 36 + delka * kanaly * 2, true); str(8, "WAVE"); str(12, "fmt ");
  data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, kanaly, true);
  data.setUint32(24, sr, true); data.setUint32(28, sr * kanaly * 2, true); data.setUint16(32, kanaly * 2, true);
  data.setUint16(34, 16, true); str(36, "data"); data.setUint32(40, delka * kanaly * 2, true);
  let o = 44;
  const ch = [...Array(kanaly)].map((_, c) => buffer.getChannelData(c));
  for (let i = 0; i < delka; i++) for (let c = 0; c < kanaly; c++) {
    const v = Math.max(-1, Math.min(1, ch[c][i]));
    data.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true); o += 2;
  }
  return new Blob([data], { type: "audio/wav" });
}

// --------------------------------------------- import hotového voiceoveru --
// Celé audio (např. z ElevenLabs) se rozseká na scény podle pauz mezi větami.

// Pauzy v řeči: úseky ticha delší než ~150 ms (energie v 10ms oknech).
function najdiPauzy(buf) {
  const sr = buf.sampleRate, okno = Math.max(1, Math.round(sr * 0.01));
  const kanaly = [...Array(buf.numberOfChannels)].map((_, c) => buf.getChannelData(c));
  const n = Math.floor(buf.length / okno);
  const db = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (const ch of kanaly) for (let j = i * okno; j < (i + 1) * okno; j++) s += ch[j] * ch[j];
    db[i] = 10 * Math.log10(s / (okno * kanaly.length) + 1e-12);
  }
  const serazene = Array.from(db).sort((a, b) => a - b);
  const hlasite = serazene[Math.floor(serazene.length * 0.9)] ?? -20;
  const prah = Math.max(-60, Math.min(-30, hlasite - 26));
  const pauzy = [];
  let od = -1;
  for (let i = 0; i <= n; i++) {
    const ticho = i < n && db[i] < prah;
    if (ticho && od < 0) od = i;
    if (!ticho && od >= 0) {
      const pred = pauzy[pauzy.length - 1];
      if (pred && od * 0.01 - pred.do < 0.12) pred.do = i * 0.01; // krátký zvuk mezi dvěma tichy = jedna pauza
      else pauzy.push({ od: od * 0.01, do: i * 0.01 });
      od = -1;
    }
  }
  // pauza mezi větami trvá aspoň ~150 ms; kratší ticha bývají uvnitř slov (p, t, k…)
  const vysledek = pauzy.filter((q) => q.do - q.od >= 0.15)
    .map((q) => ({ ...q, stred: (q.od + q.do) / 2, delka: q.do - q.od }));
  return { pauzy: vysledek, prah, db, krok: 0.01 };
}

// Váha textu ≈ jak dlouho se bude číst (číslice se čtou dlouho).
const vahaTextu = (t) => {
  const x = textProHlas(String(t || "").replace(/\[[^\]]{1,40}\]/g, " "));
  const vety = (x.match(/[.!?…]+(\s|$)/g) || []).length, carky = (x.match(/[,;:–—]/g) || []).length;
  // znaky + čísla (čtou se dlouho) + pauzy za větami a čárkami
  return Math.max(4, x.replace(/\s/g, "").length + (x.match(/\d/g) || []).length * 3 + vety * 7 + carky * 3);
};

// Rozdělí buffer na tolik kusů, kolik je textů. Hranice = pauzy co nejblíž očekávaným místům.
function rozdelNaSceny(buf, texty) {
  const celkem = buf.duration;
  if (texty.length <= 1) return [{ od: 0, do: celkem }];
  const { pauzy } = najdiPauzy(buf);
  const vnitrni = pauzy.filter((p) => p.od > 0.15 && p.do < celkem - 0.15);
  const potreba = texty.length - 1;
  if (vnitrni.length < potreba) {
    throw new Error(`V audiu jsem našel jen ${vnitrni.length} pauz, ale scén je ${texty.length}. Vygeneruj audio znovu tak, aby mezi scénami byl prázdný řádek (nebo nahraj audio ke každé scéně zvlášť tlačítkem 📥).`);
  }
  // začátek a konec řeči (bez ticha na krajích)
  const zacatek = pauzy.length && pauzy[0].od <= 0.05 ? pauzy[0].do : 0;
  const posl = pauzy[pauzy.length - 1];
  const konec = posl && posl.do >= celkem - 0.05 ? posl.od : celkem;
  const reci = Math.max(0.1, konec - zacatek);
  const vahy = texty.map(vahaTextu), suma = vahy.reduce((a, b) => a + b, 0);
  let kum = 0;
  const ocekavane = vahy.slice(0, -1).map((v) => { kum += v; return zacatek + (reci * kum) / suma; });
  // DP: vyber rostoucí posloupnost pauz. Kritéria: (1) mezi hranicemi má být zhruba tolik pauz, kolik má scéna vět,
  // (2) hranice blízko odhadovanému času, (3) delší pauza je pravděpodobnější hranice.
  const vety = texty.map((t) => Math.max(1, (textProHlas(t).match(/[.!?…]+(?=\s|$)/g) || []).length));
  const sumVet = vety.reduce((a, b) => a + b, 0);
  const zaVetu = reci / sumVet;
  const P = vnitrni.length, K = potreba, INF = 1e9;
  const casCena = (k, j) => (1.5 * Math.abs(vnitrni[j].stred - ocekavane[k])) / zaVetu - 1.2 * Math.min(vnitrni[j].delka, 0.6);
  const dp = [...Array(K)].map(() => new Float64Array(P).fill(INF));
  const odkud = [...Array(K)].map(() => new Int32Array(P).fill(-1));
  for (let j = 0; j < P; j++) dp[0][j] = 0.3 * Math.abs(j + 1 - vety[0]) + casCena(0, j);
  for (let k = 1; k < K; k++) {
    for (let j = k; j < P; j++) {
      let nej = INF, nejJ = -1;
      for (let jp = k - 1; jp < j; jp++) {
        if (dp[k - 1][jp] >= INF) continue;
        const c = dp[k - 1][jp] + 0.3 * Math.abs(j - jp - vety[k]);
        if (c < nej) { nej = c; nejJ = jp; }
      }
      if (nejJ >= 0) { dp[k][j] = nej + casCena(k, j); odkud[k][j] = nejJ; }
    }
  }
  let j = -1, nej = INF;
  for (let x = 0; x < P; x++) {
    if (dp[K - 1][x] >= INF) continue;
    const c = dp[K - 1][x] + 0.3 * Math.abs(P - 1 - x - (vety[K] - 1)); // pauzy uvnitř poslední scény
    if (c < nej) { nej = c; j = x; }
  }
  const vybrane = [];
  for (let k = K - 1; k >= 0; k--) { vybrane.unshift(vnitrni[j]); j = odkud[k][j]; }
  const hranice = [0, ...vybrane.map((p) => p.stred), celkem];
  // každý kus: bez dlouhého ticha na krajích, ale s malou rezervou
  return hranice.slice(0, -1).map((od, i) => {
    const doCas = hranice[i + 1];
    const pPred = i === 0 ? null : vybrane[i - 1];
    const pPo = i === hranice.length - 2 ? null : vybrane[i];
    const s = pPred ? Math.max(od, pPred.do - 0.06) : Math.max(0, zacatek - 0.06);
    const e = pPo ? Math.min(doCas, pPo.od + 0.12) : Math.min(celkem, konec + 0.15);
    return { od: s, do: Math.max(s + 0.1, e) };
  });
}

function vyrizni(buf, od, doCas) {
  const sr = buf.sampleRate;
  const a = Math.max(0, Math.floor(od * sr)), b = Math.min(buf.length, Math.ceil(doCas * sr));
  const out = new AudioBuffer({ length: Math.max(1, b - a), numberOfChannels: buf.numberOfChannels, sampleRate: sr });
  for (let c = 0; c < buf.numberOfChannels; c++) out.copyToChannel(buf.getChannelData(c).subarray(a, b), c);
  return out;
}

// Text scénáře připravený k vložení do ElevenLabs (scény oddělené prázdným řádkem).
function textProElevenLabs(sceny) {
  return sceny.map((s) => textProHlas(s.text)).filter(Boolean).join("\n\n");
}

// ------------------------------------------------- nastavení v „Můj styl“ --

function initNastaveni() {
  const $ = (q) => document.querySelector(q);
  if (!$("#hlasKarta")) return;
  const zprava = (t, druh = "ok") => { const el = $("#elZprava"); el.innerHTML = t; el.className = `zprava ${druh}`; el.hidden = !t; };
  const esc = (x) => String(x ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const posuvniky = [["#elStabilita", "stability", "#elStabilitaH", (v) => `${Math.round(v * 100)} %`],
    ["#elPodobnost", "similarity", "#elPodobnostH", (v) => `${Math.round(v * 100)} %`],
    ["#elStyl", "style", "#elStylH", (v) => `${Math.round(v * 100)} %`],
    ["#elRychlost", "speed", "#elRychlostH", (v) => `${Math.round(v * 100)} %`]];
  $("#elModel").innerHTML = Object.entries(EL_MODELY).map(([k, n]) => `<option value="${k}">${n}</option>`).join("");

  function vykresli(hlasy) {
    const n = elNastaveni();
    $("#elModel").value = EL_MODELY[n.model] ? n.model : "eleven_v4";
    for (const [sel, k, h, f] of posuvniky) { $(sel).value = n[k]; $(h).textContent = f(n[k]); }
    $("#elKlic").placeholder = elKlic() ? "•••••••• (klíč je uložený)" : "sk_…";
    if (hlasy) {
      $("#elHlas").innerHTML = hlasy.length
        ? hlasy.map((v) => `<option value="${esc(v.id)}" ${v.id === n.voiceId ? "selected" : ""}>${esc(v.nazev)}${v.druh ? ` · ${esc(v.druh)}` : ""}</option>`).join("")
        : `<option value="">Na účtu nejsou žádné hlasy</option>`;
    } else if (n.voiceId) {
      $("#elHlas").innerHTML = `<option value="${esc(n.voiceId)}">${esc(n.voiceName || n.voiceId)}</option>`;
    }
  }

  async function nactiHlasy() {
    zprava("Načítám hlasy z ElevenLabs…", "");
    const hlasy = await elHlasy();
    const n = elNastaveni();
    let vybrany = hlasy.find((v) => v.id === n.voiceId) || hlasy.find((v) => /kuba/i.test(v.nazev)) || null;
    if (vybrany) elUloz(undefined, { voiceId: vybrany.id, voiceName: vybrany.nazev });
    vykresli(hlasy);
    zprava(vybrany
      ? `Hotovo ✓ Reels bude namlouvat <b>${esc(vybrany.nazev)}</b>. Klikni na ▶ Vyzkoušet hlas.`
      : "Klíč funguje, ale hlas „Kuba“ jsem v My Voices nenašel. V ElevenLabs u hlasu klikni na <b>Add to my voices</b> a pak znovu na Uložit a načíst hlasy – nebo vyber jiný hlas.",
    vybrany ? "ok" : "varovani");
  }

  $("#elUlozit").addEventListener("click", async () => {
    const v = $("#elKlic").value.trim();
    if (!v && !elKlic()) { zprava("Vlož ElevenLabs API klíč.", "chyba"); return; }
    if (v) elUloz(v);
    $("#elKlic").value = "";
    try { await nactiHlasy(); } catch (e) { zprava(esc(e.message), "chyba"); }
  });
  $("#elSmazat").addEventListener("click", () => { elUloz(""); vykresli(); zprava("Klíč je smazaný z tohoto prohlížeče. Reels teď namlouvá Jirka (zdarma)."); });
  $("#elHlas").addEventListener("change", (e) => {
    elUloz(undefined, { voiceId: e.target.value, voiceName: e.target.selectedOptions[0]?.textContent.replace(/ · .*$/, "") || "" });
    zprava(`Vybraný hlas: <b>${esc(elNastaveni().voiceName)}</b>`);
  });
  $("#elModel").addEventListener("change", (e) => elUloz(undefined, { model: e.target.value }));
  for (const [sel, k, h, f] of posuvniky) {
    $(sel).addEventListener("input", (e) => { const v = Number(e.target.value); elUloz(undefined, { [k]: v }); $(h).textContent = f(v); });
  }
  let prehravac = null;
  $("#elZkusit").addEventListener("click", async (e) => {
    const b = e.currentTarget;
    b.disabled = true;
    zprava("Generuji ukázku…", "");
    try {
      const blob = await elevenTTS("Nagano. Rok devatenáct set devadesát osm. Pět nejlepších střelců světa. Proti jednomu brankáři. Tohle je Deník hokeje.");
      if (prehravac) { prehravac.pause(); URL.revokeObjectURL(prehravac.src); }
      prehravac = new Audio(URL.createObjectURL(blob));
      await prehravac.play();
      zprava("▶ Přehrávám ukázku. Nesedí? Uprav stabilitu (míň = víc emocí) nebo styl a zkus to znovu.");
    } catch (err) { zprava(esc(err.message), "chyba"); }
    finally { b.disabled = false; }
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest("[data-jdi-na-hlas]")) return;
    e.preventDefault();
    document.querySelector('.tab[data-tab="styl"]')?.click();
    setTimeout(() => $("#hlasKarta")?.scrollIntoView({ behavior: "smooth" }), 60);
  });
  vykresli();
}
initNastaveni();

window.DHReelsHlas = { najdiPauzy, rozdelNaSceny, vyrizni, textProElevenLabs, EL_MODELY, maEleven, elKlic, elNastaveni, elUloz, elHlasy, elevenTTS, HLASY, VZORKOVANI, textProHlas, syntetizuj, nahravkaZMikrofonu, dekoduj, zapomen, delkaZvuku, smichej, prehraj, naWav };
})();
