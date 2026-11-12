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
      slidy: slidy.map(({ typ, cerveny, bily, swipe, nadpis, text, dotaz }) => ({ typ, cerveny, bily, swipe, nadpis, text, dotaz })),
      popisek: $("#cPopisek").value,
      logo: logoRezim,
    }));
  } catch { /* soukromé okno */ }
}

function novySlide(data) {
  const s = { typ: "obsah", cerveny: "", bily: "", swipe: true, nadpis: "", text: "", ...data };
  s.img = null;
  s.nazevFota = "";
  s.kredit = "";
  s.url = "";
  s.dotaz = s.dotaz || "";
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
    g.addColorStop(0, "#4a0a0e");
    g.addColorStop(0.55, "#160607");
    g.addColorStop(1, "#050505");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
}

// Plynulý přechod do černé (stejná křivka jako šablona „Dnes před X lety“).
const ztmaveni = (ctx, odY, plneY) => G.ztmaveni(ctx, odY, plneY, W, H);

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
  ctx.translate(944, 1216);
  ctx.scale(4.6, 4.6);
  ctx.strokeStyle = BILA;
  ctx.lineWidth = 1.4;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const p of SWIPE_RUKA) ctx.stroke(p);
  // Oblouková šipka doleva nad prstem, s mezerou (špička prstu je v bodě 8, 2).
  const sx = 8.6, sy = 3.2, r = 6.4;
  const od = Math.PI * 1.82, k = Math.PI * 1.2;
  ctx.beginPath();
  ctx.arc(sx, sy, r, od, k, true);
  ctx.stroke();
  const hx = sx + r * Math.cos(k), hy = sy + r * Math.sin(k);
  const smer = Math.atan2(-Math.cos(k), Math.sin(k)); // tečna ve směru pohybu (proti směru hodinek)
  const hrot = 2.3;
  ctx.beginPath();
  ctx.moveTo(hx + hrot * Math.cos(smer + Math.PI - 0.6), hy + hrot * Math.sin(smer + Math.PI - 0.6));
  ctx.lineTo(hx, hy);
  ctx.lineTo(hx + hrot * Math.cos(smer + Math.PI + 0.6), hy + hrot * Math.sin(smer + Math.PI + 0.6));
  ctx.stroke();
  ctx.restore();
}

