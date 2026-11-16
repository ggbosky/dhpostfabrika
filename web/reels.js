// REELS FACTORY – historické hokejové reels z autentických záběrů (rozhraní a celý postup).
(() => {
"use strict";

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const U = window.DHReelsUloziste, A = window.DHReelsHlas, R = window.DHReelsRender, Z = window.DHReelsZabery;
const AI = () => window.DHAI;
const SCEN = { 30: 6, 45: 8, 60: 10, 90: 14 };
const LANG = ["cs", "en", "ru", "sv", "fi", "de", "fr"];

let p = null;           // otevřený projekt
let nahled = null;      // R.Nahled
let ukladani = null;

// ------------------------------------------------------------------ pomocníci --

function zprava(cil, html, druh = "") {
  const el = typeof cil === "string" ? $(cil) : cil;
  if (!el) return;
  el.innerHTML = html;
  el.className = "zprava " + druh;
  el.hidden = !html;
}
const cas = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const delkaText = (s) => (s ? (s >= 60 ? cas(s) : `${s.toFixed(1)} s`) : "?");

function ulozPozdeji() {
  if (!p) return;
  clearTimeout(ukladani);
  ukladani = setTimeout(async () => {
    p.upraveno = Date.now();
    try { await U.uloz("projekty", JSON.parse(JSON.stringify(p))); $("#rUlozeno").textContent = `Uloženo ${new Date().toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" })}`; }
    catch (e) { $("#rUlozeno").textContent = `Uložení selhalo: ${e.message}`; }
  }, 700);
}

function stahni(blob, nazev) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = nazev;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
const slug = (t) => window.DHG.slug(t || "reel");

// ------------------------------------------------------------------- projekt --

function novyProjekt({ tema, delka, ton, jazyky }) {
  return {
    id: U.noveId("reel"), nazev: tema.slice(0, 70), tema, delka, ton, jazyky,
    vytvoreno: Date.now(), upraveno: Date.now(),
    vyzkum: { fakta: [] }, scenar: { hooky: [], hook: 0, cta: "", popisek: "", hashtagy: [], nejiste: [] },
    sceny: [], klipy: {}, vysledky: {}, webVysledky: [],
    hlas: { hlasId: A.maEleven() ? "eleven" : "cs_CZ-jirka-medium", rychlost: 1 },
    hudba: null,
    vzhled: { titulky: true, zvyrazneni: true, prolnuti: true, barvy: "prirozene", logo: false, logoVolba: true, outro: true, strih: "fire" },
  };
}

async function otevri(id) {
  const z = await U.nacti("projekty", id);
  if (!z) return;
  p = z;
  p.webVysledky = p.webVysledky || [];
  p.vzhled = p.vzhled || {};
  // vodoznak v rohu je nově vypnutý; starší projekty ho měly zapnutý automaticky
  if (!p.vzhled.logoVolba) { p.vzhled.logo = false; p.vzhled.logoVolba = true; }
  if (!p.vzhled.strih) p.vzhled.strih = "fire";
  vykresliVse();
  prepniKrok(p.sceny.length ? "strih" : p.vyzkum.fakta.length ? "scenar" : "vyzkum");
  obnovNahled();
  // starší projekty: časy vět z nahraného hlasu → titulky přesně podle hlasu
  const tenhle = p;
  (async () => {
    let zmena = false;
    for (const s of tenhle.sceny) {
      if (!s.hlas?.souborId || s.titulkyRucne || (s.hlas.vety && s.hlas.vetyHash === R.hashTextu(s.text))) continue;
      try { const buf = await A.dekoduj(s.hlas.souborId, () => U.souborBlob(s.hlas.souborId)); vetyHlasu(s, buf); prepocitejTitulky(s); zmena = true; } catch { /* nic */ }
    }
    if (zmena && p === tenhle) { ulozPozdeji(); vykresliHlas(); obnovNahled(+$("#rPosuv").value || 0); }
  })();
}

// ---------------------------------------------------------------- navigace --

function prepniKrok(k) {
  $$(".r-krok").forEach((b) => b.classList.toggle("on", b.dataset.krok === k));
  $$("[data-rkrok]").forEach((s) => { s.hidden = s.dataset.rkrok !== k; });
  if (k === "export") obnovKontrolu();
  if (k === "export" || k === "zalozit") vykresliProjekty();
  if (p && !nahled?.bezi) obnovNahled(+$("#rPosuv").value || 0);
}

function vykresliVse() {
  $("#rNazevProjektu").textContent = p ? `${p.nazev} · ${p.delka} s` : "Žádný otevřený projekt";
  $$(".r-krok").forEach((b) => { if (b.dataset.krok !== "zalozit") b.disabled = !p; });
  if (!p) return;
  vykresliVyzkum();
  vykresliScenar();
  vykresliZabery();
  vykresliStrih();
  vykresliHlas();
}

// ------------------------------------------------------------ 1. založení --

async function vykresliProjekty() {
  let vse = [];
  try { vse = await U.vsechny("projekty"); } catch (e) { $("#rProjekty").innerHTML = `<p class="muted">${esc(e.message)}</p>`; return; }
  vse.sort((a, b) => b.upraveno - a.upraveno);
  const html = vse.length ? vse.map((x) => `<div class="r-projekt${p?.id === x.id ? " on" : ""}">
      <div><b>${esc(x.nazev)}</b><br><small class="muted">${x.delka} s · ${x.sceny.length} scén · upraveno ${new Date(x.upraveno).toLocaleString("cs-CZ", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" })}</small></div>
      <span class="radek"><button type="button" class="btn small" data-r-otevri="${x.id}">Otevřít</button><button type="button" class="btn small ghost" data-r-smaz="${x.id}">Smazat</button></span>
    </div>`).join("") : '<p class="muted">Zatím žádné projekty.</p>';
  $$(".r-projekty").forEach((el) => { el.innerHTML = html; });
}

async function navrhniTemata() {
  if (!AI().maKlic()) { zprava("#rTemataZprava", 'Návrh témat potřebuje AI klíč (Claude nebo Gemini). <a href="#" data-jdi-na-ai>Nastavit</a>', "chyba"); return; }
  zprava("#rTemataZprava", "AI hledá silná témata na reel…");
  try {
    const r = await AI().hledatNaWebu({
      casovyLimit: 30000,
      system: `Jsi dramaturg Instagramu Deník hokeje (historie hokeje). Navrhuješ témata na krátké dokumentární reels.
Témata musí mít příběh, ověřitelná fakta a hlavně EXISTUJÍCÍ autentické video záběry (zápasy, góly, oslavy, rozhovory). Piš česky.`,
      zadani: `Navrhni 6 témat na reel. Mix: české legendy, NHL historie, rekordy, zapomenuté příběhy, slavné zápasy.
Odpověz POUZE JSON Lines: {"tema": "název tématu česky", "proc": "1 věta proč to zaujme", "zabery": "jaké skutečné záběry existují"}`,
    });
    const t = AI().objektyZTextu(r.text).filter((x) => x.tema);
    $("#rTemataNavrhy").innerHTML = t.map((x) => `<button type="button" class="r-navrh" data-tema="${esc(x.tema)}"><b>${esc(x.tema)}</b><small>${esc(x.proc || "")}${x.zabery ? ` · 🎞️ ${esc(x.zabery)}` : ""}</small></button>`).join("");
    zprava("#rTemataZprava", t.length ? "Klikni na téma, které se ti líbí." : "AI nic nenavrhla, zkus to znovu.", t.length ? "ok" : "varovani");
  } catch (e) { zprava("#rTemataZprava", esc(e.message), "chyba"); }
}

async function zalozProjekt() {
  const tema = $("#rTema").value.trim();
  if (!tema) { zprava("#rTemataZprava", "Napiš téma reelu.", "chyba"); $("#rTema").focus(); return; }
  const jazyky = $$("#rJazyky input:checked").map((i) => i.value);
  p = novyProjekt({ tema, delka: +$("#rDelka").value, ton: $("#rTon").value, jazyky: jazyky.length ? jazyky : ["cs", "en"] });
  await U.pozadejTrvaleUloziste();
  ulozPozdeji();
  vykresliVse();
  prepniKrok("vyzkum");
  obnovNahled();
}

// --------------------------------------------------------------- 2. rešerše --

function zdrojeHtml(zdroje) {
  if (!zdroje?.length) return '<span class="bez-zdroje">⚠️ bez zdroje</span>';
  return zdroje.map((z) => `<a href="${esc(z.uri)}" target="_blank" rel="noopener">${esc(z.titulek)}</a>`).join(" · ");
}
const JISTOTA = { potvrzeno: "✅ potvrzeno", overeno: "✅ ověřeno 2×", nejiste: "⚠️ nejisté", rozpor: "❌ rozpor" };

function vykresliVyzkum() {
  const f = p.vyzkum.fakta;
  $("#rFakta").innerHTML = f.length ? f.map((x, i) => `<div class="r-fakt ${x.jistota}">
      <label class="check"><input type="checkbox" data-fakt="${i}" ${x.pouzit !== false ? "checked" : ""}> <span><b>${esc(x.text)}</b>${x.rok ? ` <small class="muted">(${esc(x.rok)})</small>` : ""}</span></label>
      <small>${JISTOTA[x.jistota] || "⚠️"} · ${zdrojeHtml(x.zdroje)}${x.poznamka ? ` · <span class="muted">${esc(x.poznamka)}</span>` : ""}</small>
    </div>`).join("") : '<p class="muted">Zatím žádná fakta. Klikni na „Prozkoumat téma“.</p>';
  $("#rOveritFakta").disabled = !f.length;
  const vsechny = p.vyzkum.zdroje || [];
  $("#rZdrojeVyzkumu").innerHTML = vsechny.length
    ? `<details><summary>Všechny zdroje, které AI při rešerši prošla (${vsechny.length})${p.vyzkum.dotazy?.length ? ` · hledáno: ${esc(p.vyzkum.dotazy.slice(0, 6).join(" · "))}` : ""}</summary><p>${zdrojeHtml(vsechny)}</p></details>`
    : "";
}

// Zdroje faktu: podle úseků odpovědi, které AI opřela o výsledky hledání, a podle domény, kterou AI uvedla
// (jen pokud ta doména opravdu je mezi nalezenými zdroji – nic se nedomýšlí).
function zdrojeFaktu(r, x) {
  const podleTextu = AI().zdrojeProText(r, `${x.fakt} ${x.rok || ""}`);
  const domena = String(x.zdroj || "").toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  const podleDomeny = domena ? r.zdroje.filter((z) => z.titulek.toLowerCase().includes(domena) || domena.includes(z.titulek.toLowerCase())) : [];
  return [...podleTextu, ...podleDomeny].filter((z, i, a) => a.findIndex((y) => y.titulek === z.titulek) === i);
}

async function vyzkum() {
  if (!AI().maKlic()) { zprava("#rVyzkumZprava", 'Rešerše potřebuje AI klíč (Claude nebo Gemini). <a href="#" data-jdi-na-ai>Nastavit</a>', "chyba"); return; }
  const b = $("#rVyzkum"); b.disabled = true;
  zprava("#rVyzkumZprava", "AI prohledává web (česky i v dalších jazycích) a sbírá ověřitelná fakta…");
  try {
    const r = await AI().hledatNaWebu({
      casovyLimit: 45000,
      system: `Jsi hokejový historik a rešeršista Deníku hokeje. Hledáš na webu (v jakémkoli jazyce) ověřitelná fakta k tématu.
Zásady: jen fakta ze zdrojů (statistiky, data, skóre, jména, citace přesně). Nic nevymýšlej. Každé fakto označ jistotou:
"potvrzeno" = našel jsi ho v důvěryhodném zdroji, "nejiste" = zdroje se liší nebo jde o tradovanou historku.
Fakta piš česky (přirozenou češtinou, ne doslovným překladem). Dnešní datum: ${AI().dnes()}.`,
      zadani: `Téma reelu: ${p.tema}
Najdi 10–14 klíčových faktů pro krátký dokumentární reel (příběh, čísla, data, zlomové momenty, zajímavosti).
Odpověz POUZE JSON Lines: {"fakt": "věta česky", "rok": "rok/datum", "jistota": "potvrzeno" | "nejiste", "zdroj": "doména webu, kde jsi fakt našel (např. nhl.com)", "poznamka": "jen když je potřeba"}`,
    });
    const fakta = AI().objektyZTextu(r.text).filter((x) => x.fakt).map((x, i) => ({
      id: `f${Date.now().toString(36)}${i}`, text: x.fakt, rok: x.rok || "", jistota: x.jistota === "potvrzeno" ? "potvrzeno" : "nejiste",
      poznamka: x.poznamka || "", zdroje: zdrojeFaktu(r, x), pouzit: true,
    }));
    fakta.forEach((f) => { if (!f.zdroje.length && f.jistota === "potvrzeno") f.jistota = "nejiste"; });
    p.vyzkum = { fakta, cas: Date.now(), dotazy: r.dotazy, zdroje: r.zdroje };
    vykresliVyzkum(); ulozPozdeji();
    zprava("#rVyzkumZprava", `Nalezeno ${fakta.length} faktů. Nepotřebná odškrtni, sporná ověř tlačítkem „Ověřit fakta znovu“.`, "ok");
  } catch (e) { zprava("#rVyzkumZprava", esc(e.message), "chyba"); }
  finally { b.disabled = false; }
}

async function overFakta() {
  const b = $("#rOveritFakta"); b.disabled = true;
  zprava("#rVyzkumZprava", "Druhé, nezávislé ověření faktů na webu…");
  try {
    const f = p.vyzkum.fakta;
    const r = await AI().hledatNaWebu({
      casovyLimit: 45000,
      system: "Jsi přísný fact-checker hokejové historie. Každé tvrzení nezávisle ověř vyhledáváním. Pokud nesedí rok, číslo, tým nebo jméno, je to rozpor.",
      zadani: `Ověř:\n${JSON.stringify(f.map((x, id) => ({ id, fakt: x.text, rok: x.rok })), null, 1)}
Odpověz POUZE JSON Lines: {"id": 0, "stav": "overeno" | "rozpor" | "nejiste", "oprava": "u rozporu správné znění česky"}`,
    });
    for (const v of AI().objektyZTextu(r.text)) {
      const x = f[Number(v.id)];
      if (!x) continue;
      x.jistota = ["overeno", "rozpor", "nejiste"].includes(v.stav) ? v.stav : x.jistota;
      if (v.stav === "rozpor" && v.oprava) x.poznamka = `Správně: ${v.oprava}`;
      const nove = AI().zdrojeProText(r, `${x.text} ${v.oprava || ""}`);
      if (nove.length) x.zdroje = [...x.zdroje, ...nove].filter((z, i, a) => a.findIndex((y) => y.titulek === z.titulek) === i);
      if (x.jistota === "rozpor") x.pouzit = false;
    }
    vykresliVyzkum(); ulozPozdeji();
    const rozpory = f.filter((x) => x.jistota === "rozpor").length;
    zprava("#rVyzkumZprava", rozpory ? `Hotovo. ${rozpory} faktů je ve sporu – automaticky jsem je vyřadil ze scénáře.` : "Hotovo, žádný rozpor.", rozpory ? "varovani" : "ok");
  } catch (e) { zprava("#rVyzkumZprava", esc(e.message), "chyba"); }
  finally { b.disabled = false; }
}

// ---------------------------------------------------------------- 3. scénář --

const SCHEMA_SCENAR = {
  type: "object",
  properties: {
    hooky: { type: "array", items: { type: "object", properties: { text: { type: "string" }, sila: { type: "integer" } }, required: ["text", "sila"] } },
    vybrany: { type: "integer" },
    sceny: {
      type: "array",
      items: {
        type: "object",
        properties: {
          text: { type: "string" }, titulek: { type: "string" }, zaber: { type: "string" },
          dotazy: { type: "object", properties: Object.fromEntries(LANG.map((l) => [l, { type: "string" }])), required: LANG },
          fakta: { type: "array", items: { type: "integer" } },
        },
        required: ["text", "titulek", "zaber", "dotazy", "fakta"],
      },
    },
    cta: { type: "string" }, popisek: { type: "string" },
    hashtagy: { type: "array", items: { type: "string" } },
    nejiste: { type: "array", items: { type: "string" } },
  },
  required: ["hooky", "vybrany", "sceny", "cta", "popisek", "hashtagy", "nejiste"],
};

const TONY = {
  dokument: "klidný, sebevědomý dokumentární vypravěč (jako sportovní dokument ČT)",
  napeti: "napínavý příběh s gradací a pointou",
  vycet: "výčet (např. 5 rekordů) – každá scéna jeden bod, jasně očíslovaný",
  kontroverze: "kontroverzní moment – fakta z obou stran, bez senzacechtivosti",
};

async function napisScenar() {
  if (!AI().maKlic()) { zprava("#rScenarZprava", 'Scénář potřebuje AI klíč (Claude nebo Gemini). <a href="#" data-jdi-na-ai>Nastavit</a>', "chyba"); return; }
  const fakta = p.vyzkum.fakta.map((f, i) => ({ ...f, i })).filter((f) => f.pouzit !== false && f.jistota !== "rozpor");
  const nSc = SCEN[p.delka] || 10;
  const slov = Math.round(p.delka * 1.6); // hlas Piper mluví ~1,7 slova/s včetně pauz mezi scénami
  const b = $("#rNapsat"); b.disabled = true;
  zprava("#rScenarZprava", "AI píše český scénář… (obvykle 5–20 s)");
  try {
    const r = await AI().gemini({
      system: `Jsi hokejový historik a scenárista Deníku hokeje. Píšeš voiceover krátkého DOKUMENTÁRNÍHO reelu z autentických záběrů.
VŠECHNO piš česky: přirozená, plynulá, profesionální čeština pro české publikum (žádné slovakismy, žádné doslovné překlady, žádné AI fráze
typu „pojďme se podívat“, žádný clickbait, který text nesplní).
Pravidla:
- Používej JEN fakta ze seznamu (čísla, data, skóre, citace přesně). Co ze seznamu nevyplývá, nepiš. Pochybnosti dej do "nejiste".
- Přesně ${nSc} scén. Voiceover má CELKEM ${slov} slov (±10 %, ≈ ${p.delka} s) – to je tvrdý limit, delší text se do reelu nevejde.
  Jedna scéna = jeden záběr = nejvýš ${Math.ceil(slov / nSc) + 3} slov (jedna krátká věta, výjimečně dvě).
- Scéna 1 = háček (hook): do 10 slov, zazní v prvních 1–3 s a musí zastavit scrollování. Dej 4 varianty háčku,
  každou podle jiného vzorce (šokující číslo · kontrast/paradox · konkrétní okamžik · nedokončená zápletka), se silou 1–10, a vyber nejlepší.
  Zakázané začátky: „Věděli jste, že“, „Dnes si povíme“, „Pojďme“, „Tohle je příběh“.
- Krátké věty, žádná vata, žádné opakování. Každá scéna posune příběh dál.
- Pak logický příběh s gradací, poslední scéna = zapamatovatelná pointa (případně krátká výzva k Deníku hokeje v "cta").
- V každé scéně 1–2 klíčová slova obal *hvězdičkami* (zvýrazní se v titulcích).
- "titulek" = krátký nápis na obrazovku (max 5 slov) jen u klíčových scén, jinak prázdný řetězec.
- "zaber" = česky PŘESNĚ jaký autentický záběr má scéna ukazovat (hráč, tým, rok, akce – gól, oslava, rozhovor, televizní přenos).
- "dotazy" = vyhledávací dotazy na ten konkrétní záběr ve více jazycích (cs, en, ru, sv, fi, de, fr): jména, tým, rok, akce,
  slova jako highlights / goal / footage / 1980s game / interview v daném jazyce. Ne jen jméno hráče.
- "fakta" = čísla faktů ze seznamu, ze kterých scéna vychází.
- Popisek pod reel česky: hook (1 řádek, max 10 slov) + 1 krátký odstavec + krátká otázka, celkem max 300 znaků. Hashtagy 3–5.
Tón: ${TONY[p.ton] || TONY.dokument}.`,
      zadani: `TÉMA: ${p.tema}\n\nOVĚŘENÁ FAKTA (číslo: fakt):\n${fakta.map((f) => `${f.i}: ${f.text}${f.rok ? ` (${f.rok})` : ""}${f.jistota === "nejiste" ? " [nejisté]" : ""}`).join("\n") || "(žádná rešerše – piš opatrně jen obecně známá fakta a vše sporné dej do nejiste)"}\n\nNapiš scénář.`,
      schema: SCHEMA_SCENAR,
      teplota: 0.7,
    });
    const idFaktu = (i) => p.vyzkum.fakta[i]?.id;
    p.scenar = {
      hooky: (r.hooky || []).map((h) => ({ text: h.text, sila: h.sila })),
      hook: Math.max(0, Math.min((r.hooky || []).length - 1, r.vybrany || 0)),
      cta: r.cta || "", popisek: r.popisek || "", hashtagy: AI().cisteHashtagy(r.hashtagy || []), nejiste: r.nejiste || [],
    };
    p.sceny = (r.sceny || []).map((s) => ({
      id: U.noveId("s"), text: s.text, titulek: s.titulek || "", zaber: s.zaber || "",
      dotazy: Object.fromEntries(LANG.map((l) => [l, s.dotazy?.[l] || ""])),
      fakta: (s.fakta || []).map(idFaktu).filter(Boolean),
      klip: null, hlas: null, titulky: [], titulkyRucne: false,
    }));
    if (p.scenar.hooky[p.scenar.hook] && p.sceny[0]) p.sceny[0].text = p.scenar.hooky[p.scenar.hook].text;
    p.sceny.forEach((s) => { s.titulky = R.autoTitulky(s.text, null); });
    vykresliVse(); ulozPozdeji(); obnovNahled();
    const odhad = R.casovaOsa(p).celkem;
    zprava("#rScenarZprava", odhad > p.delka * 1.2
      ? `Scénář má ${p.sceny.length} scén, ale odhadem ${Math.round(odhad)} s místo ${p.delka} s – zkrať texty scén (nebo zvol delší reel).`
      : `Scénář má ${p.sceny.length} scén (odhadem ${Math.round(odhad)} s). Uprav ho podle sebe a pokračuj na Záběry.`, odhad > p.delka * 1.2 ? "varovani" : "ok");
  } catch (e) { zprava("#rScenarZprava", esc(e.message), "chyba"); }
  finally { b.disabled = false; }
}

async function prepisScenu(i) {
  const s = p.sceny[i];
  zprava("#rScenarZprava", `Přepisuji scénu ${i + 1}…`);
  try {
    const r = await AI().gemini({
      system: "Jsi scenárista Deníku hokeje. Přepiš jednu scénu voiceoveru přirozenou češtinou. Jen fakta z kontextu, nic nevymýšlej. 1–2 klíčová slova v *hvězdičkách*.",
      zadani: `Téma: ${p.tema}\nPředchozí scéna: ${p.sceny[i - 1]?.text || "(začátek)"}\nTato scéna: ${s.text}\nNásledující scéna: ${p.sceny[i + 1]?.text || "(konec)"}\nZáběr: ${s.zaber}\nNapiš jinou, lepší verzi stejně dlouhou.`,
      schema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] },
      teplota: 0.9,
    });
    if (r.text) { s.text = r.text; prepocitejTitulky(s); }
    vykresliScenar(); vykresliHlas(); ulozPozdeji();
    zprava("#rScenarZprava", `Scéna ${i + 1} přepsaná – nezapomeň pro ni znovu vygenerovat hlas.`, "ok");
  } catch (e) { zprava("#rScenarZprava", esc(e.message), "chyba"); }
}

