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
  let detail = "", stav = "";
  try { const j = await r.json(); stav = j?.detail?.status || ""; detail = j?.detail?.message || stav || (typeof j?.detail === "string" ? j.detail : JSON.stringify(j?.detail || j)); } catch { /* nic */ }
  if (stav === "missing_permissions" || /missing the permission/i.test(detail)) {
    const pravo = (detail.match(/permission (\w+)/) || [])[1] || "";
    const popis = { voices_write: "Voices → Write (ukládání hlasů)", text_to_voice: "Text to Voice → Access", voices_read: "Voices → Read (čtení hlasů)", text_to_speech: "Text to Speech → Access", user_read: "User → Read", models_read: "Models → Read" }[pravo] || pravo;
    return new Error(`Klíč nemá zapnuté oprávnění „${popis}“. V ElevenLabs → Developers → API Keys vytvoř nový klíč a zapni u něj „Text to Speech“ a „Voices: Read“ (nebo hlas zadej ručně přes Voice ID v Můj styl → Hlas pro reels).`);
  }
  // Vždy připojit původní hlášku ElevenLabs, ať je jasné, co přesně vadí.
  const puvodni = detail ? ` (ElevenLabs: „${String(detail).slice(0, 220)}“)` : "";
  if (/library voice|free users|paid_plan|payment_required|upgrade your subscription/i.test(`${stav} ${detail}`)) {
    return new Error(`Tenhle hlas je z Voice Library a přes API ho ElevenLabs na bezplatném plánu nepovolí. Řešení přímo v aplikaci: v Můj styl → ElevenLabs → „🎨 Vlastní hlas pro bezplatný plán“ si navrhni vlastní hlas (ten jde i zdarma), nebo přejdi na placený plán Starter – pak Kuba funguje rovnou.${puvodni}`);
  }
  if (/unusual_activity|unusual activity/i.test(`${stav} ${detail}`)) {
    return new Error(`ElevenLabs zablokoval bezplatné použití přes API kvůli „neobvyklé aktivitě“ (často VPN nebo víc účtů). Vypni VPN, nebo použij generování na webu a nahraj MP3.${puvodni}`);
  }
  if (stav === "quota_exceeded" || /exceeds your quota|credits remaining|quota/i.test(detail)) {
    const zbyva = (detail.match(/have (\d+) credits remaining/i) || [])[1];
    const treba = (detail.match(/(\d+) credits are required/i) || [])[1];
    if (zbyva && treba && Number(zbyva) >= Number(treba)) return new Error(`Kredity na účtu jsou, ale tenhle API klíč má nastavený vlastní limit kreditů. V ElevenLabs → Developers → API Keys u klíče zvyš nebo vypni „Credit limit“.${puvodni}`);
    return new Error(`ElevenLabs odmítl požadavek kvůli kreditům – buď došly, nebo má API klíč nastavený nízký „Credit limit“ (Developers → API Keys → upravit klíč).${puvodni}`);
  }
  if (r.status === 401) return new Error(`ElevenLabs klíč nefunguje – zkontroluj ho v Můj styl → Hlas pro reels.${puvodni}`);
  if (r.status === 402) return new Error(`ElevenLabs vyžaduje placený plán pro tuhle akci.${puvodni}`);
  if (r.status === 404) return new Error("Hlas na ElevenLabs nenašel – přidej si ho do „My Voices“ a vyber ho znovu v Můj styl → Hlas pro reels.");
  if (r.status === 429) return new Error("ElevenLabs: moc požadavků najednou, zkus to za chvíli.");
  return new Error(`ElevenLabs chyba ${r.status}: ${String(detail).slice(0, 200)}`);
}

async function elHlasy(klic = elKlic()) {
  const r = await fetch(`${EL_API}/v1/voices`, { headers: { "xi-api-key": klic } });
  if (!r.ok) throw await elChyba(r);
  const j = await r.json();
  // Na bezplatném plánu jdou přes API výchozí hlasy ElevenLabs (premade) a hlasy, které jsi sám vytvořil.
  return (j.voices || []).map((v) => {
    const zdarma = v.category === "premade" || v.is_owner === true ? true : v.is_owner === false ? false : null;
    return { id: v.voice_id, nazev: v.name, druh: v.category || "", zdarma };
  }).sort((a, b) => (b.zdarma === true) - (a.zdarma === true));
}