function kresliTitul(ctx, s) {
  const cerveny = s.cerveny.trim().toUpperCase();
  const bily = s.bily.trim().toUpperCase();
  const sirka = W - 120;
  // Spodní řádek nesmí zasahovat do ikony „posuň dál“ vpravo dole (začíná na x ≈ 945):
  // text je na střed, takže jeho šířka je nejvýš 2 × (925 − 540) px.
  const sirkaDole = s.swipe ? 2 * (925 - W / 2) : sirka;
  const vBily = bily ? velikostNaSirku(ctx, bily, 900, PISMO_TITUL, 170, sirkaDole) : 0;
  const vCerveny = cerveny ? velikostNaSirku(ctx, cerveny, 900, PISMO_TITUL, 170, bily ? sirka : sirkaDole) : 0;
  const yBily = H - 100;
  const yCerveny = bily ? yBily - vBily * 0.72 - 75 : H - 110;
  const horni = cerveny ? yCerveny - vCerveny * 0.72 : yBily - vBily * 0.72;
  ztmaveni(ctx, horni - 600, horni + 150);
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
  if (radkyNadpis.length || radkyText.length) ztmaveni(ctx, horni - 565, horni + 185);

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
        <label class="btn ghost small" style="color:var(--text);font-weight:600">📷 ${s.img ? "Vlastní fotka" : "Nahrát fotku"}<input type="file" accept="image/*" data-akce="foto"></label>
        <button type="button" class="btn ghost small" data-akce="webFoto">🔍 Najít fotku</button>
        ${s.img ? `<span class="jmeno" title="${esc(s.kredit || s.nazevFota)}">${esc(s.kredit ? s.kredit.replace("📸 Foto: ", "") : s.nazevFota)}</span><button type="button" class="btn ghost small" data-akce="bezFota">Odebrat</button>` : "<span>bez fotky = tmavé pozadí</span>"}
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
    s.kredit = "";
    s.url = "";
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
  const kredity = [...new Set(slidy.map((s) => s.kredit).filter(Boolean))];
  if (kredity.length) casti.push(kredity.join("\n"));
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


// ------------------------------------------------------------------- AI --

const SCHEMA_CAROUSEL = {
  type: "object",
  properties: {
    cerveny: { type: "string", description: "titulní slide: 1–2 slova, hlavní pojem (místo, jméno, tým) – obří červené písmo" },
    bily: { type: "string", description: "titulní slide: krátký doplněk 1–3 slova, např. rok s tečkou – bílé písmo" },
    titul_foto_dotaz: { type: "string" },
    slidy: {
      type: "array",
      items: {
        type: "object",
        properties: {
          nadpis: { type: "string" },
          text: { type: "string" },
          foto_dotaz: { type: "string" },
        },
        required: ["nadpis", "text", "foto_dotaz"],
      },
    },
    popisek: { type: "string", description: "text pod příspěvek bez hashtagů: hook, 2–3 krátké odstavce, výzva pro fanoušky" },
    hashtagy: { type: "array", items: { type: "string" } },
    k_overeni: { type: "array", items: { type: "string" } },
  },
  required: ["cerveny", "bily", "titul_foto_dotaz", "slidy", "popisek", "hashtagy", "k_overeni"],
};

const SYSTEM_CAROUSEL = `Jsi redaktor Instagram účtu Deník hokeje (@denik_hokeje). Píšeš texty na příběhové carousely
o hokeji: krátké, úderné, emotivní, každá věta končí tečkou.

Formát:
- Titulní slide: "cerveny" = 1–2 slova (hlavní pojem), "bily" = krátký doplněk (např. rok s tečkou).
- Každý další slide:
  - "nadpis": přesně 2 krátké věty (2–4 slova), každá na vlastním řádku (oddělené \\n), každá končí tečkou.
    1–3 klíčová slova obal hvězdičkami *takhle* – zobrazí se červeně.
  - "text": 1–3 krátké věty, celkem max 190 znaků, věty odděluj \\n. Jména, čísla, data a důležitá
    slova obal hvězdičkami *takhle* – zobrazí se žlutě (zhruba každé 3.–4. slovo).
  - "foto_dotaz": dotaz na fotku pro tenhle slide.
- Slidy tvoří příběh: úvod → průběh → vyvrcholení → pointa/odkaz. Poslední slide má emoci.

Ukázka (carousel o tragédii Lokomotivu Jaroslavl):
  titul: cerveny "Jaroslavl", bily "2011."
  slide: nadpis "Černé *září*.\\nOsudný *let* do *Minsku*."
         text "*1. září 2011* mířil *Lokomotiv* na první zápas *sezóny*.\\nNa palubě seděl špičkový *evropský* tým.\\nVčetně tří *českých* mistrů světa."
  slide: nadpis "Věčná *památka*.\\n*Legendy* žijí dál."
         text "*Neštěstí* vzalo život *44* lidem včetně *trojice českých* šampionů.\\nČísla *Rachůnka*, *Vašíčka*, *Marka* byla v *reprezentaci* navždy vyřazena. *Nezapomeneme*."
`;

function cAiZprava(html, druh = "") {
  const el = $("#cAiZprava");
  el.innerHTML = html;
  el.className = "zprava " + druh;
  el.hidden = !html;
}

function aktualizujKredity() {
  const el = $("#cPopisek");
  if (!el.value.trim()) return;
  const kredity = [...new Set(slidy.map((s) => s.kredit).filter(Boolean))];
  let odstavce = el.value.split(/\n{2,}/).filter((o) => !o.trim().startsWith("📸 Foto:"));
  if (kredity.length) {
    const i = odstavce.length && odstavce[odstavce.length - 1].trim().startsWith("#") ? odstavce.length - 1 : odstavce.length;
    odstavce.splice(i, 0, kredity.join("\n"));
  }
  el.value = odstavce.join("\n\n");
  prepocitejPopisek();
  ulozKoncept();
}

function nastavWebFoto(i, img, foto) {
  const s = slidy[i];
  s.img = img;
  s.nazevFota = foto.nazev;
  s.kredit = window.DHAI.kredit(foto);
  s.url = foto.url;
  s.pohled = { zoom: 1, cx: 0.5, cy: 0.4 };
}

async function najdiFotku(i) {
  const s = slidy[i];
  const vychozi = s.dotaz || (s.typ === "titul" ? [s.cerveny, s.bily].join(" ") : bezZnacek(s.nadpis)).trim();
  const v = await window.DHAI.vyberFoto(vychozi);
  if (!v) return;
  nastavWebFoto(i, v.img, v.foto);
  vybrany = i;
  vykresliSeznam();
  aktualizujKredity();
}

const maObsah = () => slidy.some((s) => [s.cerveny, s.bily, s.nadpis, s.text].some((x) => (x || "").trim()) || s.img);

window.DHKoncepty?.registruj("carousel", {
  async ziskej() {
    vykresliVse();
    const titul = slidy[0] || {};
    return {
      nazev: [titul.cerveny, titul.bily].filter(Boolean).join(" ").trim() || (slidy[1]?.nadpis || "").replace(/\*/g, "").split("\n")[0] || "Carousel",
      data: {
        slidy: slidy.map(({ typ, cerveny, bily, swipe, nadpis, text, dotaz, kredit, url, nazevFota, pohled }) =>
          ({ typ, cerveny, bily, swipe, nadpis, text, dotaz, kredit, url, nazevFota, pohled })),
        popisek: $("#cPopisek").value,
        logo: logoRezim,
      },
      obrazky: Object.fromEntries(slidy.map((s, i) => [`s${i}`, s.img]).filter(([, img]) => img)),
      platno: slidy[0]?.platno,
    };
  },
  async obnov(d, obrazky) {
    slidy = (d.slidy || []).map((x, i) => {
      const s = novySlide(x);
      Object.assign(s, { kredit: x.kredit || "", url: x.url || "", nazevFota: x.nazevFota || "", pohled: x.pohled || s.pohled });
      if (obrazky[`s${i}`]) s.img = obrazky[`s${i}`];
      return s;
    });
    if (!slidy.length || slidy[0].typ !== "titul") slidy.unshift(novySlide({ typ: "titul" }));
    vybrany = 0;
    logoRezim = d.logo || "auto";
    $("#cLogo").value = logoRezim;
    $("#cPopisek").value = d.popisek || "";
    vykresliSeznam();
    prepocitejPopisek();
    ulozKoncept();
  },
});

let zdrojeNavrhu = []; // zdroje z hledání (záložka Témata)

window.DHCarousel = {
  navrhni(zadani, zdroje = [], pocet = 4) {
    window.DHPost.prepniZalozku("carousel");
    $("#cAiZadani").value = zadani;
    $("#cAiPocet").value = String(pocet);
    zdrojeNavrhu = zdroje;
    window.scrollTo({ top: 0, behavior: "smooth" });
    navrhniCarousel(true);
  },
  textKOvereni: () => [
    ...slidy.map((s) => (s.typ === "titul" ? [s.cerveny, s.bily] : [s.nadpis, s.text]).join(" ").replace(/\*/g, "").replace(/\s+/g, " ").trim()),
    $("#cPopisek").value,
  ].filter(Boolean).join("\n\n"),
};

async function navrhniCarousel(bezPotvrzeni = false) {
  window.DHKoncepty?.zapomen("carousel");
  const AI = window.DHAI;
  const zadani = $("#cAiZadani").value.trim();
  if (!zadani) { cAiZprava("Napiš téma carouselu.", "chyba"); $("#cAiZadani").focus(); return; }
  if (!AI.maKlic()) { cAiZprava('AI pomocník potřebuje AI klíč (Claude nebo Gemini). <a href="#" data-jdi-na-ai>Nastavit klíč</a>', "chyba"); return; }
  if (bezPotvrzeni !== true && maObsah() && !confirm("Návrh od AI přepíše současné slidy. Pokračovat?")) return;
  const pocet = Number($("#cAiPocet").value) || 4;
  const b = $("#cAiNavrhni");
  b.disabled = true;
  b.textContent = "Píšu…";
  cAiZprava("AI píše texty slidů… (obvykle 5–15 s)");
  try {
    const r = await AI.gemini({
      system: `${SYSTEM_CAROUSEL}\n${AI.stylDoPromptu()}\n\n${AI.PRAVIDLA}\n- Dnešní datum: ${AI.dnes()}.`,
      zadani: `TÉMA A PODKLADY OD REDAKTORA:\n${zadani}\n\nVytvoř titulní slide a přesně ${pocet} dalších slidů.`,
      schema: SCHEMA_CAROUSEL,
    });
    slidy = [
      novySlide({ typ: "titul", cerveny: r.cerveny || "", bily: r.bily || "", swipe: true, dotaz: r.titul_foto_dotaz || "" }),
      ...(r.slidy || []).slice(0, MAX_SLIDU - 1).map((x) => novySlide({ typ: "obsah", nadpis: x.nadpis || "", text: x.text || "", dotaz: x.foto_dotaz || "" })),
    ];
    vybrany = 0;
    const tagy = window.DHAI.cisteHashtagy(r.hashtagy);
    const zdrojeRadek = zdrojeNavrhu.length ? `ℹ️ Zdroj: ${zdrojeNavrhu.map((z) => z.titulek).join(", ")}` : "";
    $("#cPopisek").value = [r.popisek || "", zdrojeRadek, tagy.join(" ")].map((x) => x.trim()).filter(Boolean).join("\n\n");
    prepocitejPopisek();
    vykresliSeznam();
    ulozKoncept();

    const overit = (r.k_overeni || []).filter(Boolean);
    const seznam = overit.length ? `<br><b>Před zveřejněním ověř:</b><ul>${overit.map((o) => `<li>${esc(o)}</li>`).join("")}</ul>` : "";
    const pouzite = new Set();
    let nalezeno = 0;
    // Fotky souběžně (po 3), každá se ukáže hned, jak dorazí.
    let hotovo = 0;
    cAiZprava(`Texty hotové ✓ Můžeš je upravovat, fotky se doplňují… 0 / ${slidy.length}${seznam}`, "varovani");
    const sada = slidy;
    const fronta = sada.map((s, i) => i);
    const pracovnik = async () => {
      while (fronta.length) {
        const i = fronta.shift();
        const s = sada[i];
        const nalez = await AI.prvniFoto([s.dotaz, s.typ === "titul" ? r.cerveny : "", r.titul_foto_dotaz], pouzite);
        hotovo++;
        if (slidy !== sada) return; // mezitím vznikl nový návrh
        if (nalez && !pouzite.has(nalez.foto.url) && !s.img) {
          pouzite.add(nalez.foto.url);
          nastavWebFoto(i, nalez.img, nalez.foto);
          nalezeno++;
          vykresliSeznam();
        }
        cAiZprava(`Texty hotové ✓ Můžeš je upravovat, fotky se doplňují… ${hotovo} / ${sada.length}${seznam}`, "varovani");
      }
    };
    await Promise.all([pracovnik(), pracovnik(), pracovnik()]);
    if (slidy !== sada) return;
    aktualizujKredity();
    cAiZprava(`Hotovo ✓ Fotky: ${nalezeno} / ${slidy.length} (volně použitelné, autoři jsou v popisku). Texty i fotky teď uprav podle sebe – u každého slidu je <b>🔍 Najít fotku</b> a <b>📷 Vlastní fotka</b>.${seznam}`, overit.length ? "varovani" : "ok");
  } catch (e) {
    cAiZprava(esc(e.message), "chyba");
  } finally {
    b.disabled = false;
    b.textContent = "✨ Navrhnout carousel";
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
    } else if (akce === "bezFota") { Object.assign(slidy[i], { img: null, kredit: "", url: "" }); vybrany = i; vykresliSeznam(); aktualizujKredity(); }
    else if (akce === "webFoto") najdiFotku(i);
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
    window.DHKoncepty?.zapomen("carousel");
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

  $("#cAiNavrhni").addEventListener("click", () => navrhniCarousel());
  $("#cAiZadani").addEventListener("input", () => { zdrojeNavrhu = []; });
  $("#cAiZadani").addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) navrhniCarousel(); });
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