function vykresliScenar() {
  const sc = p.scenar;
  $("#rHooky").innerHTML = sc.hooky.length ? sc.hooky.map((h, i) => `<label class="check r-hook"><input type="radio" name="rHook" value="${i}" ${i === sc.hook ? "checked" : ""}> <span>${esc(h.text)} <small class="muted">síla ${h.sila}/10</small></span></label>`).join("") : '<p class="muted">Háčky se objeví po napsání scénáře.</p>';
  const slovCelkem = p.sceny.reduce((a, s) => a + s.text.replace(/\*/g, "").split(/\s+/).filter(Boolean).length, 0);
  $("#rScenarStat").textContent = p.sceny.length ? `${p.sceny.length} scén · ${slovCelkem} slov · odhad ${Math.round(R.casovaOsa(p).celkem)} s (cíl ${p.delka} s)` : "";
  $("#rSceny").innerHTML = p.sceny.map((s, i) => `<div class="r-scena" data-i="${i}">
      <div class="slide-hlava"><b>Scéna ${i + 1}${i === 0 ? " · háček" : i === p.sceny.length - 1 ? " · pointa" : ""}</b>
        <span class="ikony"><button type="button" class="ikona" data-r-akce="nahoru" ${i === 0 ? "disabled" : ""}>↑</button><button type="button" class="ikona" data-r-akce="dolu" ${i === p.sceny.length - 1 ? "disabled" : ""}>↓</button><button type="button" class="ikona" data-r-akce="prepsat" title="Přepsat scénu (AI)">↻</button><button type="button" class="ikona" data-r-akce="smazat">✕</button></span></div>
      <label>Voiceover (česky, *zvýraznění*)<textarea data-r-pole="text" rows="2">${esc(s.text)}</textarea></label>
      <div class="dva"><label>Nápis na obrazovce<input data-r-pole="titulek" value="${esc(s.titulek)}" placeholder="nepovinné, max 5 slov"></label>
      <label>Jaký záběr<input data-r-pole="zaber" value="${esc(s.zaber)}"></label></div>
      <details><summary class="muted">Vyhledávací dotazy (${LANG.filter((l) => s.dotazy?.[l]).length} jazyků)</summary>
        <div class="r-dotazy">${LANG.map((l) => `<label>${l}<input data-r-dotaz="${l}" value="${esc(s.dotazy?.[l] || "")}"></label>`).join("")}</div></details>
    </div>`).join("");
  $("#rPopisekReel").value = [sc.popisek, sc.cta, sc.hashtagy.join(" ")].filter(Boolean).join("\n\n");
}

