// Carousel podle šablony Deníku hokeje: titulní slide + obsahové slidy.
(() => {
"use strict";

const G = window.DHG;
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const W = 1080, H = 1350;

const CERVENA = "#ab0707";
const ZLUTA = "#ffc000";
const BILA = "#ffffff";
const PISMO_TITUL = '"Montserrat", "Arial Black", Impact, sans-serif';
const PISMO_OBSAH = '"Roboto Condensed", "Arial Narrow", "Helvetica Neue", Arial, sans-serif';
const MAX_SLIDU = 20;

const UKAZKA = [
  { typ: "titul", cerveny: "Jaroslavl", bily: "2011.", swipe: true },
  { typ: "obsah", nadpis: "Černé *září*.\nOsudný *let* do *Minsku*.", text: "*1. září 2011* mířil *Lokomotiv* na první zápas *sezóny*.\nNa palubě seděl špičkový *evropský* tým." },
  { typ: "obsah", nadpis: "", text: "" },
];

let slidy = [];
let vybrany = 0;
let logoRezim = "auto";

// --------------------------------------------------------------- úložiště --

function ulozKoncept() {
  try {
    localStorage.setItem("dhpf_carousel", JSON.stringify({
      slidy: slidy.map(({ typ, cerveny, bily, swipe, nadpis, text }) => ({ typ, cerveny, bily, swipe, nadpis, text })),
      popisek: $("#cPopisek").value,
      logo: logoRezim,
    }));
  } catch { /* soukromé okno */ }
}

function novySlide(data) {
  const s = { typ: "obsah", cerveny: "", bily: "", swipe: true, nadpis: "", text: "", ...data };
  s.img = null;
  s.nazevFota = "";
  s.pohled = { zoom: 1, cx: 0.5, cy: 0.45 };
  s.platno = document.createElement("canvas");
  s.platno.width = W;
  s.platno.height = H;
  return s;
}

function nactiKoncept() {
  let k = null;
  try { k = JSON.parse(localStorage.getItem("dhpf_carousel")); } catch { /* nic */ }
  slidy = (k?.slidy?.length ? k.slidy : UKAZKA).map(novySlide);
  if (slidy[0].typ !== "titul") slidy.unshift(novySlide({ typ: "titul" }));
  $("#cPopisek").value = k?.popisek || "";
  logoRezim = ["auto", "bila", "cerna", "vypnuto"].includes(k?.logo) ? k.logo : "auto";
  $("#cLogo").value = logoRezim;
}

// ------------------------------------------------------------ bohatý text --

// "Černé *září*." → slova, každé složené z úseků {t, a} (a = zvýrazněno).
function naSlova(radek) {
  const slova = [];
  let slovo = [];
  let zvyrazneno = false;
  const pridejZnak = (z) => {
    const posledni = slovo[slovo.length - 1];
    if (posledni && posledni.a === zvyrazneno) posledni.t += z;
    else slovo.push({ t: z, a: zvyrazneno });
  };
  for (const z of radek) {
    if (z === "*") { zvyrazneno = !zvyrazneno; continue; }
    if (z === " " || z === "\t") { if (slovo.length) slova.push(slovo); slovo = []; continue; }
    pridejZnak(z);
  }
  if (slovo.length) slova.push(slovo);
  return slova;
}

const sirkaSlova = (ctx, slovo) => slovo.reduce((s, u) => s + ctx.measureText(u.t).width, 0);

function zalom(ctx, text, maxSirka) {
  const radky = [];
  for (const odstavec of text.split("\n")) {
    const slova = naSlova(odstavec.trim());
    if (!slova.length) continue;
    const mezera = ctx.measureText(" ").width;
    let radek = [], sirka = 0;
    for (const s of slova) {
      const ws = sirkaSlova(ctx, s);
      if (radek.length && sirka + mezera + ws > maxSirka) {
        radky.push(radek);
        radek = [s]; sirka = ws;
      } else {
        sirka += (radek.length ? mezera : 0) + ws;
        radek.push(s);
      }
    }
    if (radek.length) radky.push(radek);
  }
  return radky;
}

function kresliRadek(ctx, radek, stred, y, barvaZvyrazneni) {
  const mezera = ctx.measureText(" ").width;
  const celkem = radek.reduce((s, sl) => s + sirkaSlova(ctx, sl), 0) + mezera * (radek.length - 1);
  let x = stred - celkem / 2;
  for (const slovo of radek) {
    for (const u of slovo) {
      ctx.fillStyle = u.a ? barvaZvyrazneni : BILA;
      ctx.fillText(u.t, x, y);
      x += ctx.measureText(u.t).width;
    }
    x += mezera;
  }
}

const nejsirsi = (ctx, radky) => Math.max(0, ...radky.map((r) => {
  const mezera = ctx.measureText(" ").width;
  return r.reduce((s, sl) => s + sirkaSlova(ctx, sl), 0) + mezera * (r.length - 1);
}));

// ----------------------------------------------------------------- kreslení --

function pozadi(ctx, s) {
  if (s.img) {
    G.kresliFoto(ctx, s.img, s.pohled, W, H);
  } else {
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, "#2a3446");
    g.addColorStop(0.6, "#10151f");
    g.addColorStop(1, "#05070d");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
}

function ztmaveni(ctx, odY, plneY) {
  const g = ctx.createLinearGradient(0, odY, 0, plneY);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(0.55, "rgba(0,0,0,0.75)");
  g.addColorStop(1, "rgba(0,0,0,1)");
  ctx.fillStyle = g;
  ctx.fillRect(0, odY, W, plneY - odY);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, plneY, W, H - plneY);
}

function velikostNaSirku(ctx, text, vaha, pismo, max, sirka) {
  let v = max;
  ctx.font = `${vaha} ${v}px ${pismo}`;
  while (v > 40 && ctx.measureText(text).width > sirka) {
    v -= 4;
    ctx.font = `${vaha} ${v}px ${pismo}`;
  }
  return v;
}

const SWIPE_RUKA = [
  "M22 14a8 8 0 0 1-8 8",
  "M18 11v-1a2 2 0 0 0-4 0v1",
  "M14 10V9a2 2 0 0 0-4 0v1",
  "M10 9.5V4a2 2 0 0 0-4 0v10",
  "M18 11a2 2 0 1 1 4 0v3a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15",
].map((d) => new Path2D(d));

function kresliSwipe(ctx) {
  ctx.save();
  ctx.translate(938, 1196);
  ctx.scale(5, 5);
  ctx.strokeStyle = BILA;
  ctx.lineWidth = 1.3;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const p of SWIPE_RUKA) ctx.stroke(p);
  // šipka doleva nad prstem
  ctx.beginPath();
  ctx.arc(11, 4.2, 6.5, Math.PI * 1.08, Math.PI * 1.9);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(6.6, -1.2); ctx.lineTo(4.6, 3.1); ctx.lineTo(9.2, 3.3);
  ctx.stroke();
  ctx.restore();
}

