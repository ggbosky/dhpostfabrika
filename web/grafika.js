// Sdílená grafika: logo Deník hokeje, ořez fotky, stažení a sdílení obrázků.
(() => {
"use strict";

// Logo „DENÍK HOKEJE“ jako vektorové cesty (viewBox 392.64 × 210.62) – dá se
// vykreslit v libovolné barvě bez načítání souboru.
const LOGO_CESTY = ["M56.6,46.41c-1.6-5.55-3.8-10.06-6.61-13.54-2.81-3.48-5.88-5.95-9.22-7.41-3.34-1.47-8.28-2.2-14.84-2.2H0V109.16H26.69c5.74,0,10.43-.81,14.08-2.43s6.76-4.03,9.34-7.24c2.57-3.2,4.7-7.55,6.38-13.04,1.68-5.48,2.52-11.94,2.52-19.36,0-8.24-.8-15.14-2.41-20.68Zm-13.53,34.81c-.86,3.75-1.95,6.49-3.25,8.23-1.31,1.74-2.99,3.03-5.04,3.89s-5.36,1.29-9.93,1.29H14.18V37.79h6.45c5.7,0,9.55,.26,11.54,.76,2.66,.67,4.91,2.05,6.77,4.16,1.85,2.11,3.22,5,4.1,8.66,.88,3.67,1.32,8.69,1.32,15.05s-.43,11.06-1.29,14.8Z", "M85.31,94.63v-23.32h35.39v-14.47h-35.39v-19.05h38.09v-14.53h-52.27V109.16h53.56v-14.53h-39.38Z", "M191.85,89.64c-.28-.07-.56-.12-.85-.13-.3,.04-.61,.07-.92,.12-.55,.1-1.07,.29-1.56,.56-.61,.32-1.14,.75-1.61,1.26-.26,.28-.43,.6-.52,.97-.18,.79-.04,1.54,.25,2.28,.07,.16,.17,.32,.24,.48,.28,.61,.47,1.23,.44,1.91-.01,.18-.01,.36,0,.54,.02,.54-.1,1.06-.24,1.56-.18,.63-.4,1.23-.72,1.8-.08,.13-.14,.28-.21,.41-.17,.33-.21,.69-.22,1.06,0,.12,.03,.26,.09,.37,.12,.22,.26,.44,.4,.66,.23,.36,.56,.59,.96,.74,.92,.37,1.75,.88,2.42,1.63,.13,.14,.25,.29,.3,.48,.24,.86,.59,1.68,.94,2.5,.05,.11,.09,.21,.14,.32h1.59v-19.28c-.3-.08-.61-.17-.92-.24Zm-12.32-66.38v48.09c.48-.1,.97-.19,1.45-.29,.14-.03,.28-.04,.42-.05,.19-.02,.38-.04,.58-.06,.14-.01,.28-.02,.42-.02,.35,0,.7,.01,1.04-.06,.13-.03,.26-.02,.39-.02h4.26c.2,.01,.39,.03,.58,.05,.14,.01,.28,.02,.43,.03,.38,0,.77,0,1.16,0,.23,.01,.46,.04,.69,.05,.25,0,.49,.02,.74,.03,.35,0,.69-.02,1.04,.06h.04V23.26h-13.24Zm-28.83,0h-13.82V88.91c.54-.7,1.17-1.3,1.8-1.93,.72-.74,1.52-1.39,2.32-2.05,1.21-.99,2.51-1.86,3.82-2.72,.3-.2,.6-.39,.89-.6,.19-.14,.37-.29,.55-.44,.53-.44,1.11-.8,1.71-1.13,.35-.19,.73-.32,1.11-.45,.45-.17,.5-.15,.43-.65-.05-.35-.05-.72,.03-1.08,.01-.09,.02-.18,.02-.27,0-.47,.08-.92,.14-1.39,.04-.37,.05-.74,.02-1.12-.01-.12-.05-.22-.16-.29-.14-.08-.21-.22-.31-.34-.2-.25-.41-.5-.6-.76-.25-.33-.49-.66-.72-1.01-.12-.18-.22-.38-.34-.56-.23-.35-.38-.73-.51-1.12-.14-.41-.27-.81-.39-1.22-.03-.13-.06-.26-.06-.38,0-.4-.03-.8,.04-1.2,.03-.14,.03-.28,.03-.43,0-.62,.21-1.19,.5-1.73,.19-.34,.44-.63,.69-.93,.32-.36,.64-.71,.98-1.04,.39-.39,.81-.76,1.25-1.09v-9.84l3.76,7.42s.04-.02,.06-.03c.76-.4,1.53-.8,2.3-1.19,.31-.16,.63-.31,.95-.43,.47-.19,.97-.28,1.48-.31,.2-.01,.41,.01,.62,0,1.08-.03,2.05,.32,2.93,.93,.27,.19,.57,.25,.87,.31,.55,.1,1.1,.18,1.64,.3,1.15,.27,2.25,.69,3.2,1.41,.75,.56,1.37,1.25,1.8,2.1,.4,.78,.63,1.61,.75,2.47,.05,.33,.06,.67,.09,1v.04c-.09,.83-.11,1.67-.35,2.48-.32,1.07-.58,2.15-.77,3.25-.03,.16-.06,.32-.05,.53,.09-.01,.14-.01,.19-.02,1.49-.32,2.98-.65,4.47-.96,.41-.08,.82-.17,1.23-.25l-24.59-48.93Z", "M207.31,23.26v52.49c.71,.28,1.39,.6,2.03,1.03,.5,.34,.93,.74,1.28,1.22,.31,.41,.53,.86,.63,1.36,.04,.2,.12,.37,.2,.55,.66,1.39,1.31,2.78,1.97,4.17,.24,.51,.49,1.02,.73,1.54,.42,.91,.86,1.82,1.27,2.74,.24,.55,.44,1.13,.62,1.71,.21,.66,.4,1.34,.56,2.01,.16,.63,.26,1.27,.34,1.91,.09,.67,.05,1.34,.06,2.01,0,.14-.03,.28-.06,.42-.05,.26-.07,.52-.01,.77,.15,.61,.04,1.21-.13,1.8-.26,.91-.7,1.74-1.26,2.51-.01,.02-.03,.05-.04,.06-.25,.27-.34,.58-.24,.93,.01,.05,.01,.11,.01,.16-.03,.34-.06,.69-.08,1.04-.01,.12-.01,.25,0,.38,.03,.4,.08,.8,.1,1.2,.02,.24,.06,.49,.17,.71,.29,.64,.26,1.31,.17,1.98-.01,.1-.03,.2-.06,.3-.06,.22-.03,.43,.06,.64,.03,.08,.07,.17,.09,.26h5.77V23.26h-14.18ZM213.53,0l-6.63,17.52h8.57L228.75,0h-15.22Z", "M270.83,56.74l26.56-33.48h-19.16l-28.79,38.24V23.26h-14.18V109.16h14.18v-25.96l11.52-14.41,19.44,40.37h18.4l-27.97-52.42Z", "M42.25,123.26v33.81H14.3v-33.81H.12v85.9H14.3v-37.56h27.95v37.56h14.18V123.26h-14.18Z", "M136.02,156.98c-.77,.46-1.54,.93-2.31,1.39-1.46,.89-2.91,1.78-4.37,2.67-1.28,.78-2.56,1.55-3.84,2.32-.99,.61-1.98,1.21-2.98,1.82-.21,.13-.42,.26-.64,.39v.29c0,10.16-1.84,17.68-5.52,22.59-3.68,4.9-8.31,7.35-13.91,7.35s-10.21-2.47-13.96-7.41c-1.34-1.77-2.45-3.85-3.31-6.25-.32-.06-.65-.12-.97-.19-1.02-.22-2.04-.45-3.03-.77-.59-.19-1.19-.37-1.78-.57-.95-.33-1.89-.68-2.8-1.12-.44-.21-.89-.41-1.33-.63-.95-.49-1.87-1.04-2.76-1.65-.56-.38-.89-.93-1.13-1.54-.38-.99-.3-1.97,.13-2.93,.19-.43,.42-.83,.72-1.2,.31-.38,.66-.72,1.11-.93,.54-.26,1.1-.35,1.7-.24,.45,.09,.86,.26,1.24,.51,.48,.3,.98,.59,1.48,.85,.78,.4,1.57,.79,2.37,1.14,1.02,.45,2.04,.88,3.07,1.3,.05,.02,.09,.04,.14,.06-.33-2.48-.49-5.17-.49-8.08,0-10.08,1.82-17.52,5.46-22.32,3.64-4.81,8.35-7.21,14.14-7.21s10.48,2.38,14.06,7.15c3.12,4.16,4.88,10.29,5.29,18.41,1.29-.77,2.58-1.55,3.87-2.32,1.41-.85,2.83-1.71,4.24-2.56,1.75-1.05,3.5-2.1,5.25-3.15,.15-.09,.29-.18,.44-.26-1.36-8.4-4.23-15.25-8.6-20.55-6.34-7.7-14.56-11.54-24.64-11.54-6.95,0-12.87,1.62-17.75,4.86-4.88,3.24-8.84,8.17-11.86,14.79-3.03,6.63-4.55,15.05-4.55,25.29,0,14.1,3.36,25.19,10.08,33.28,5.9,7.07,13.95,10.6,24.14,10.6s18.13-3.57,24.03-10.72c6.71-8.08,10.07-19.31,10.07-33.69,0-3.25-.16-6.32-.5-9.23Z", "M199.6,123.26c.13,.25,.27,.5,.4,.75,.1,.18,.19,.36,.28,.55,.55,1.08,1.1,2.17,1.64,3.25,.44,.87,.87,1.73,1.29,2.61,.14,.29,.27,.57,.4,.86l6.36-8.02h-10.37Zm-10.37,44.38c-.11-.07-.22-.14-.34-.21-.5-.29-1.01-.57-1.49-.9-.68-.48-1.3-1.02-1.79-1.7-.08-.12-.17-.22-.27-.34-.08,.05-.15,.1-.21,.14-.25,.17-.5,.36-.77,.52-.46,.28-.97,.34-1.49,.26-.14-.02-.27-.08-.39-.16-.67-.42-1.33-.84-1.98-1.29-.77-.52-1.52-1.07-2.28-1.61-.61-.43-1.22-.87-1.83-1.3-.84-.6-1.67-1.21-2.51-1.81-1-.72-1.99-1.44-2.98-2.17-.49-.35-.98-.72-1.47-1.07-.7-.52-1.42-1.03-2.12-1.54l-5.3,7.04v-12.2c-.06-.1-.11-.2-.16-.31-.3-.65-.61-1.31-.91-1.97-.2-.44-.39-.9-.58-1.35-.11-.25-.22-.49-.33-.74-.23-.55-.45-1.1-.68-1.65-.02-.05-.03-.1-.06-.14-.07-.15-.16-.18-.31-.1-.24,.13-.47,.27-.7,.41-.91,.55-1.81,1.1-2.72,1.65-1.15,.71-2.31,1.41-3.47,2.12-1.19,.72-2.39,1.44-3.58,2.16-.23,.14-.45,.28-.68,.42v59.36h14.18v-25.96l11.53-14.41,19.43,40.37h18.41l-22.15-41.52Zm-31.16-27.58c-.08-.21-.18-.28-.41-.19-.71,.27-1.43,.47-2.15,.65-.86,.21-1.71,.42-2.56,.64-.42,.11-.84,.11-1.27,.05-.27-.04-.54-.07-.8-.13-.3-.06-.56-.18-.72-.48-.04-.08-.11-.14-.17-.21-.66-.71-1.27-1.46-1.81-2.26-.12-.18-.24-.37-.35-.55v8.95c.68-.41,1.35-.83,2.03-1.24,1.26-.75,2.52-1.51,3.79-2.27,1.36-.81,2.72-1.63,4.08-2.45,.08-.04,.16-.09,.23-.14,.16-.11,.18-.19,.11-.37Z", "M234.3,194.63c.61,.6,1.24,1.19,1.86,1.79,.05,.05,.09,.1,.14,.14,.06,.07,.13,.14,.1,.24-.04,.1-.14,.11-.23,.11-.21-.01-.41-.01-.62-.03-1.11-.12-2.16-.48-3.2-.89-.12-.05-.24-.09-.36-.15-.2-.09-.39-.1-.59-.01-.14,.07-.29,.12-.43,.18-.75,.27-1.52,.46-2.31,.43-1.13-.04-2.13-.4-2.93-1.22-.43-.45-.91-.85-1.38-1.24-.03-.03-.06-.05-.09-.08-.41-.38-.81-.76-1.22-1.13-.32-.3-.66-.58-.99-.87-.02-.01-.04-.03-.06-.05-.39-.35-.79-.71-1.16-1.08-.54-.52-1.11-1-1.69-1.48-.14-.11-.27-.22-.41-.33v20.2h53.56v-14.53h-37.99Zm-13.73-16.51c.33,.3,.66,.61,.99,.91,.4,.35,.8,.69,1.19,1.05,.61,.56,1.27,1.06,1.9,1.59,.37,.31,.71,.65,1.06,.96,.34,.31,.68,.6,1.02,.9,.04,.03,.08,.06,.12,.1,.48,.45,.95,.91,1.44,1.35,.53,.48,1.04,1,1.58,1.48,.39,.36,.77,.73,1.15,1.1,.62,.61,1.26,1.21,1.89,1.81v-18.06h35.39v-14.48h-35.39v-19.04h38.09v-14.53h-52.27v53.22c.36,.33,.72,.65,1.08,.97,.25,.22,.51,.44,.76,.67Z", "M309.79,123.26v55.49c0,7.19-.71,11.83-2.12,13.91-1.41,2.09-3.61,3.14-6.58,3.14s-5.36-1.44-6.88-4.34c-1.14-2.11-1.79-5.68-1.94-10.72l-13.42,1.88c.04,9.37,1.97,16.38,5.8,21.03s9.12,6.97,15.88,6.97c5.12,0,9.42-1.15,12.92-3.45,3.49-2.31,6.12-5.61,7.88-9.91,1.76-4.29,2.64-10.84,2.64-19.62v-54.38h-14.18Z", "M353.26,194.63v-23.32h35.39v-14.48h-35.39v-19.04h38.09v-14.53h-52.27v85.9h53.56v-14.53h-39.38Z", "M234.07,194.41c-.1-.09-.19-.17-.29-.26,.02-.07,.03-.14,.05-.2,.19-.52,.33-1.05,.41-1.61,.05-.42,.05-.82-.04-1.23-.11-.53-.37-.96-.79-1.29-.08-.07-.17-.12-.24-.2-.09-.08-.17-.16-.26-.25v5.26h1.39c-.08-.07-.15-.15-.23-.22Z"];
const LOGO_W = 392.64, LOGO_H = 210.62;
const logoCesty = LOGO_CESTY.map((d) => new Path2D(d));

// Umístění podle šablony: vlevo nahoře, šířka 143 px na slidu 1080 × 1350.
const LOGO = { x: 47, y: 40, sirka: 143 };

function jasOblasti(ctx, x, y, w, h) {
  try {
    const data = ctx.getImageData(x, y, w, h).data;
    let soucet = 0;
    for (let i = 0; i < data.length; i += 16) {
      soucet += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    }
    return soucet / (data.length / 16) / 255;
  } catch { return 0; }
}

// rezim: "auto" (podle jasu pozadí) | "bila" | "cerna" | "seda" | "vypnuto"
function kresliLogo(ctx, rezim = "auto", poloha = LOGO) {
  if (rezim === "vypnuto") return;
  const m = poloha.sirka / LOGO_W;
  const vyska = LOGO_H * m;
  let barva = rezim === "cerna" ? "#1d1d1b" : rezim === "seda" ? "#b7b7b7" : "#ffffff";
  if (rezim === "auto") barva = jasOblasti(ctx, poloha.x, poloha.y, poloha.sirka, vyska) > 0.6 ? "#1d1d1b" : "#ffffff";
  ctx.save();
  if (rezim === "seda") ctx.globalAlpha = 0.88;
  ctx.translate(poloha.x, poloha.y);
  ctx.scale(m, m);
  ctx.fillStyle = barva;
  if (barva === "#ffffff") { ctx.shadowColor = "rgba(0,0,0,0.35)"; ctx.shadowBlur = 10 / m; }
  for (const p of logoCesty) ctx.fill(p);
  ctx.restore();
}

// Ořez fotky „cover“ podle pohledu {zoom, cx, cy} (cx, cy = střed výřezu 0–1).
function vyrez(img, pohled, W, H) {
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  const meritko = Math.max(W / iw, H / ih) * pohled.zoom;
  const sw = W / meritko, sh = H / meritko;
  const sx = Math.min(Math.max(pohled.cx * iw - sw / 2, 0), iw - sw);
  const sy = Math.min(Math.max(pohled.cy * ih - sh / 2, 0), ih - sh);
  return { sx, sy, sw, sh, meritko, iw, ih };
}

function kresliFoto(ctx, img, pohled, W, H) {
  const { sx, sy, sw, sh } = vyrez(img, pohled, W, H);
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, W, H);
}

function omezPohled(img, pohled, W, H) {
  const { sw, sh, iw, ih } = vyrez(img, pohled, W, H);
  pohled.cx = Math.min(Math.max(pohled.cx, sw / 2 / iw), 1 - sw / 2 / iw);
  pohled.cy = Math.min(Math.max(pohled.cy, sh / 2 / ih), 1 - sh / 2 / ih);
}

// Posouvání fotky tažením po náhledu. ziskej() vrací {img, pohled} nebo null.
function tahani(platno, W, H, ziskej, zmena) {
  let start = null;
  platno.addEventListener("pointerdown", (e) => {
    const s = ziskej();
    if (!s) return;
    start = { x: e.clientX, y: e.clientY, cx: s.pohled.cx, cy: s.pohled.cy, s };
    platno.setPointerCapture(e.pointerId);
  });
  platno.addEventListener("pointermove", (e) => {
    if (!start) return;
    const { img, pohled } = start.s;
    const w = start.s.w || W, h = start.s.h || H; // vložená fotka má vlastní rozměr
    const naPlatno = W / platno.getBoundingClientRect().width;
    const { meritko, iw, ih } = vyrez(img, pohled, w, h);
    pohled.cx = start.cx - ((e.clientX - start.x) * naPlatno) / meritko / iw;
    pohled.cy = start.cy - ((e.clientY - start.y) * naPlatno) / meritko / ih;
    omezPohled(img, pohled, w, h);
    zmena();
  });
  const konec = () => { start = null; };
  platno.addEventListener("pointerup", konec);
  platno.addEventListener("pointercancel", konec);
}

function nactiObrazek(soubor) {
  return new Promise((ok, chyba) => {
    if (!soubor || !soubor.type.startsWith("image/")) { chyba(new Error("Tohle není obrázek.")); return; }
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => chyba(new Error("Obrázek se nepodařilo načíst."));
    img.src = URL.createObjectURL(soubor);
  });
}

function slug(text) {
  return (text || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "post";
}

const naBlob = (platno) => new Promise((ok) => platno.toBlob(ok, "image/jpeg", 0.92));

function stahniBlob(blob, nazev) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = nazev;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

async function stahniPlatno(platno, nazev) { stahniBlob(await naBlob(platno), nazev); }

// Sdílení do telefonu (uložit do galerie / poslat do Instagramu), kde to prohlížeč umí.
function lzeSdilet() {
  try {
    return !!(navigator.canShare && navigator.canShare({ files: [new File([""], "a.jpg", { type: "image/jpeg" })] }));
  } catch { return false; }
}

async function sdilej(platna, nazvy) {
  const soubory = [];
  for (let i = 0; i < platna.length; i++) {
    soubory.push(new File([await naBlob(platna[i])], nazvy[i], { type: "image/jpeg" }));
  }
  try { await navigator.share({ files: soubory }); } catch { /* uživatel zrušil */ }
}

// Plynulé ztmavení do černé podle šablony (PSD „Dnes před X lety“): křivka průhlednosti
// naměřená z Photoshopu, žádný viditelný zlom.
const KRIVKA = [[0, 0], [0.067, 0.09], [0.133, 0.19], [0.2, 0.28], [0.267, 0.38], [0.333, 0.49], [0.4, 0.59],
  [0.467, 0.68], [0.533, 0.76], [0.6, 0.83], [0.667, 0.88], [0.733, 0.93], [0.8, 0.96], [0.867, 0.98], [1, 1]];
function ztmaveni(ctx, odY, plneY, W, H) {
  odY = Math.max(0, odY);
  plneY = Math.max(odY + 50, Math.min(H, plneY));
  const g = ctx.createLinearGradient(0, odY, 0, plneY);
  for (const [t, a] of KRIVKA) g.addColorStop(t, `rgba(0,0,0,${a})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, odY, W, plneY - odY);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, plneY - 1, W, H - plneY + 1);
}

// Bohatý text: slova v *hvězdičkách* se kreslí barvou zvýraznění.
function naSlova(radek) {
  const slova = [];
  let slovo = [], zv = false;
  for (const z of radek) {
    if (z === "*") { zv = !zv; continue; }
    if (z === " " || z === "\t") { if (slovo.length) slova.push(slovo); slovo = []; continue; }
    const posl = slovo[slovo.length - 1];
    if (posl && posl.a === zv) posl.t += z; else slovo.push({ t: z, a: zv });
  }
  if (slovo.length) slova.push(slovo);
  return slova;
}
const sirkaSlova = (ctx, s) => s.reduce((a, u) => a + ctx.measureText(u.t).width, 0);
function zalomBohaty(ctx, text, maxSirka) {
  const radky = [];
  const mezera = ctx.measureText(" ").width;
  for (const odstavec of text.split("\n")) {
    let radek = [], sirka = 0;
    for (const s of naSlova(odstavec.trim())) {
      const ws = sirkaSlova(ctx, s);
      if (radek.length && sirka + mezera + ws > maxSirka) { radky.push(radek); radek = [s]; sirka = ws; }
      else { sirka += (radek.length ? mezera : 0) + ws; radek.push(s); }
    }
    if (radek.length) radky.push(radek);
  }
  return radky;
}
function sirkaRadku(ctx, radek) {
  const mezera = ctx.measureText(" ").width;
  return radek.reduce((a, s) => a + sirkaSlova(ctx, s), 0) + mezera * (radek.length - 1);
}
function kresliBohatyRadek(ctx, radek, x, y, barvaZv, zaklad = "#fff") {
  const mezera = ctx.measureText(" ").width;
  for (const slovo of radek) {
    for (const u of slovo) {
      ctx.fillStyle = u.a ? barvaZv : zaklad;
      ctx.fillText(u.t, x, y);
      x += ctx.measureText(u.t).width;
    }
    x += mezera;
  }
}

window.DHG = { ztmaveni, zalomBohaty, sirkaRadku, kresliBohatyRadek, LOGO, kresliLogo, vyrez, kresliFoto, omezPohled, tahani, nactiObrazek, slug, naBlob, stahniBlob, stahniPlatno, lzeSdilet, sdilej };
})();