// Voice Design: vlastní hlas podle popisu (bez napodobování konkrétního člověka).
async function elNavrhniHlasy({ popis, text, klic = elKlic() }) {
  if (!klic) throw new Error("Chybí ElevenLabs klíč – vlož ho výš a ulož.");
  const zkus = async (model_id) => {
    let r;
    try {
      r = await fetch(`${EL_API}/v1/text-to-voice/design?output_format=mp3_44100_128`, {
        method: "POST",
        headers: { "xi-api-key": klic, "Content-Type": "application/json" },
        body: JSON.stringify({ voice_description: popis, text, model_id }),
      });
    } catch { throw new Error("ElevenLabs je nedostupný (síť). Zkus to znovu."); }
    return r;
  };
  let r = await zkus("eleven_ttv_v3");
  if (r.status === 400 || r.status === 422) {
    const t = await r.clone().text().catch(() => "");
    if (/model/i.test(t)) r = await zkus("eleven_multilingual_ttv_v2");
  }
  if (!r.ok) throw await elChyba(r);
  const j = await r.json();
  return (j.previews || []).map((p) => ({ id: p.generated_voice_id, audio: `data:${p.media_type || "audio/mpeg"};base64,${p.audio_base_64}`, delka: p.duration_secs }));
}

async function elUlozNavrh({ generatedId, nazev, popis, klic = elKlic() }) {
  let r;
  try {
    r = await fetch(`${EL_API}/v1/text-to-voice`, {
      method: "POST",
      headers: { "xi-api-key": klic, "Content-Type": "application/json" },
      body: JSON.stringify({ voice_name: nazev, voice_description: popis, generated_voice_id: generatedId }),
    });
  } catch { throw new Error("ElevenLabs je nedostupný (síť). Zkus to znovu."); }
  if (!r.ok) throw await elChyba(r);
  const j = await r.json();
  return { id: j.voice_id, nazev: j.name || nazev };
}

// [tagy] emocí umí jen v3; ostatní modely by je přečetly nahlas.
function textProEleven(text, model) {
  let t = ceskaCisla(text).replace(/\*/g, "")
    .replace(/(?:\p{Extended_Pictographic}|\p{Regional_Indicator})(?:\uFE0F|\u200D\p{Extended_Pictographic})*/gu, "");
  if (!/^eleven_v3/.test(model)) t = t.replace(/\[[^\]]{1,40}\]/g, " ");
  return t.replace(/\s+/g, " ").trim();
}

// sCasy: vrátí { blob, zarovnani: { characters, character_start_times_seconds, character_end_times_seconds }, text }
async function elevenTTS(text, { predchozi = "", dalsi = "", nastaveni = elNastaveni(), klic = elKlic(), sCasy = false } = {}) {
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
  // v3 navazující text (previous/next_text) nepodporuje
  const bezKontextu = /^eleven_v3/.test(nastaveni.model);
  if (predchozi && !bezKontextu) telo.previous_text = textProEleven(predchozi, nastaveni.model);
  if (dalsi && !bezKontextu) telo.next_text = textProEleven(dalsi, nastaveni.model);
  let r;
  // Když model nějaké pole nepodporuje (API se mění), zkusí se to znovu bez něj.
  for (let pokus = 0; pokus < 4; pokus++) {
    try {
      r = await fetch(`${EL_API}/v1/text-to-speech/${encodeURIComponent(nastaveni.voiceId)}${sCasy ? "/with-timestamps" : ""}?output_format=mp3_44100_128`, {
        method: "POST",
        headers: { "xi-api-key": klic, "Content-Type": "application/json", Accept: sCasy ? "application/json" : "audio/mpeg" },
        body: JSON.stringify(telo),
      });
    } catch { throw new Error("ElevenLabs je nedostupný (síť). Zkus to znovu."); }
    if (r.ok || r.status !== 400) break;
    const zprava = await r.clone().text().catch(() => "");
    if (/previous_text|next_text/i.test(zprava) && (telo.previous_text || telo.next_text)) { delete telo.previous_text; delete telo.next_text; continue; }
    if (/language_code/i.test(zprava) && telo.language_code) { delete telo.language_code; continue; }
    if (/stability/i.test(zprava) && ![0, 0.5, 1].includes(telo.voice_settings.stability)) {
      const st = telo.voice_settings.stability;
      telo.voice_settings.stability = st < 0.25 ? 0 : st > 0.75 ? 1 : 0.5;
      continue;
    }
    if (/speed|style|speaker_boost/i.test(zprava) && (telo.voice_settings.speed !== 1 || telo.voice_settings.style)) { telo.voice_settings = { stability: telo.voice_settings.stability, similarity_boost: telo.voice_settings.similarity_boost }; continue; }
    break;
  }
  if (!r.ok) throw await elChyba(r);
  if (sCasy) {
    let j;
    try { j = await r.json(); } catch { j = null; }
    if (!j?.audio_base64) throw Object.assign(new Error("ElevenLabs nevrátil časy slov."), { nelzeCasy: true });
    const bin = Uint8Array.from(atob(j.audio_base64), (c) => c.charCodeAt(0));
    return { blob: new Blob([bin], { type: "audio/mpeg" }), zarovnani: j.alignment || j.normalized_alignment || null, text: telo.text };
  }
  return new Blob([await r.arrayBuffer()], { type: "audio/mpeg" });
}