function kresliTitul(ctx, s) {
  const cerveny = s.cerveny.trim().toUpperCase();
  const bily = s.bily.trim().toUpperCase();
  const sirka = W - 120;
  const vBily = bily ? velikostNaSirku(ctx, bily, 900, PISMO_TITUL, 170, sirka) : 0;
  const vCerveny = cerveny ? velikostNaSirku(ctx, cerveny, 900, PISMO_TITUL, 170, sirka) : 0;
  const yBily = H - 100;
  const yCerveny = bily ? yBily - vBily * 0.72 - 75 : H - 110;
  const horni = cerveny ? yCerveny - vCerveny * 0.72 : yBily - vBily * 0.72;
  ztmaveni(ctx, Math.max(200, horni - 420), Math.min(H - 40, horni + 120));
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  if (cerveny) {
    ctx.font = `900 ${vCerveny}px ${PISMO_TITUL}`;
    ctx.fillStyle = CERVENA;
    ctx.fillText(cerveny, (W - ctx.measureText(cerveny).width) / 2, yCerveny);
  }
  if (bily) {
    ctx.font = `900 ${vBily}px ${PISMO_TITUL}`;
    ctx.fillStyle = BILA;
    ctx.fillText(bily, (W - ctx.measureText(bily).width) / 2, yBily);
  }
  if (s.swipe) kresliSwipe(ctx);
}