// ---------------------------------------------------------------- 4. záběry --

const zabery = (s) => R.zaberySceny(s);
const pouziteKlipy = () => new Set(p.sceny.flatMap((s) => zabery(s).map((z) => z.klipId)));
const MAX_DALSICH = 3;

const STAV_LIC = { volna: ["ok", "✅ volná licence"], prava: ["ok", "✅ práva potvrzena"], neovereno: ["warn", "⚠️ práva neověřena"], chranena: ["err", "⛔ chráněno"], "cc-yt": ["warn", "ⓒ CC na YouTube"] };

function kartaVysledku(v, i) {
  const [tr, lic] = STAV_LIC[v.licence?.stav] || STAV_LIC.neovereno;
  return `<div class="r-vysledek">
    <div class="r-nahledovka">${v.nahled ? `<img src="${esc(v.nahled)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : "<span>bez náhledu</span>"}${v.delka ? `<em>${delkaText(v.delka)}</em>` : ""}</div>
    <div class="r-vinfo">
      <b title="${esc(v.nazev)}">${esc(v.nazev)}</b>
      <small class="muted">${esc(v.platforma)}${v.jazyk ? ` · ${esc(v.jazyk)}` : ""}${v.rok ? ` · ${esc(v.rok)}` : ""} · relevance ${v.relevance ?? "?"} %</small>
      <span class="r-stitky"><i class="ok">👁 lze sledovat</i>${v.lze.stahnout === true ? '<i class="ok">⬇ lze načíst</i>' : v.lze.stahnout === "rucne" ? '<i class="warn">⬇ jen ručně</i>' : '<i class="err">⬇ nelze stáhnout</i>'}<i class="${tr}" title="${esc(v.licence?.nazev)}">${lic}</i>${v.odAI ? '<i class="warn">odkaz z AI – ověř</i>' : ""}</span>
      ${v.casy?.length ? `<small class="muted">⏱ ${v.casy.slice(0, 4).map((c) => `${esc(c.cas)} ${esc(c.popis)}`).join(" · ")}</small>` : ""}
      <span class="radek">
        ${v.url || v.embed ? `<button type="button" class="btn small ghost" data-r-nahled="${i}">▶ Náhled</button>` : ""}
        <a class="btn small ghost" href="${esc(v.stranka)}" target="_blank" rel="noopener">Zdroj ↗</a>
        ${v.lze.pouzit && v.lze.stahnout === true ? `<button type="button" class="btn small" data-r-pouzit="${i}">Použít</button><button type="button" class="btn small ghost" data-r-dalsi="${i}" title="Přidat jako další rychlý střih ve scéně">➕ Střih</button>` : ""}
      </span>
    </div></div>`;
}

let vysledkyIndex = []; // [{scena, v}] pro tlačítka

function vykresliZabery() {
  vysledkyIndex = [];
  // knihovna
  const kl = Object.values(p.klipy);
  $("#rKnihovna").innerHTML = kl.length ? kl.map((k) => {
    const [tr, lic] = STAV_LIC[k.licence?.stav] || STAV_LIC.neovereno;
    return `<div class="r-klip" data-klip="${k.id}">
      <div class="r-nahledovka">${k.nahled ? `<img src="${esc(k.nahled)}" alt="">` : `<span>${k.typ === "foto" ? "foto" : "video"}</span>`}${k.delka ? `<em>${delkaText(k.delka)}</em>` : ""}</div>
      <div class="r-vinfo"><b>${esc(k.nazev)}</b>
        <small class="muted">${k.zdroj === "import" ? "vlastní import" : esc(k.zdroj)} · ${k.typ === "foto" ? "📷 fotka (doplněk)" : "🎞️ video"}${k.puvod ? ` · <a href="${esc(k.puvod)}" target="_blank" rel="noopener">zdroj</a>` : ""}</small>
        <span class="r-stitky"><i class="${tr}" title="${esc(k.licence?.nazev)}">${lic}</i></span>
        ${k.zdroj === "import" ? `<label class="check"><input type="checkbox" data-r-prava="${k.id}" ${k.licence.stav === "prava" ? "checked" : ""}> Mám práva tento záběr použít a zveřejnit</label>
        <input data-r-puvod="${k.id}" value="${esc(k.puvod || "")}" placeholder="Odkud záběr je (licence / smlouva / odkaz)">` : ""}
        <span class="radek"><button type="button" class="btn small ghost" data-r-smazklip="${k.id}">Odebrat</button></span>
      </div></div>`;
  }).join("") : '<p class="muted">Knihovna je prázdná. Použij záběr z výsledků nebo importuj vlastní soubor.</p>';
  // scény
  $("#rScenyZabery").innerHTML = p.sceny.map((s, si) => {
    const k = s.klip && p.klipy[s.klip.klipId];
    const navic = (s.extra || []).length;
    const vys = p.vysledky[s.id] || [];
    const web = (p.webVysledky || []).filter((w) => w.scena === si);
    const html = [...vys, ...web].slice(0, 12).map((v) => { vysledkyIndex.push({ scena: si, v }); return kartaVysledku(v, vysledkyIndex.length - 1); }).join("");
    return `<div class="r-scena-zabery">
      <div class="slide-hlava"><b>Scéna ${si + 1}</b><span class="radek">${k ? `<span class="r-prirazeno">✔ ${esc(k.nazev)}${navic ? ` + ${navic} ${navic === 1 ? "střih" : "střihy"}` : ""}</span>` : '<span class="bez-zdroje">bez záběru</span>'}${navic ? `<button type="button" class="btn small ghost" data-r-bezstrihu="${si}" title="Odebrat další střihy">✕ střihy</button>` : ""}<button type="button" class="btn small ghost" data-r-hledat="${si}">🔎 Hledat</button></span></div>
      <p class="muted" style="margin:0 0 6px">🎬 ${esc(s.zaber || "")} <span class="muted">— „${esc(s.text.replace(/\*/g, "").slice(0, 90))}…“</span></p>
      <select data-r-zknihovny="${si}"><option value="">Použít z knihovny…</option>${Object.values(p.klipy).map((x) => `<option value="${x.id}" ${s.klip?.klipId === x.id ? "selected" : ""}>${esc(x.nazev)}</option>`).join("")}</select>
      <div class="r-vysledky">${html || '<p class="muted">Zatím bez výsledků.</p>'}</div>
    </div>`;
  }).join("");
  $("#rYtStav").innerHTML = Z.ytKlic() ? "YouTube: zapnuto (vlastní klíč)" : 'YouTube: vypnuto – <a href="#" data-r-krok-odkaz="zalozit">přidat bezplatný klíč</a>';
}

async function hledatScenu(si, tiche = false) {
  const s = p.sceny[si];
  if (!tiche) zprava("#rZaberyZprava", `Hledám záběry pro scénu ${si + 1}…`);
  const { vysledky, chyby } = await Z.hledejProScenu(p, s, p.jazyky);
  p.vysledky[s.id] = vysledky.slice(0, 20);
  if (!tiche) {
    vykresliZabery(); ulozPozdeji();
    zprava("#rZaberyZprava", `Scéna ${si + 1}: ${vysledky.length} výsledků${chyby.length ? ` (nedostupné: ${esc(chyby.join("; "))})` : ""}.`, vysledky.length ? "ok" : "varovani");
  }
  return { vysledky, chyby };
}

async function hledatVse() {
  const b = $("#rHledatVse"); b.disabled = true;
  let celkem = 0;
  const chyby = new Set();
  for (let i = 0; i < p.sceny.length; i++) {
    zprava("#rZaberyZprava", `Hledám záběry… scéna ${i + 1} / ${p.sceny.length}`);
    try { const r = await hledatScenu(i, true); celkem += r.vysledky.length; r.chyby.forEach((c) => chyby.add(c.split(":")[0])); } catch (e) { chyby.add(e.message); }
  }
  vykresliZabery(); ulozPozdeji();
  zprava("#rZaberyZprava", `Hotovo: ${celkem} výsledků.${chyby.size ? ` Nedostupné zdroje: ${esc([...chyby].join(", "))}.` : ""} Přímo použitelné jsou záběry s ✅ a „lze načíst“. Ostatní otevři, a pokud máš práva, stáhni a importuj.`, "ok");
  b.disabled = false;
}

async function hledatWeb() {
  const b = $("#rHledatWeb"); b.disabled = true;
  zprava("#rZaberyZprava", "AI hledá videa na celém webu ve více jazycích…");
  try {
    const { vysledky } = await Z.hledejWebAI(p, p.jazyky);
    p.webVysledky = vysledky.map((v) => ({ ...v, relevance: p.sceny[v.scena] ? Z.relevance(v, p.sceny[v.scena], p) : 50 }));
    vykresliZabery(); ulozPozdeji();
    zprava("#rZaberyZprava", `Web: ${vysledky.length} odkazů (YouTube odkazy ověřené). Jsou jen ke sledování – kde máš práva, stáhni video a importuj.`, vysledky.length ? "ok" : "varovani");
  } catch (e) { zprava("#rZaberyZprava", esc(e.message), "chyba"); }
  finally { b.disabled = false; }
}

// Nový záběr ve scéně: zvolí začátek, který se nepřekrývá s jinými scénami se stejným klipem.
function priradKlip(si, klipId) {
  const k = p.klipy[klipId];
  const osa = R.casovaOsa(p);
  const delka = osa.segmenty[si]?.delka || 4;
  const obsazene = p.sceny.map((s, i) => (i !== si && s.klip?.klipId === klipId ? [s.klip.start, s.klip.start + (osa.segmenty[i]?.delka || 4)] : null)).filter(Boolean).sort((a, b) => a[0] - b[0]);
  let start = k.delka ? Math.min(Math.max(0, k.delka * 0.15), Math.max(0, k.delka - delka)) : 0;
  for (const [od, d] of obsazene) if (start < d && start + delka > od) start = d + 0.1;
  if (k.delka && start + delka > k.delka) start = Math.max(0, k.delka - delka);
  const naSirku = (k.sirka || 16) / (k.vyska || 9) > 1.2;
  p.sceny[si].klip = { klipId, start: +start.toFixed(2), fokus: 0.5, rezim: naSirku ? "vyplnit" : "vyplnit", zoom: 1, zvuk: k.typ === "video" ? 0.25 : 0 };
}

function novyZaber(si, klipId) {
  const k = p.klipy[klipId];
  const osa = R.casovaOsa(p);
  const s = p.sceny[si];
  const delka = (osa.segmenty[si]?.delka || 4) / Math.max(1, zabery(s).length + 1);
  const obsazene = p.sceny.flatMap((x) => zabery(x)).filter((z) => z.klipId === klipId).map((z) => z.start || 0);
  let start = k.delka ? Math.min(Math.max(0, k.delka * 0.15), Math.max(0, k.delka - delka)) : 0;
  for (const od of obsazene.sort((a, b) => a - b)) if (start < od + delka + 0.1 && start + delka > od) start = od + delka + 0.1;
  if (k.delka && start + delka > k.delka) start = Math.max(0, k.delka - delka);
  return { klipId, start: +start.toFixed(2), fokus: 0.5, rezim: "vyplnit", zoom: 1, zvuk: 0 };
}
function pridejStrih(si, klipId) {
  const s = p.sceny[si];
  if (!s.klip) { priradKlip(si, klipId); return true; }
  s.extra = s.extra || [];
  if (s.extra.length >= MAX_DALSICH || zabery(s).some((z) => z.klipId === klipId)) return false;
  s.extra.push(novyZaber(si, klipId));
  return true;
}

async function pouzitVysledek(idx, jakoDalsi = false) {
  const { scena, v } = vysledkyIndex[idx];
  zprava("#rZaberyZprava", "Načítám záběr…");
  try {
    const k = await Z.pridejZVysledku(p, v);
    if (jakoDalsi) {
      if (!pridejStrih(scena, k.id)) throw new Error(`Scéna ${scena + 1} už má maximum střihů nebo tenhle záběr obsahuje.`);
    } else priradKlip(scena, k.id);
    vykresliZabery(); vykresliStrih(); ulozPozdeji(); obnovNahled();
    zprava("#rZaberyZprava", `Záběr „${esc(k.nazev)}“ je ve scéně ${scena + 1}.`, "ok");
  } catch (e) { zprava("#rZaberyZprava", esc(e.message), "chyba"); }
}

// Poskládá scény: hlavní záběr + ve fire stylu další rychlé střihy (video má přednost, pak fotky).
async function automatickyPriradit() {
  let pridano = 0;
  const pouzite = pouziteKlipy();
  const fire = (p.vzhled?.strih || "fire") === "fire";
  const osa = R.casovaOsa(p);
  for (let i = 0; i < p.sceny.length; i++) {
    const s = p.sceny[i];
    const cil = fire ? Math.max(1, Math.min(1 + MAX_DALSICH, Math.round((osa.segmenty[i]?.delka || 4) / 2.4))) : 1;
    if (zabery(s).length >= cil) continue;
    zprava("#rZaberyZprava", `Skládám záběry… scéna ${i + 1} / ${p.sceny.length}`);
    const kandidati = (p.vysledky[s.id] || []).filter((v) => v.lze.pouzit && v.lze.stahnout === true)
      .sort((a, b) => (b.relevance || 0) + (b.typ !== "foto" ? 15 : 0) - (a.relevance || 0) - (a.typ !== "foto" ? 15 : 0));
    for (const v of kandidati) {
      if (zabery(s).length >= cil) break;
      const existujici = Object.values(p.klipy).find((k) => k.vysledekId === v.id);
      if (existujici && pouzite.has(existujici.id)) continue;
      try {
        const k = existujici || await Z.pridejZVysledku(p, v);
        if (pridejStrih(i, k.id)) { pouzite.add(k.id); pridano++; }
      } catch { /* další kandidát */ }
    }
  }
  vykresliZabery(); vykresliStrih(); ulozPozdeji(); obnovNahled();
  const chybi = p.sceny.filter((s) => !s.klip).length;
  zprava("#rZaberyZprava", `Přidáno ${pridano} záběrů a fotek.${chybi ? ` ${chybi} scén stále nemá nic – zkus 🔎 Hledat u scény s jiným dotazem, nebo importuj vlastní video/fotku.` : " Všechny scény mají obraz ✓"}`, chybi ? "varovani" : "ok");
}

// Jedno tlačítko: najdi záběry i fotky pro všechny scény a rovnou je poskládej.
async function najdiAPoskladej() {
  const b = $("#rFire"); if (b) b.disabled = true;
  try {
    await hledatVse();
    await automatickyPriradit();
  } finally { if (b) b.disabled = false; }
}

async function importuj(soubory) {
  for (const f of soubory) {
    zprava("#rZaberyZprava", `Importuji „${esc(f.name)}“…`);
    try { await Z.importujSoubor(p, f); } catch (e) { zprava("#rZaberyZprava", esc(e.message), "chyba"); return; }
  }
  vykresliZabery(); vykresliStrih(); ulozPozdeji();
  zprava("#rZaberyZprava", "Import hotový. U každého souboru potvrď, že máš práva k použití, a doplň, odkud je.", "ok");
}

function nahledVysledku(idx) {
  const { v } = vysledkyIndex[idx];
  const d = $("#rDialog");
  $("#rDialogObsah").innerHTML = v.url && v.lze.stahnout === true
    ? `<video src="${esc(v.url)}" controls autoplay playsinline style="width:100%;max-height:70vh;background:#000"></video>`
    : v.embed ? `<iframe src="${esc(v.embed)}" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen style="width:100%;aspect-ratio:16/9;border:0"></iframe>`
    : `<p>Náhled nejde vložit. <a href="${esc(v.stranka)}" target="_blank" rel="noopener">Otevřít zdroj</a></p>`;
  $("#rDialogInfo").innerHTML = `<b>${esc(v.nazev)}</b><br><small>${esc(v.platforma)} · ${esc(v.licence?.nazev)} · <a href="${esc(v.stranka)}" target="_blank" rel="noopener">zdroj</a></small>`;
  d.showModal();
}

// ------------------------------------------------------------------ 5. střih --

function vykresliStrih() {
  const osa = R.casovaOsa(p);
  const vz = p.vzhled;
  $("#rStrihStyl").value = vz.strih || "fire";
  $("#rBarvy").value = vz.barvy; $("#rProlnuti").checked = vz.prolnuti; $("#rTitulkyZap").checked = vz.titulky;
  $("#rZvyrazneni").checked = vz.zvyrazneni; $("#rLogoZap").checked = vz.logo; $("#rOutro").checked = vz.outro;
  $("#rStrih").innerHTML = osa.segmenty.map((seg) => {
    const s = seg.scena, si = seg.i;
    const k = s.klip && p.klipy[s.klip.klipId];
    const maxStart = k?.delka ? Math.max(0, k.delka - seg.delka) : 60;
    return `<div class="r-strih-scena" data-i="${si}">
      <div class="r-nahledovka">${k?.nahled ? `<img src="${esc(k.nahled)}" alt="">` : "<span>bez záběru</span>"}<em>${seg.delka.toFixed(1)} s</em></div>
      <div class="r-strih-pole">
        <div class="slide-hlava"><b>${si + 1}. ${esc(s.text.replace(/\*/g, "").slice(0, 60))}…</b>
          <span class="ikony"><button type="button" class="ikona" data-r-sakce="nahoru" ${si === 0 ? "disabled" : ""}>↑</button><button type="button" class="ikona" data-r-sakce="dolu" ${si === p.sceny.length - 1 ? "disabled" : ""}>↓</button><button type="button" class="ikona" data-r-sakce="ukaz" title="Ukázat v náhledu">👁</button></span></div>
        <select data-r-klip="${si}"><option value="">— vyber záběr —</option>${Object.values(p.klipy).map((x) => `<option value="${x.id}" ${s.klip?.klipId === x.id ? "selected" : ""}>${esc(x.nazev)} (${delkaText(x.delka)})</option>`).join("")}</select>
        ${k ? `<div class="dva">
          <label>Začátek záběru: <b data-r-hodnota="start">${(s.klip.start || 0).toFixed(1)} s</b><input type="range" data-r-k="start" min="0" max="${maxStart.toFixed(1)}" step="0.1" value="${s.klip.start || 0}"></label>
          <label>Výřez vodorovně<input type="range" data-r-k="fokus" min="0" max="1" step="0.01" value="${s.klip.fokus ?? 0.5}"></label>
          <label>Režim<select data-r-k="rezim"><option value="vyplnit" ${s.klip.rezim !== "rozmazane" ? "selected" : ""}>Vyplnit na výšku (ořez)</option><option value="rozmazane" ${s.klip.rezim === "rozmazane" ? "selected" : ""}>Celý záběr + rozmazané pozadí</option></select></label>
          <label>Přiblížení<input type="range" data-r-k="zoom" min="1" max="2" step="0.01" value="${s.klip.zoom || 1}"></label>
          <label>Původní zvuk (atmosféra)<input type="range" data-r-k="zvuk" min="0" max="1" step="0.05" value="${s.klip.zvuk || 0}"></label>
          <span class="muted" style="font-size:12px;align-self:end">${k.typ === "foto" ? "📷 fotka – s pohybem kamery" : `🎞️ ${delkaText(k.delka)} · ${k.sirka || "?"}×${k.vyska || "?"}`}</span>
        </div>` : ""}
        ${(s.extra || []).length ? `<div class="r-strihy"><span class="muted">Další střihy ve scéně:</span>${s.extra.map((z, j) => { const kk = p.klipy[z.klipId]; return `<span class="r-strih-chip">${kk?.nahled ? `<img src="${esc(kk.nahled)}" alt="">` : ""}${esc((kk?.nazev || "?").slice(0, 28))} <button type="button" class="ikona" data-r-smazstrih="${si}:${j}" title="Odebrat střih">✕</button></span>`; }).join("")}</div>` : ""}
      </div></div>`;
  }).join("") || '<p class="muted">Nejdřív napiš scénář.</p>';
  $("#rStrihStat").textContent = osa.segmenty.length ? `Celkem ${osa.celkem.toFixed(1)} s · ${p.sceny.filter((s) => s.klip).length}/${p.sceny.length} scén má záběr · ${p.sceny.reduce((a, s) => a + zabery(s).length, 0)} střihů` : "";
}

// ----------------------------------------------------------- 6. hlas a titulky --

function vykresliHlas() {
  const el = A.elNastaveni();
  $("#rHlasId").innerHTML = Object.entries(A.HLASY).map(([id, n]) => `<option value="${id}" ${p.hlas.hlasId === id ? "selected" : ""}>${esc(id === "eleven" && el.voiceName ? `🎙️ ${el.voiceName} (ElevenLabs)` : n)}</option>`).join("");
  $("#rHlasInfo").innerHTML = p.hlas.hlasId === "eleven"
    ? (A.maEleven() ? `Namlouvá <b>${esc(el.voiceName || "hlas z ElevenLabs")}</b> (${esc(A.EL_MODELY[el.model] || el.model)}). Platí se znaky z tvého ElevenLabs účtu. Nastavení hlasu: <a href="#styl" data-jdi-na-hlas>Můj styl → Hlas pro reels</a>.`
      : `⚠️ ElevenLabs ještě není nastavený – <a href="#styl" data-jdi-na-hlas>vlož klíč a vyber hlas</a>.`)
    : "Hlas Piper „Jirka“ běží zdarma přímo v prohlížeči (model ~60 MB se stáhne poprvé).";
  $("#rRychlost").value = p.hlas.rychlost;
  $("#rRychlostHodnota").textContent = `${Math.round(p.hlas.rychlost * 100)} %`;
  $("#rHudbaInfo").innerHTML = p.hudba ? `🎵 ${esc(p.hudba.nazev)} <button type="button" class="btn small ghost" id="rHudbaPryc">Odebrat</button>` : "bez hudby";
  $("#rHudbaHlasitost").value = p.hudba?.hlasitost ?? 0.12;
  $("#rHudbaLicence").value = p.hudba?.licence || "";
  $("#rHlasSceny").innerHTML = p.sceny.map((s, i) => {
    const zastaraly = s.hlas && s.hlas.textHash !== R.hashTextu(s.text);
    return `<div class="r-hlas-scena" data-i="${i}">
      <div class="slide-hlava"><b>Scéna ${i + 1}</b><span class="radek">
        ${s.hlas ? `<span class="${zastaraly ? "bez-zdroje" : "r-prirazeno"}">${zastaraly ? "⚠️ text se změnil" : `✔ ${s.hlas.zdroj === "mikrofon" ? "🎙️" : s.hlas.zdroj === "elevenlabs" || s.hlas.zdroj === "import" ? "🎧" : "🤖"} ${s.hlas.delka.toFixed(1)} s`}</span><button type="button" class="btn small ghost" data-r-hakce="prehrat">▶</button>` : '<span class="bez-zdroje">bez hlasu</span>'}
        <button type="button" class="btn small ghost" data-r-hakce="tts">🤖 Hlas</button>
        <button type="button" class="btn small ghost" data-r-hakce="soubor" title="Nahrát audio soubor jen pro tuhle scénu">📥 Soubor</button>
        <button type="button" class="btn small ghost" data-r-hakce="mic">🎙️ Nahrát sám</button></span></div>
      <p class="r-hlas-text">${esc(s.text.replace(/\*/g, ""))}</p>
      <details ${s.titulkyRucne ? "open" : ""}><summary class="muted">Titulky (${(s.titulky || []).length})${s.titulkyRucne ? " · upravené ručně" : ""}</summary>
        <div class="r-titulky">${(s.titulky || []).map((t, j) => `<div class="r-titulek" data-j="${j}"><input data-r-t="text" value="${esc(t.text)}"><input data-r-t="od" type="number" step="0.05" value="${t.od}"><input data-r-t="do" type="number" step="0.05" value="${t.do}"></div>`).join("")}</div>
        <button type="button" class="btn small ghost" data-r-hakce="titulky">↻ Titulky znovu z textu</button></details>
    </div>`;
  }).join("") || '<p class="muted">Nejdřív napiš scénář.</p>';
}

// Čísla v textu převede AI na slova ve správném pádě („s 5 góly“ → „s pěti góly“).
// Bez AI klíče (nebo při chybě) se použijí pravidla v DHReelsHlas.ceskaCisla.
// Titulky scény: s časy vět z nahrávky (pauzy) sedí přesně na hlas; bez nahrávky odhad.
function vetyHlasu(s, buf) {
  try { s.hlas.vety = A.vetyZPauz(buf, R.vetyTextu(s.text)); s.hlas.vetyHash = R.hashTextu(s.text); } catch { /* bez vět */ }
}
function prepocitejTitulky(s) {
  if (!s || s.titulkyRucne) return;
  const r = p.hlas?.rychlost || 1;
  const vety = s.hlas?.vety && s.hlas.vetyHash === R.hashTextu(s.text) ? s.hlas.vety.map((v) => ({ od: v.od / r, do: v.do / r })) : null;
  s.titulky = R.autoTitulky(s.text, s.hlas?.delka ? s.hlas.delka / r : null, vety);
}

let mluvaSelhala = 0;
async function pripravMluvu(indexy) {
  const potreba = indexy.filter((i) => {
    const s = p.sceny[i];
    return /\d/.test(s.text) && s.mluva?.hash !== R.hashTextu(s.text);
  });
  if (!potreba.length || !AI()?.maKlic() || Date.now() - mluvaSelhala < 120000) return;
  try {
    const r = await AI().gemini({
      system: `Připravuješ český text pro hlasového robota (text-to-speech). Přepiš VŠECHNA čísla slovy ve správném pádě a rodě podle češtiny:
roky („1998“ → „devatenáct set devadesát osm“, „2011“ → „dva tisíce jedenáct“), data („1. září“ → „prvního září“), řadové číslovky („v 68. minutě“ → „v šedesáté osmé minutě“),
skóre („5:3“ → „pět ku třem“), čísla s předložkami („s 5 góly“ → „s pěti góly“), procenta, desetinná čísla, čísla dresů („č. 68“ → „s číslem šedesát osm“ podle kontextu), „3×“ → „třikrát“.
Nic jiného neměň – slova, interpunkci, hvězdičky *zvýraznění* i [tagy] v hranatých závorkách nech přesně tak. Ve výsledku nesmí zůstat žádná číslice.`,
      zadani: JSON.stringify(potreba.map((i) => ({ i, text: p.sceny[i].text }))),
      schema: { type: "object", properties: { sceny: { type: "array", items: { type: "object", properties: { i: { type: "integer" }, text: { type: "string" } }, required: ["i", "text"] } } }, required: ["sceny"] },
      teplota: 0.1,
    });
    for (const x of r.sceny || []) {
      const s = p.sceny[x.i];
      if (!s || !potreba.includes(x.i) || !x.text?.trim()) continue;
      const delkaOk = x.text.length < s.text.length * 3 + 200;
      if (delkaOk) s.mluva = { hash: R.hashTextu(s.text), text: x.text.trim() };
    }
  } catch (e) { mluvaSelhala = Date.now(); console.warn("AI převod čísel selhal, použijí se pravidla:", e?.message); }
}
const mluvenyText = (s) => (s.mluva?.hash === R.hashTextu(s.text) ? s.mluva.text : s.text);

async function hlasScenu(i, tiche = false) {
  const s = p.sceny[i];
  await pripravMluvu([i]);
  const eleven = p.hlas.hlasId === "eleven";
  if (!tiche) zprava("#rHlasZprava", eleven ? `Generuji hlas pro scénu ${i + 1} na ElevenLabs…` : `Generuji hlas pro scénu ${i + 1}… (poprvé se stahuje hlasový model ~60 MB)`);
  const blob = await A.syntetizuj(mluvenyText(s), p.hlas.hlasId, (pct) => zprava("#rHlasZprava", `Stahuji český hlasový model… ${pct} %`),
    { predchozi: p.sceny[i - 1] ? mluvenyText(p.sceny[i - 1]) : "", dalsi: p.sceny[i + 1] ? mluvenyText(p.sceny[i + 1]) : "" });
  const souborId = await U.ulozSoubor(blob, { nazev: `hlas-${i + 1}.${eleven ? "mp3" : "wav"}` });
  const buf = await A.dekoduj(souborId, async () => blob);
  s.hlas = { souborId, delka: buf.duration, zdroj: eleven ? "elevenlabs" : "piper", hlasId: p.hlas.hlasId, textHash: R.hashTextu(s.text) };
  vetyHlasu(s, buf);
  prepocitejTitulky(s);
}

async function hlasVse() {
  const b = $("#rGenHlas"); b.disabled = true;
  try {
    if (p.sceny.some((s) => /\d/.test(s.text))) {
      zprava("#rHlasZprava", "Připravuji čísla pro hlas (roky, skóre, data)…");
      await pripravMluvu(p.sceny.map((_, i) => i));
    }
    for (let i = 0; i < p.sceny.length; i++) {
      const s = p.sceny[i];
      if (s.hlas && s.hlas.textHash === R.hashTextu(s.text) && s.hlas.zdroj !== "mikrofon" && s.hlas.hlasId === p.hlas.hlasId) continue;
      zprava("#rHlasZprava", `Generuji český hlas${p.hlas.hlasId === "eleven" ? " (ElevenLabs)" : ""}… scéna ${i + 1} / ${p.sceny.length}`);
      await hlasScenu(i, true);
      s.hlas.hlasId = p.hlas.hlasId;
      ulozPozdeji();
    }
    vykresliHlas(); vykresliStrih(); obnovNahled();
    zprava("#rHlasZprava", `Hlas je hotový ve všech scénách. Délka reelu ${R.casovaOsa(p).celkem.toFixed(1)} s.`, "ok");
  } catch (e) { zprava("#rHlasZprava", esc(e.message), "chyba"); }
  finally { b.disabled = false; }
}

// --------------------------------------------- hotové audio (ElevenLabs bez API) --

async function kopirujProEleven() {
  if (!p?.sceny.length) { zprava("#rHlasZprava", "Nejdřív napiš scénář.", "chyba"); return; }
  const text = A.textProElevenLabs(p.sceny.map((s) => ({ ...s, text: mluvenyText(s) })));
  try {
    await navigator.clipboard.writeText(text);
    zprava("#rHlasZprava", `Text zkopírován ✓ (${text.length} znaků, ${p.sceny.length} scén). V ElevenLabs ho vlož do <b>Text to Speech</b>, vyber hlas <b>Kuba</b>, klikni <b>Generate</b>, stáhni MP3 a nahraj ho sem tlačítkem <b>📥 Nahrát celé audio</b>.`, "ok");
  } catch {
    $("#rElevenText").value = text;
    $("#rElevenText").hidden = false;
    $("#rElevenText").select();
    zprava("#rHlasZprava", "Kopírování zablokoval prohlížeč – text je označený níž, zkopíruj ho ručně (Ctrl+C).", "varovani");
  }
}

async function ulozHlasSceny(i, buf, zdroj, nazev) {
  const blob = A.naWav(buf);
  const souborId = await U.ulozSoubor(blob, { nazev });
  A.zapomen(souborId);
  const dek = await A.dekoduj(souborId, async () => blob);
  const s = p.sceny[i];
  s.hlas = { souborId, delka: dek.duration, zdroj, hlasId: zdroj, textHash: R.hashTextu(s.text) };
  vetyHlasu(s, dek);
  prepocitejTitulky(s);
}

async function importCelehoAudia(soubor) {
  if (!soubor || !p) return;
  if (!p.sceny.length) { zprava("#rHlasZprava", "Nejdřív napiš scénář – audio se rozdělí podle jeho scén.", "chyba"); return; }
  zprava("#rHlasZprava", "Načítám audio a hledám pauzy mezi scénami…");
  try {
    const buf = await A.dekoduj(`import-${Date.now()}`, async () => soubor);
    const useky = A.rozdelNaSceny(buf, p.sceny.map((s) => s.text));
    for (let i = 0; i < useky.length; i++) {
      await ulozHlasSceny(i, A.vyrizni(buf, useky[i].od, useky[i].do), "import", `voiceover-${i + 1}.wav`);
    }
    vykresliHlas(); vykresliStrih(); ulozPozdeji(); obnovNahled();
    zprava("#rHlasZprava", `Audio (${buf.duration.toFixed(1)} s) je rozdělené do ${useky.length} scén ✓ Proklikej ▶ u scén – kdyby střih seděl špatně, nahraj audio ke konkrétní scéně tlačítkem 📥 Soubor.`, "ok");
  } catch (e) { zprava("#rHlasZprava", esc(e.message), "chyba"); }
}

let souborProScenu = null;
async function importSceny(soubor) {
  const i = souborProScenu;
  souborProScenu = null;
  if (!soubor || i === null || !p?.sceny[i]) return;
  try {
    const buf = await A.dekoduj(`import-${Date.now()}`, async () => soubor);
    await ulozHlasSceny(i, buf, "import", `scena-${i + 1}.wav`);
    vykresliHlas(); vykresliStrih(); ulozPozdeji(); obnovNahled();
    zprava("#rHlasZprava", `Audio scény ${i + 1} nahrané (${buf.duration.toFixed(1)} s).`, "ok");
  } catch (e) { zprava("#rHlasZprava", `Audio se nepodařilo načíst: ${esc(e.message)}`, "chyba"); }
}

let nahravani = null;
async function mikrofon(i, tl) {
  if (nahravani) {
    const { rec, idx } = nahravani;
    nahravani = null;
    const blob = await rec.zastav();
    const souborId = await U.ulozSoubor(blob, { nazev: `nahravka-${idx + 1}.webm` });
    const buf = await A.dekoduj(souborId, async () => blob);
    const s = p.sceny[idx];
    s.hlas = { souborId, delka: buf.duration, zdroj: "mikrofon", textHash: R.hashTextu(s.text) };
    vetyHlasu(s, buf);
    prepocitejTitulky(s);
    vykresliHlas(); vykresliStrih(); ulozPozdeji(); obnovNahled();
    zprava("#rHlasZprava", `Nahrávka scény ${idx + 1} uložena (${buf.duration.toFixed(1)} s).`, "ok");
    return;
  }
  try {
    nahravani = { rec: await A.nahravkaZMikrofonu(), idx: i };
    tl.textContent = "⏹ Zastavit";
    zprava("#rHlasZprava", `🔴 Nahrávám scénu ${i + 1} – přečti text a klikni na Zastavit.`, "varovani");
  } catch (e) { zprava("#rHlasZprava", esc(e.message), "chyba"); }
}

// --------------------------------------------------------------- náhled --

async function obnovNahled(t = 0) {
  if (!p || !nahled) return;
  try {
    await nahled.nacti(p, (chyba) => zprava("#rNahledZprava", esc(chyba), "chyba"));
    const osa = R.casovaOsa(p);
    $("#rPosuv").max = osa.celkem.toFixed(2);
    $("#rPosuv").value = Math.min(t, osa.celkem);
    $("#rCas").textContent = `${cas(t)} / ${cas(osa.celkem)}`;
    await nahled.snimek(Math.min(t, Math.max(0, osa.celkem - 0.01)));
  } catch (e) { zprava("#rNahledZprava", esc(e.message), "chyba"); }
}

async function prehrat() {
  const b = $("#rPrehrat");
  if (nahled.bezi) { nahled.zastav(); b.textContent = "▶ Přehrát"; return; }
  b.textContent = "⏸ Pauza";
  zprava("#rNahledZprava", "");
  try {
    await nahled.prehraj(p, +$("#rPosuv").value || 0, (t, konec) => {
      $("#rPosuv").value = t;
      $("#rCas").textContent = `${cas(t)} / ${cas(nahled.osa.celkem)}`;
      if (konec) b.textContent = "▶ Přehrát";
    });
  } catch (e) { b.textContent = "▶ Přehrát"; zprava("#rNahledZprava", esc(e.message), "chyba"); }
}

// ------------------------------------------------------------- 7. export --

async function obnovKontrolu() {
  if (!p) return null;
  const k = await R.kontrola(p);
  const ikona = { ok: "✅", varovani: "⚠️", chyba: "⛔" };
  $("#rKontrola").innerHTML = `<ul class="overeni">${k.body.map((b) => `<li class="r-qc ${b.stav}"><span>${ikona[b.stav]}</span><div>${esc(b.text)}</div></li>`).join("")}</ul>`;
  $("#rRender").disabled = !k.ok;
  zprava("#rRenderZprava", k.ok ? "Kontrola prošla – můžeš renderovat." : "Export je zablokovaný, dokud nevyřešíš body označené ⛔. Kvalita a autenticita mají přednost.", k.ok ? "ok" : "chyba");
  $("#rQcSouhrn").innerHTML = k.body.filter((b) => b.stav !== "ok").length ? `${k.body.filter((b) => b.stav === "chyba").length} ⛔ · ${k.body.filter((b) => b.stav === "varovani").length} ⚠️` : "✅ připraveno";
  return k;
}

let zrusit = false;
async function vyrenderuj() {
  const k = await obnovKontrolu();
  if (!k?.ok) return;
  nahled?.zastav();
  zrusit = false;
  const b = $("#rRender"); b.disabled = true;
  $("#rZrusit").hidden = false;
  $("#rPrubeh").hidden = false;
  const start = Date.now();
  try {
    const out = await R.render(p, {
      pokrok: (x, text) => { $("#rPrubeh").value = x; zprava("#rRenderZprava", `${esc(text)} · ${Math.round(x * 100)} % · ${Math.round((Date.now() - start) / 1000)} s`); },
      zruseno: () => zrusit,
    });
    const id = U.noveId("render");
    await U.uloz("rendery", { id, projektId: p.id, nazev: p.nazev, blob: out.blob, cas: Date.now(), delka: out.delka, velikost: out.blob.size, format: out.format });
    p.rendery = [...(p.rendery || []), id];
    ulozPozdeji();
    const url = URL.createObjectURL(out.blob);
    $("#rVystup").innerHTML = `<video src="${url}" controls playsinline></video>
      <div class="akce"><a class="btn" href="${url}" download="denik-hokeje-${slug(p.nazev)}.mp4">⬇️ Stáhnout MP4</a></div>
      <p class="muted" style="font-size:13px">${(out.blob.size / 1048576).toFixed(1)} MB · ${out.delka.toFixed(1)} s · 1080×1920 · H.264 · ${out.format.audio.mux.toUpperCase()}</p>`;
    zprava("#rRenderZprava", `Hotovo za ${Math.round((Date.now() - start) / 1000)} s. Reel je uložený i v historii.`, "ok");
    vykresliHistorii();
  } catch (e) { zprava("#rRenderZprava", esc(e.message), "chyba"); }
  finally { b.disabled = false; $("#rZrusit").hidden = true; $("#rPrubeh").hidden = true; }
}

function scenarText() {
  const osa = R.casovaOsa(p);
  return [`${p.nazev}`, `Délka: ${osa.celkem.toFixed(0)} s · ${p.sceny.length} scén`, "",
    ...osa.segmenty.map((seg) => `[${cas(seg.od)}–${cas(seg.do)}] SCÉNA ${seg.i + 1}${seg.scena.titulek ? ` · NÁPIS: ${seg.scena.titulek}` : ""}\nVO: ${seg.scena.text.replace(/\*/g, "")}\nZÁBĚR: ${seg.scena.zaber}${seg.scena.klip ? ` → ${p.klipy[seg.scena.klip.klipId]?.nazev} (od ${seg.scena.klip.start}s)` : ""}\n`),
    p.scenar.cta ? `CTA: ${p.scenar.cta}` : ""].join("\n");
}

function zdrojeText() {
  const pouzite = pouziteKlipy();
  return ["ZDROJE FAKTŮ", ...p.vyzkum.fakta.filter((f) => f.pouzit !== false).map((f) => `- ${f.text} [${JISTOTA[f.jistota] || f.jistota}]\n  ${(f.zdroje || []).map((z) => `${z.titulek}: ${z.uri}`).join("\n  ") || "bez zdroje"}`),
    "", "ZÁBĚRY A LICENCE", ...[...pouzite].map((id) => p.klipy[id]).filter(Boolean).map((k) => `- ${k.nazev} · ${k.licence?.nazev || ""}${k.licence?.autor ? ` · autor: ${k.licence.autor}` : ""}${k.puvod ? ` · ${k.puvod}` : ""}`),
    p.hudba ? `\nHUDBA: ${p.hudba.nazev} · ${p.hudba.licence || "licence neuvedena"}` : ""].join("\n");
}

function popisekSKredity() {
  const pouzite = [...pouziteKlipy()].map((id) => p.klipy[id]).filter((k) => k && k.licence?.stav === "volna");
  const kredity = pouzite.length ? `📹 Záběry a fotky: ${pouzite.map((k) => `${k.licence.autor || k.nazev} (${k.licence.nazev})`).join(", ")}` : "";
  const t = $("#rPopisekReel").value.trim();
  return [t, kredity].filter(Boolean).join("\n\n");
}

async function vykresliHistorii() {
  let r = [];
  try { r = await U.vsechny("rendery"); } catch { /* nic */ }
  r.sort((a, b) => b.cas - a.cas);
  $("#rHistorie").innerHTML = r.length ? r.map((x) => `<label class="r-render check"><input type="checkbox" data-r-vyber="${x.id}">
      <span><b>${esc(x.nazev)}</b><br><small class="muted">${new Date(x.cas).toLocaleString("cs-CZ")} · ${x.delka.toFixed(0)} s · ${(x.velikost / 1048576).toFixed(1)} MB</small></span>
      <button type="button" class="btn small ghost" data-r-stahnirender="${x.id}">⬇️</button><button type="button" class="btn small ghost" data-r-yt="${x.id}" title="Nahrát na YouTube">▶ YT</button><button type="button" class="btn small ghost" data-r-smazrender="${x.id}">✕</button></label>`).join("")
    : '<p class="muted">Zatím žádné vyrenderované reels.</p>';
}

let jszip = null;
async function nactiJSZip() {
  if (window.JSZip) return window.JSZip;
  jszip = jszip || new Promise((ok, chyba) => {
    const sc = document.createElement("script");
    sc.src = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
    sc.onload = () => ok(window.JSZip); sc.onerror = () => { jszip = null; chyba(new Error("ZIP knihovnu se nepodařilo načíst.")); };
    document.head.appendChild(sc);
  });
  return jszip;
}

async function hromadnyExport() {
  const ids = $$("[data-r-vyber]:checked").map((i) => i.dataset.rVyber);
  if (!ids.length) { zprava("#rRenderZprava", "Zaškrtni reels v historii.", "varovani"); return; }
  const JSZip = await nactiJSZip();
  const zip = new JSZip();
  for (const id of ids) {
    const r = await U.nacti("rendery", id);
    if (!r) continue;
    const proj = await U.nacti("projekty", r.projektId);
    const nazev = `${slug(r.nazev)}-${new Date(r.cas).toISOString().slice(0, 10)}`;
    zip.file(`${nazev}/reel.mp4`, r.blob);
    if (proj) {
      const puvodni = p; p = proj;
      zip.file(`${nazev}/titulky.srt`, R.srt(proj));
      zip.file(`${nazev}/scenar.txt`, scenarText());
      zip.file(`${nazev}/zdroje.txt`, zdrojeText());
      zip.file(`${nazev}/popisek.txt`, [proj.scenar.popisek, proj.scenar.cta, proj.scenar.hashtagy.join(" ")].filter(Boolean).join("\n\n"));
      p = puvodni;
    }
  }
  stahni(await zip.generateAsync({ type: "blob" }), `denik-hokeje-reels-${new Date().toISOString().slice(0, 10)}.zip`);
}

// ----------------------------------------------------------------- události --

function init() {
  if (!$("#zalozkaReels")) return;
  nahled = new R.Nahled($("#rPlatno"));
  $("#rYtKlic").value = Z.ytKlic() ? "••••••••" : "";
  vykresliVse();
  vykresliProjekty();
  vykresliHistorii();

  $("#zalozkaReels").addEventListener("click", async (e) => {
    const t = e.target.closest("button, a, [data-tema]");
    if (!t) return;
    const d = t.dataset;
    if (t.classList.contains("r-krok")) return prepniKrok(d.krok);
    if (d.rKrokOdkaz) { e.preventDefault(); return prepniKrok(d.rKrokOdkaz); }
    if (d.tema) { $("#rTema").value = d.tema; return; }
    if (d.rOtevri) return otevri(d.rOtevri);
    if (d.rSmaz) { if (confirm("Smazat projekt?")) { await U.smaz("projekty", d.rSmaz); if (p?.id === d.rSmaz) { p = null; vykresliVse(); } vykresliProjekty(); } return; }
    if (!p) return;
    const sc = t.closest(".r-scena, .r-strih-scena, .r-hlas-scena");
    const i = sc ? +sc.dataset.i : -1;
    if (d.rAkce) {
      if (d.rAkce === "nahoru" && i > 0) [p.sceny[i - 1], p.sceny[i]] = [p.sceny[i], p.sceny[i - 1]];
      else if (d.rAkce === "dolu") [p.sceny[i + 1], p.sceny[i]] = [p.sceny[i], p.sceny[i + 1]];
      else if (d.rAkce === "smazat") { if (!confirm("Smazat scénu?")) return; p.sceny.splice(i, 1); }
      else if (d.rAkce === "prepsat") return prepisScenu(i);
      vykresliVse(); ulozPozdeji(); return;
    }
    if (d.rSakce) {
      if (d.rSakce === "ukaz") { const osa = R.casovaOsa(p); return obnovNahled(osa.segmenty[i].od + 0.3); }
      if (d.rSakce === "nahoru" && i > 0) [p.sceny[i - 1], p.sceny[i]] = [p.sceny[i], p.sceny[i - 1]];
      if (d.rSakce === "dolu" && i < p.sceny.length - 1) [p.sceny[i + 1], p.sceny[i]] = [p.sceny[i], p.sceny[i + 1]];
      vykresliVse(); ulozPozdeji(); obnovNahled(); return;
    }
    if (d.rHakce) {
      const s = p.sceny[i];
      if (d.rHakce === "prehrat" && s.hlas) { const buf = await A.dekoduj(s.hlas.souborId, () => U.souborBlob(s.hlas.souborId)); A.prehraj(buf); return; }
      if (d.rHakce === "tts") { try { t.disabled = true; await hlasScenu(i); vykresliHlas(); vykresliStrih(); ulozPozdeji(); obnovNahled(); zprava("#rHlasZprava", `Hlas scény ${i + 1} hotový.`, "ok"); } catch (er) { zprava("#rHlasZprava", esc(er.message), "chyba"); } finally { t.disabled = false; } return; }
      if (d.rHakce === "mic") return mikrofon(i, t);
      if (d.rHakce === "soubor") { souborProScenu = i; $("#rSouborSceny").value = ""; $("#rSouborSceny").click(); return; }
      if (d.rHakce === "titulky") { s.titulkyRucne = false; prepocitejTitulky(s); vykresliHlas(); ulozPozdeji(); obnovNahled(); return; }
    }
    if (d.rHledat !== undefined) { t.disabled = true; try { await hledatScenu(+d.rHledat); } catch (er) { zprava("#rZaberyZprava", esc(er.message), "chyba"); } t.disabled = false; return; }
    if (d.rPouzit !== undefined) return pouzitVysledek(+d.rPouzit);
    if (d.rDalsi !== undefined) return pouzitVysledek(+d.rDalsi, true);
    if (d.rBezstrihu !== undefined) { p.sceny[+d.rBezstrihu].extra = []; vykresliZabery(); vykresliStrih(); ulozPozdeji(); obnovNahled(); return; }
    if (d.rSmazstrih) { const [si, j] = d.rSmazstrih.split(":").map(Number); p.sceny[si].extra.splice(j, 1); vykresliZabery(); vykresliStrih(); ulozPozdeji(); obnovNahled(R.casovaOsa(p).segmenty[si]?.od + 0.3); return; }
    if (d.rNahled !== undefined) return nahledVysledku(+d.rNahled);
    if (d.rSmazklip) {
      if (pouziteKlipy().has(d.rSmazklip) && !confirm("Záběr je použitý ve scéně. Odebrat?")) return;
      p.sceny.forEach((s) => {
        s.extra = (s.extra || []).filter((z) => z.klipId !== d.rSmazklip);
        if (s.klip?.klipId === d.rSmazklip) s.klip = s.extra.shift() || null;
      });
      delete p.klipy[d.rSmazklip]; R.zapomenMedium(d.rSmazklip);
      vykresliZabery(); vykresliStrih(); ulozPozdeji(); obnovNahled(); return;
    }
    if (d.rYt) { window.DHYtStudio?.publikovatReel(d.rYt); return; }
    if (d.rStahnirender) { const r = await U.nacti("rendery", d.rStahnirender); if (r) stahni(r.blob, `denik-hokeje-${slug(r.nazev)}.mp4`); return; }
    if (d.rSmazrender) { if (confirm("Smazat render z historie?")) { await U.smaz("rendery", d.rSmazrender); vykresliHistorii(); } return; }
    if (t.id === "rHudbaPryc") { p.hudba = null; vykresliHlas(); ulozPozdeji(); return; }
  });

  const zmena = (e) => {
    if (!p) return;
    const t = e.target, d = t.dataset;
    const sc = t.closest(".r-scena, .r-strih-scena, .r-hlas-scena");
    const i = sc ? +sc.dataset.i : -1;
    if (d.rPole) { p.sceny[i][d.rPole] = t.value; if (d.rPole === "text") prepocitejTitulky(p.sceny[i]); ulozPozdeji(); if (e.type === "change") { vykresliHlas(); obnovNahled(R.casovaOsa(p).segmenty[i]?.od + 0.3); } return; }
    if (d.rDotaz) { p.sceny[i].dotazy[d.rDotaz] = t.value; ulozPozdeji(); return; }
    if (t.name === "rHook") { p.scenar.hook = +t.value; p.sceny[0].text = p.scenar.hooky[p.scenar.hook].text; prepocitejTitulky(p.sceny[0]); vykresliScenar(); vykresliHlas(); ulozPozdeji(); return; }
    if (d.fakt !== undefined) { p.vyzkum.fakta[+d.fakt].pouzit = t.checked; ulozPozdeji(); return; }
    if (d.rZknihovny !== undefined || d.rKlip !== undefined) {
      const si = +(d.rZknihovny ?? d.rKlip);
      if (t.value) priradKlip(si, t.value); else p.sceny[si].klip = null;
      vykresliZabery(); vykresliStrih(); ulozPozdeji(); obnovNahled(R.casovaOsa(p).segmenty[si]?.od + 0.3); return;
    }
    if (d.rK) {
      const k = p.sceny[i].klip;
      k[d.rK] = t.type === "range" ? +t.value : t.value;
      if (d.rK === "start") sc.querySelector('[data-r-hodnota="start"]').textContent = `${(+t.value).toFixed(1)} s`;
      ulozPozdeji();
      const osa = R.casovaOsa(p);
      obnovNahled(osa.segmenty[i].od + (d.rK === "start" ? 0.05 : 0.6));
      return;
    }
    if (d.rPrava) { const k = p.klipy[d.rPrava]; k.licence.stav = t.checked ? "prava" : "neovereno"; k.licence.nazev = t.checked ? "vlastní import – práva potvrzena uživatelem" : "vlastní import – potvrď práva"; vykresliZabery(); ulozPozdeji(); return; }
    if (d.rPuvod) { p.klipy[d.rPuvod].puvod = t.value; ulozPozdeji(); return; }
    if (d.rT) {
      const j = +t.closest(".r-titulek").dataset.j;
      const tt = p.sceny[i].titulky[j];
      tt[d.rT] = d.rT === "text" ? t.value : +t.value;
      p.sceny[i].titulkyRucne = true; ulozPozdeji(); return;
    }
  };
  $("#zalozkaReels").addEventListener("input", zmena);
  $("#zalozkaReels").addEventListener("change", zmena);

  $("#rNavrhniTemata").addEventListener("click", navrhniTemata);
  $("#rZalozit").addEventListener("click", zalozProjekt);
  $("#rVyzkum").addEventListener("click", vyzkum);
  $("#rOveritFakta").addEventListener("click", overFakta);
  $("#rNapsat").addEventListener("click", napisScenar);
  $("#rPridatScenu").addEventListener("click", () => { if (!p) return; p.sceny.push({ id: U.noveId("s"), text: "", titulek: "", zaber: "", dotazy: Object.fromEntries(LANG.map((l) => [l, ""])), fakta: [], klip: null, hlas: null, titulky: [], titulkyRucne: false }); vykresliVse(); ulozPozdeji(); });
  $("#rPopisekReel").addEventListener("input", (e) => { p.scenar.popisek = e.target.value; p.scenar.cta = ""; p.scenar.hashtagy = []; ulozPozdeji(); });
  $("#rHledatVse").addEventListener("click", hledatVse);
  $("#rHledatWeb").addEventListener("click", hledatWeb);
  $("#rPriradit").addEventListener("click", automatickyPriradit);
  $("#rFire")?.addEventListener("click", najdiAPoskladej);
  $("#rImport").addEventListener("change", (e) => { importuj([...e.target.files]); e.target.value = ""; });
  const drop = $("#rDrop");
  drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("drop"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("drop"));
  drop.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("drop"); if (p) importuj([...e.dataTransfer.files]); });
  $("#rYtUlozit").addEventListener("click", () => {
    const v = $("#rYtKlic").value.trim();
    try { if (v && !v.startsWith("••")) localStorage.setItem("dhpf_youtube_klic", v); if (!v) localStorage.removeItem("dhpf_youtube_klic"); } catch { /* nic */ }
    $("#rYtKlic").value = Z.ytKlic() ? "••••••••" : "";
    zprava("#rYtZprava", Z.ytKlic() ? "YouTube klíč uložen (jen v tomhle prohlížeči)." : "YouTube klíč odebrán.", "ok");
    if (p) vykresliZabery();
  });
  for (const [id, klic] of [["#rStrihStyl", "strih"], ["#rBarvy", "barvy"], ["#rProlnuti", "prolnuti"], ["#rTitulkyZap", "titulky"], ["#rZvyrazneni", "zvyrazneni"], ["#rLogoZap", "logo"], ["#rOutro", "outro"]]) {
    $(id).addEventListener("change", (e) => { if (!p) return; p.vzhled[klic] = e.target.type === "checkbox" ? e.target.checked : e.target.value; ulozPozdeji(); obnovNahled(+$("#rPosuv").value); });
  }
  $("#rHlasId").addEventListener("change", (e) => { p.hlas.hlasId = e.target.value; ulozPozdeji(); });
  $("#rRychlost").addEventListener("input", (e) => {
    p.hlas.rychlost = +e.target.value;
    $("#rRychlostHodnota").textContent = `${Math.round(p.hlas.rychlost * 100)} %`;
    p.sceny.forEach((s) => { if (s.hlas) prepocitejTitulky(s); });
    ulozPozdeji();
  });
  $("#rGenHlas").addEventListener("click", hlasVse);
  $("#rKopirujEleven").addEventListener("click", kopirujProEleven);
  $("#rCeleAudio").addEventListener("change", (e) => { importCelehoAudia(e.target.files[0]); e.target.value = ""; });
  $("#rSouborSceny").addEventListener("change", (e) => importSceny(e.target.files[0]));
  $("#rHudba").addEventListener("change", async (e) => {
    const f = e.target.files[0]; if (!f || !p) return;
    const souborId = await U.ulozSoubor(f, { nazev: f.name });
    p.hudba = { souborId, nazev: f.name, hlasitost: +$("#rHudbaHlasitost").value || 0.12, licence: $("#rHudbaLicence").value };
    vykresliHlas(); ulozPozdeji(); e.target.value = "";
  });
  $("#rHudbaHlasitost").addEventListener("input", (e) => { if (p?.hudba) { p.hudba.hlasitost = +e.target.value; ulozPozdeji(); } });
  $("#rHudbaLicence").addEventListener("input", (e) => { if (p?.hudba) { p.hudba.licence = e.target.value; ulozPozdeji(); } });

  $("#rPrehrat").addEventListener("click", () => p && prehrat());
  $("#rPosuv").addEventListener("input", (e) => { if (!p || nahled.bezi) return; const t = +e.target.value; $("#rCas").textContent = `${cas(t)} / ${cas(R.casovaOsa(p).celkem)}`; nahled.snimek(t); });
  $("#rKontrolaBtn").addEventListener("click", obnovKontrolu);
  $("#rRender").addEventListener("click", vyrenderuj);
  $("#rZrusit").addEventListener("click", () => { zrusit = true; });
  $("#rExScenar").addEventListener("click", () => p && stahni(new Blob([scenarText()], { type: "text/plain;charset=utf-8" }), `${slug(p.nazev)}-scenar.txt`));
  $("#rExSrt").addEventListener("click", () => p && stahni(new Blob([R.srt(p)], { type: "text/plain;charset=utf-8" }), `${slug(p.nazev)}.srt`));
  $("#rExZdroje").addEventListener("click", () => p && stahni(new Blob([zdrojeText()], { type: "text/plain;charset=utf-8" }), `${slug(p.nazev)}-zdroje.txt`));
  $("#rExPopisek").addEventListener("click", async () => {
    if (!p) return;
    const t = popisekSKredity();
    try { await navigator.clipboard.writeText(t); zprava("#rRenderZprava", "Popisek s kredity záběrů zkopírován.", "ok"); } catch { stahni(new Blob([t], { type: "text/plain;charset=utf-8" }), `${slug(p.nazev)}-popisek.txt`); }
  });
  $("#rZip").addEventListener("click", () => hromadnyExport().catch((e) => zprava("#rRenderZprava", esc(e.message), "chyba")));
  $("#rDialog").addEventListener("close", () => { $("#rDialogObsah").innerHTML = ""; });
  document.querySelector('.tab[data-tab="reels"]')?.addEventListener("click", () => { vykresliProjekty(); if (p) obnovNahled(+$("#rPosuv").value); });
  R.zjistiFormat().then((f) => { $("#rFormat").textContent = f.poznamka || `Výstup: MP4 · H.264 · ${f.audio?.mux === "aac" ? "AAC" : "Opus"}`; });
}

// ------------------------------------------------- upoutávka na YouTube video --
// Z (naplánovaného) videa na YouTube udělá krátký reel 9:16: háček, pár záběrů bez spoileru a CTA s datem premiéry.

const DNY_TYDNE = ["v neděli", "v pondělí", "v úterý", "ve středu", "ve čtvrtek", "v pátek", "v sobotu"];
function kdyPremiera(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (!(d > new Date())) return null;
  const dnes = new Date(); dnes.setHours(0, 0, 0, 0);
  const den = new Date(d); den.setHours(0, 0, 0, 0);
  const rozdil = Math.round((den - dnes) / 864e5);
  const hodina = d.toLocaleTimeString("cs-CZ", { hour: "numeric", minute: "2-digit" });
  const kdy = rozdil === 0 ? "dnes" : rozdil === 1 ? "zítra" : rozdil < 7 ? DNY_TYDNE[d.getDay()] : `${d.getDate()}. ${d.getMonth() + 1}.`;
  return { kdy, hodina, text: `${kdy} v ${hodina}`, kratce: `${kdy.toUpperCase()} ${hodina}`, datum: d.toLocaleString("cs-CZ") };
}

const SCHEMA_UPOUTAVKA = {
  type: "object",
  properties: {
    sceny: { type: "array", items: { type: "object", properties: { text: { type: "string" }, titulek: { type: "string" }, cas_s: { type: "number" } }, required: ["text", "titulek", "cas_s"] } },
    popisek: { type: "string" },
    hashtagy: { type: "array", items: { type: "string" } },
  },
  required: ["sceny", "popisek", "hashtagy"],
};

async function zUpoutavky({ video, soubor, delka = 30 }) {
  const premiera = kdyPremiera(video.naplanovano);
  const kapitoly = Z.casyZPopisu(video.popis || "").map((k) => {
    const c = String(k.cas).split(":").map(Number);
    return { s: c.length === 3 ? c[0] * 3600 + c[1] * 60 + c[2] : c[0] * 60 + (c[1] || 0), popis: k.popis };
  }).filter((k) => Number.isFinite(k.s));
  p = novyProjekt({ tema: `Upoutávka: ${video.nazev}`, delka, ton: "dokument", jazyky: ["cs"] });
  p.nazev = `🎬 ${video.nazev}`.slice(0, 80);
  p.upoutavka = { videoId: video.id, nazev: video.nazev, url: `https://youtu.be/${video.id}`, premiera: video.naplanovano || null };
  p.vzhled.outroText = premiera ? ["Celé video na YouTube", `${premiera.kratce} · odkaz v bio`] : ["Celé video na YouTube", "odkaz v bio"];
  await U.pozadejTrvaleUloziste();
  zprava("#rTemataZprava", "Načítám video…");
  const k = await Z.importujSoubor(p, soubor);
  k.licence = { stav: "prava", nazev: "vlastní video kanálu Deník hokeje", autor: "Deník hokeje", odkaz: p.upoutavka.url };
  k.puvod = p.upoutavka.url;
  const delkaVidea = k.delka || video.delka || 600;
  const nSc = { 15: 3, 30: 5, 45: 7, 60: 8 }[delka] || 5;

  let r = null;
  if (AI()?.maKlic()) {
    zprava("#rTemataZprava", "AI píše scénář upoutávky…");
    try {
      r = await AI().gemini({
        system: `Píšeš scénáře krátkých upoutávek (Instagram Reels / YouTube Shorts) pro český hokejový kanál „Deník hokeje“. Cíl: aby lidi šli na celé video na YouTube.
Pravidla:
- česky, mluvená řeč, krátké věty; ${nSc} scén, každá 1–2 věty (celkem asi ${Math.round(delka * 2.3)} slov)
- 1. scéna = háček do 2 sekund: otázka, šokující fakt nebo napětí. Žádné „Ahoj“.
- Scény tvoří JEDEN souvislý příběh: každá věta navazuje na předchozí (žádné samostatné hesla), a text jasně odkazuje na nové video
  na YouTube („v novém videu“, „na YouTube ukážeme…“, „uvidíš…“), ať je jasné, že jde o upoutávku.
- NEVYZRAZUJ pointu ani konec příběhu – nech otevřenou otázku, ať to lidi musí dokoukat na YouTube.
- poslední scéna = výzva: ${premiera ? `celé video vychází ${premiera.text} na YouTube Deník hokeje, odkaz je v bio` : "celé video je na YouTube Deník hokeje, odkaz je v bio"}.
- vymýšlej jen z toho, co je v názvu, popisu a kapitolách videa; nic nepřidávej.
- „titulek“ nech prázdný (nahoře je stálý pruh „nové video na YouTube“ a dole titulky toho, co se říká).
- „cas_s“ = sekunda v původním videu, odkud použít záběr k té scéně (0–${Math.round(delkaVidea - 6)}). Ber časy kapitol, pokud jsou; scény ať mají různé časy.
- popisek pod reel: háček (1 řádek), 1–2 řádky o čem video je bez spoileru, ${premiera ? `„🎬 Celé video ${premiera.text} na YouTube – odkaz v bio“` : "„🎬 Celé video na YouTube – odkaz v bio“"}, otázka do komentářů. Hashtagy 3–5.`,
        zadani: `NÁZEV: ${video.nazev}
POPIS: ${(video.popis || "").slice(0, 1800)}
KAPITOLY: ${kapitoly.length ? kapitoly.map((x) => `${x.s}s ${x.popis}`).join("; ") : "(nejsou)"}
DÉLKA VIDEA: ${Math.round(delkaVidea)} s
${premiera ? `PREMIÉRA: ${premiera.datum}` : "Video už je venku."}`,
        schema: SCHEMA_UPOUTAVKA,
        teplota: 0.8,
      });
    } catch (e) { zprava("#rTemataZprava", `AI scénář se nepovedl (${esc(e.message)}), použiju jednoduchou kostru – texty uprav.`, "varovani"); }
  }
  if (!r?.sceny?.length) {
    const cta = premiera ? `Celé video vychází ${premiera.text} na YouTube. Odkaz je v bio.` : "Celé video najdeš na YouTube. Odkaz je v bio.";
    r = {
      sceny: [
        { text: `${video.nazev}. Znáte tenhle příběh?`, titulek: "", cas_s: kapitoly[0]?.s ?? delkaVidea * 0.1 },
        ...kapitoly.slice(1, nSc - 1).map((x) => ({ text: `${x.popis}.`, titulek: "", cas_s: x.s })),
        { text: cta, titulek: premiera ? premiera.kratce : "NA YOUTUBE", cas_s: delkaVidea * 0.6 },
      ],
      popisek: `${video.nazev}\n\n🎬 ${premiera ? `Celé video ${premiera.text} na YouTube` : "Celé video na YouTube"} – odkaz v bio`,
      hashtagy: ["#denikhokeje", "#hokej"],
    };
  }
  const omez = (x) => Math.max(0, Math.min(Number(x) || 0, Math.max(0, delkaVidea - 6)));
  // časy z YouTube délky přepočítat na délku vybraného souboru (kdyby byl kratší/zkrácený)
  const ytDelka = video.delka || delkaVidea;
  const meritko = ytDelka > delkaVidea + 5 ? delkaVidea / ytDelka : 1;
  const vybrane = r.sceny.slice(0, nSc + 1);
  let casy = vybrane.map((x) => omez((Number(x.cas_s) || 0) * meritko));
  const kolize = casy.some((c, i) => casy.some((d, j) => j < i && Math.abs(c - d) < 3));
  if (kolize) casy = vybrane.map((_, i) => omez(((i + 0.5) / vybrane.length) * Math.max(0, delkaVidea - 6)));
  p.sceny = vybrane.map((x, i) => {
    const start = casy[i];
    const s = {
      id: U.noveId("s"), text: x.text, titulek: "", zaber: `záběr z videa v ${Math.floor(start / 60)}:${String(Math.floor(start % 60)).padStart(2, "0")}`,
      dotazy: Object.fromEntries(LANG.map((l) => [l, ""])), fakta: [],
      klip: { klipId: k.id, start: +start.toFixed(1), fokus: 0.5, rezim: "rozmazane", zoom: 1, zvuk: 0.25 },
      extra: [], hlas: null, titulky: [], titulkyRucne: false,
    };
    // ve fire stylu druhý rychlý střih o kus dál ve stejném videu
    if (i > 0 && start + 8 < delkaVidea) s.extra.push({ klipId: k.id, start: +(start + 4).toFixed(1), fokus: 0.5, rezim: "rozmazane", zoom: 1.08, zvuk: 0 });
    s.titulky = R.autoTitulky(s.text);
    return s;
  });
  p.scenar = { hooky: [{ text: p.sceny[0].text, sila: 0 }], hook: 0, cta: "",
    popisek: r.popisek || "", hashtagy: AI()?.cisteHashtagy ? AI().cisteHashtagy(r.hashtagy || []) : (r.hashtagy || []), nejiste: [] };
  ulozPozdeji();
  window.DHShell?.jdi("reels");
  vykresliVse();
  prepniKrok("scenar");
  obnovNahled();
  zprava("#rScenarZprava", `Upoutávka je připravená ✓ ${p.sceny.length} scén ze záběrů tvého videa${premiera ? `, na konci „${premiera.kratce}“` : ""}. Uprav texty, pak <b>Hlas</b> → <b>Export</b>.`, "ok");
  return p;
}

window.DHReels = { otevri, zUpoutavky, kdyPremiera, get projekt() { return p; } };
init();
})();
