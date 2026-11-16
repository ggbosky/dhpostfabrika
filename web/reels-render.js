// Reels Factory – střihový engine: časová osa, skládání snímků 1080×1920, náhled, render MP4
// (H.264 přes WebCodecs + mp4-muxer) a kontrola kvality před exportem.
(() => {
"use strict";

const W = 1080, H = 1920, FPS = 30;
const U = () => window.DHReelsUloziste;
const A = () => window.DHReelsHlas;
const G = () => window.DHG;
const MUXER_URL = "https://cdn.jsdelivr.net/npm/mp4-muxer@5.2.2/build/mp4-muxer.js";
const SLOV_ZA_SEKUNDU = 1.75; // naměřené tempo hlasu Piper (Jirka) včetně pauz – odhad, než je hlas vygenerovaný
const MIN_SEGMENTU = { 30: 5, 45: 6, 60: 7, 90: 9 };

// ---------------------------------------------------------- časová osa --

const slova = (t) => String(t || "").replace(/\*/g, "").split(/\s+/).filter(Boolean);
function odhadDelky(text) { return slova(text).length / SLOV_ZA_SEKUNDU; }

function casovaOsa(p) {
  const rychlost = p.hlas?.rychlost || 1;
  let t = 0;
  // souvislý hlas (namluvený najednou / nahraný celý): scény na sebe navazují bez mezer – audio je plynulé
  const souvisly = !!p.hlas?.souvisly && p.sceny.every((s) => s.hlas?.souborId && s.hlas.souvisly);
  const bezHlasu = !!p.bezHlasu; // upoutávka: úseky videa s původním zvukem, délka = délka úseku
  const segmenty = p.sceny.map((s, i) => {
    const hlasDelka = bezHlasu ? Math.max(0.5, s.trvani || 4) : s.hlas?.delka ? s.hlas.delka / rychlost : odhadDelky(s.text);
    const delka = bezHlasu ? hlasDelka + (i === p.sceny.length - 1 && p.vzhled?.outro !== false ? 2.2 : 0) : souvisly ? hlasDelka + (i === p.sceny.length - 1 ? 0.8 : 0) : Math.max(2.5, hlasDelka + 0.5);
    const seg = { i, scena: s, od: t, do: t + delka, delka, hlasOd: souvisly ? t : t + 0.2, hlasDelka };
    t += delka;
    return seg;
  });
  return { segmenty, celkem: t };
}

// Záběry scény: hlavní + další (rychlé střihy). Délka scény se mezi ně rozdělí rovným dílem.
function zaberySceny(s) { return [s.klip, ...(s.extra || [])].filter((z) => z && z.klipId); }
function aktivniZaber(seg, t) {
  const z = zaberySceny(seg.scena);
  if (!z.length) return null;
  const lokal = Math.max(0, t - seg.od);
  const delka = seg.delka / z.length;
  const idx = Math.min(z.length - 1, Math.floor(lokal / delka));
  const vZaberu = lokal - idx * delka;
  return { zaber: z[idx], idx, lokal: vZaberu, delka, cas: (z[idx].start || 0) + vZaberu };
}
async function nastavVideo(el, a) {
  if (el?.tagName === "VIDEO") await seekTo(el, Math.min(a.cas, Math.max(0, el.duration - 0.05)));
}

// Titulky scény: krátké kousky (max ~30 znaků), časované podle délky hlasu.
// Slova scény (se značkami *) – čísla typu „18 000“, „č. 68“, „1. září“ drží pohromadě.
function slovaTitulku(text) {
  return String(text || "").split(/\s+/).filter(Boolean)
    .reduce((acc, w) => {
      const pred = acc[acc.length - 1];
      if (pred && /^\*?(\d{1,3}|č\.|#|\d{1,2}\.)$/.test(pred) && /^\*?\d|^[a-záčďéěíňóřšťúůýž]+[.,!?]?\*?$/.test(w) && (/^\*?\d/.test(w) || /\d\.$/.test(pred))) acc[acc.length - 1] = `${pred}\u00a0${w}`;
      else acc.push(w);
      return acc;
    }, []);
}
const konecVety = (w) => /[.!?…]["“”»]?$/.test(w.replace(/\*/g, ""));
// Věty scény (jak je čte hlas) – podle nich se titulky časují na pauzy v nahrávce.
function vetyTextu(text) {
  const out = [];
  let veta = [];
  for (const w of slovaTitulku(text)) { veta.push(w); if (konecVety(w)) { out.push(veta.join(" ")); veta = []; } }
  if (veta.length) out.push(veta.join(" "));
  return out.map((v) => v.replace(/\*/g, "").replace(/\u00a0/g, " "));
}

// Titulky scény: krátké kousky (max ~24 znaků, nikdy přes konec věty). Když známe časy vět v nahrávce (vety),
// kousky se rozloží uvnitř každé věty – titulek pak ukazuje přesně to, co hlas právě říká.
function autoTitulky(text, hlasDelka, volby = null) {
  const { vety = null, slova: casySlov = null, posun = 0.2 } = Array.isArray(volby) ? { vety: volby } : (volby || {});
  const s = slova(String(text || "").replace(/\s+/g, " "));
  const zdroj = slovaTitulku(text);
  const kusy = [];  // {text, veta, n}
  let kus = [], iVety = 0;
  const delkaKusu = (k) => k.join(" ").replace(/\*/g, "").length;
  zdroj.forEach((w, i) => {
    kus.push(w);
    const kv = konecVety(w), carka = /[:;,]$/.test(w.replace(/\*/g, ""));
    // krátké úderné kousky (max ~3–4 slova) – moderní titulky na Reels/Shorts
    if (delkaKusu(kus) >= 18 || kv || (carka && kus.length >= 2) || kus.length >= 4 || i === zdroj.length - 1) { kusy.push({ text: kus.join(" "), veta: iVety, n: kus.length }); kus = []; }
    if (kv) iVety++;
  });
  // Neuzavřené *zvýraznění* přes hranici kusu doplníme.
  kusy.forEach((k) => { if ((k.text.match(/\*/g) || []).length % 2) k.text = k.text.replace(/\*/g, ""); });
  const delka = (k) => k.text.replace(/\*/g, "").length + 2;
  const pocetVet = new Set(kusy.map((k) => k.veta)).size;
  // 0) stejná slova jako v přepisu/zarovnání → každé slovo má svůj čas (zvýraznění právě vyslovovaného slova)
  if (casySlov?.length && casySlov.length === zdroj.length) {
    let idx = 0;
    return kusy.map((k, j) => {
      const sl = casySlov.slice(idx, idx + k.n); idx += k.n;
      const dalsi = casySlov[idx];
      const konec = dalsi ? Math.min(dalsi.od, sl[sl.length - 1].do + 0.6) : sl[sl.length - 1].do + 0.4;
      return { text: k.text, od: +(sl[0].od + posun).toFixed(2), do: +(Math.max(konec, sl[0].od + 0.25) + posun).toFixed(2),
        slova: sl.map((w) => ({ od: +(w.od + posun).toFixed(2), do: +(w.do + posun).toFixed(2) })) };
    });
  }
  // 1) přesné časy slov (ElevenLabs): kousek titulku začíná přesně se slovem, které se v tu chvíli říká
  if (casySlov?.length) {
    const sv = []; let akt = [];
    casySlov.forEach((w, i) => { akt.push(w); if (konecVety(w.text) || i === casySlov.length - 1) { sv.push(akt); akt = []; } });
    const skupiny = sv.length === pocetVet ? sv : [casySlov];
    const kusySk = sv.length === pocetVet ? (v) => kusy.filter((k) => k.veta === v) : () => kusy;
    const out = [];
    skupiny.forEach((sw, v) => {
      const ks = kusySk(v);
      const zn = ks.reduce((a, k) => a + delka(k), 0) || 1;
      const spZn = sw.reduce((a, w) => a + w.text.length + 1, 0) || 1;
      // čas pro podíl f (0–1) mluveného textu věty = začátek slova, na které f připadne
      const cas = (f) => {
        let kum = 0;
        for (const w of sw) { if (kum / spZn >= f - 1e-6) return w.od; kum += w.text.length + 1; }
        return sw[sw.length - 1].do;
      };
      let kumD = 0;
      ks.forEach((k, j) => {
        const t0 = cas(kumD / zn);
        kumD += delka(k);
        const t1 = j === ks.length - 1 ? (skupiny[v + 1]?.[0]?.od ?? sw[sw.length - 1].do + 0.3) : cas(kumD / zn);
        out.push({ text: k.text, od: +(t0 + posun).toFixed(2), do: +(Math.max(t1, t0 + 0.25) + posun).toFixed(2) });
      });
    });
    return out;
  }
  // 2) časy vět podle pauz v nahrávce
  if (vety && vety.length === pocetVet) {
    const out = [];
    for (let v = 0; v < pocetVet; v++) {
      const ve = kusy.filter((k) => k.veta === v);
      const zn = ve.reduce((a, k) => a + delka(k), 0) || 1;
      let t = vety[v].od;
      const rozsah = Math.max(0.3, vety[v].do - vety[v].od);
      ve.forEach((k, j) => {
        const d = (delka(k) / zn) * rozsah;
        // drží až do začátku další věty (žádné blikání v pauze)
        const doKonce = j === ve.length - 1 ? (vety[v + 1]?.od ?? t + d) : t + d;
        out.push({ text: k.text, od: +(t + posun).toFixed(2), do: +(Math.max(t + d, doKonce) + posun).toFixed(2) });
        t += d;
      });
    }
    return out;
  }
  const znaku = kusy.reduce((a, k) => a + delka(k), 0) || 1;
  let t = posun;
  const celkem = Math.max(0.5, hlasDelka || s.length / SLOV_ZA_SEKUNDU);
  return kusy.map((k) => {
    const d = (delka(k) / znaku) * celkem;
    const z = { text: k.text, od: +t.toFixed(2), do: +(t + d).toFixed(2) };
    t += d;
    return z;
  });
}

function srt(p) {
  const osa = casovaOsa(p);
  const cas = (x) => {
    const ms = Math.round(x * 1000);
    const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`;
  };
  let n = 0;
  const radky = [];
  for (const seg of osa.segmenty) {
    for (const t of seg.scena.titulky || []) {
      radky.push(`${++n}\n${cas(seg.od + t.od)} --> ${cas(seg.od + t.do)}\n${t.text.replace(/\*/g, "")}\n`);
    }
  }
  return radky.join("\n");
}

// ------------------------------------------------------------- média --

async function mediaUrl(klip) {
  if (klip.souborId) return U().souborUrl(klip.souborId);
  return klip.url;
}

const media = new Map(); // klipId → { el, typ }
async function pripravMedium(klip) {
  if (media.has(klip.id)) return media.get(klip.id);
  const url = await mediaUrl(klip);
  const slib = new Promise((ok, chyba) => {
    if (klip.typ === "foto") {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => ok({ el: img, typ: "foto" });
      img.onerror = () => chyba(new Error(`Fotku „${klip.nazev}“ se nepodařilo načíst.`));
      img.src = url;
      return;
    }
    const v = document.createElement("video");
    v.crossOrigin = "anonymous";
    v.muted = true;
    v.playsInline = true;
    v.preload = "auto";
    const hotovo = () => { v.removeEventListener("loadeddata", hotovo); ok({ el: v, typ: "video" }); };
    v.addEventListener("loadeddata", hotovo);
    v.onerror = () => chyba(new Error(`Video „${klip.nazev}“ se nepodařilo načíst (formát nebo zdroj nepovoluje použití).`));
    v.src = url;
  });
  media.set(klip.id, slib);
  slib.catch(() => media.delete(klip.id));
  return slib;
}
const zapomenMedium = (id) => media.delete(id);

function seekTo(v, cas) {
  return new Promise((ok) => {
    if (Math.abs(v.currentTime - cas) < 0.004 && v.readyState >= 2) { ok(); return; }
    let hotovo = false;
    const konec = () => { if (!hotovo) { hotovo = true; v.removeEventListener("seeked", konec); ok(); } };
    v.addEventListener("seeked", konec);
    setTimeout(konec, 4000);
    v.currentTime = cas;
  });
}

// ------------------------------------------------------------ kreslení --

const FILTRY = {
  prirozene: "contrast(1.06) saturate(1.06)",
  archiv: "sepia(0.22) contrast(1.12) saturate(0.85) brightness(0.98)",
  dramaticke: "contrast(1.18) saturate(0.95) brightness(0.95)",
  zadne: "none",
};
const PISMO_T = '"Montserrat", "Arial Black", sans-serif';
let avatar = null;
function nactiAvatar() {
  if (avatar) return avatar;
  avatar = new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = "brand/dh-avatar.webp"; });
  return avatar;
}

function kresliKlip(ctx, el, nastaveni, filtr, pohyb = { z: 1, px: 0, py: 0 }) {
  const sw = el.videoWidth || el.naturalWidth || el.width, sh = el.videoHeight || el.naturalHeight || el.height;
  if (!sw || !sh) return;
  ctx.save();
  if ((nastaveni.rezim || "vyplnit") === "rozmazane") {
    // celý záběr na šířku + rozmazané pozadí (typické pro historické 4:3 / 16:9 záběry)
    const m = Math.max(W / sw, H / sh) * 1.08;
    ctx.filter = "blur(36px) brightness(0.5)";
    ctx.drawImage(el, (W - sw * m) / 2, (H - sh * m) / 2, sw * m, sh * m);
    const m2 = Math.min(W / sw, (H * 0.62) / sh) * (nastaveni.zoom || 1) * pohyb.z;
    ctx.filter = FILTRY[filtr] || "none";
    ctx.drawImage(el, (W - sw * m2) / 2, (H - sh * m2) / 2 - 40, sw * m2, sh * m2);
  } else {
    const m = Math.max(W / sw, H / sh) * (nastaveni.zoom || 1) * pohyb.z;
    const vw = W / m, vh = H / m;
    const sx = Math.min(Math.max(((nastaveni.fokus ?? 0.5) + pohyb.px) * sw - vw / 2, 0), sw - vw);
    const sy = Math.min(Math.max((0.5 + pohyb.py) * sh - vh / 2, 0), sh - vh);
    ctx.filter = FILTRY[filtr] || "none";
    ctx.drawImage(el, sx, sy, vw, vh, 0, 0, W, H);
  }
  ctx.restore();
}

function zalomBohaty(ctx, text, max) { return G().zalomBohaty(ctx, text, max); }

// Titulky ve stylu Reels/Shorts: tučné verzálky s černým obrysem, právě vyslovované slovo svítí žlutě a „poskočí“,
// *klíčová slova* jsou červená. kus = { text, od, do, slova?: [{od, do}] }, lokal = čas ve scéně.
const TIT_AKTIVNI = "#ffd400", TIT_KLIC = "#ff3b3b";
function kresliTitulky(ctx, kus, lokal, zvyraznit, pop = 1) {
  const t = (zvyraznit ? kus.text : kus.text.replace(/\*/g, "")).toUpperCase();
  ctx.save();
  if (pop !== 1) { ctx.translate(W / 2, 1400); ctx.scale(pop, pop); ctx.translate(-W / 2, -1400); }
  let v = 84, radky;
  for (; v >= 56; v -= 2) {
    ctx.font = `900 ${v}px ${PISMO_T}`;
    radky = zalomBohaty(ctx, t, 900);
    if (radky.length <= 2 && radky.every((r) => G().sirkaRadku(ctx, r) <= 900)) break;
  }
  // které slovo se právě říká
  const slov = radky.reduce((a, r) => a + r.length, 0);
  let aktivni = -1;
  if (kus.slova?.length === slov) aktivni = kus.slova.findIndex((w, i) => lokal >= w.od && lokal < (kus.slova[i + 1]?.od ?? kus.do));
  else if (slov) {
    const zn = radky.flat().map((s) => s.reduce((a, u) => a + u.t.length, 0) + 1);
    const celk = zn.reduce((a, b) => a + b, 0);
    const f = (lokal - kus.od) / Math.max(0.2, kus.do - kus.od);
    let kum = 0;
    aktivni = zn.findIndex((z) => { kum += z; return f * celk < kum; });
  }
  const startAkt = kus.slova?.[aktivni]?.od ?? lokal;
  const rozestup = v * 1.12;
  let y = 1400 - (radky.length - 1) * rozestup;
  ctx.lineJoin = "round";
  ctx.textBaseline = "alphabetic";
  let iSlova = 0;
  for (const r of radky) {
    const sirka = G().sirkaRadku(ctx, r);
    let x = W / 2 - sirka / 2;
    const mezera = ctx.measureText(" ").width * 1.25;
    x = W / 2 - (sirka + (r.length - 1) * ctx.measureText(" ").width * 0.25) / 2;
    for (const slovo of r) {
      const jeAkt = iSlova === aktivni;
      const sw = slovo.reduce((a, u) => a + ctx.measureText(u.t).width, 0);
      ctx.save();
      if (jeAkt) {
        // krátké „poskočení“ při vyslovení slova (bez roztažení do sousedních slov)
        const sk = 1 + 0.07 * Math.max(0, 1 - (lokal - startAkt) / 0.14);
        ctx.translate(x + sw / 2, y - v * 0.35); ctx.scale(sk, sk); ctx.translate(-(x + sw / 2), -(y - v * 0.35));
      }
      let xx = x;
      for (const u of slovo) {
        ctx.lineWidth = v * 0.26;
        ctx.strokeStyle = "#000";
        ctx.shadowColor = "rgba(0,0,0,0.55)"; ctx.shadowBlur = 0; ctx.shadowOffsetY = v * 0.08;
        ctx.strokeText(u.t, xx, y);
        ctx.shadowColor = "transparent";
        ctx.fillStyle = jeAkt ? TIT_AKTIVNI : u.a ? TIT_KLIC : "#ffffff";
        ctx.fillText(u.t, xx, y);
        xx += ctx.measureText(u.t).width;
      }
      ctx.restore();
      x += sw + mezera;
      iSlova++;
    }
    y += rozestup;
  }
  ctx.restore();
}

function kresliNadpisSceny(ctx, text, alfa) {
  if (!text || alfa <= 0) return;
  ctx.save();
  ctx.globalAlpha = alfa;
  const t = text.toUpperCase();
  let v = 76, radky;
  for (; v >= 48; v -= 4) {
    ctx.font = `900 ${v}px ${PISMO_T}`;
    radky = zalomBohaty(ctx, t, 900);
    if (radky.length <= 3) break;
  }
  const rozestup = v * 1.06;
  const horni = 330;
  const g = ctx.createLinearGradient(0, 160, 0, horni + rozestup * radky.length + 120);
  g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(0.35, "rgba(0,0,0,0.55)"); g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 160, W, rozestup * radky.length + 300);
  ctx.fillStyle = "#e01e26";
  ctx.save(); ctx.translate(90, horni - v * 0.95); ctx.transform(1, 0, -0.25, 1, 0, 0); ctx.fillRect(0, 0, 14, v * 0.8); ctx.restore();
  radky.forEach((r, i) => {
    ctx.shadowColor = "rgba(0,0,0,0.6)"; ctx.shadowBlur = 18;
    G().kresliBohatyRadek(ctx, r, 120, horni + i * rozestup, "#ff3b3b");
  });
  ctx.restore();
}

// Upoutávka: stálý pruh nahoře – ikona YouTube, „nové video / premiéra“ a název videa.
const DNY_K = ["NE", "PO", "ÚT", "ST", "ČT", "PÁ", "SO"];
function kresliPruhYouTube(ctx, p, t) {
  const u = p.upoutavka;
  const a = Math.min(1, t / 0.35);
  ctx.save();
  ctx.globalAlpha = a;
  const x = 70, y = 150;
  // ikona přehrávání (červený zaoblený obdélník s bílým trojúhelníkem)
  const iw = 112, ih = 78;
  ctx.fillStyle = "#ff0033"; ctx.shadowColor = "rgba(0,0,0,0.45)"; ctx.shadowBlur = 18;
  ctx.beginPath(); ctx.roundRect(x, y, iw, ih, 22); ctx.fill(); ctx.shadowBlur = 0;
  ctx.fillStyle = "#ffffff"; ctx.beginPath(); ctx.moveTo(x + iw * 0.4, y + ih * 0.27); ctx.lineTo(x + iw * 0.4, y + ih * 0.73); ctx.lineTo(x + iw * 0.7, y + ih * 0.5); ctx.closePath(); ctx.fill();
  // štítek
  let stitek = "NOVÉ VIDEO NA YOUTUBE";
  if (u.premiera) {
    const d = new Date(u.premiera);
    if (d > new Date()) stitek = `PREMIÉRA ${DNY_K[d.getDay()]} ${d.getDate()}. ${d.getMonth() + 1}. · ${d.toLocaleTimeString("cs-CZ", { hour: "numeric", minute: "2-digit" })}`;
  }
  ctx.font = `800 34px ${PISMO_T}`; ctx.textBaseline = "middle"; ctx.textAlign = "left";
  ctx.fillStyle = "#ffc000"; ctx.shadowColor = "rgba(0,0,0,0.6)"; ctx.shadowBlur = 10;
  ctx.fillText(stitek, x + iw + 24, y + 22, W - (x + iw + 24) - 60);
  // název videa (max 2 řádky)
  ctx.font = `900 44px ${PISMO_T}`; ctx.fillStyle = "#ffffff";
  const slova = String(u.nazev || "").toUpperCase().split(/\s+/);
  const max = W - (x + iw + 24) - 60;
  const radky = [];
  let r = "";
  for (const w of slova) { const z = r ? `${r} ${w}` : w; if (ctx.measureText(z).width > max && r) { radky.push(r); r = w; } else r = z; }
  if (r) radky.push(r);
  if (radky.length > 2) { radky.length = 2; radky[1] = `${radky[1].replace(/\s+\S*$/, "")}…`; }
  radky.forEach((rr, i) => ctx.fillText(rr, x + iw + 24, y + 70 + i * 50, max));
  ctx.restore();
}

async function kresliOutro(ctx, alfa, texty = null) {
  if (alfa <= 0) return;
  const av = await nactiAvatar();
  ctx.save();
  ctx.globalAlpha = alfa;
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(0, 0, W, H);
  if (av) {
    ctx.save();
    ctx.beginPath(); ctx.arc(W / 2, 560, 150, 0, Math.PI * 2); ctx.closePath();
    ctx.shadowColor = "rgba(224,30,38,0.6)"; ctx.shadowBlur = 50; ctx.fillStyle = "#000"; ctx.fill();
    ctx.clip(); ctx.drawImage(av, W / 2 - 150, 410, 300, 300); ctx.restore();
  }
  G().kresliLogo(ctx, "bila", { x: W / 2 - 150, y: 760, sirka: 300 });
  ctx.font = `800 46px ${PISMO_T}`;
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  const [r1, r2] = texty?.length ? texty : ["Sledujte další příběhy", "z historie hokeje"];
  ctx.fillText(r1, W / 2, 1020, W - 120);
  ctx.fillStyle = "#ffc000";
  if (r2) ctx.fillText(r2, W / 2, 1080, W - 120);
  ctx.textAlign = "left";
  ctx.restore();
}

// Jeden snímek v čase t. Média musí být už nastavená na správný čas (seek / přehrávání).
async function kresliSnimek(ctx, p, osa, t, elementy) {
  const vz = p.vzhled || {};
  ctx.save();
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);
  const seg = osa.segmenty.find((s) => t >= s.od && t < s.do) || osa.segmenty[osa.segmenty.length - 1];
  if (!seg) { ctx.restore(); return; }
  const s = seg.scena;
  const fire = (vz.strih || "fire") === "fire";
  const a = aktivniZaber(seg, t);
  const el = a && elementy.get(a.zaber.klipId);
  if (el) {
    // pohyb kamery: fotky Ken Burns (střídavě přiblížení / oddálení), video jemný nájezd; ve fire stylu „punch“ na střihu
    const prog = Math.min(1, a.lokal / a.delka);
    const jeFoto = el.tagName !== "VIDEO";
    const smer = (seg.i + a.idx) % 2 ? -1 : 1;
    const sila = fire ? 1 : 0.5;
    let z = jeFoto ? 1.03 + 0.15 * sila * (smer > 0 ? prog : 1 - prog) : 1 + (fire ? 0.06 : 0) * prog;
    const px = jeFoto ? smer * 0.04 * sila * (prog - 0.5) : 0;
    if (fire && (seg.i > 0 || a.idx > 0)) { const k = Math.max(0, 1 - a.lokal / 0.22); z *= 1 + 0.12 * k * k; }
    kresliKlip(ctx, el, a.zaber, vz.barvy || "prirozene", { z, px, py: 0 });
  } else {
    ctx.fillStyle = "#140607"; ctx.fillRect(0, 0, W, H);
    ctx.font = `800 44px ${PISMO_T}`; ctx.fillStyle = "#ff8d92"; ctx.textAlign = "center";
    ctx.fillText("CHYBÍ ZÁBĚR", W / 2, H / 2 - 30);
    ctx.font = `500 32px ${PISMO_T}`; ctx.fillStyle = "#ccc";
    ctx.fillText(`scéna ${seg.i + 1}`, W / 2, H / 2 + 30); ctx.textAlign = "left";
  }
  // jemné ztmavení nahoře a dole kvůli čitelnosti
  let g = ctx.createLinearGradient(0, 0, 0, 380);
  g.addColorStop(0, "rgba(0,0,0,0.55)"); g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, 380);
  g = ctx.createLinearGradient(0, 1150, 0, H);
  g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(0.5, "rgba(0,0,0,0.45)"); g.addColorStop(1, "rgba(0,0,0,0.75)");
  ctx.fillStyle = g; ctx.fillRect(0, 1150, W, H - 1150);

  if (vz.logo !== false) G().kresliLogo(ctx, "bila", { x: 70, y: 150, sirka: 150 });
  const lokal = t - seg.od;
  if (p.upoutavka) await kresliPruhYouTube(ctx, p, t);
  else if (s.titulek) {
    const alfa = Math.min(1, lokal / 0.25) * Math.min(1, Math.max(0, (2.6 - lokal) / 0.3));
    kresliNadpisSceny(ctx, s.titulek, seg.i === 0 ? Math.min(1, lokal / 0.25) * Math.min(1, Math.max(0, (3.2 - lokal) / 0.3)) : alfa);
  }
  if (vz.titulky !== false) {
    const kus = (s.titulky || []).find((k) => lokal >= k.od && lokal < k.do);
    if (kus) kresliTitulky(ctx, kus, lokal, vz.zvyrazneni !== false, 1 + 0.06 * Math.max(0, 1 - (lokal - kus.od) / 0.12));
  }
  if (fire) {
    // viněta + krátký záblesk na každém střihu
    const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.32, W / 2, H / 2, H * 0.72);
    vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,0.42)");
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    let zablesk = 0;
    for (const sg of osa.segmenty) {
      const n = Math.max(1, zaberySceny(sg.scena).length);
      for (let j = 0; j < n; j++) {
        const zacatek = sg.od + (sg.delka / n) * j;
        if (zacatek <= 0.01) continue;
        const d = t - zacatek;
        if (d >= 0 && d < 0.08) zablesk = Math.max(zablesk, 0.5 * (1 - d / 0.08));
      }
    }
    if (zablesk > 0) { ctx.fillStyle = `rgba(255,255,255,${zablesk})`; ctx.fillRect(0, 0, W, H); }
  } else if (vz.prolnuti !== false) {
    // střih přes černou (velmi krátký)
    let a = 0;
    for (const sg of osa.segmenty) {
      if (sg.i === 0) continue;
      const d = Math.abs(t - sg.od);
      if (d < 0.1) a = Math.max(a, (1 - d / 0.1) * 0.8);
    }
    if (a > 0) { ctx.fillStyle = `rgba(0,0,0,${a})`; ctx.fillRect(0, 0, W, H); }
  }
  if (vz.outro !== false) {
    const zbyva = osa.celkem - t;
    if (zbyva < 2.4) await kresliOutro(ctx, Math.min(1, (2.4 - zbyva) / 0.4), vz.outroText);
  }
  // nájezd z černé na začátku
  if (t < 0.25) { ctx.fillStyle = `rgba(0,0,0,${1 - t / 0.25})`; ctx.fillRect(0, 0, W, H); }
  ctx.restore();
}

// ------------------------------------------------------------- zvuk mixu --

async function smichejProjekt(p, osa, pokrok = () => {}) {
  const stopy = [];
  for (const seg of osa.segmenty) {
    const s = seg.scena;
    if (s.hlas?.souborId) {
      const buf = await A().dekoduj(s.hlas.souborId, () => U().souborBlob(s.hlas.souborId));
      stopy.push({ buffer: buf, od: seg.hlasOd, delka: Math.min(buf.duration / (p.hlas?.rychlost || 1), seg.do - seg.hlasOd), hlasitost: 1, rychlost: p.hlas?.rychlost || 1, prolnuti: 0.02 });
    }
    const klip = s.klip && p.klipy[s.klip.klipId];
    if (klip && klip.typ === "video" && (s.klip.zvuk || 0) > 0) {
      try {
        const buf = await A().dekoduj(`klip-${klip.id}`, async () => (klip.souborId ? U().souborBlob(klip.souborId) : (await fetch(klip.url)).blob()));
        const hlasitost = s.klip.zvuk * (s.hlas ? 0.35 : 1); // pod hlasem se původní zvuk ztlumí
        if (p.bezHlasu) {
          // úsek hraje o 0,35 s déle a plynule doznívá pod začátkem dalšího úseku (crossfade, žádné useknutí)
          const posledni = seg.i === osa.segmenty.length - 1;
          const presah = posledni ? 0.6 : 0.35;
          stopy.push({ buffer: buf, od: seg.od, offset: s.klip.start || 0, delka: Math.min(seg.delka, s.trvani || seg.delka) + presah, hlasitost, nabeh: seg.i ? 0.25 : 0.05, dobeh: presah + 0.1 });
        } else {
          stopy.push({ buffer: buf, od: seg.od, offset: s.klip.start || 0, delka: seg.delka / Math.max(1, zaberySceny(s).length), hlasitost, prolnuti: 0.12 });
        }
      } catch { /* video bez zvukové stopy */ }
    }
    pokrok(seg.i / osa.segmenty.length);
  }
  let hudba = null;
  if (p.hudba?.souborId) {
    const buf = await A().dekoduj(p.hudba.souborId, () => U().souborBlob(p.hudba.souborId));
    hudba = { buffer: buf, hlasitost: p.hudba.hlasitost ?? 0.12 };
  }
  return A().smichej({ celkem: osa.celkem, stopy, hudba });
}

// ---------------------------------------------------------------- náhled --

class Nahled {
  constructor(platno) {
    this.platno = platno;
    this.ctx = platno.getContext("2d");
    this.bezi = false;
  }
  async nacti(p, priStavu = () => {}) {
    this.p = p;
    this.osa = casovaOsa(p);
    this.el = new Map();
    for (const s of p.sceny) {
      for (const z of zaberySceny(s)) {
        const k = p.klipy[z.klipId];
        if (k && !this.el.has(k.id)) {
          try { this.el.set(k.id, (await pripravMedium(k)).el); } catch (e) { priStavu(e.message); }
        }
      }
    }
    return this.osa;
  }
  async snimek(t) {
    if (!this.p) return;
    const seg = this.osa.segmenty.find((s) => t >= s.od && t < s.do);
    const a = seg && aktivniZaber(seg, t);
    if (a) await nastavVideo(this.el.get(a.zaber.klipId), a);
    await kresliSnimek(this.ctx, this.p, this.osa, t, this.el);
  }
  async prehraj(p, odCasu = 0, priCase = () => {}) {
    this.zastav();
    await this.nacti(p);
    const mix = await smichejProjekt(p, this.osa);
    this.zvuk = A().prehraj(mix, odCasu);
    this.bezi = true;
    let posledniSeg = -1;
    const smycka = async () => {
      if (!this.bezi) return;
      const t = this.zvuk.cas();
      if (t >= this.osa.celkem) { this.zastav(); priCase(this.osa.celkem, true); return; }
      const seg = this.osa.segmenty.find((s) => t >= s.od && t < s.do);
      const a = seg && aktivniZaber(seg, t);
      if (a) {
        const klic = `${seg.i}:${a.idx}`;
        const el = this.el.get(a.zaber.klipId);
        if (el?.tagName === "VIDEO") {
          if (klic !== posledniSeg || Math.abs(el.currentTime - a.cas) > 0.3) { el.currentTime = a.cas; }
          if (el.paused) el.play().catch(() => {});
        }
        if (klic !== posledniSeg) {
          this.el.forEach((v) => { if (v !== el && v.tagName === "VIDEO" && !v.paused) v.pause(); });
          posledniSeg = klic;
        }
      }
      await kresliSnimek(this.ctx, this.p, this.osa, t, this.el);
      priCase(t, false);
      this.raf = requestAnimationFrame(smycka);
    };
    smycka();
  }
  zastav() {
    this.bezi = false;
    cancelAnimationFrame(this.raf);
    this.zvuk?.zastav();
    this.zvuk = null;
    this.el?.forEach((v) => { if (v.tagName === "VIDEO") v.pause(); });
  }
}

// ---------------------------------------------------------------- formát --

let muxerSlib = null;
function nactiMuxer() {
  if (window.Mp4Muxer) return Promise.resolve(window.Mp4Muxer);
  if (!muxerSlib) {
    muxerSlib = new Promise((ok, chyba) => {
      const sc = document.createElement("script");
      sc.src = MUXER_URL;
      sc.onload = () => ok(window.Mp4Muxer);
      sc.onerror = () => { muxerSlib = null; chyba(new Error("Nepodařilo se načíst knihovnu pro MP4 (jsi online?).")); };
      document.head.appendChild(sc);
    });
  }
  return muxerSlib;
}

async function zjistiFormat() {
  const out = { video: null, audio: null, poznamka: "" };
  if (typeof VideoEncoder === "undefined") {
    out.poznamka = "Prohlížeč neumí kódovat video (WebCodecs). Použij Chrome nebo Edge na počítači.";
    return out;
  }
  for (const codec of ["avc1.640028", "avc1.4d0028", "avc1.42e028"]) {
    try {
      const s = await VideoEncoder.isConfigSupported({ codec, width: W, height: H, bitrate: 8e6, framerate: FPS });
      if (s.supported) { out.video = codec; break; }
    } catch { /* další */ }
  }
  if (typeof AudioEncoder !== "undefined") {
    for (const [codec, mux] of [["mp4a.40.2", "aac"], ["opus", "opus"]]) {
      try {
        const s = await AudioEncoder.isConfigSupported({ codec, sampleRate: 48000, numberOfChannels: 2, bitrate: 192000 });
        if (s.supported) { out.audio = { codec, mux }; break; }
      } catch { /* další */ }
    }
  }
  if (!out.video) out.poznamka = "Prohlížeč neumí H.264. Použij Chrome nebo Edge na počítači.";
  else if (!out.audio) out.poznamka = "Prohlížeč neumí kódovat zvuk. Použij Chrome nebo Edge.";
  else if (out.audio.mux === "opus") out.poznamka = "Zvuk bude Opus (tenhle prohlížeč neumí AAC). Pro Instagram je jistější Chrome/Edge na Windows nebo Macu (AAC).";
  return out;
}

// ---------------------------------------------------------------- render --

async function render(p, { pokrok = () => {}, zruseno = () => false } = {}) {
  const format = await zjistiFormat();
  if (!format.video || !format.audio) throw new Error(format.poznamka);
  const Mp4Muxer = await nactiMuxer();
  const osa = casovaOsa(p);

  pokrok(0, "Míchám zvuk…");
  const mix = await smichejProjekt(p, osa);

  pokrok(0.02, "Načítám záběry…");
  const el = new Map();
  for (const s of p.sceny) {
    for (const z of zaberySceny(s)) {
      const k = p.klipy[z.klipId];
      if (k && !el.has(k.id)) el.set(k.id, (await pripravMedium(k)).el);
    }
  }

  const muxer = new Mp4Muxer.Muxer({
    target: new Mp4Muxer.ArrayBufferTarget(),
    video: { codec: "avc", width: W, height: H, frameRate: FPS },
    audio: { codec: format.audio.mux, sampleRate: 48000, numberOfChannels: 2 },
    fastStart: "in-memory",
    firstTimestampBehavior: "offset",
  });
  let chyba = null;
  const venc = new VideoEncoder({ output: (c, m) => muxer.addVideoChunk(c, m), error: (e) => { chyba = e; } });
  venc.configure({ codec: format.video, width: W, height: H, bitrate: 8_000_000, framerate: FPS, latencyMode: "quality", avc: { format: "avc" } });
  const aenc = new AudioEncoder({ output: (c, m) => muxer.addAudioChunk(c, m), error: (e) => { chyba = e; } });
  aenc.configure({ codec: format.audio.codec, sampleRate: 48000, numberOfChannels: 2, bitrate: 192000 });

  // zvuk
  const kus = 1024 * 4;
  const l = mix.getChannelData(0), r = mix.numberOfChannels > 1 ? mix.getChannelData(1) : l;
  for (let i = 0; i < mix.length; i += kus) {
    const n = Math.min(kus, mix.length - i);
    const data = new Float32Array(n * 2);
    data.set(l.subarray(i, i + n), 0);
    data.set(r.subarray(i, i + n), n);
    const ad = new AudioData({ format: "f32-planar", sampleRate: 48000, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round((i / 48000) * 1e6), data });
    aenc.encode(ad);
    ad.close();
  }

  // video
  const platno = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(W, H) : Object.assign(document.createElement("canvas"), { width: W, height: H });
  const ctx = platno.getContext("2d");
  const snimku = Math.ceil(osa.celkem * FPS);
  for (let n = 0; n < snimku; n++) {
    if (zruseno()) throw new Error("Render zrušen.");
    if (chyba) throw chyba;
    const t = n / FPS;
    const seg = osa.segmenty.find((s) => t >= s.od && t < s.do) || osa.segmenty[osa.segmenty.length - 1];
    const a = aktivniZaber(seg, t);
    if (a) await nastavVideo(el.get(a.zaber.klipId), a);
    await kresliSnimek(ctx, p, osa, t, el);
    const frame = new VideoFrame(platno, { timestamp: Math.round(t * 1e6), duration: Math.round(1e6 / FPS) });
    venc.encode(frame, { keyFrame: n % (FPS * 2) === 0 });
    frame.close();
    while (venc.encodeQueueSize > 6) await new Promise((ok) => setTimeout(ok, 5));
    if (n % 10 === 0) pokrok(0.05 + 0.93 * (n / snimku), `Skládám snímky ${n} / ${snimku}`);
  }
  await venc.flush();
  await aenc.flush();
  if (chyba) throw chyba;
  muxer.finalize();
  pokrok(1, "Hotovo");
  return { blob: new Blob([muxer.target.buffer], { type: "video/mp4" }), delka: osa.celkem, format };
}

// ------------------------------------------------------- kontrola kvality --

function prekryv(a, b) { return a.od < b.do && b.od < a.do; }

async function kontrola(p) {
  const osa = casovaOsa(p);
  const vysl = [];
  const pridej = (stav, text) => vysl.push({ stav, text });
  const sceny = p.sceny;
  if (!sceny.length) { pridej("chyba", "Projekt nemá žádné scény – nejdřív napiš scénář."); return { body: vysl, ok: false, osa }; }

  // 1) pohyblivé video
  let video = 0;
  for (const seg of osa.segmenty) {
    const z = zaberySceny(seg.scena);
    for (const x of z) if (p.klipy[x.klipId]?.typ === "video") video += seg.delka / z.length;
  }
  const podil = video / osa.celkem;
  const bez = osa.segmenty.filter((s) => !zaberySceny(s.scena).length).map((s) => s.i + 1);
  if (bez.length) pridej("chyba", `Chybí záběr nebo fotka ve scénách ${bez.join(", ")}.`);
  else if (podil >= 0.6) pridej("ok", `Skutečné pohyblivé video tvoří ${Math.round(podil * 100)} % délky, zbytek jsou fotky s pohybem kamery.`);
  else pridej("varovani", `Pohyblivé video tvoří ${Math.round(podil * 100)} % délky, zbytek jsou fotky (s pohybem kamery). Víc skutečného videa = víc „fire“.`);

  // 2) počet různých segmentů a opakování
  const pouziti = [];
  for (const seg of osa.segmenty) {
    const z = zaberySceny(seg.scena);
    for (const k of z) {
      const foto = p.klipy[k.klipId]?.typ === "foto";
      pouziti.push({ klip: k.klipId, od: foto ? 0 : k.start || 0, do: foto ? 0 : (k.start || 0) + seg.delka / z.length, scena: seg.i + 1, foto });
    }
  }
  const minimum = p.bezHlasu ? 1 : MIN_SEGMENTU[p.delka] || 6;
  if (p.bezHlasu) pridej("ok", `${pouziti.length} úseků z videa s původním zvukem.`);
  else if (pouziti.length >= minimum) pridej("ok", `${pouziti.length} záběrů (minimum pro ${p.delka} s je ${minimum}).`);
  else pridej("chyba", `Jen ${pouziti.length} záběrů – pro ${p.delka} s je potřeba aspoň ${minimum} různých video segmentů.`);
  const opakovani = [];
  for (let i = 0; i < pouziti.length; i++) for (let j = i + 1; j < pouziti.length; j++) {
    if (pouziti[i].klip === pouziti[j].klip && (pouziti[i].foto ? true : prekryv(pouziti[i], pouziti[j]))) opakovani.push(`${pouziti[i].scena} a ${pouziti[j].scena}`);
  }
  if (opakovani.length) pridej("chyba", `Stejný úsek videa nebo stejná fotka se opakuje ve scénách ${opakovani.join("; ")}. Posuň začátek nebo vyber jiný záběr.`);
  else if (pouziti.length) pridej("ok", "Žádný úsek videa se neopakuje.");

  // 3) práva
  const bezPrav = [...new Set(pouziti.map((u) => u.klip))].map((id) => p.klipy[id]).filter((k) => k && !["volna", "prava"].includes(k.licence?.stav));
  if (bezPrav.length) pridej("chyba", `Chybí potvrzení práv u ${bezPrav.length} záběrů: ${bezPrav.map((k) => `„${k.nazev}“`).join(", ")}. Potvrď je v knihovně záběrů.`);
  else if (pouziti.length) pridej("ok", "Všechny záběry mají volnou licenci nebo potvrzená práva.");

  // 4) hlas a čeština (upoutávka bez namlouvání tyhle body přeskočí)
  if (!p.bezHlasu) {
  const bezHlasu = osa.segmenty.filter((s) => !s.scena.hlas?.souborId).map((s) => s.i + 1);
  if (bezHlasu.length) pridej("chyba", `Chybí český hlas ve scénách ${bezHlasu.join(", ")}.`);
  else pridej("ok", "Hlas je ve všech scénách.");
  const zastarale = osa.segmenty.filter((s) => s.scena.hlas?.textHash && s.scena.hlas.textHash !== hashTextu(s.scena.text)).map((s) => s.i + 1);
  if (zastarale.length) pridej("chyba", `Text scén ${zastarale.join(", ")} se změnil po vygenerování hlasu – vygeneruj hlas znovu.`);
  const vse = sceny.map((s) => s.text).join(" ");
  const cesky = /[ěščřžýáíéůú]/i.test(vse);
  const anglicka = (vse.match(/\b(the|and|with|was|his|for|this|that)\b/gi) || []).length;
  if (!cesky || anglicka > 3) pridej("chyba", "Text nevypadá jako čeština – vše musí být česky.");
  else pridej("ok", "Text je česky.");

  }
  // 5) titulky
  const bezTitulku = osa.segmenty.filter((s) => !(s.scena.titulky || []).length).map((s) => s.i + 1);
  if (p.vzhled?.titulky !== false && bezTitulku.length) pridej(p.bezHlasu ? "varovani" : "chyba", `Chybí titulky ve scénách ${bezTitulku.join(", ")}${p.bezHlasu ? " (v úseku není řeč, nebo chyběl přepis)" : ""}.`);
  else pridej("ok", p.bezHlasu ? "Titulky jsou podle toho, co ve videu zazní." : "Titulky jsou připravené a časované podle hlasu.");

  // 6) fakta a zdroje
  const fakta = p.bezHlasu ? null : p.vyzkum?.fakta || [];
  if (fakta) {
  if (!fakta.length) pridej("varovani", "Scénář nevychází z rešerše – fakta nejsou podložená zdroji.");
  else {
    const pouzita = new Set(sceny.flatMap((s) => s.fakta || []));
    const sporna = fakta.filter((f) => pouzita.has(f.id) && f.jistota === "rozpor");
    const bezZdroje = fakta.filter((f) => pouzita.has(f.id) && !(f.zdroje || []).length);
    if (sporna.length) pridej("chyba", `Scénář používá sporná fakta: ${sporna.map((f) => `„${f.text.slice(0, 60)}“`).join(", ")}.`);
    if (bezZdroje.length) pridej("varovani", `${bezZdroje.length} použitých faktů nemá přímo přiřazený zdroj – ověř je (tlačítko „Ověřit fakta znovu“ nebo seznam všech zdrojů rešerše).`);
    const nejista = fakta.filter((f) => pouzita.has(f.id) && f.jistota === "nejiste");
    if (nejista.length) pridej("varovani", `${nejista.length} použitých faktů je označeno jako nejisté.`);
    if (!sporna.length && !bezZdroje.length) pridej("ok", "Použitá fakta mají zdroje.");
  }
  }
  if ((p.scenar?.nejiste || []).length) pridej("varovani", `AI označila k ověření: ${p.scenar.nejiste.slice(0, 3).join("; ")}`);

  // 7) délka a formát
  const odchylka = Math.abs(osa.celkem - p.delka) / p.delka;
  if (odchylka > 0.2) pridej("varovani", `Délka ${osa.celkem.toFixed(0)} s se liší od cíle ${p.delka} s – ${p.bezHlasu ? "uber nebo přidej úsek" : "uprav text scén"}.`);
  else pridej("ok", `Délka ${osa.celkem.toFixed(0)} s (cíl ${p.delka} s).`);
  if (osa.celkem > 90.5) pridej("chyba", "Reel je delší než 90 s.");
  const format = await zjistiFormat();
  if (!format.video || !format.audio) pridej("chyba", format.poznamka);
  else pridej(format.audio.mux === "aac" ? "ok" : "varovani", format.audio.mux === "aac" ? "Výstup MP4 · H.264 · 1080×1920 · AAC." : format.poznamka);

  // 8) dostupnost záběrů
  for (const id of new Set(pouziti.map((u) => u.klip))) {
    const k = p.klipy[id];
    if (k && k.delka) {
      const potreba = Math.max(...pouziti.filter((u) => u.klip === id).map((u) => u.do));
      if (potreba > k.delka + 0.1) pridej("chyba", `Záběr „${k.nazev}“ je kratší (${k.delka.toFixed(1)} s), než scéna potřebuje (do ${potreba.toFixed(1)} s). Posuň začátek nebo vyber delší záběr.`);
    }
  }
  return { body: vysl, ok: !vysl.some((b) => b.stav === "chyba"), osa };
}

function hashTextu(t) {
  let h = 0;
  for (const ch of String(t || "")) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return String(h);
}

window.DHReelsRender = { vetyTextu, zaberySceny, aktivniZaber, W, H, FPS, casovaOsa, autoTitulky, srt, odhadDelky, pripravMedium, zapomenMedium, kresliSnimek, Nahled, render, kontrola, zjistiFormat, hashTextu, smichejProjekt, MIN_SEGMENTU };
})();