function kresliObsah(ctx, s) {
  const sirka = W - 80;
  // Text (kurzíva, žluté zvýraznění)
  let vText = 46, radkyText = [];
  if (s.text.trim()) {
    for (; vText >= 32; vText -= 2) {
      ctx.font = `italic 700 ${vText}px ${PISMO_OBSAH}`;
      radkyText = zalom(ctx, s.text, sirka);
      if (radkyText.length <= 5) break;
    }
  }
  const rozestupText = Math.round(vText * 1.2);
  // Nadpis (verzálky, červené zvýraznění)
  let vNadpis = 88, radkyNadpis = [];
  if (s.nadpis.trim()) {
    for (; vNadpis >= 56; vNadpis -= 4) {
      ctx.font = `700 ${vNadpis}px ${PISMO_OBSAH}`;
      radkyNadpis = zalom(ctx, s.nadpis.toUpperCase(), sirka);
      if (radkyNadpis.length <= 3 && nejsirsi(ctx, radkyNadpis) <= sirka) break;
    }
  }
  const rozestupNadpis = Math.round(vNadpis * 1.05);

  const posledniText = H - 100;
  const prvniText = posledniText - (radkyText.length - 1) * rozestupText;
  const posledniNadpis = radkyText.length ? prvniText - vText * 0.75 - 70 : H - 110;
  const prvniNadpis = posledniNadpis - (radkyNadpis.length - 1) * rozestupNadpis;
  const horni = radkyNadpis.length ? prvniNadpis - vNadpis * 0.75 : prvniText - vText * 0.75;
  if (radkyNadpis.length || radkyText.length) ztmaveni(ctx, Math.max(150, horni - 380), Math.min(H - 40, horni + 170));

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.font = `700 ${vNadpis}px ${PISMO_OBSAH}`;
  radkyNadpis.forEach((r, i) => kresliRadek(ctx, r, W / 2, prvniNadpis + i * rozestupNadpis, CERVENA));
  ctx.font = `italic 700 ${vText}px ${PISMO_OBSAH}`;
  radkyText.forEach((r, i) => kresliRadek(ctx, r, W / 2, prvniText + i * rozestupText, ZLUTA));
}

function vykresliSlide(i) {
  const s = slidy[i];
  const ctx = s.platno.getContext("2d");
  ctx.clearRect(0, 0, W, H);
  pozadi(ctx, s);
  if (s.typ === "titul") kresliTitul(ctx, s);
  else kresliObsah(ctx, s);
  G.kresliLogo(ctx, logoRezim);
  const nahled = $$("#cNahledy canvas")[i];
  if (nahled) nahled.getContext("2d").drawImage(s.platno, 0, 0, nahled.width, nahled.height);
  if (i === vybrany) {
    const hlavni = $("#cPlatno").getContext("2d");
    hlavni.clearRect(0, 0, W, H);
    hlavni.drawImage(s.platno, 0, 0);
  }
}

const vykresliVse = () => slidy.forEach((_, i) => vykresliSlide(i));