// Slova s časy ze zarovnání ElevenLabs (znak po znaku) pro úsek textu [od, do).
function slovaZeZarovnani(z, od, doZn) {
  const ch = z.characters, st = z.character_start_times_seconds, en = z.character_end_times_seconds;
  const slova = [];
  let w = null;
  for (let i = od; i < Math.min(doZn, ch.length); i++) {
    if (/\s/.test(ch[i])) { if (w) { slova.push(w); w = null; } continue; }
    if (!w) w = { text: "", od: st[i], do: en[i], zn: i };
    w.text += ch[i]; w.do = en[i];
  }
  if (w) slova.push(w);
  return slova;
}
const VITS_URL = "https://cdn.jsdelivr.net/npm/@diffusionstudio/vits-web@1.0.3/+esm";

let vits = null;
async function knihovnaTTS() {
  if (!vits) vits = import(VITS_URL).catch((e) => { vits = null; throw new Error("Nepodařilo se načíst hlasový modul (jsi online?). " + e.message); });
  return vits;
}

// Text pro syntézu: bez značek *zvýraznění*, bez emoji, sjednocené mezery.
// ---------------------------------------------------- čísla → česká slova --
// Hlas (ElevenLabs i Piper) pak čte „1998“ jako „devatenáct set devadesát osm“, „5:3“ jako „pět ku třem“ atd.
const JEDN = ["nula", "jedna", "dva", "tři", "čtyři", "pět", "šest", "sedm", "osm", "devět", "deset", "jedenáct", "dvanáct", "třináct", "čtrnáct", "patnáct", "šestnáct", "sedmnáct", "osmnáct", "devatenáct"];
const DES = ["", "", "dvacet", "třicet", "čtyřicet", "padesát", "šedesát", "sedmdesát", "osmdesát", "devadesát"];
const STA = ["", "sto", "dvě stě", "tři sta", "čtyři sta", "pět set", "šest set", "sedm set", "osm set", "devět set"];
function podTisic(n) {
  const out = [];
  if (n >= 100) { out.push(STA[Math.floor(n / 100)]); n %= 100; }
  if (n >= 20) { out.push(DES[Math.floor(n / 10)]); n %= 10; if (n) out.push(JEDN[n]); } else if (n) out.push(JEDN[n]);
  return out.join(" ");
}
function cisloSlovy(n) {
  n = Math.floor(Math.abs(n));
  if (n === 0) return "nula";
  const out = [];
  const mil = Math.floor(n / 1e6), tis = Math.floor((n % 1e6) / 1000), zb = n % 1000;
  if (mil) out.push(mil === 1 ? "milion" : `${mil < 5 ? podTisic(mil).replace(/^dva$/, "dva") : podTisic(mil)} ${mil >= 2 && mil <= 4 ? "miliony" : "milionů"}`);
  if (tis) out.push(tis === 1 ? "tisíc" : `${podTisic(tis)} ${tis >= 2 && tis <= 4 ? "tisíce" : "tisíc"}`);
  if (zb) out.push(podTisic(zb));
  return out.join(" ");
}
function rokSlovy(r) {
  if (r >= 1100 && r < 2000) return `${JEDN[Math.floor(r / 100)]} set${r % 100 ? ` ${podTisic(r % 100)}` : ""}`;
  return cisloSlovy(r);
}
const DATIV = ["nule", "jedné", "dvěma", "třem", "čtyřem", "pěti", "šesti", "sedmi", "osmi", "devíti", "deseti", "jedenácti", "dvanácti", "třinácti", "čtrnácti", "patnácti"];
const RAD_KMEN = ["", "prv", "druh", "třet", "čtvrt", "pát", "šest", "sedm", "osm", "devát", "desát", "jedenáct", "dvanáct", "třináct", "čtrnáct", "patnáct", "šestnáct", "sedmnáct", "osmnáct", "devatenáct"];
const RAD_DES = ["", "", "dvacát", "třicát", "čtyřicát", "padesát", "šedesát", "sedmdesát", "osmdesát", "devadesát"];
const MEKKE = new Set([1, 3]); // první, třetí – měkké, nemění se
function radovaSlovy(n, konc) {
  const mekka = { "ého": "ího", "ém": "ím", "ých": "ích", "ými": "ími" }[konc] || "í";
  const cast = (k) => (MEKKE.has(k) ? (k === 1 ? "prvn" : "třet") + mekka : RAD_KMEN[k] + konc);
  if (n < 20) return cast(n);
  if (n < 100) return `${RAD_DES[Math.floor(n / 10)]}${konc}${n % 10 ? ` ${cast(n % 10)}` : ""}`;
  if (n === 100) return `st${konc}`;
  return cisloSlovy(n);
}
const RAD_GEN = (n) => radovaSlovy(n, "ého");
const MESICE = ["ledna", "února", "března", "dubna", "května", "června", "července", "srpna", "září", "října", "listopadu", "prosince"];
const MASK_NEUT_LOK = /^(místě|kole|zápase|zápasu|utkání|finále|ročníku|draftu|kolu|týmu|klubu|roce|století|desetiletí|období|kanadském|světě)$/i;
function koncovkaRadove(slovo) {
  const s = slovo.toLowerCase();
  if (MASK_NEUT_LOK.test(s)) return "ém";
  if (/(ech|ích|ách)$/.test(s)) return "ých";
  if (/ě$/.test(s)) return "é";
  if (/a$/.test(s)) return "á";
  if (/(o|í|é)$/.test(s)) return "é";
  if (/ou$/.test(s)) return "ou";
  if (/(u|e)$/.test(s)) return "ém";
  return "ý";
}
const POCITANE = /^(gól|bod|zápas|utkání|divák|fanouš|minut|sekund|sezón|let|rok|hráč|titul|medail|asistenc|výhr|proher|kilometr|km|kč|korun|dolar|euro|tým|klub|krát)/i;

