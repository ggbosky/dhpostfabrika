// Přesné časy slov v řeči: Whisper (onnx-community/whisper-small_timestamped, MIT) přímo v prohlížeči přes transformers.js.
// Používá se jen na krátké úseky (upoutávky), text přitom bereme z přesnějšího přepisu Gemini a z Whisperu jen časy.
(() => {
"use strict";
const TRANSFORMERS = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2";
const MODEL = "onnx-community/whisper-small_timestamped";
let asr = null;

async function nactiModel(onStav = () => {}) {
  if (asr) return asr;
  asr = (async () => {
    const { pipeline } = await import(TRANSFORMERS);
    const progress_callback = (x) => { if (x?.status === "progress" && x.total > 5e6) onStav(`⬇️ Stahuji model pro přesné titulky (jen poprvé, ~220 MB)… ${Math.round(x.progress || 0)} %`); };
    const dtype = { encoder_model: "q4", decoder_model_merged: "q8" };
    // WebGPU jen když opravdu je grafický adaptér (jinak by se backend „zasekl“ a nešel by ani WASM)
    let gpu = null;
    try { gpu = navigator.gpu ? await navigator.gpu.requestAdapter() : null; } catch { gpu = null; }
    if (gpu) {
      try { return await pipeline("automatic-speech-recognition", MODEL, { dtype, device: "webgpu", progress_callback }); } catch (e) { console.warn("WebGPU nejde, zkouším WASM:", e?.message); }
    }
    return pipeline("automatic-speech-recognition", MODEL, { dtype, device: "wasm", progress_callback });
  })();
  asr.catch(() => { asr = null; });
  return asr;
}

// AudioBuffer (libovolný) → Float32Array 16 kHz mono pro úsek [od, do)
async function pcm16k(buf, od = 0, doCas = buf.duration) {
  const SR = 16000;
  const delka = Math.max(0.1, doCas - od);
  const off = new OfflineAudioContext(1, Math.ceil(delka * SR), SR);
  const src = off.createBufferSource(); src.buffer = buf; src.connect(off.destination);
  src.start(0, od, delka);
  return (await off.startRendering()).getChannelData(0);
}

// Slova s časy (sekundy od začátku buf) pro úsek [od, do)
async function slovaWhisper(buf, od, doCas, onStav = () => {}) {
  const model = await nactiModel(onStav);
  const pcm = await pcm16k(buf, od, doCas);
  const r = await model(pcm, { language: "czech", task: "transcribe", return_timestamps: "word", chunk_length_s: 30, stride_length_s: 5 });
  return (r.chunks || []).map((c) => ({ text: String(c.text || "").trim(), od: od + (c.timestamp?.[0] ?? 0), do: od + (c.timestamp?.[1] ?? c.timestamp?.[0] ?? 0) }))
    .filter((w) => w.text && Number.isFinite(w.od));
}

const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
function podobnost(a, b) {
  a = norm(a); b = norm(b);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const m = a.length, n = b.length;
  let pred = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const akt = [i];
    for (let j = 1; j <= n; j++) akt[j] = Math.min(pred[j] + 1, akt[j - 1] + 1, pred[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    pred = akt;
  }
  return 1 - pred[n] / Math.max(m, n);
}

// Lokální zarovnání: kde v řeči (slova Whisperu) leží daný text (slova přepisu). Každé slovo textu dostane čas.
// Vrací { slova: [{text, od, do}], kvalita (0–1 podíl spárovaných slov), konecDalsi (začátek slova po textu) } nebo null.
function zarovnej(text, rec) {
  const T = text.length, R = rec.length;
  if (!T || !R) return null;
  const MEZERA = -0.6;
  const H = Array.from({ length: T + 1 }, () => new Float32Array(R + 1));
  const S = Array.from({ length: T + 1 }, () => new Uint8Array(R + 1)); // 1 diag, 2 nahoru, 3 vlevo
  let nej = 0, ni = 0, nj = 0;
  for (let i = 1; i <= T; i++) for (let j = 1; j <= R; j++) {
    const p = podobnost(text[i - 1], rec[j - 1].text);
    const shoda = p >= 0.6 ? 2 * p : -1;
    let v = 0, s = 0;
    const d = H[i - 1][j - 1] + shoda, u = H[i - 1][j] + MEZERA, l = H[i][j - 1] + MEZERA;
    if (d > v) { v = d; s = 1; }
    if (u > v) { v = u; s = 2; }
    if (l > v) { v = l; s = 3; }
    H[i][j] = v; S[i][j] = s;
    if (v > nej) { nej = v; ni = i; nj = j; }
  }
  if (nej <= 0) return null;
  const par = new Array(T).fill(-1);
  let i = ni, j = nj;
  while (i > 0 && j > 0 && S[i][j]) {
    if (S[i][j] === 1) { if (podobnost(text[i - 1], rec[j - 1].text) >= 0.6) par[i - 1] = j - 1; i--; j--; }
    else if (S[i][j] === 2) i--;
    else j--;
  }
  const sparovano = par.filter((x) => x >= 0).length;
  const kvalita = sparovano / T;
  if (sparovano < 2) return null;
  // časy: spárovaná slova z Whisperu, ostatní dopočítat mezi sousedy
  const out = text.map((t, k) => (par[k] >= 0 ? { text: t, od: rec[par[k]].od, do: rec[par[k]].do } : { text: t, od: null, do: null }));
  const prvni = out.findIndex((w) => w.od != null), posl = out.length - 1 - [...out].reverse().findIndex((w) => w.od != null);
  // okraje bez páru: odhad podle průměrné délky slova
  const prumer = Math.max(0.18, (out[posl].do - out[prvni].od) / Math.max(1, posl - prvni + 1));
  for (let k = prvni - 1; k >= 0; k--) { out[k].do = out[k + 1].od; out[k].od = out[k].do - prumer; }
  for (let k = posl + 1; k < out.length; k++) { out[k].od = out[k - 1].do; out[k].do = out[k].od + prumer; }
  for (let k = prvni; k <= posl; k++) {
    if (out[k].od != null) continue;
    let z = k; while (out[z].od == null) z++;
    const a = out[k - 1].do, b = out[z].od, n = z - k;
    for (let q = 0; q < n; q++) { out[k + q].od = a + ((b - a) * q) / n; out[k + q].do = a + ((b - a) * (q + 1)) / n; }
  }
  const posledniRec = par[posl];
  return { slova: out, kvalita, konecDalsi: rec[posledniRec + 1]?.od ?? null };
}

window.DHPrepis = { nactiModel, slovaWhisper, zarovnej, podobnost, pcm16k };
})();