// ---------------------------------------------------------------- seznam --

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function kartaSlidu(s, i) {
  const pole = s.typ === "titul"
    ? `<div class="dva">
         <label>Červený nápis<input data-k="cerveny" value="${esc(s.cerveny)}" placeholder="např. Jaroslavl"></label>
         <label>Bílý nápis<input data-k="bily" value="${esc(s.bily)}" placeholder="např. 2011."></label>
       </div>
       <label class="check"><input type="checkbox" data-k="swipe"${s.swipe ? " checked" : ""}> Ikona „posuň dál“ vpravo dole</label>`
    : `<label>Nadpis<textarea data-k="nadpis" rows="2" placeholder="např. Černé *září*.&#10;Osudný *let* do *Minsku*.">${esc(s.nadpis)}</textarea></label>
       <label>Text<textarea data-k="text" rows="3" placeholder="např. *1. září 2011* mířil *Lokomotiv* na první zápas *sezóny*.">${esc(s.text)}</textarea></label>`;
  return `<div class="slide-karta${i === vybrany ? " on" : ""}" data-i="${i}">
    <div class="slide-hlava">
      <b>${i + 1} · ${s.typ === "titul" ? "Titulní slide" : "Slide"}</b>
      <span class="ikony">
        <button type="button" class="ikona" data-akce="nahoru" title="Posunout výš"${i <= 1 ? " disabled" : ""}>↑</button>
        <button type="button" class="ikona" data-akce="dolu" title="Posunout níž"${i === 0 || i === slidy.length - 1 ? " disabled" : ""}>↓</button>
        <button type="button" class="ikona" data-akce="smazat" title="Smazat slide"${i === 0 ? " disabled" : ""}>✕</button>
      </span>
    </div>
    <div class="slide-pole">
      ${pole}
      <div class="foto-radek">
        <label class="btn ghost small" style="color:var(--text);font-weight:600">📷 ${s.img ? "Změnit fotku" : "Nahrát fotku"}<input type="file" accept="image/*" data-akce="foto"></label>
        ${s.img ? `<span class="jmeno">${esc(s.nazevFota)}</span><button type="button" class="btn ghost small" data-akce="bezFota">Odebrat</button>` : "<span>bez fotky = tmavé pozadí</span>"}
      </div>
    </div>
  </div>`;
}

function vykresliSeznam() {
  $("#slidy").innerHTML = slidy.map(kartaSlidu).join("");
  $("#cNahledy").innerHTML = slidy.map((_, i) =>
    `<canvas width="216" height="270" data-i="${i}" class="${i === vybrany ? "on" : ""}" title="Slide ${i + 1}"></canvas>`).join("");
  $$("#cNahledy canvas").forEach((c) => c.addEventListener("click", () => vyber(Number(c.dataset.i), true)));
  $("#cPridat").disabled = slidy.length >= MAX_SLIDU;
  vykresliVse();
  aktualizujOvladani();
}

function aktualizujOvladani() {
  const s = slidy[vybrany];
  $("#cCislo").textContent = `· slide ${vybrany + 1} / ${slidy.length}`;
  $("#cZoomRadek").hidden = !s.img;
  $("#cZoom").value = s.pohled.zoom;
}