function ceskaCisla(text) {
  let t = String(text || "");
  // oddělovače tisíců: 18 000 / 18 000 / 18.000
  t = t.replace(/\b(\d{1,3})(?:[   ](\d{3}))(?:[   ](\d{3}))?\b(?![,.]\d)/g, (m, a, b, c) => a + b + (c || ""));
  t = t.replace(/\b(\d{1,3})\.(\d{3})(?:\.(\d{3}))?\b(?!\.\d)/g, (m, a, b, c) => a + b + (c || ""));
  // čísla dresů
  t = t.replace(/(^|[^\p{L}])(se?)\s+(?:č\.\s?|#|číslem\s)(\d{1,3})\b/gu, (m, pred, pr, n) => `${pred}${pr} číslem ${cisloSlovy(+n)}`);
  t = t.replace(/(^|[^\p{L}])(?:č\.\s?|#)(\d{1,3})\b/gu, (m, pred, n) => `${pred}číslo ${cisloSlovy(+n)}`);
  // data: 1. 9. 2011 / 1. září 2011
  t = t.replace(/\b(\d{1,2})\.\s?(\d{1,2})\.\s?(\d{4})\b/g, (m, d, mes, r) => (+mes >= 1 && +mes <= 12 && +d >= 1 && +d <= 31 ? `${RAD_GEN(+d)} ${MESICE[+mes - 1]} ${rokSlovy(+r)}` : m));
  t = t.replace(new RegExp(`\\b(\\d{1,2})\\.\\s?(${MESICE.join("|")})`, "gi"), (m, d, mes) => `${RAD_GEN(+d)} ${mes}`);
  // rozsahy let: 1990–1995 / 1990-95
  t = t.replace(/\b(1[89]\d{2}|20\d{2})\s?[–—-]\s?(1[89]\d{2}|20\d{2})\b/g, (m, a, b) => `${rokSlovy(+a)} až ${rokSlovy(+b)}`);
  // skóre 5:3
  t = t.replace(/\b(\d{1,2})\s?:\s?(\d{1,2})\b(?!\s?(?:h|hod|min))/g, (m, a, b) => `${cisloSlovy(+a)} ku ${DATIV[+b] || cisloSlovy(+b)}`);
  // procenta a desetinná čísla
  t = t.replace(/\b(\d+),(\d+)\s?(%|procent\w*)/g, (m, a, b) => `${cisloSlovy(+a)} celá ${cisloSlovy(+b)} procenta`.replace(/^jedna celá/, "jedna celá"));
  t = t.replace(/\b(\d+)\s?(%|procent\w*)/g, (m, a) => `${cisloSlovy(+a)} ${+a === 1 ? "procento" : +a >= 2 && +a <= 4 ? "procenta" : "procent"}`);
  t = t.replace(/\b(\d+),(\d+)\b/g, (m, a, b) => `${cisloSlovy(+a)} ${+a === 1 ? "celá" : +a >= 2 && +a <= 4 ? "celé" : "celých"} ${cisloSlovy(+b)}`);
  // 3× / 3x
  t = t.replace(/\b(\d{1,3})\s?[×x](?![\p{L}\d])/gu, (m, a) => (+a === 1 ? "jednou" : `${cisloSlovy(+a).replace(/ /g, "")}krát`));
  // řadové číslovky: 68. minutě, 1. třetina, 70. léta
  t = t.replace(/\b(\d{1,3})\.(\s+)([a-záčďéěíňóřšťúůýž]+)/g, (m, n, mez, slovo) => `${radovaSlovy(+n, koncovkaRadove(slovo))}${mez}${slovo}`);
  // roky (a ostatní čísla)
  t = t.replace(/\b(\d+)\b(\s*)([^\s\d]*)/g, (m, n, mez, dalsi) => {
    const x = +n;
    const jeRok = n.length === 4 && x >= 1100 && x <= 2099 && !POCITANE.test(dalsi);
    let slovy = jeRok ? rokSlovy(x) : cisloSlovy(x);
    if (!jeRok && x === 1 && /^[a-záčďéěíňóřšťúůýž]/i.test(dalsi)) slovy = /a$/i.test(dalsi) ? "jedna" : /(o|í|e)$/i.test(dalsi) ? "jedno" : "jeden";
    if (!jeRok && x === 2 && /^(sezón|minut|medail|třetin|asistenc|výhr|branky|hvězd|ligy|řady)/i.test(dalsi)) slovy = "dvě";
    return `${slovy}${mez}${dalsi}`;
  });
  return t;
}

function textProHlas(text) {
  return ceskaCisla(text)
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

// Časy vět v nahrávce podle pauz: věty = pole textů (jak jdou za sebou). Vrací [{od, do}] v sekundách.
// Hranice = pauzy nejblíž místům, kde by věta měla podle délky textu končit.
function vetyZPauz(buf, vety) {
  const { pauzy } = najdiPauzy(buf);
  const D = buf.duration;
  let zacatek = 0, konec = D;
  const p0 = pauzy.find((q) => q.od <= 0.06); if (p0) zacatek = p0.do;
  const pk = pauzy.find((q) => q.do >= D - 0.06); if (pk) konec = pk.od;
  if (konec - zacatek < 0.3) { zacatek = 0; konec = D; }
  const n = vety.length;
  if (n <= 1) return [{ od: zacatek, do: konec }];
  const vnitrni = pauzy.filter((q) => q.od > zacatek + 0.1 && q.do < konec - 0.1);
  const vahy = vety.map(vahaTextu), celk = vahy.reduce((a, b) => a + b, 0) || 1;
  let kum = 0;
  const ocek = vahy.slice(0, -1).map((v) => { kum += v; return zacatek + (kum / celk) * (konec - zacatek); });
  const hranice = [];
  let posledni = zacatek;
  for (const t of ocek) {
    let nej = null, nejSkore = Infinity;
    for (const q of vnitrni) {
      if (q.stred <= posledni + 0.2) continue;
      const skore = Math.abs(q.stred - t) - Math.min(0.4, q.delka) * 0.8; // delší pauza = pravděpodobnější konec věty
      if (skore < nejSkore) { nejSkore = skore; nej = q; }
    }
    const h = nej && Math.abs(nej.stred - t) < Math.max(1.2, (konec - zacatek) / n) ? { od: nej.od, do: nej.do } : { od: t, do: t };
    hranice.push(h);
    posledni = (h.od + h.do) / 2;
  }
  return vety.map((_, i) => ({ od: +(i ? hranice[i - 1].do : zacatek).toFixed(2), do: +(i < n - 1 ? hranice[i].od : konec).toFixed(2) }));
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
        ? hlasy.map((v) => `<option value="${esc(v.id)}" ${v.id === n.voiceId ? "selected" : ""}>${esc(v.nazev)}${v.zdarma === true ? " · ✓ jde i na free plánu" : v.zdarma === false ? " · jen placený plán" : v.druh ? ` · ${esc(v.druh)}` : ""}</option>`).join("")
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
    vykresli();
    try { await nactiHlasy(); } catch (e) { zprava(esc(e.message), "chyba"); }
  });
  // Voice ID ručně – pro klíče bez oprávnění číst seznam hlasů
  $("#elVoiceId")?.addEventListener("change", (e) => {
    const id = e.target.value.trim();
    if (!id) return;
    if (!/^[A-Za-z0-9]{10,40}$/.test(id)) { zprava("Voice ID vypadá jinak – v ElevenLabs u hlasu klikni na ⋯ → Copy voice ID.", "chyba"); return; }
    elUloz(undefined, { voiceId: id, voiceName: `Hlas ${id.slice(0, 6)}…` });
    vykresli();
    zprava("Voice ID uložené ✓ Klikni na ▶ Vyzkoušet hlas.");
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
  $("#elNavrhni")?.addEventListener("click", async (e) => {
    const b = e.currentTarget;
    const popis = $("#elNavrhPopis").value.trim();
    const text = $("#elNavrhText").value.trim();
    if (popis.length < 20) { zprava("Popiš hlas aspoň jednou větou.", "chyba"); return; }
    if (text.length < 100 || text.length > 1000) { zprava(`Ukázkový text musí mít 100–1000 znaků (teď ${text.length}).`, "chyba"); return; }
    b.disabled = true;
    zprava("Navrhuji hlasy… obvykle 10–30 s", "");
    try {
      const navrhy = await elNavrhniHlasy({ popis, text });
      if (!navrhy.length) throw new Error("ElevenLabs nevrátil žádný návrh – uprav popis a zkus to znovu.");
      $("#elNavrhy").innerHTML = navrhy.map((n, i) => `<div class="el-navrh-polozka"><b>Návrh ${i + 1}</b><audio controls preload="auto" src="${n.audio}"></audio>
        <button type="button" class="btn small" data-el-pouzij="${esc(n.id)}">✓ Použít tento hlas</button></div>`).join("");
      zprava("Poslechni si návrhy a vyber jeden. Nesedí? Uprav popis (např. „hlubší“, „rychlejší“, „víc vzrušený“) a navrhni znovu.");
    } catch (err) { zprava(esc(err.message), "chyba"); }
    finally { b.disabled = false; }
  });
  $("#elNavrhy")?.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-el-pouzij]");
    if (!b) return;
    b.disabled = true;
    zprava("Ukládám hlas do My Voices…", "");
    try {
      const hlas = await elUlozNavrh({ generatedId: b.dataset.elPouzij, nazev: `Deník hokeje – vypravěč ${new Date().toLocaleDateString("cs-CZ")}`, popis: $("#elNavrhPopis").value.trim() });
      elUloz(undefined, { voiceId: hlas.id, voiceName: hlas.nazev });
      vykresli();
      $("#elNavrhy").innerHTML = "";
      zprava(`Hotovo ✓ Reels teď namlouvá <b>${esc(hlas.nazev)}</b> – i na bezplatném plánu. Klikni na ▶ Vyzkoušet hlas.`);
    } catch (err) { zprava(esc(err.message), "chyba"); b.disabled = false; }
  });
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

window.DHReelsHlas = { slovaZeZarovnani, textProEleven, vetyZPauz, ceskaCisla, cisloSlovy, elNavrhniHlasy, elUlozNavrh, najdiPauzy, rozdelNaSceny, vyrizni, textProElevenLabs, EL_MODELY, maEleven, elKlic, elNastaveni, elUloz, elHlasy, elevenTTS, HLASY, VZORKOVANI, textProHlas, syntetizuj, nahravkaZMikrofonu, dekoduj, zapomen, delkaZvuku, smichej, prehraj, naWav };
})();