function vyber(i, posunoutKartu = false) {
  if (i === vybrany) return;
  vybrany = i;
  $$("#slidy .slide-karta").forEach((k) => k.classList.toggle("on", Number(k.dataset.i) === i));
  $$("#cNahledy canvas").forEach((c) => c.classList.toggle("on", Number(c.dataset.i) === i));
  vykresliSlide(i);
  aktualizujOvladani();
  if (posunoutKartu) $(`#slidy .slide-karta[data-i="${i}"]`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

async function nastavFoto(i, soubor) {
  try {
    const img = await G.nactiObrazek(soubor);
    const s = slidy[i];
    s.img = img;
    s.nazevFota = soubor.name || "fotka";
    s.pohled = { zoom: 1, cx: 0.5, cy: 0.45 };
    vybrany = i;
    vykresliSeznam();
  } catch (e) {
    alert(e.message);
  }
}

// --------------------------------------------------------------- popisek --

function bezZnacek(s) {
  return (s || "").replace(/\*/g, "").replace(/\s*\n\s*/g, " ").trim();
}

function vytvorPopisek() {
  let profil = null;
  try { profil = JSON.parse(localStorage.getItem("dhpf_profil")); } catch { /* nic */ }
  const titul = slidy[0];
  const casti = [];
  const hook = [bezZnacek(titul.cerveny), bezZnacek(titul.bily)].filter(Boolean).join(" ");
  if (hook) casti.push(`🚨 ${hook}`);
  for (const s of slidy.slice(1)) {
    const odstavec = [bezZnacek(s.nadpis), bezZnacek(s.text)].filter(Boolean).join(" ");
    if (odstavec) casti.push(odstavec);
  }
  const cta = profil?.cta?.length ? profil.cta[Math.floor(Math.random() * profil.cta.length)] : "Co na to říkáte? 👇";
  casti.push(`👉 Swipe pro celý příběh\n\n${cta}`);
  const stale = profil?.stale?.length ? profil.stale : ["#denikhokeje", "#hokej"];
  const dalsi = profil?.hashtagy?.length ? profil.hashtagy : ["#ceskyhokej", "#hockey", "#icehockey"];
  const cil = profil?.pocetTagu ?? 8;
  const tagy = [...new Set([...stale, ...dalsi])].slice(0, Math.max(cil, stale.length));
  if (tagy.length && cil !== 0) casti.push(tagy.join(" "));
  $("#cPopisek").value = casti.join("\n\n");
  prepocitejPopisek();
  ulozKoncept();
}

function prepocitejPopisek() {
  const text = $("#cPopisek").value;
  const znaky = [...text].length;
  const tagy = (text.match(/#[\p{L}\p{N}_]+/gu) || []).length;
  $("#cPocty").innerHTML =
    `<span class="${znaky > 2200 ? "spatne" : ""}">${znaky} / 2200 znaků</span>` +
    `<span class="${tagy > 30 ? "spatne" : ""}">${tagy} / 30 hashtagů</span>`;
}

// ---------------------------------------------------------------- export --

function nazevSouboru(i) {
  const zaklad = G.slug([slidy[0].cerveny, slidy[0].bily].join(" ").trim() || "carousel");
  return `denik-hokeje-${zaklad}-${String(i + 1).padStart(2, "0")}.jpg`;
}

let jszip = null;
function nactiJSZip() {
  if (window.JSZip) return Promise.resolve(window.JSZip);
  if (jszip) return jszip;
  jszip = new Promise((ok, chyba) => {
    const sc = document.createElement("script");
    sc.src = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
    sc.onload = () => ok(window.JSZip);
    sc.onerror = () => { jszip = null; chyba(new Error("Nepodařilo se načíst knihovnu pro ZIP (jsi online?).")); };
    document.head.appendChild(sc);
  });
  return jszip;
}

async function stahniVse() {
  const b = $("#cStahniVse");
  const puvodni = b.textContent;
  b.disabled = true;
  b.textContent = "Připravuju…";
  try {
    vykresliVse();
    const JSZip = await nactiJSZip();
    const zip = new JSZip();
    for (let i = 0; i < slidy.length; i++) zip.file(nazevSouboru(i), await G.naBlob(slidy[i].platno));
    const popisek = $("#cPopisek").value.trim();
    if (popisek) zip.file("popisek.txt", popisek);
    const blob = await zip.generateAsync({ type: "blob" });
    G.stahniBlob(blob, nazevSouboru(0).replace(/-01\.jpg$/, ".zip"));
  } catch (e) {
    alert(e.message);
  } finally {
    b.disabled = false;
    b.textContent = puvodni;
  }
}

// ------------------------------------------------------------------ start --

function init() {
  nactiKoncept();
  vykresliSeznam();
  prepocitejPopisek();

  const seznam = $("#slidy");
  seznam.addEventListener("input", (e) => {
    const karta = e.target.closest(".slide-karta");
    const k = e.target.dataset.k;
    if (!karta || !k) return;
    const i = Number(karta.dataset.i);
    slidy[i][k] = e.target.type === "checkbox" ? e.target.checked : e.target.value;
    vyber(i);
    vykresliSlide(i);
    ulozKoncept();
  });
  seznam.addEventListener("change", (e) => {
    if (e.target.dataset.akce !== "foto") return;
    const i = Number(e.target.closest(".slide-karta").dataset.i);
    nastavFoto(i, e.target.files[0]);
  });
  seznam.addEventListener("click", (e) => {
    const karta = e.target.closest(".slide-karta");
    if (!karta) return;
    const i = Number(karta.dataset.i);
    const akce = e.target.closest("button")?.dataset.akce;
    if (akce === "nahoru" && i > 1) { [slidy[i - 1], slidy[i]] = [slidy[i], slidy[i - 1]]; vybrany = i - 1; vykresliSeznam(); ulozKoncept(); }
    else if (akce === "dolu" && i < slidy.length - 1) { [slidy[i + 1], slidy[i]] = [slidy[i], slidy[i + 1]]; vybrany = i + 1; vykresliSeznam(); ulozKoncept(); }
    else if (akce === "smazat" && i > 0) {
      slidy.splice(i, 1);
      vybrany = Math.min(vybrany, slidy.length - 1);
      vykresliSeznam(); ulozKoncept();
    } else if (akce === "bezFota") { slidy[i].img = null; vybrany = i; vykresliSeznam(); }
    else vyber(i);
  });

  $("#cPridat").addEventListener("click", () => {
    if (slidy.length >= MAX_SLIDU) return;
    slidy.push(novySlide({ typ: "obsah" }));
    vybrany = slidy.length - 1;
    vykresliSeznam();
    ulozKoncept();
    $(`#slidy .slide-karta[data-i="${vybrany}"] textarea`)?.focus();
  });
  $("#cReset").addEventListener("click", () => {
    if (!confirm("Smazat všechny slidy a začít znovu?")) return;
    slidy = [novySlide({ typ: "titul" }), novySlide({ typ: "obsah" })];
    vybrany = 0;
    $("#cPopisek").value = "";
    vykresliSeznam();
    prepocitejPopisek();
    ulozKoncept();
  });

  $("#cLogo").addEventListener("change", (e) => { logoRezim = e.target.value; vykresliVse(); ulozKoncept(); });
  $("#cZoom").addEventListener("input", (e) => {
    const s = slidy[vybrany];
    if (!s.img) return;
    s.pohled.zoom = Number(e.target.value);
    G.omezPohled(s.img, s.pohled, W, H);
    vykresliSlide(vybrany);
  });
  G.tahani($("#cPlatno"), W, H, () => (slidy[vybrany].img ? slidy[vybrany] : null), () => vykresliSlide(vybrany));

  const cil = $("#cNahled");
  cil.addEventListener("dragover", (e) => { e.preventDefault(); cil.classList.add("drop"); });
  cil.addEventListener("dragleave", () => cil.classList.remove("drop"));
  cil.addEventListener("drop", (e) => { e.preventDefault(); cil.classList.remove("drop"); nastavFoto(vybrany, e.dataTransfer.files[0]); });

  $("#cPopisekZeSlidu").addEventListener("click", vytvorPopisek);
  $("#cPopisek").addEventListener("input", () => { prepocitejPopisek(); ulozKoncept(); });
  $("#cKopiruj").addEventListener("click", async () => {
    const text = $("#cPopisek").value;
    try { await navigator.clipboard.writeText(text); } catch { $("#cPopisek").select(); document.execCommand("copy"); }
    const b = $("#cKopiruj");
    b.textContent = "Zkopírováno ✓";
    setTimeout(() => { b.textContent = "Kopírovat text"; }, 1600);
  });
  $("#cStahniVse").addEventListener("click", stahniVse);
  $("#cStahniJeden").addEventListener("click", () => { vykresliSlide(vybrany); G.stahniPlatno(slidy[vybrany].platno, nazevSouboru(vybrany)); });
  if (G.lzeSdilet()) {
    $("#cSdilej").hidden = false;
    $("#cSdilej").addEventListener("click", () => { vykresliVse(); G.sdilej(slidy.map((s) => s.platno), slidy.map((_, i) => nazevSouboru(i))); });
  }

  if (document.fonts) {
    Promise.all([
      document.fonts.load(`900 120px Montserrat`),
      document.fonts.load(`700 80px "Roboto Condensed"`),
      document.fonts.load(`italic 700 40px "Roboto Condensed"`),
    ]).then(vykresliVse).catch(() => {});
  }
}

init();
})();
