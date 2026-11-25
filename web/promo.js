// Promo hráče – grafika na sdílení: oblíbený (i historický) hokejista ze skutečné fotky.
// Šablony ve stylu oficiálních grafik NHL (Milník s obřím číslem, Rekord klubu se žebříčkem, Narozeniny,
// Titulek) a klidné tribute šablony (Ikona, Plakát, Vertikál, Karta). Texty se skládají podle změřené výšky.
(() => {
"use strict";

const $ = (q, el = document) => el.querySelector(q);
const $$ = (q, el = document) => [...el.querySelectorAll(q)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const AI = () => window.DHAI;
const G = () => window.DHG;
const U = () => window.DHYtUloziste;
const toast = (t, d = "ok") => window.DHToast?.(t, d);

const KLIC = "dhpf_promo";
const W = 1080;
const FORMATY = { "4x5": { nazev: "Post 4:5", h: 1350 }, "1x1": { nazev: "Čtverec 1:1", h: 1080 }, "9x16": { nazev: "Story 9:16", h: 1920 } };
const SABLONY = {
  milnik: { nazev: "Milník", popis: "obří číslo za hráčem (NHL styl)", nhl: true },
  rekord: { nazev: "Rekord", popis: "rekord klubu + žebříček", nhl: true },
  narozeniny: { nazev: "Narozeniny", popis: "velké jméno, dva výřezy", nhl: true },
  titulek: { nazev: "Titulek", popis: "velký nápis přes fotku", nhl: true },
  ikona: { nazev: "Ikona", popis: "hráč před obřím jménem, barvy týmu" },
  plakat: { nazev: "Plakát", popis: "duotón v rámu, jméno dole" },
  vertikal: { nazev: "Vertikál", popis: "fotka + svislé jméno v barvě týmu" },
  karta: { nazev: "Karta", popis: "sběratelská kartička" },
};
const P_JMENO = '"Anton", "Oswald", Impact, sans-serif';
const P_TEXT = '"Inter", "Helvetica Neue", Arial, sans-serif';
const P_UZKE = '"Roboto Condensed", "Oswald", Arial, sans-serif';

const prazdna = () => ({
  verze: 2, jmeno: "", sablona: "ikona", format: "4x5", logo: true, cb: false, barva: "#c8102e", barva2: "#ffffff", vyrezZap: true,
  data: { krestni: "", prijmeni: "", nahore: "", roky: "", veta: "", popisek: "", hashtagy: [], zdroje: [],
    dres: "", cislo: "", co: "", dole: "", nadpis: "", stitek: "", tabulka: "", narozen: "", zemrel: false, nadpisTitulek: "", podnadpis: "" },
  fotoId: null, vyrezId: null, kredit: "", foto: { zoom: 1, x: 0, y: 0 },
  foto2Id: null, vyrez2Id: null, kredit2: "", vylepsit: true, zare: true,
});
let st = prazdna();
try {
  const ulozeny = JSON.parse(localStorage.getItem(KLIC) || "{}");
  // starší verze (s čísly a výřezem) – zachovat jen jméno a fotku
  if (ulozeny.sablona && !Object.keys(SABLONY).includes(ulozeny.sablona)) ulozeny.sablona = "ikona";
  st = ulozeny.verze === 2 ? { ...prazdna(), ...ulozeny, data: { ...prazdna().data, ...(ulozeny.data || {}) } } : { ...prazdna(), jmeno: ulozeny.jmeno || "", fotoId: ulozeny.fotoId || null, kredit: ulozeny.kredit || "" };
} catch { /* nic */ }
const uloz = () => { try { localStorage.setItem(KLIC, JSON.stringify(st)); } catch { /* nic */ } };

let foto = null;  // HTMLImageElement
let vyrez = null; // canvas – hráč bez pozadí
let foto2 = null, vyrez2 = null; // druhá (akční) fotka – nepovinná
let vyrezSurovy = null, vyrez2Surovy = null; // výřezy bez vylepšení (vylepšení jde vypnout)
const VYREZ_VERZE = "ormbg-2"; // přesný model + dočištění masky; starší výřezy se přepočítají
let kandidati = []; // nalezené fotky seřazené podle kvality

// ------------------------------------------------------- vylepšení výřezu --
// Čisté okraje (bez šedého lemu), automatické úrovně, sytost a doostření – hlavně pro malé fotky z Commons.
function pripravVyrez(zdroj) {
  if (!zdroj) return null;
  if (st.vylepsit === false) return zdroj;
  const w = zdroj.width, h = zdroj.height;
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const x = c.getContext("2d", { willReadFrequently: true });
  x.drawImage(zdroj, 0, 0);
  const id = x.getImageData(0, 0, w, h), d = id.data;
  // histogram jasu postavy → 2. a 98. percentil
  const hist = new Uint32Array(256); let n = 0;
  for (let i = 0; i < d.length; i += 16) if (d[i + 3] > 160) { hist[(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) | 0]++; n++; }
  let lo = 0, hi = 255, acc = 0;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= n * 0.02) { lo = v; break; } }
  acc = 0;
  for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc >= n * 0.02) { hi = v; break; } }
  const roz = Math.max(60, hi - lo), k = 0.65; // jen část korekce, ať to nevypadá přepáleně
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3];
    // okraj: tvrdší náběh alfy = bez šedého lemu z pozadí
    d[i + 3] = Math.max(0, Math.min(255, ((a - 28) * 255) / 200));
    if (!a) continue;
    let r = d[i], g = d[i + 1], b = d[i + 2];
    const r2 = ((r - lo) * 255) / roz, g2 = ((g - lo) * 255) / roz, b2 = ((b - lo) * 255) / roz;
    r = r + (r2 - r) * k; g = g + (g2 - g) * k; b = b + (b2 - b) * k;
    const l = 0.299 * r + 0.587 * g + 0.114 * b, sat = 1.1;
    d[i] = l + (r - l) * sat; d[i + 1] = l + (g - l) * sat; d[i + 2] = l + (b - l) * sat;
  }
  // doostření (unsharp 3×3), silnější u malých fotek
  const sila = w < 900 ? 0.45 : 0.25;
  const src = new Uint8ClampedArray(d);
  for (let y = 1; y < h - 1; y++) {
    for (let xx = 1; xx < w - 1; xx++) {
      const i = (y * w + xx) * 4;
      if (src[i + 3] < 20) continue;
      for (let ch = 0; ch < 3; ch++) {
        const st0 = src[i + ch];
        const okoli = (src[i + ch - 4] + src[i + ch + 4] + src[i + ch - w * 4] + src[i + ch + w * 4]) / 4;
        d[i + ch] = st0 + (st0 - okoli) * sila * 2;
      }
    }
  }
  x.putImageData(id, 0, 0);
  return c;
}
const silCache = new WeakMap();
// silueta výřezu v jedné barvě (pro záři za hráčem)
function silueta(zdroj, barva) {
  let m = silCache.get(zdroj);
  if (!m) { m = new Map(); silCache.set(zdroj, m); }
  if (!m.has(barva)) {
    const c = document.createElement("canvas"); c.width = zdroj.width; c.height = zdroj.height;
    const x = c.getContext("2d"); x.drawImage(zdroj, 0, 0); x.globalCompositeOperation = "source-in"; x.fillStyle = barva; x.fillRect(0, 0, c.width, c.height);
    m.set(barva, c);
  }
  return m.get(barva);
}
const vyska = () => FORMATY[st.format]?.h || 1350;

// ------------------------------------------------------------------ AI --

async function navrhni(prilezitost = null) {
  const jmeno = $("#prJmeno").value.trim();
  if (!jmeno) { zprava("Napiš jméno hráče.", "chyba"); return; }
  st.jmeno = jmeno; uloz();
  if (!AI()?.maKlic()) { predvyplnRucne(jmeno); zprava("Bez AI klíče doplň tým, roky a větu ručně níž (AI klíč: Můj styl → AI pomocník).", "varovani"); if (!foto) najdiFoto(true, jmeno); return; }
  const b = $("#prNavrhni"); b.disabled = true;
  zprava("AI hledá na webu, za jaký tým a v jakých letech hrál… (15–40 s)");
  try {
    const r = await AI().hledatNaWebu({
      casovyLimit: 60000,
      system: `Jsi editor českého hokejového Instagramu „Deník hokeje“. Děláš grafiky oblíbených hokejistů (i historických) ve stylu
oficiálních grafik NHL: milník s obřím číslem, rekord klubu, narozeniny, tribute. Fanoušci je sdílí.
Fakta (tým, roky, čísla, data, žebříčky) ber JEN z výsledků hledání; když si nejsi jistý, nech pole prázdné. Nic nevymýšlej ani nezaokrouhluj.`,
      zadani: `Hráč: ${jmeno}${prilezitost ? `
PŘÍLEŽITOST, kvůli které grafiku děláme: ${prilezitost.typ} – ${prilezitost.proc} (${prilezitost.kdy || ""}; ${prilezitost.fakt || ""}).
Podle ní vyplň hlavně odpovídající část (milnik / rekord / narozen / titulek) – ale jen tím, co potvrdí zdroje.` : ""}

Vrať POUZE JSON:
{
 "krestni": "křestní jméno s diakritikou",
 "prijmeni": "příjmení",
 "tym": "tým, se kterým je nejvíc spojený (oficiální název)",
 "roky": "roky jeho kariéry v NHL (nebo celé kariéry), formát 1989–2011; jinak prázdné",
 "barva": "#hex hlavní barva toho týmu (tmavší, ať je čitelná)",
 "barva2": "#hex druhá (akcentní) barva toho týmu",
 "veta": "JEDNA krátká věta česky (max 9 slov), proč ho lidi milovali – jeho styl, charakter nebo ikonický moment. Bez čísel, bez klišé typu ‚legenda neumírá‘. Např. ‚Elegance, kterou si Dallas pamatuje dodnes.‘",
 "popisek": "popisek pod post česky ve stylu účtu: začni ‚Jméno. Definující věta.‘ (např. ‚Mike Modano. Hráč, který naučil Texas milovat hokej.‘ – nikdy číslem ani datem), pak 1–2 krátké odstavce s kontextem příležitosti (milník / narozeniny / rekord / co ho dělalo výjimečným), na konci jedna věta ke sdílení bez emoji (např. ‚Pošli to někomu, kdo ho taky pamatuje.‘). Žádná otázka, žádné emoji.",
 "hashtagy": ["#denikhokeje", "…3–4 další relevantní"],
 "foto_dotaz": "anglický dotaz na Wikimedia Commons pro jeho fotku (celé jméno + tým), bez diakritiky",
 "dres": "číslo dresu, se kterým je nejvíc spojený (jen číslo), jinak prázdné",
 "milnik": {"cislo": "nejvýraznější KULATÉ nebo rekordní číslo jeho kariéry (např. 1921, 600, 1000) – jen číslice", "co": "co to číslo je, česky, krátce VERZÁLKAMI, 1–3 slova, např. ‚BODŮ V NHL‘, ‚ZÁPASŮ‘, ‚VÝHER‘, ‚GÓLŮ ZA KLUB‘", "kontext": "1 krátký řádek česky, proč je to výjimečné (např. ‚Nejvíc ze všech Evropanů v historii NHL‘)"},
 "rekord": {"stitek": "např. ‚REKORD KLUBU‘ nebo ‚REKORD NHL‘", "nadpis": "2–3 slova VERZÁLKAMI, co drží, např. ‚NEJVÍC ZÁPASŮ‘", "kde": "tým nebo soutěž, ke které se rekord vztahuje", "tabulka": [{"jmeno": "Příjmení J.", "hodnota": "číslo"}] },
 "narozen": "datum narození RRRR-MM-DD",
 "zemrel": false,
 "titulek": {"nadpis": "2–4 slova VERZÁLKAMI na velký titulek o něm (přezdívka, ikonický moment), např. ‚MUŽ ZE ŽELEZA‘", "podnadpis": "1 krátký řádek česky"}
}
Do "rekord.tabulka" dej 3–5 nejlepších v tom rekordu (včetně něj), seřazené – jen když to najdeš ve zdrojích, jinak [].`,
    });
    const d = AI().jsonZTextu(r.text);
    const krestni = d.krestni || jmeno.split(/\s+/).slice(0, -1).join(" ");
    const prijmeni = d.prijmeni || jmeno.split(/\s+/).pop();
    st.data = {
      krestni, prijmeni,
      nahore: d.tym ? String(d.tym).toUpperCase() : "",
      roky: d.roky || "",
      veta: d.veta || "",
      popisek: d.popisek || "",
      hashtagy: AI().cisteHashtagy ? AI().cisteHashtagy(d.hashtagy || []) : (d.hashtagy || []),
      zdroje: (r.zdroje || []).slice(0, 6),
      dres: String(d.dres || "").replace(/[^0-9]/g, ""),
      cislo: String(d.milnik?.cislo || "").replace(/[^0-9]/g, ""),
      co: String(d.milnik?.co || "").toUpperCase(),
      dole: d.milnik?.kontext || "",
      stitek: String(d.rekord?.stitek || "").toUpperCase(),
      nadpis: String(d.rekord?.nadpis || d.titulek?.nadpis || "").toUpperCase(),
      nadpisTitulek: String(d.titulek?.nadpis || "").toUpperCase(),
      podnadpis: d.titulek?.podnadpis || "",
      tabulka: (Array.isArray(d.rekord?.tabulka) ? d.rekord.tabulka : []).filter((x) => x?.jmeno).slice(0, 5).map((x) => `${x.jmeno} | ${x.hodnota ?? ""}`).join("\n"),
      narozen: /^\d{4}-\d{2}-\d{2}$/.test(d.narozen || "") ? d.narozen : "",
      zemrel: !!d.zemrel,
    };
    if (/^#[0-9a-f]{6}$/i.test(d.barva || "")) st.barva = d.barva;
    if (/^#[0-9a-f]{6}$/i.test(d.barva2 || "")) st.barva2 = d.barva2;
    uloz();
    vykresliFormular();
    vykresli();
    if (prilezitost && SABLONY[TYP_SABLONA[prilezitost.typ]]) st.sablona = TYP_SABLONA[prilezitost.typ];
    if (prilezitost?.typ === "narozeniny" && !st.data.narozen) st.sablona = "ikona";
    uloz(); vykresliFormular(); vykresli();
    zprava(`Hotovo ✓ Zkontroluj údaje (zdroje jsou pod texty).${foto ? "" : " Teď vyber fotku."}`, "ok");
    if (!foto) najdiFoto(true, d.foto_dotaz || `${krestni} ${prijmeni}`);
  } catch (e) { zprava(esc(e.message), "chyba"); predvyplnRucne(jmeno); }
  finally { b.disabled = false; }
}

function predvyplnRucne(jmeno) {
  const casti = jmeno.split(/\s+/);
  if (!st.data.prijmeni) { st.data.prijmeni = casti.pop() || ""; st.data.krestni = casti.join(" "); }
  uloz(); vykresliFormular(); vykresli();
}


// -------------------------------------------------- 🎲 návrhy hráčů a událostí --
// AI sama najde, koho a proč udělat: narozeniny tento týden, čerstvé milníky, výročí rekordů a událostí,
// oblíbené legendy. Každý návrh ověří druhým hledáním; jedním klikem z něj vznikne hotová grafika.
const KLIC_NAVRHY = "dhpf_promo_navrhy", KLIC_NAVRHY_HIST = "dhpf_promo_navrhy_hist", KLIC_NAVRHY_AUTO = "dhpf_promo_navrhy_auto";
const TYP_SABLONA = { narozeniny: "narozeniny", milnik: "milnik", rekord: "rekord", vyroci: "titulek", titulek: "titulek", tribute: "ikona" };
const TYP_POPIS = { narozeniny: "🎂 Narozeniny", milnik: "🏁 Milník", rekord: "🏆 Rekord", vyroci: "📅 Výročí", titulek: "📅 Výročí", tribute: "❤️ Tribute" };
const UHLY_LEGEND = ["brankáři 90. let", "čeští útočníci v NHL 2000–2010", "obránci, kteří psali historii", "hráči Nagana 1998", "slovenské legendy NHL",
  "kanadské ikony 80. let", "švédští a finští hráči NHL", "kapitáni, kteří zvedli Stanley Cup", "hráči extraligy 90. let", "legendy MS 70. a 80. let",
  "zapomenuté hvězdy NHL", "rváči a tvrdí obránci", "hokejoví otcové a synové", "hvězdy KHL"];
let navrhyBezi = false;
const KOHO = {
  mix: "Hráči: mix českých a slovenských hráčů a světových legend NHL.",
  cz: "Hráči: jen čeští a slovenští hráči (NHL, reprezentace, extraliga – současní i legendy).",
  legendy: "Hráči: jen legendy NHL, které už nehrají (Gretzky, Lemieux, Modano, Shanahan, Hašek, Jágr…).",
  hvezdy: "Hráči: jen současné hvězdy NHL (aktivní hráči).",
  extraliga: "Hráči: hráči a legendy české extraligy.",
};
const nactiJson = (k, v) => { try { return JSON.parse(localStorage.getItem(k)) ?? v; } catch { return v; } };
const ulozJson = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* nic */ } };

function navrhyZprava(t, druh = "") {
  const el = $("#prNavrhyZprava");
  if (!el) return;
  el.innerHTML = t; el.className = `zprava ${druh}`; el.hidden = !t;
}

function vykresliNavrhy() {
  const el = $("#prNavrhy");
  if (!el) return;
  const { seznam = [], cas = 0 } = nactiJson(KLIC_NAVRHY, {});
  el.innerHTML = seznam.length ? seznam.map((n, i) => `
    <div class="pr-navrh${n.pouzito ? " pouzito" : ""}">
      <div class="pr-navrh-info">
        <span class="pr-navrh-typ">${esc(TYP_POPIS[n.typ] || n.typ)}${n.kdy ? ` · ${esc(n.kdy)}` : ""} · ${n.kontrola === "overeno" ? "✅ ověřeno" : "⚠️ ověř ručně"}</span>
        <b>${esc(n.jmeno)}</b>
        <small>${esc(n.proc || "")}${n.problem ? ` <em class="muted">(${esc(n.problem)})</em>` : ""}</small>
      </div>
      <button type="button" class="btn small${n.pouzito ? " ghost" : ""}" data-pr-navrh="${i}">${n.pouzito ? "↻ Znovu" : "✨ Vytvořit grafiku"}</button>
    </div>`).join("") + `<p class="muted" style="font-size:12px;margin:8px 0 0">Navrženo ${new Date(cas).toLocaleString("cs-CZ", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" })}</p>` : "";
}

async function navrhniHrace({ auto = false } = {}) {
  if (navrhyBezi) return;
  if (!AI()?.maKlic()) { if (!auto) navrhyZprava('Potřebuje AI klíč (Claude nebo Gemini). <a href="#" data-jdi-na-ai>Nastavit klíč</a>', "chyba"); return; }
  navrhyBezi = true;
  const b = $("#prNavrhyBtn");
  if (b) { b.disabled = true; b.textContent = "🎲 Hledám…"; }
  const start = Date.now();
  const odpocet = setInterval(() => navrhyZprava(`AI hledá, koho a proč teď udělat (narozeniny, milníky, výročí, legendy)… ${Math.round((Date.now() - start) / 1000)} s`), 1000);
  try {
    const hist = nactiJson(KLIC_NAVRHY_HIST, []);
    const uhel = UHLY_LEGEND[Math.floor(Math.random() * UHLY_LEGEND.length)];
    const r = await AI().hledatNaWebu({
      casovyLimit: 90000,
      system: `Jsi editor českého hokejového Instagramu „Deník hokeje“. Hledáš příležitosti na grafiku hráče, kterou fanoušci sdílí:
narozeniny známých hráčů, čerstvé kulaté milníky, výročí rekordů a slavných událostí, oblíbené legendy. Dnešní datum: ${AI().dnes()}.
Data, čísla a jména ber JEN z výsledků hledání. Co nemáš potvrzené, nenavrhuj.`,
      zadani: `Najdi 8 příležitostí, pestrý mix. ${KOHO[$("#prKoho")?.value] || KOHO.mix}
Navrhuj jen hráče, které fanoušci opravdu znají a mají rádi (velká fanouškovská základna, ikonické momenty) – žádné neznámé jméno jen kvůli datu.
- 2× NAROZENINY: známí hráči (čeští a slovenští hráči, legendy NHL), kteří mají narozeniny DNES nebo v příštích 7 dnech – i ti, co už nežijí (nedožité narozeniny). Uveď přesné datum narození.
- 1–2× MILNÍK: hráč, který v posledních 14 dnech dosáhl kulatého milníku (zápasy, body, góly, výhry, nuly) – nejlépe Čech nebo Slovák v NHL/KHL/extralize.
- 1× VÝROČÍ: slavný rekord nebo událost s hráčem, která má výročí tento týden (ideálně kulaté).
- 1× TRIBUTE: oblíbená legenda – tentokrát z okruhu „${uhel}“.
${hist.length ? `Tyto hráče už jsme nedávno navrhovali, NENAVRHUJ je: ${hist.slice(0, 50).join(", ")}.` : ""}

Odpověz POUZE řádky JSON Lines – každý návrh jeden řádek s jedním objektem, žádný jiný text:
{"jmeno": "celé jméno hráče s diakritikou", "typ": "narozeniny" | "milnik" | "vyroci" | "tribute", "proc": "1 krátká věta česky, proč právě teď", "kdy": "datum události (D. M. RRRR) nebo prázdné", "fakt": "klíčové ověřitelné tvrzení s čísly a daty (např. ‚Jaromír Jágr se narodil 15. 2. 1972‘)", "popularita": 1–10 (jak moc ho fanoušci znají a sdílí)}`,
    });
    let seznam = AI().objektyZTextu(r.text).filter((n) => n?.jmeno && n?.typ).slice(0, 8);
    if (!seznam.length) { navrhyZprava("AI tentokrát nic nenašla, zkus to znovu.", "varovani"); return; }
    clearInterval(odpocet);
    navrhyZprava(`Našel jsem ${seznam.length} návrhů, ověřuji je druhým hledáním…`);
    try {
      const k = await AI().hledatNaWebu({
        casovyLimit: 60000,
        system: `Jsi přísný fact-checker hokejové redakce. Nezávisle ověř tvrzení vyhledáváním. Dnešní datum: ${AI().dnes()}.
"overeno" jen když sedí jména, data i čísla. Když cokoliv nesedí, je to "rozpor" a napiš, jak je to správně.`,
        zadani: `Ověř:\n${JSON.stringify(seznam.map((n, id) => ({ id, jmeno: n.jmeno, typ: n.typ, kdy: n.kdy, fakt: n.fakt })), null, 1)}

Odpověz POUZE blokem \`\`\`json s polem: [{"id": 0, "stav": "overeno" | "rozpor" | "nejiste", "problem": "co nesedí / co se nepodařilo potvrdit, jinak prázdné"}]`,
      });
      const v = AI().jsonZTextu(k.text);
      (Array.isArray(v) ? v : []).forEach((x) => { const n = seznam[Number(x.id)]; if (n) { n.kontrola = x.stav; n.problem = x.problem || ""; } });
    } catch { seznam.forEach((n) => { n.kontrola = n.kontrola || "nejiste"; }); }
    const vsech = seznam.length;
    seznam = seznam.filter((n) => n.kontrola !== "rozpor");
    seznam.forEach((n) => { if (n.kontrola !== "overeno") { n.kontrola = "nejiste"; } });
    seznam.sort((a, b2) => (a.kontrola === "overeno" ? 0 : 1) - (b2.kontrola === "overeno" ? 0 : 1) || (+b2.popularita || 0) - (+a.popularita || 0));
    ulozJson(KLIC_NAVRHY, { seznam, cas: Date.now() });
    ulozJson(KLIC_NAVRHY_HIST, [...new Set([...seznam.map((n) => n.jmeno), ...hist])].slice(0, 80));
    try { localStorage.setItem(`${KLIC_NAVRHY_AUTO}_posledni`, AI().dnes()); } catch { /* nic */ }
    vykresliNavrhy();
    const ok = seznam.filter((n) => n.kontrola === "overeno").length;
    navrhyZprava(`Hotovo ✓ ${seznam.length} ${seznam.length === 1 ? "návrh" : seznam.length < 5 ? "návrhy" : "návrhů"} (${ok} ověřených${vsech > seznam.length ? `, ${vsech - seznam.length} s rozporem vyřazeno` : ""}). Klikni na <b>✨ Vytvořit grafiku</b> – AI doplní údaje, vybere šablonu a najde fotku.`, "ok");
    if (auto) toast(`🎲 Promo hráče: ${seznam.length} ${seznam.length < 5 ? "nové návrhy" : "nových návrhů"} (narozeniny, milníky, výročí).`);
  } catch (e) { navrhyZprava(esc(e.message), "chyba"); }
  finally {
    clearInterval(odpocet);
    navrhyBezi = false;
    if (b) { b.disabled = false; b.textContent = "🎲 Navrhni hráče a události"; }
  }
}

async function pouzijNavrh(i) {
  const data = nactiJson(KLIC_NAVRHY, {});
  const n = data.seznam?.[i];
  if (!n) return;
  st = { ...prazdna(), format: st.format, logo: st.logo, cb: n.typ === "tribute" || n.typ === "vyroci" ? st.cb : false };
  foto = null; vyrez = null; foto2 = null; vyrez2 = null; vyrezSurovy = null; vyrez2Surovy = null; kandidati = []; vykresliKandidaty();
  st.jmeno = n.jmeno; st.sablona = TYP_SABLONA[n.typ] || "ikona";
  $("#prJmeno").value = n.jmeno;
  uloz(); vykresliFormular(); vykresli();
  n.pouzito = true; ulozJson(KLIC_NAVRHY, data); vykresliNavrhy();
  $("#prJmeno").scrollIntoView({ behavior: "smooth", block: "center" });
  await navrhni(n);
}

// ---------------------------------------------------------------- fotka --

async function nastavFoto(blob, kredit = "") {
  st.fotoId = await U().ulozObrazek(blob, { kredit, promo: true });
  st.kredit = kredit; st.foto = { zoom: 1, x: 0, y: 0 }; st.vyrezId = null;
  uloz();
  foto = await U().obrazekImg(st.fotoId);
  vyrez = null;
  vykresliFormular();
  vykresli();
  await vyrizni();
}

async function vyrizni() {
  if (!foto || !window.DHVyrez) return;
  zprava("✂️ Vyřezávám hráče z fotky přesným modelem… (poprvé se stáhne ~45 MB, pak 10–20 s)");
  try {
    const surovy = await window.DHVyrez.vyrizni(await U().obrazekBlob(st.fotoId), null, { presne: true });
    const blob = await new Promise((ok) => surovy.toBlob(ok, "image/png"));
    st.vyrezId = await U().ulozObrazek(blob, { promoVyrez: true });
    st.vyrezModel = VYREZ_VERZE;
    vyrezSurovy = surovy; vyrez = pripravVyrez(surovy);
    uloz();
    zprava("Hotovo ✓ Hráč je vyříznutý (přesný model – i s hokejkou). Táhnutím v náhledu ho posuneš, posuvníkem zvětšíš.", "ok");
  } catch (e) {
    vyrez = null;
    zprava(`Hráče se nepodařilo vyříznout (${esc(e.message)}) – šablony použijí celou fotku.`, "varovani");
  }
  vykresli();
}

// Druhá (akční) fotka – v NHL grafikách bývá hráč dvakrát: velký portrét + akční záběr.
async function nastavFoto2(blob, kredit = "") {
  st.foto2Id = await U().ulozObrazek(blob, { kredit, promo: true });
  st.kredit2 = kredit; st.vyrez2Id = null;
  uloz();
  foto2 = await U().obrazekImg(st.foto2Id);
  vyrez2 = null;
  vykresliFormular(); vykresli();
  if (!window.DHVyrez) return;
  zprava("✂️ Vyřezávám hráče z druhé fotky…");
  try {
    const surovy2 = await window.DHVyrez.vyrizni(await U().obrazekBlob(st.foto2Id), null, { presne: true });
    vyrez2Surovy = surovy2; vyrez2 = pripravVyrez(surovy2);
    const b = await new Promise((ok) => surovy2.toBlob(ok, "image/png"));
    st.vyrez2Id = await U().ulozObrazek(b, { promoVyrez: true });
    st.vyrez2Model = VYREZ_VERZE;
    uloz();
    vykresliFormular();
    zprava("Hotovo ✓ Druhá fotka je vyříznutá – v šablonách Milník, Rekord a Narozeniny je hráč dvakrát.", "ok");
  } catch (e) { vyrez2 = null; zprava(`Druhou fotku se nepodařilo vyříznout (${esc(e.message)}).`, "varovani"); }
  vykresli();
}
async function najdiFoto2() {
  const q = [st.data.krestni, st.data.prijmeni].filter(Boolean).join(" ") || st.jmeno;
  if (!q) { zprava("Nejdřív napiš jméno hráče.", "chyba"); return; }
  if (!kandidati.length) await hledejKandidaty();
  const dalsi = kandidati.findIndex((f) => f.url !== st.fotoUrl && f.url !== st.foto2Url);
  if (dalsi >= 0) { await pouzijKandidata(dalsi, true); return; }
  try {
    const v = await AI().vyberFoto(`${q} ice hockey action`);
    if (!v) return;
    const blob = await new Promise((ok) => { const c = document.createElement("canvas"); c.width = v.img.naturalWidth; c.height = v.img.naturalHeight; c.getContext("2d").drawImage(v.img, 0, 0); c.toBlob(ok, "image/jpeg", 0.94); });
    await nastavFoto2(blob, AI().kredit(v.foto));
  } catch (e) { zprava(esc(e.message), "chyba"); }
}

// Hledání fotek: víc dotazů najednou (jméno + tým, jméno + hokej, jméno), výsledky seřazené podle kvality:
// v názvu je příjmení hráče, vysoké rozlišení, na výšku, bez podpisů/karet/hrobů/soch. Nejlepší se použije hned,
// ostatní jsou v pásu pod tlačítky – kliknutím se přepne (bez dialogu).
const normT = (t) => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const ZLE_FOTKY = /(signature|signed|autograph|card|logo|grave|hrob|tomb|statue|socha|ticket|banner|poster|stamp|coin|map|plaque|mural|wax|figurine|bobblehead|draft day|press conference|conference|suit|award ceremony)/i;
async function hledejKandidaty(dotaz = "") {
  const jm = [st.data.krestni, st.data.prijmeni].filter(Boolean).join(" ") || st.jmeno || $("#prJmeno").value.trim();
  if (!jm && !dotaz) return [];
  const prijmeni = normT(st.data.prijmeni || jm.split(/\s+/).pop());
  const tym = (st.data.nahore || "").toLowerCase();
  const bez = normT(jm);
  const dotazy = [...new Set([dotaz, tym ? `${bez} ${tym}` : "", `${bez} ice hockey`, bez].filter(Boolean))];
  const vse = new Map();
  for (const q of dotazy) {
    try { for (const f of await AI().hledejFotky(q, 20)) if (!vse.has(f.url)) vse.set(f.url, f); } catch { /* další dotaz */ }
    if (vse.size >= 40) break;
  }
  kandidati = [...vse.values()].map((f) => {
    const n = normT(`${f.nazev}`);
    let sk = 0;
    if (prijmeni && n.includes(prijmeni)) sk += 50; else sk -= 40;
    if (ZLE_FOTKY.test(n)) sk -= 35;
    if (tym && tym.split(/\s+/).some((w) => w.length > 3 && n.includes(normT(w)))) sk += 10;
    if (/(hockey|game|vs\.?|match|nhl|iihf|extraliga|playoff)/i.test(n)) sk += 8;
    const sir = f.sirka || 0, vys = f.vyska || 0;
    if (sir && vys) { sk += Math.min(16, Math.min(sir, vys) / 150); if (vys >= sir * 0.95) sk += 8; }
    return { ...f, skore: sk };
  }).sort((a, b) => b.skore - a.skore).slice(0, 14);
  vykresliKandidaty();
  return kandidati;
}
function vykresliKandidaty() {
  const el = $("#prFotky");
  if (!el) return;
  el.innerHTML = kandidati.length ? kandidati.map((f, i) => `
    <div class="pr-fotka${f.url === st.fotoUrl ? " on" : ""}${f.url === st.foto2Url ? " druha" : ""}" title="${esc(f.nazev)} · ${esc(f.autor)} (${esc(f.licence)})">
      <img src="${esc(f.nahled)}" alt="" loading="lazy" data-pr-fotka="${i}">
      <button type="button" data-pr-fotka2="${i}" title="Použít jako druhou (akční) fotku">+2</button>
    </div>`).join("") + `<button type="button" class="btn ghost small" id="prGalerie">Víc fotek…</button>` : "";
}
async function pouzijKandidata(i, druha = false) {
  const f = kandidati[i];
  if (!f) return;
  zprava(`Načítám fotku „${esc(f.nazev)}“…`);
  try {
    const img = await AI().nactiWebFoto(f.url);
    const blob = await new Promise((ok) => { const c = document.createElement("canvas"); c.width = img.naturalWidth; c.height = img.naturalHeight; c.getContext("2d").drawImage(img, 0, 0); c.toBlob(ok, "image/jpeg", 0.95); });
    if (druha) { st.foto2Url = f.url; await nastavFoto2(blob, AI().kredit(f)); }
    else { st.fotoUrl = f.url; await nastavFoto(blob, AI().kredit(f)); }
    vykresliKandidaty();
  } catch (e) { zprava(`Fotku se nepodařilo načíst (${esc(e.message)}) – zkus jinou z pásu.`, "chyba"); }
}

async function najdiFoto(tiche = false, dotaz = "") {
  try {
    zprava("🔍 Hledám nejlepší volně použitelné fotky…");
    const k = await hledejKandidaty(dotaz);
    if (k.length) { await pouzijKandidata(0); if (kandidati.length > 1) zprava("Vybral jsem nejlepší fotku ✓ Nesedí? Klikni na jinou v pásu pod tlačítky (+2 = druhá akční fotka).", "ok"); return; }
    if (!tiche) zprava("Žádnou vhodnou volnou fotku jsem nenašel – nahraj vlastní nebo zkus „Víc fotek…“.", "varovani");
  } catch (e) { if (!tiche) zprava(esc(e.message), "chyba"); }
}

async function najdiFotoGalerie(tiche = false, dotaz = "") {
  const q = dotaz || [st.data.krestni, st.data.prijmeni].filter(Boolean).join(" ") || st.jmeno || $("#prJmeno").value.trim();
  if (!q) return;
  try {
    const v = await AI().vyberFoto(/hockey/i.test(q) ? q : `${q} ice hockey`);
    if (!v) return;
    const blob = await new Promise((ok) => { const c = document.createElement("canvas"); c.width = v.img.naturalWidth; c.height = v.img.naturalHeight; c.getContext("2d").drawImage(v.img, 0, 0); c.toBlob(ok, "image/jpeg", 0.94); });
    await nastavFoto(blob, AI().kredit(v.foto));
  } catch (e) { if (!tiche) zprava(esc(e.message), "chyba"); }
}

// ------------------------------------------------------------- kreslení --

const hex = (h, a = 1) => { const n = parseInt(String(h).slice(1), 16) || 0; return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };
function jas(h) { const n = parseInt(String(h).slice(1), 16) || 0; return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; }
// akcent čitelný na tmavém pozadí (příliš tmavou týmovou barvu zesvětlí)
const akcent = () => (jas(st.barva) < 0.25 ? "#ffffff" : st.barva);

// animace pro MP4: anim = čas v s, jinak null
let anim = null;
const ease = (x) => 1 - Math.pow(1 - x, 3);
const vidim = (od, trvani = 0.6) => (anim == null ? 1 : ease(Math.max(0, Math.min(1, (anim - od) / trvani))));

let zrno = null;
function kresliZrno(ctx, w, h, sila) {
  if (!zrno) {
    zrno = document.createElement("canvas"); zrno.width = zrno.height = 256;
    const z = zrno.getContext("2d"), id = z.createImageData(256, 256);
    for (let i = 0; i < id.data.length; i += 4) { const v = Math.random() * 255; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255; }
    z.putImageData(id, 0, 0);
  }
  ctx.save(); ctx.globalAlpha = sila; ctx.globalCompositeOperation = "overlay";
  ctx.fillStyle = ctx.createPattern(zrno, "repeat"); ctx.fillRect(0, 0, w, h); ctx.restore();
}

// Fotka do obdélníku (cover) s posunem a přiblížením; ve videu pomalý nájezd kamery.
function kresliFoto(ctx, x, y, w, h, cb = false) {
  if (!foto) {
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, "#2a2a2e"); g.addColorStop(1, "#0b0b0d");
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = "rgba(255,255,255,0.35)"; ctx.font = `600 ${Math.round(w * 0.035)}px ${P_TEXT}`; ctx.textAlign = "center";
    ctx.fillText("sem přijde fotka hráče", x + w / 2, y + h * 0.42);
    return;
  }
  const iw = foto.naturalWidth, ih = foto.naturalHeight;
  const kamera = anim == null ? 1 : 1 + 0.07 * Math.min(1, anim / DELKA_ANIM);
  const m = Math.max(w / iw, h / ih) * (st.foto.zoom || 1) * kamera;
  const sw = w / m, sh = h / m;
  const fx = Math.min(1, Math.max(0, 0.5 + (st.foto.x || 0) / 2));
  const fy = Math.min(1, Math.max(0, 0.3 + (st.foto.y || 0) * 0.7));
  const sx = (iw - sw) * fx, sy = (ih - sh) * fy;
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.filter = cb ? "grayscale(1) contrast(1.12) brightness(0.96)" : "contrast(1.05) saturate(1.04)";
  ctx.drawImage(foto, Math.max(0, sx), Math.max(0, sy), Math.min(sw, iw), Math.min(sh, ih), x, y, w, h);
  ctx.filter = "none";
  if (cb) { ctx.fillStyle = "rgba(255,226,190,0.06)"; ctx.fillRect(x, y, w, h); }
  ctx.restore();
}

// zalomení textu do řádků (max šířka)
function zalom(ctx, text, max) {
  const out = []; let r = "";
  for (const w of String(text || "").split(/\s+/).filter(Boolean)) {
    const z = r ? `${r} ${w}` : w;
    if (r && ctx.measureText(z).width > max) { out.push(r); r = w; } else r = z;
  }
  if (r) out.push(r);
  return out;
}
// velikost písma, aby text (1 řádek) nepřesáhl šířku
function vejdeSe(ctx, text, font, max, sirka, min = 40) {
  let v = max;
  for (; v > min; v -= 2) { ctx.font = font(v); if (ctx.measureText(text).width <= sirka) break; }
  return v;
}
// text s mezerami mezi písmeny (Canvas letterSpacing)
function rozprostreny(ctx, text, x, y, mezery) {
  ctx.letterSpacing = `${mezery}px`;
  ctx.fillText(text, x, y);
  ctx.letterSpacing = "0px";
}
function logo(ctx, rezim, poloha) { if (st.logo) G().kresliLogo(ctx, rezim, poloha); }
const kickerText = () => [st.data.nahore, st.data.roky].filter(Boolean).join("  ·  ");

// pomocné barvy
function mix(h1, h2, t) {
  const a = parseInt(h1.slice(1), 16), b = parseInt(h2.slice(1), 16);
  const k = (x, y) => Math.round(x + (y - x) * t);
  const r = k((a >> 16) & 255, (b >> 16) & 255), g = k((a >> 8) & 255, (b >> 8) & 255), bl = k(a & 255, b & 255);
  return `#${((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1)}`;
}
const tmavsi = (h, t) => mix(h, "#000000", t);
const svetlejsi = (h, t) => mix(h, "#ffffff", t);
const maVyrez = () => !!(vyrez && st.vyrezZap !== false);

// Hráč (výřez) – velikost a poloha z posuvníků / tažení; ve videu jemný nájezd.
function polohaVyrezu(h, vyskaPodil, stredX = 0.5, spodek = 0) {
  const kamera = anim == null ? 1 : 1 + 0.05 * Math.min(1, anim / DELKA_ANIM);
  let vh = h * vyskaPodil * (st.foto.zoom || 1) * kamera;
  let vw = vh * (vyrez.width / vyrez.height);
  const maxSirka = W * (vyrez.width / vyrez.height > 0.8 ? 0.98 : 1.1) * (st.foto.zoom || 1);
  if (vw > maxSirka) { vw = maxSirka; vh = vw * (vyrez.height / vyrez.width); }
  const x = W * stredX - vw / 2 + (st.foto.x || 0) * W * 0.35;
  const y = h - vh - spodek + (st.foto.y || 0) * h * 0.25;
  return { x, y, w: vw, h: vh };
}
function duoton(zdroj, tmava, svetla) {
  const c = document.createElement("canvas"); c.width = zdroj.width; c.height = zdroj.height;
  const x = c.getContext("2d"); x.drawImage(zdroj, 0, 0);
  const id = x.getImageData(0, 0, c.width, c.height), d = id.data;
  const A = [1, 3, 5].map((i) => parseInt(tmava.slice(i, i + 2), 16)), B = [1, 3, 5].map((i) => parseInt(svetla.slice(i, i + 2), 16));
  for (let i = 0; i < d.length; i += 4) {
    let l = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
    l = Math.min(1, Math.max(0, (l - 0.08) * 1.25));
    d[i] = A[0] + (B[0] - A[0]) * l; d[i + 1] = A[1] + (B[1] - A[1]) * l; d[i + 2] = A[2] + (B[2] - A[2]) * l;
  }
  x.putImageData(id, 0, 0);
  return c;
}
let duotonCache = { klic: "", c: null };
function duotonVyrezu() {
  const klic = `${st.vyrezId}|${st.barva}`;
  if (duotonCache.klic !== klic) duotonCache = { klic, c: duoton(vyrez, tmavsi(st.barva, 0.82), "#f4f1ea") };
  return duotonCache.c;
}

// Spodní textový blok (na střed nebo vlevo), skládaný odspodu – vrací horní hranu bloku.
function textBlok(ctx, { spodek, zarovnani = "center", L = 76, maxJmeno = 120, barvaKicker = "rgba(255,255,255,0.8)" }) {
  const d = st.data;
  const x = zarovnani === "center" ? W / 2 : L;
  const sirka = W - 2 * L;
  ctx.textAlign = zarovnani; ctx.textBaseline = "alphabetic";
  let y = spodek;
  ctx.font = `500 34px ${P_TEXT}`;
  const vety = d.veta ? zalom(ctx, d.veta, sirka).slice(0, 2) : [];
  ctx.save(); ctx.globalAlpha = vidim(1.4); ctx.fillStyle = "rgba(255,255,255,0.88)";
  for (let i = vety.length - 1; i >= 0; i--) { ctx.fillText(vety[i], x, y); y -= 46; }
  ctx.restore();
  if (vety.length) y -= 20;
  const cele = [d.krestni, d.prijmeni].filter(Boolean).join(" ").toUpperCase();
  if (cele) {
    const v = vejdeSe(ctx, cele, (q) => `${q}px ${P_JMENO}`, maxJmeno, sirka);
    ctx.save(); ctx.globalAlpha = vidim(0.8); ctx.font = `${v}px ${P_JMENO}`; ctx.fillStyle = "#ffffff";
    ctx.fillText(cele, x, y); ctx.restore();
    y -= (ctx.measureText(cele).actualBoundingBoxAscent || v * 0.75) + 22;
  }
  const k = kickerText();
  if (k) {
    ctx.save(); ctx.globalAlpha = vidim(0.4);
    ctx.font = `700 26px ${P_UZKE}`; ctx.fillStyle = barvaKicker;
    rozprostreny(ctx, k.toUpperCase(), x, y, 5);
    ctx.restore();
    y -= 26;
  }
  ctx.textAlign = "left";
  return y;
}

// 1) IKONA – hráč (výřez) před obřím příjmením, pozadí v barvách týmu.
// Příjmení musí zůstat čitelné: hráč se zmenší tak, aby zakryl nanejvýš spodní okraj nápisu.
function sablonaIkona(ctx, h) {
  const d = st.data, c = paleta().bg;
  const bg = ctx.createRadialGradient(W / 2, h * 0.32, 20, W / 2, h * 0.45, h * 0.85);
  bg.addColorStop(0, svetlejsi(c, 0.18)); bg.addColorStop(0.45, c); bg.addColorStop(1, tmavsi(c, 0.7));
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, h);
  ctx.save(); ctx.translate(W * 0.2, 0); ctx.rotate(0.35);
  const pruh = ctx.createLinearGradient(-200, 0, 200, 0);
  pruh.addColorStop(0, "rgba(255,255,255,0)"); pruh.addColorStop(0.5, "rgba(255,255,255,0.07)"); pruh.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = pruh; ctx.fillRect(-200, -h, 400, h * 3); ctx.restore();
  const prijmeni = (d.prijmeni || "").toUpperCase();
  let obdelnik = null, yJ = 0, vJ = 0;
  if (prijmeni) {
    vJ = vejdeSe(ctx, prijmeni, (q) => `${q}px ${P_JMENO}`, h * 0.3, W * 0.94, 60);
    ctx.font = `${vJ}px ${P_JMENO}`;
    const m = ctx.measureText(prijmeni), asc = m.actualBoundingBoxAscent || vJ * 0.8;
    yJ = h * 0.12 + asc;
    obdelnik = { x: W / 2 - m.width / 2, y: yJ - asc, w: m.width, h: asc };
    ctx.save(); ctx.globalAlpha = vidim(0.1, 0.8); ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
    const svetle = jas(c) > 0.55;
    ctx.fillStyle = svetle ? "rgba(0,0,0,0.16)" : "rgba(255,255,255,0.24)"; ctx.fillText(prijmeni, W / 2, yJ);
    ctx.lineWidth = 3; ctx.strokeStyle = svetle ? "rgba(0,0,0,0.45)" : "rgba(255,255,255,0.6)"; ctx.strokeText(prijmeni, W / 2, yJ);
    ctx.restore();
  }
  if (maVyrez()) {
    // hráč smí zakrýt jen spodní čtvrtinu příjmení
    const cil = obdelnik ? [{ ...obdelnik, h: obdelnik.h * 0.75 }] : [];
    const vy = vyskaBezPrekryvu(h, vyrez, { stredX: 0.5, spodek: 0, hlavni: true }, cil, 0.84, 0.56, 0.06);
    kresliVyrez(ctx, h, vyrez, { stredX: 0.5, spodek: 0, vyska: vy, hlavni: true });
  } else {
    ctx.save(); ctx.globalAlpha = 0.9; kresliFoto(ctx, 0, h * 0.2, W, h * 0.8, st.cb); ctx.restore();
  }
  const g = ctx.createLinearGradient(0, h * 0.58, 0, h);
  g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(0.5, "rgba(0,0,0,0.72)"); g.addColorStop(1, "rgba(0,0,0,0.94)");
  ctx.fillStyle = g; ctx.fillRect(0, h * 0.58, W, h * 0.42);
  kresliZrno(ctx, W, h, 0.06);
  textBlok(ctx, { spodek: h - (h > 1500 ? 140 : 84), maxJmeno: 110 });
  ctx.fillStyle = st.barva2 && jas(st.barva2) > 0.15 ? st.barva2 : "#ffffff";
  ctx.fillRect(W / 2 - 40, h - 36, 80, 6);
  logo(ctx, "bila", { x: 56, y: 52, sirka: 130 });
}

// 2) PLAKÁT – tmavé pozadí, barevný rám s hráčem v duotónu (hlava přesahuje rám), jméno dole vlevo
function sablonaPlakat(ctx, h) {
  const d = st.data, c = st.barva;
  ctx.fillStyle = tmavsi(c, 0.86); ctx.fillRect(0, 0, W, h);
  const M = 70, ramY = h * 0.13, ramH = h * 0.56;
  ctx.fillStyle = c; ctx.fillRect(M, ramY, W - 2 * M, ramH);
  ctx.save(); ctx.globalAlpha = 0.25; ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 2; ctx.strokeRect(M + 18, ramY + 18, W - 2 * M - 36, ramH - 36); ctx.restore();
  const spodekRamu = h - (ramY + ramH);
  if (maVyrez()) {
    const r = polohaVyrezu(h, 0.66, 0.5, spodekRamu);
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, ramY + ramH); ctx.clip();
    ctx.shadowColor = "rgba(0,0,0,0.4)"; ctx.shadowBlur = 40; ctx.shadowOffsetY = 14;
    ctx.drawImage(st.cb ? vyrez : duotonVyrezu(), r.x, r.y, r.w, r.h);
    ctx.restore();
  } else {
    ctx.save(); ctx.beginPath(); ctx.rect(M, ramY, W - 2 * M, ramH); ctx.clip();
    kresliFoto(ctx, M, ramY, W - 2 * M, ramH, true);
    ctx.globalCompositeOperation = "multiply"; ctx.fillStyle = c; ctx.fillRect(M, ramY, W - 2 * M, ramH);
    ctx.restore();
  }
  // text pod rámem (shora dolů, měřeno)
  const L = M;
  let y = ramY + ramH + 54;
  ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  const asc = (t) => ctx.measureText(t).actualBoundingBoxAscent || 0;
  if (d.krestni) {
    ctx.font = `700 32px ${P_TEXT}`; const t = d.krestni.toUpperCase(); y += asc(t);
    ctx.save(); ctx.globalAlpha = vidim(0.3); ctx.fillStyle = svetlejsi(c, 0.55); rozprostreny(ctx, t, L, y, 10); ctx.restore();
    y += 16;
  }
  const prijmeni = (d.prijmeni || "").toUpperCase();
  if (prijmeni) {
    const zbyva = h - y - 150;
    let v = vejdeSe(ctx, prijmeni, (q) => `${q}px ${P_JMENO}`, h > 1500 ? 230 : 180, W - 2 * L);
    ctx.font = `${v}px ${P_JMENO}`;
    while (v > 60 && asc(prijmeni) > zbyva) { v -= 4; ctx.font = `${v}px ${P_JMENO}`; }
    y += asc(prijmeni);
    ctx.save(); ctx.globalAlpha = vidim(0.6); ctx.fillStyle = "#ffffff"; ctx.fillText(prijmeni, L - 4, y); ctx.restore();
    y += 22;
  }
  const k = kickerText();
  if (k) {
    ctx.font = `700 26px ${P_UZKE}`; y += asc(k);
    ctx.save(); ctx.globalAlpha = vidim(0.9); ctx.fillStyle = "rgba(255,255,255,0.7)"; rozprostreny(ctx, k.toUpperCase(), L, y, 5); ctx.restore();
    y += 18;
  }
  if (d.veta) {
    ctx.font = `500 30px ${P_TEXT}`;
    const vety = zalom(ctx, d.veta, W - 2 * L).slice(0, 2);
    y += asc(vety[0] || "A") + 6;
    ctx.save(); ctx.globalAlpha = vidim(1.3); ctx.fillStyle = "rgba(255,255,255,0.85)";
    vety.forEach((r, i) => { if (y + i * 40 < h - 30) ctx.fillText(r, L, y + i * 40); }); ctx.restore();
  }
  kresliZrno(ctx, W, h, 0.07);
  logo(ctx, "bila", { x: M, y: Math.max(24, ramY - 92), sirka: 120 });
}

// 3) VERTIKÁL – fotka vlevo (černobílá), vpravo sloupec v barvě týmu se svislým jménem
function sablonaVertikal(ctx, h) {
  const d = st.data, c = st.barva;
  const sloupec = W * 0.34, fotoW = W - sloupec;
  kresliFoto(ctx, 0, 0, fotoW + 60, h, true);
  ctx.fillStyle = c; ctx.fillRect(fotoW, 0, sloupec, h);
  const g = ctx.createLinearGradient(fotoW - 160, 0, fotoW, 0);
  g.addColorStop(0, hex(c, 0)); g.addColorStop(1, hex(c, 1));
  ctx.fillStyle = g; ctx.fillRect(fotoW - 160, 0, 160, h);
  // svislé jméno (zdola nahoru)
  const prijmeni = (d.prijmeni || "").toUpperCase();
  ctx.save();
  ctx.translate(fotoW + sloupec * 0.5, h * 0.5); ctx.rotate(-Math.PI / 2);
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  if (prijmeni) {
    const v = vejdeSe(ctx, prijmeni, (q) => `${q}px ${P_JMENO}`, sloupec * 0.86, h * 0.86, 60);
    ctx.globalAlpha = vidim(0.4); ctx.font = `${v}px ${P_JMENO}`; ctx.fillStyle = "#ffffff";
    ctx.fillText(prijmeni, 0, sloupec * 0.06);
  }
  ctx.restore();
  // dole vlevo přes fotku: křestní, kicker, věta
  const gb = ctx.createLinearGradient(0, h * 0.6, 0, h);
  gb.addColorStop(0, "rgba(0,0,0,0)"); gb.addColorStop(1, "rgba(0,0,0,0.85)");
  ctx.fillStyle = gb; ctx.fillRect(0, h * 0.6, fotoW, h * 0.4);
  const L = 60, sirka = fotoW - L - 40;
  ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  let y = h - (h > 1500 ? 130 : 76);
  ctx.font = `500 32px ${P_TEXT}`;
  const vety = d.veta ? zalom(ctx, d.veta, sirka).slice(0, 3) : [];
  ctx.save(); ctx.globalAlpha = vidim(1.3); ctx.fillStyle = "rgba(255,255,255,0.9)";
  for (let i = vety.length - 1; i >= 0; i--) { ctx.fillText(vety[i], L, y); y -= 44; }
  ctx.restore();
  if (vety.length) y -= 18;
  const k = kickerText();
  if (k) {
    ctx.save(); ctx.globalAlpha = vidim(0.9); ctx.font = `700 24px ${P_UZKE}`; ctx.fillStyle = "rgba(255,255,255,0.75)";
    zalom(ctx, k.toUpperCase(), sirka).slice(0, 2).reverse().forEach((r) => { rozprostreny(ctx, r, L, y, 4); y -= 34; });
    ctx.restore();
    y -= 8;
  }
  if (d.krestni) {
    ctx.save(); ctx.globalAlpha = vidim(0.6); ctx.font = `700 44px ${P_TEXT}`; ctx.fillStyle = "#ffffff";
    rozprostreny(ctx, d.krestni.toUpperCase(), L, y, 10); ctx.restore();
  }
  ctx.fillStyle = "#ffffff"; ctx.fillRect(L, h - 40, 60, 5);
  kresliZrno(ctx, W, h, 0.05);
  logo(ctx, "bila", { x: 48, y: 46, sirka: 120 });
}

// 3) KARTA – fotka v rámečku na krémovém papíře, jméno pod ní (sběratelská kartička)
function sablonaKarta(ctx, h) {
  const d = st.data;
  const PAPIR = "#f1ece3", TMAVA = "#141414";
  ctx.fillStyle = PAPIR; ctx.fillRect(0, 0, W, h);
  const M = 56;
  const vyskaTextu = h > 1500 ? 470 : h < 1200 ? 300 : 360;
  const fx = M, fy = M, fw = W - 2 * M, fh = h - M - vyskaTextu;
  ctx.save(); ctx.shadowColor = "rgba(0,0,0,0.25)"; ctx.shadowBlur = 24; ctx.shadowOffsetY = 8;
  ctx.fillStyle = "#000"; ctx.fillRect(fx, fy, fw, fh); ctx.restore();
  kresliFoto(ctx, fx, fy, fw, fh, st.cb);
  ctx.fillStyle = st.barva; ctx.fillRect(fx, fy + fh - 12, fw, 12);
  // text pod fotkou – pozice podle skutečné výšky písmen (nic se nepřekrývá)
  const L = M + 4, sirka = W - 2 * M;
  ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  const asc = (t) => ctx.measureText(t).actualBoundingBoxAscent || 0;
  let y = fy + fh + 40;
  if (d.krestni) {
    ctx.font = `700 34px ${P_TEXT}`;
    const t = d.krestni.toUpperCase();
    y += asc(t);
    ctx.save(); ctx.globalAlpha = vidim(0.3);
    ctx.fillStyle = jas(st.barva) > 0.85 ? TMAVA : st.barva;
    rozprostreny(ctx, t, L, y, 9);
    ctx.restore();
    y += 20;
  }
  const prijmeni = (d.prijmeni || "").toUpperCase();
  const k = kickerText();
  ctx.font = `700 26px ${P_UZKE}`;
  const sirkaK = k ? Math.min(sirka * 0.42, ctx.measureText(k.toUpperCase()).width + 30) : 0;
  // příjmení nesmí vytlačit větu pod spodní okraj
  const radkyVety = (() => { ctx.font = `500 32px ${P_TEXT}`; return d.veta ? zalom(ctx, d.veta, sirka).slice(0, 2) : []; })();
  const mistoProVetu = radkyVety.length ? 26 + radkyVety.length * 42 : 0;
  const maxVyska = Math.max(60, h - M - mistoProVetu - y);
  let vP = prijmeni ? vejdeSe(ctx, prijmeni, (v) => `${v}px ${P_JMENO}`, h > 1500 ? 190 : h < 1200 ? 120 : 150, sirka - sirkaK - 24) : 0;
  if (prijmeni) {
    ctx.font = `${vP}px ${P_JMENO}`;
    while (vP > 50 && asc(prijmeni) > maxVyska) { vP -= 4; ctx.font = `${vP}px ${P_JMENO}`; }
    y += asc(prijmeni);
    ctx.save(); ctx.globalAlpha = vidim(0.6);
    ctx.fillStyle = TMAVA; ctx.fillText(prijmeni, L - 3, y);
    ctx.restore();
  }
  if (k) {
    ctx.save(); ctx.globalAlpha = vidim(0.9);
    ctx.font = `700 26px ${P_UZKE}`; ctx.fillStyle = "#555"; ctx.textAlign = "right";
    const radky = zalom(ctx, k.toUpperCase(), sirkaK).slice(0, 2);
    radky.forEach((r, i) => ctx.fillText(r, W - M, y - (radky.length - 1 - i) * 32));
    ctx.restore();
  }
  if (radkyVety.length) {
    y += 26;
    ctx.save(); ctx.globalAlpha = vidim(1.3);
    ctx.font = `500 32px ${P_TEXT}`; ctx.fillStyle = "#3a3a3a"; ctx.textAlign = "left";
    y += asc(radkyVety[0]);
    radkyVety.forEach((r, i) => ctx.fillText(r, L, y + i * 42));
    ctx.restore();
  }
  // logo do rohu fotky (text pod fotkou má volné místo)
  logo(ctx, "bila", { x: fx + 28, y: fy + 26, sirka: 120 });
}

// ================================================== NHL styl (milník, rekord, narozeniny, titulek) ==
const P_CISLO = '"Anton", "Oswald", Impact, sans-serif';
const P_STITEK = '"Oswald", "Roboto Condensed", Arial, sans-serif';
const cele = () => [st.data.krestni, st.data.prijmeni].filter(Boolean).join(" ").toUpperCase();
const formatCislo = (c) => String(c || "").replace(/\D/g, "").replace(/\B(?=(\d{3})+(?!\d))/g, " ");
// Paleta pro NHL šablony: pozadí musí být tmavé dost na bílý text, akcent světlý.
// Světlá týmová barva (zlatá, žlutá) jde do akcentu a pozadí je z tmavé druhé barvy.
function paleta() {
  const b1 = st.barva || "#c8102e", b2 = st.barva2 || "#ffffff";
  if (jas(b1) > 0.6 && jas(b2) < 0.4) return { bg: mix(b2, b1, 0.14), akc: b1 };
  return { bg: b1, akc: jas(b2) >= 0.5 && Math.abs(jas(b2) - jas(b1)) > 0.25 ? b2 : "#ffffff" };
}
const akcent2 = () => paleta().akc;

// Pozadí v barvách týmu: světlo uprostřed, rozmazaná textura fotky, šikmé světelné pruhy, vinětace.
function pozadiTym(ctx, h, { svetle = false } = {}) {
  const c = paleta().bg;
  const g = ctx.createRadialGradient(W * 0.5, h * 0.38, 40, W * 0.5, h * 0.5, h * 0.9);
  if (svetle) { g.addColorStop(0, "#ffffff"); g.addColorStop(0.6, "#eef0f4"); g.addColorStop(1, "#cfd4dc"); }
  else { g.addColorStop(0, svetlejsi(c, 0.22)); g.addColorStop(0.5, c); g.addColorStop(1, tmavsi(c, 0.72)); }
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, h);
  // rozmazaná fotka jako textura (arena, dres…) – v barvě týmu
  if (foto) {
    ctx.save();
    ctx.globalAlpha = svetle ? 0.22 : 0.3;
    ctx.globalCompositeOperation = svetle ? "multiply" : "overlay";
    ctx.filter = `blur(${Math.round(W * 0.02)}px) grayscale(1) contrast(1.2)`;
    const iw = foto.naturalWidth, ih = foto.naturalHeight, m = Math.max(W / iw, h / ih) * 1.25;
    ctx.drawImage(foto, (W - iw * m) / 2, (h - ih * m) / 2, iw * m, ih * m);
    ctx.restore();
  }
  // bokeh – rozostřená světla haly (stejná při každém vykreslení)
  if (!svetle) {
    let sem = 7;
    const rnd = () => { sem = (sem * 16807) % 2147483647; return sem / 2147483647; };
    ctx.save(); ctx.globalCompositeOperation = "screen";
    for (let i = 0; i < 16; i++) {
      const bx = rnd() * W, by = rnd() * h * 0.7, r = 18 + rnd() * 70;
      const gb = ctx.createRadialGradient(bx, by, 0, bx, by, r);
      gb.addColorStop(0, hex(paleta().akc, 0.09 + rnd() * 0.08)); gb.addColorStop(1, hex(paleta().akc, 0));
      ctx.fillStyle = gb; ctx.beginPath(); ctx.arc(bx, by, r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    // světlo za hráčem
    const sv = ctx.createRadialGradient(W * 0.5, h * 0.45, 10, W * 0.5, h * 0.45, W * 0.6);
    sv.addColorStop(0, "rgba(255,255,255,0.16)"); sv.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = sv; ctx.fillRect(0, 0, W, h);
  }
  // šikmé světelné pruhy
  ctx.save();
  for (const [x, sirka, a] of [[0.18, 260, 0.08], [0.62, 140, 0.06], [0.86, 320, 0.05]]) {
    ctx.save(); ctx.translate(W * x, 0); ctx.rotate(0.42);
    const pr = ctx.createLinearGradient(-sirka, 0, sirka, 0);
    pr.addColorStop(0, "rgba(255,255,255,0)"); pr.addColorStop(0.5, `rgba(255,255,255,${svetle ? a * 2 : a})`); pr.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = pr; ctx.fillRect(-sirka, -h, sirka * 2, h * 3); ctx.restore();
  }
  ctx.restore();
  if (!svetle) {
    const v = ctx.createRadialGradient(W / 2, h / 2, h * 0.35, W / 2, h / 2, h * 0.85);
    v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, "rgba(0,0,0,0.55)");
    ctx.fillStyle = v; ctx.fillRect(0, 0, W, h);
  }
}

// ------------------------------------------------ rozložení bez překrývání --
// Obrys hráče (průhlednost výřezu) se zmenší na malou masku. Texty se pak umisťují tam, kde hráč není,
// případně se hráč zmenší. Když to jinak nejde (hráč přetažený přes text), dostane text tmavý podklad.
let obsazeno = []; // [{zdroj, box, oriznout}] – hráči vykreslení v aktuálním snímku
const maskCache = new WeakMap();
function maska(zdroj) {
  if (maskCache.has(zdroj)) return maskCache.get(zdroj);
  const mw = 160, mh = Math.max(1, Math.round((mw * zdroj.height) / zdroj.width));
  const c = document.createElement("canvas"); c.width = mw; c.height = mh;
  const x = c.getContext("2d", { willReadFrequently: true }); x.drawImage(zdroj, 0, 0, mw, mh);
  const d = x.getImageData(0, 0, mw, mh).data, a = new Uint8Array(mw * mh);
  for (let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3];
  const m = { mw, mh, a };
  maskCache.set(zdroj, m);
  return m;
}
// podíl obdélníku r, který zakrývá některý z hráčů
function prekryvS(seznam, r) {
  if (!r || r.w <= 0 || r.h <= 0) return 0;
  let zasah = 0, n = 0;
  const NX = 18, NY = 8;
  for (let iy = 0; iy < NY; iy++) for (let ix = 0; ix < NX; ix++) {
    const px = r.x + ((ix + 0.5) * r.w) / NX, py = r.y + ((iy + 0.5) * r.h) / NY;
    n++;
    for (const o of seznam) {
      if (o.oriznout && py > o.oriznout) continue;
      const b = o.box;
      if (px < b.x || px >= b.x + b.w || py < b.y || py >= b.y + b.h) continue;
      const m = maska(o.zdroj);
      if (m.a[(((py - b.y) / b.h) * m.mh | 0) * m.mw + (((px - b.x) / b.w) * m.mw | 0)] > 70) { zasah++; break; }
    }
  }
  return zasah / n;
}
const prekryv = (r) => prekryvS(obsazeno, r);
function boxVyrezu(h, zdroj, { stredX = 0.5, spodek = 0, vyska = 0.8, hlavni = true, odShora = null } = {}) {
  const kamera = anim == null ? 1 : 1 + 0.05 * Math.min(1, anim / DELKA_ANIM);
  const zoom = hlavni ? (st.foto.zoom || 1) : 1;
  let vh = h * vyska * zoom * kamera, vw = vh * (zdroj.width / zdroj.height);
  // portrét do pasu (široký výřez) se nezvětšuje přes šířku plátna – jinak by z hráče zbyl jen dres
  const maxSirka = W * (zdroj.width / zdroj.height > 0.8 ? 0.98 : 1.15) * (hlavni ? (st.foto.zoom || 1) : 1);
  if (vw > maxSirka) { vw = maxSirka; vh = vw * (zdroj.height / zdroj.width); }
  // hlava nesmí být uříznutá nahoře (pokud ji uživatel sám nepřetáhne / nepřiblíží)
  const horniOkraj = h * 0.04;
  if (odShora == null && h - vh - h * spodek < horniOkraj && zoom <= 1.001) {
    vh = h - h * spodek - horniOkraj; vw = vh * (zdroj.width / zdroj.height);
  }
  const x = W * stredX - vw / 2 + (hlavni ? (st.foto.x || 0) * W * 0.35 : 0);
  const y = (odShora != null ? h * odShora : h - vh - h * spodek) + (hlavni ? (st.foto.y || 0) * h * 0.25 : 0);
  return { x, y, w: vw, h: vh };
}
// největší výška hráče (podíl plátna), při které nezakryje texty víc než o toleranci
function vyskaBezPrekryvu(h, zdroj, volby, obdelniky, max, min = 0.5, tolerance = 0.03) {
  if (!obdelniky.length) return max;
  for (let v = max; v >= min; v -= 0.02) {
    const box = boxVyrezu(h, zdroj, { ...volby, vyska: v });
    if (obdelniky.every((r) => prekryvS([{ zdroj, box, oriznout: volby.oriznout }], r) <= tolerance)) return v;
  }
  return min;
}
// měkký tmavý podklad pod text, který leží přes hráče
function podklad(ctx, r, sila = 0.6) {
  ctx.save();
  const POSUN = 20000;
  ctx.fillStyle = "#000"; ctx.shadowColor = `rgba(0,0,0,${Math.min(0.95, sila + 0.25)})`; ctx.shadowBlur = 60; ctx.shadowOffsetX = POSUN;
  ctx.beginPath(); ctx.roundRect(r.x - 20 - POSUN, r.y - 14, r.w + 40, r.h + 28, 30); ctx.fill();
  ctx.restore();
}

// Vyříznutý hráč se stínem (a září). Poloha z boxVyrezu; zapíše se do „obsazeno“.
function kresliVyrez(ctx, h, zdroj, { stredX = 0.5, spodek = 0, vyska = 0.8, hlavni = true, alfa = 1, oriznout = null, odShora = null, zare = null } = {}) {
  const { x, y, w: vw, h: vh } = boxVyrezu(h, zdroj, { stredX, spodek, vyska, hlavni, odShora });
  ctx.save();
  ctx.globalAlpha = alfa;
  if (oriznout) { ctx.beginPath(); ctx.rect(0, 0, W, oriznout); ctx.clip(); }
  // záře za hráčem v akcentní barvě (rim light jako na grafikách NHL)
  const barvaZare = zare ?? (hlavni && st.zare !== false ? akcent2() : null);
  if (barvaZare) {
    ctx.save();
    ctx.globalAlpha = alfa * 0.75;
    ctx.shadowColor = barvaZare; ctx.shadowBlur = Math.max(30, vw * 0.07);
    ctx.drawImage(silueta(zdroj, barvaZare), x, y, vw, vh);
    ctx.drawImage(silueta(zdroj, barvaZare), x, y, vw, vh);
    ctx.restore();
  }
  ctx.shadowColor = "rgba(0,0,0,0.5)"; ctx.shadowBlur = 45; ctx.shadowOffsetY = 16;
  ctx.filter = st.cb ? "grayscale(1) contrast(1.1)" : "contrast(1.07) saturate(1.08)";
  ctx.drawImage(zdroj, x, y, vw, vh);
  ctx.restore();
  const box = { x, y, w: vw, h: vh };
  obsazeno.push({ zdroj, box, oriznout });
  return box;
}
// hlavní a druhý hráč; bez výřezu aspoň fotka
function hraci(ctx, h, hlavniBox, druhyBox) {
  if (vyrez2 && druhyBox) kresliVyrez(ctx, h, vyrez2, { ...druhyBox, hlavni: false });
  if (maVyrez()) return kresliVyrez(ctx, h, vyrez, hlavniBox);
  ctx.save(); ctx.globalAlpha = 0.95;
  const y0 = h * (1 - (hlavniBox.vyska || 0.8)) - h * (hlavniBox.spodek || 0);
  kresliFoto(ctx, 0, y0, W, h - y0 - h * (hlavniBox.spodek || 0), st.cb);
  ctx.restore();
  return null;
}

// Obří číslo s kovovou / akcentní výplní, vrací spodní hranu.
function obriCislo(ctx, text, { y, maxV, sirka, x = W / 2, zarovnani = "center" }) {
  let v = vejdeSe(ctx, text, (q) => `${q}px ${P_CISLO}`, maxV, sirka, 80);
  ctx.font = `${v}px ${P_CISLO}`; ctx.textAlign = zarovnani; ctx.textBaseline = "alphabetic";
  const m = ctx.measureText(text);
  const asc = m.actualBoundingBoxAscent || v * 0.8;
  const zaklad = y + asc;
  const a2 = akcent2();
  const g = ctx.createLinearGradient(0, y, 0, zaklad);
  if (a2.toLowerCase() === "#ffffff") { g.addColorStop(0, "#ffffff"); g.addColorStop(0.55, "#e9ecf1"); g.addColorStop(1, "#aab2bd"); }
  else { g.addColorStop(0, svetlejsi(a2, 0.35)); g.addColorStop(0.5, a2); g.addColorStop(1, tmavsi(a2, 0.25)); }
  ctx.save();
  ctx.globalAlpha = vidim(0.1, 0.7);
  // plastická hloubka: tmavé vrstvy posunuté dolů vpravo
  const hloubka = Math.max(6, Math.round(v * 0.03));
  ctx.fillStyle = tmavsi(paleta().bg, 0.6);
  ctx.shadowColor = "rgba(0,0,0,0.45)"; ctx.shadowBlur = 34; ctx.shadowOffsetY = 12;
  ctx.fillText(text, x + hloubka, zaklad + hloubka);
  ctx.shadowColor = "transparent";
  for (let i = hloubka - 1; i > 0; i--) ctx.fillText(text, x + i, zaklad + i);
  ctx.fillStyle = g; ctx.fillText(text, x, zaklad);
  // jemná světlá hrana nahoře
  ctx.lineWidth = Math.max(2, v * 0.006); ctx.strokeStyle = "rgba(255,255,255,0.35)"; ctx.strokeText(text, x, zaklad);
  ctx.shadowColor = "transparent";
  // jemné vodorovné linky přes číslo (textura jako na grafikách NHL)
  ctx.globalCompositeOperation = "source-atop";
  ctx.restore();
  return zaklad;
}

// malý řádek s mezerami mezi písmeny a čárkami po stranách
function stitekSCarami(ctx, text, y, barva = "rgba(255,255,255,0.92)", vel = 30) {
  if (!text) return;
  ctx.save(); ctx.globalAlpha = vidim(0.3);
  ctx.font = `700 ${vel}px ${P_STITEK}`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = barva;
  ctx.letterSpacing = `${Math.round(vel * 0.28)}px`;
  const w = Math.min(W - 200, ctx.measureText(text).width);
  ctx.fillText(text, W / 2, y, W - 200);
  ctx.letterSpacing = "0px";
  ctx.fillRect(W / 2 - w / 2 - 70, y - 1.5, 46, 3); ctx.fillRect(W / 2 + w / 2 + 24, y - 1.5, 46, 3);
  ctx.restore();
}
function spodniRadek(ctx, h, text, barva = "rgba(255,255,255,0.92)") {
  if (!text) return;
  const g = ctx.createLinearGradient(0, h * 0.8, 0, h);
  g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,0.6)");
  ctx.fillStyle = g; ctx.fillRect(0, h * 0.8, W, h * 0.2);
  ctx.save(); ctx.globalAlpha = vidim(1.4);
  ctx.font = `700 30px ${P_STITEK}`; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic"; ctx.fillStyle = barva;
  ctx.letterSpacing = "4px";
  const radky = zalom(ctx, text.toUpperCase(), W - 160).slice(0, 2);
  const yP = h - (h > 1500 ? 120 : 58);
  const sirka = Math.max(...radky.map((r) => ctx.measureText(r).width));
  const r0 = { x: W / 2 - sirka / 2, y: yP - (radky.length - 1) * 42 - 26, w: sirka, h: (radky.length - 1) * 42 + 32 };
  if (prekryv(r0) > 0.04) { podklad(ctx, r0, 0.55); ctx.fillStyle = barva; }
  ctx.shadowColor = "rgba(0,0,0,0.6)"; ctx.shadowBlur = 10;
  radky.forEach((r, i) => ctx.fillText(r, W / 2, yP - (radky.length - 1 - i) * 42));
  ctx.letterSpacing = "0px";
  ctx.restore();
}

// 5) MILNÍK – obří číslo za hráčem (hráč smí zakrýt jen spodní část čísla), jméno nahoře,
// popis čísla tam, kde je volno (vpravo / vlevo vedle hráče), řádek dole.
function sablonaMilnik(ctx, h) {
  const d = st.data;
  pozadiTym(ctx, h);
  const nahore = [d.nahore, d.dres ? `#${d.dres}` : ""].filter(Boolean).join("  ·  ");
  stitekSCarami(ctx, nahore, h * 0.05, "rgba(255,255,255,0.7)", 24);
  stitekSCarami(ctx, cele(), h * 0.095, "#ffffff", 40);
  const cislo = formatCislo(d.cislo) || "—";
  const yCisla = h * 0.13;
  const spodekCisla = obriCislo(ctx, cislo, { y: yCisla, maxV: h * 0.4, sirka: W * 0.92 });
  ctx.font = `${vejdeSe(ctx, cislo, (q) => `${q}px ${P_CISLO}`, h * 0.4, W * 0.92, 80)}px ${P_CISLO}`;
  const sirkaCisla = ctx.measureText(cislo).width;
  const hlavni = { stredX: 0.44, spodek: 0.0, hlavni: true };
  if (maVyrez()) {
    // horních 60 % čísla musí zůstat vidět
    const vrch = { x: W / 2 - sirkaCisla / 2, y: yCisla, w: sirkaCisla, h: (spodekCisla - yCisla) * 0.6 };
    hlavni.vyska = vyskaBezPrekryvu(h, vyrez, hlavni, [vrch], 0.74, 0.5, 0.06);
  } else hlavni.vyska = 0.74;
  hraci(ctx, h, hlavni, { stredX: 0.2, spodek: 0.06, vyska: 0.5 });
  if (d.co) {
    const slova = d.co.split(/\s+/);
    const radky = slova.length > 1 ? [slova.slice(0, Math.ceil(slova.length / 2)).join(" "), slova.slice(Math.ceil(slova.length / 2)).join(" ")] : [d.co];
    let nej = null;
    for (let v = 110; v >= 50; v -= 6) {
      ctx.font = `${v}px ${P_CISLO}`;
      const sir = Math.max(...radky.map((r) => ctx.measureText(r).width));
      if (sir > W * 0.46) continue;
      const vys = (radky.length - 1) * v * 0.98 + v * 0.78;
      for (const strana of ["vpravo", "vlevo"]) {
        for (let yz = Math.max(spodekCisla + 40 + v * 0.78, h * 0.4); yz + vys - v * 0.78 <= h * 0.84; yz += h * 0.025) {
          const x0 = strana === "vpravo" ? W - 56 - sir - 40 : 56;
          const r = { x: x0, y: yz - v * 0.78, w: sir + 40, h: vys };
          const pk = prekryv(r);
          const skore = pk * 100 + (strana === "vlevo" ? 0.4 : 0) + Math.abs(yz - h * 0.66) / h - v / 400;
          if (!nej || skore < nej.skore) nej = { v, strana, yz, sir, pk, skore, r };
        }
      }
      if (nej && nej.pk <= 0.02) break;
    }
    if (nej) {
      ctx.save(); ctx.globalAlpha = vidim(0.9);
      if (nej.pk > 0.02) podklad(ctx, nej.r, 0.55);
      ctx.font = `${nej.v}px ${P_CISLO}`; ctx.textBaseline = "alphabetic";
      ctx.textAlign = nej.strana === "vpravo" ? "right" : "left";
      const xT = nej.strana === "vpravo" ? W - 56 : 56 + 40;
      ctx.shadowColor = "rgba(0,0,0,0.55)"; ctx.shadowBlur = 18; ctx.fillStyle = "#ffffff";
      radky.forEach((r, i) => ctx.fillText(r, xT, nej.yz + i * nej.v * 0.98));
      // šipka ukazující na hráče
      ctx.fillStyle = akcent2();
      const s1 = ctx.measureText(radky[0]).width, ty = nej.yz - nej.v * 0.36;
      ctx.beginPath();
      if (nej.strana === "vpravo") { const tx = W - 56 - s1 - 22; ctx.moveTo(tx - 22, ty - 20); ctx.lineTo(tx, ty); ctx.lineTo(tx - 22, ty + 20); }
      else { const tx = 56 + 24; ctx.moveTo(tx, ty - 20); ctx.lineTo(tx - 22, ty); ctx.lineTo(tx, ty + 20); }
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  }
  spodniRadek(ctx, h, d.dole);
  kresliZrno(ctx, W, h, 0.05);
  logo(ctx, "bila", { x: 46, y: 40, sirka: 110 });
}

// 6) REKORD – vpravo nahoře štítek, nadpis a jméno; hráč pod nimi (zmenší se, aby je nezakryl);
// druhý výřez vlevo; žebříček vlevo dole na tmavém panelu.
function sablonaRekord(ctx, h) {
  const d = st.data;
  pozadiTym(ctx, h);
  const R = W - 56;
  // 1) rozvržení textů vpravo nahoře (měření, kreslí se až po hráčích)
  const texty = [];
  let y = h * 0.075;
  if (d.stitek) { texty.push({ typ: "stitek", text: d.stitek, y }); y += 44; }
  const slova = String(d.nadpis || "").split(/\s+/).filter(Boolean);
  const radky = slova.length > 2 ? [slova.slice(0, Math.ceil(slova.length / 2)).join(" "), slova.slice(Math.ceil(slova.length / 2)).join(" ")] : slova;
  let v = 150; ctx.font = `${v}px ${P_CISLO}`;
  while (v > 60 && radky.length && Math.max(...radky.map((r) => ctx.measureText(r).width)) > W * 0.62) { v -= 4; ctx.font = `${v}px ${P_CISLO}`; }
  const sirkaNadpisu = radky.length ? Math.max(...radky.map((r) => ctx.measureText(r).width)) : 0;
  radky.forEach((r) => { y += v * 0.95; texty.push({ typ: "nadpis", text: r, y }); });
  y += 50;
  const prj = (d.prijmeni || "").toUpperCase();
  const vPr = prj ? vejdeSe(ctx, prj, (q) => `${q}px ${P_CISLO}`, 84, W * 0.5, 48) : 0;
  ctx.font = `700 28px ${P_STITEK}`;
  if (d.krestni) { texty.push({ typ: "krestni", text: d.krestni.toUpperCase(), y }); y += 16; }
  if (prj) { y += vPr * 0.86; texty.push({ typ: "prijmeni", text: prj, y }); }
  const sirkaBloku = Math.max(sirkaNadpisu, W * 0.3);
  const blok = { x: R - sirkaBloku, y: h * 0.075 - 30, w: sirkaBloku, h: y - h * 0.075 + 40 };
  // 2) žebříček vlevo dole
  const tab = String(d.tabulka || "").split("\n").map((r) => r.split("|").map((x) => x.trim())).filter((r) => r[0]).slice(0, 5);
  const L = 56, sirkaTab = 400;
  const spodekTab = h - (h > 1500 ? 140 : 70);
  const vrchTab = tab.length ? spodekTab - tab.length * 50 - 60 : spodekTab - 150;
  // 3) hráči: hlavní vpravo pod textem, druhý vlevo nad žebříčkem
  const hlavni = { stredX: 0.62, spodek: 0, hlavni: true };
  hlavni.vyska = maVyrez() ? vyskaBezPrekryvu(h, vyrez, hlavni, [blok], 0.8, 0.5, 0.03) : 0.78;
  const druhy = { stredX: 0.22, spodek: Math.max(0.02, (h - vrchTab + 30) / h), vyska: 0.4 };
  hraci(ctx, h, hlavni, druhy);
  const g = ctx.createLinearGradient(0, h * 0.6, 0, h);
  g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,0.6)");
  ctx.fillStyle = g; ctx.fillRect(0, h * 0.6, W, h * 0.4);
  // 4) texty vpravo nahoře (když je přes ně hráč přetažený, dostanou podklad)
  ctx.save(); ctx.globalAlpha = vidim(0.2); ctx.textAlign = "right"; ctx.textBaseline = "alphabetic";
  if (prekryv(blok) > 0.03) podklad(ctx, blok, 0.5);
  ctx.shadowColor = "rgba(0,0,0,0.45)"; ctx.shadowBlur = 18;
  for (const t of texty) {
    if (t.typ === "stitek") { ctx.font = `700 30px ${P_STITEK}`; ctx.letterSpacing = "6px"; ctx.fillStyle = akcent2(); ctx.fillText(t.text, R, t.y); ctx.letterSpacing = "0px"; }
    if (t.typ === "nadpis") { ctx.font = `${v}px ${P_CISLO}`; ctx.fillStyle = "#ffffff"; ctx.fillText(t.text, R, t.y); }
    if (t.typ === "krestni") { ctx.font = `700 28px ${P_STITEK}`; ctx.letterSpacing = "4px"; ctx.fillStyle = "rgba(255,255,255,0.85)"; ctx.fillText(t.text, R + 4, t.y); ctx.letterSpacing = "0px"; }
    if (t.typ === "prijmeni") { ctx.font = `${vPr}px ${P_CISLO}`; ctx.fillStyle = akcent2(); ctx.fillText(t.text, R, t.y); }
  }
  ctx.restore();
  // 5) žebříček na tmavém panelu
  if (tab.length) {
    ctx.save(); ctx.globalAlpha = vidim(0.9);
    const panel = { x: L, y: vrchTab, w: sirkaTab, h: spodekTab - vrchTab + 10 };
    ctx.fillStyle = "rgba(0,0,0,0.62)"; ctx.beginPath(); ctx.roundRect(panel.x - 22, panel.y - 18, panel.w + 44, panel.h + 30, 18); ctx.fill();
    ctx.fillStyle = akcent2(); ctx.fillRect(panel.x - 22, panel.y - 18, panel.w + 44, 5);
    ctx.textBaseline = "alphabetic";
    ctx.font = `700 24px ${P_STITEK}`; ctx.letterSpacing = "4px"; ctx.fillStyle = akcent2(); ctx.textAlign = "left";
    ctx.fillText((d.nahore || "ŽEBŘÍČEK").toUpperCase(), L, vrchTab + 26, sirkaTab); ctx.letterSpacing = "0px";
    const pr = (d.prijmeni || "").toLowerCase();
    tab.forEach(([jm, hod], i) => {
      const on = pr && jm.toLowerCase().includes(pr);
      const yy = vrchTab + 78 + i * 50;
      ctx.font = `${on ? 800 : 600} 32px ${P_UZKE}`; ctx.fillStyle = on ? "#ffffff" : "rgba(255,255,255,0.62)";
      ctx.textAlign = "left"; ctx.fillText(`${i + 1}. ${jm.toUpperCase()}`, L, yy, sirkaTab - 90);
      ctx.textAlign = "right"; ctx.fillText(hod || "", L + sirkaTab, yy);
    });
    ctx.restore();
  } else if (d.cislo) {
    ctx.save(); ctx.globalAlpha = vidim(0.9); ctx.textAlign = "left";
    const r0 = { x: L, y: spodekTab - 150, w: 420, h: 170 };
    if (prekryv(r0) > 0.03) podklad(ctx, r0, 0.55);
    ctx.font = `140px ${P_CISLO}`; ctx.fillStyle = "#ffffff"; ctx.fillText(formatCislo(d.cislo), L, spodekTab - 40);
    ctx.font = `700 30px ${P_STITEK}`; ctx.letterSpacing = "4px"; ctx.fillStyle = akcent2(); ctx.fillText(d.co || "", L, spodekTab); ctx.letterSpacing = "0px";
    ctx.restore();
  }
  kresliZrno(ctx, W, h, 0.05);
  logo(ctx, "bila", { x: 46, y: 40, sirka: 110 });
}

// věk z data narození (letošní narozeniny)
function vekLetos(narozen) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(narozen || "");
  return m ? new Date().getFullYear() - +m[1] : null;
}

// 7) NAROZENINY – světlé pozadí, velký portrét + akční výřez, velké jméno vlevo dole.
// Portrét končí nad textem (plynule se rozplyne do bílé), akční výřez je vpravo vedle jména.
function sablonaNarozeniny(ctx, h) {
  const d = st.data, c = st.barva;
  pozadiTym(ctx, h, { svetle: true });
  ctx.save(); ctx.globalAlpha = 0.9; ctx.fillStyle = c;
  ctx.beginPath(); ctx.moveTo(W * 0.62, 0); ctx.lineTo(W, 0); ctx.lineTo(W, h * 0.42); ctx.closePath(); ctx.fill(); ctx.restore();
  // rozvržení textu odspodu (měření)
  const L = 60, barvaTextu = jas(c) > 0.62 ? (jas(st.barva2 || "#000") < 0.4 ? st.barva2 : "#111111") : c;
  const vek = vekLetos(d.narozen);
  const kicker = d.zemrel ? (vek ? `NEDOŽITÉ ${vek}. NAROZENINY` : "VZPOMÍNÁME") : "VŠECHNO NEJLEPŠÍ";
  const pr = (d.prijmeni || "").toUpperCase(), kr = (d.krestni || "").toUpperCase();
  const v = Math.min(vejdeSe(ctx, pr, (q) => `${q}px ${P_CISLO}`, 170, W * 0.56, 60), vejdeSe(ctx, kr, (q) => `${q}px ${P_CISLO}`, 170, W * 0.56, 60));
  let y = h - (h > 1500 ? 140 : 70);
  const yVek = !d.zemrel && vek ? y : null;
  if (yVek) y -= 46;
  const yPr = y; y -= v * 0.95;
  const yKr = y; y -= v * 0.95 + 4;
  const yKick = y;
  const vrchTextu = yKick - 46;
  ctx.font = `${v}px ${P_CISLO}`;
  const sirkaTextu = Math.max(ctx.measureText(pr).width, ctx.measureText(kr).width, 420);
  const textObd = { x: L, y: vrchTextu, w: sirkaTextu, h: h - vrchTextu };
  // portrét: končí nad textem
  if (maVyrez()) kresliVyrez(ctx, h, vyrez, { stredX: 0.4, odShora: 0.04, vyska: 1.0, hlavni: true, oriznout: vrchTextu - 10, zare: false });
  else { ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, vrchTextu - 10); ctx.clip(); kresliFoto(ctx, 0, 0, W, h * 0.7, st.cb); ctx.restore(); }
  const g = ctx.createLinearGradient(0, vrchTextu - 220, 0, vrchTextu);
  g.addColorStop(0, "rgba(255,255,255,0)"); g.addColorStop(1, "rgba(255,255,255,0.97)");
  ctx.fillStyle = g; ctx.fillRect(0, vrchTextu - 220, W, 220);
  ctx.fillStyle = "rgba(255,255,255,0.97)"; ctx.fillRect(0, vrchTextu - 1, W, h - vrchTextu + 1);
  // akční výřez vpravo – posune se, aby nezakryl jméno
  if (vyrez2) {
    let sx = 0.83;
    for (; sx <= 0.98; sx += 0.03) {
      const box = boxVyrezu(h, vyrez2, { stredX: sx, spodek: 0, vyska: 0.44, hlavni: false });
      if (prekryvS([{ zdroj: vyrez2, box }], textObd) <= 0.02) break;
    }
    kresliVyrez(ctx, h, vyrez2, { stredX: Math.min(sx, 0.98), spodek: 0.0, vyska: 0.44, hlavni: false });
  }
  ctx.save(); ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  ctx.globalAlpha = vidim(0.9);
  if (yVek) { ctx.font = `700 30px ${P_STITEK}`; ctx.fillStyle = "#333"; ctx.letterSpacing = "4px"; ctx.fillText(`K ${vek}. NAROZENINÁM`, L, yVek); ctx.letterSpacing = "0px"; }
  ctx.globalAlpha = vidim(0.6);
  ctx.font = `${v}px ${P_CISLO}`; ctx.fillStyle = barvaTextu;
  ctx.fillText(pr, L, yPr);
  ctx.fillText(kr, L, yKr);
  ctx.globalAlpha = vidim(0.3);
  ctx.font = `700 46px ${P_STITEK}`; ctx.fillStyle = jas(c) > 0.62 ? tmavsi(c, 0.35) : c;
  ctx.fillText(kicker, L, yKick);
  ctx.restore();
  logo(ctx, "cerna", { x: 46, y: 40, sirka: 110 });
}

// 8) TITULEK – velký dvouřádkový nápis vpravo dole; hráč vlevo se zmenší/posune, aby ho nezakryl.
function sablonaTitulek(ctx, h) {
  const d = st.data;
  const R = W - 56;
  const slova = String(d.nadpisTitulek || d.nadpis || cele()).split(/\s+/).filter(Boolean);
  const pul = Math.ceil(slova.length / 2);
  const radky = slova.length > 1 ? [slova.slice(0, pul).join(" "), slova.slice(pul).join(" ")] : slova;
  const pod = d.podnadpis || d.veta;
  const rozvrh = (v) => {
    ctx.font = `${v}px ${P_CISLO}`;
    const sirka = Math.max(...radky.map((r) => ctx.measureText(r).width));
    const yPrvni = h - (h > 1500 ? 170 : 100) - (radky.length - 1) * v * 0.95;
    return { v, yPrvni, obd: { x: R - sirka, y: yPrvni - v * 0.8, w: sirka, h: (radky.length - 1) * v * 0.95 + v * 0.8 + 10 } };
  };
  let vMax = 200;
  ctx.font = `${vMax}px ${P_CISLO}`;
  while (vMax > 70 && Math.max(...radky.map((r) => ctx.measureText(r).width)) > W * 0.86) { vMax -= 4; ctx.font = `${vMax}px ${P_CISLO}`; }
  let plan = rozvrh(vMax), volby = { stredX: 0.4, spodek: 0, hlavni: true, vyska: 0.86 };
  if (maVyrez()) {
    // největší nápis a největší hráč, kteří se nepřekrývají (hráč se může posunout doleva a zmenšit)
    let nej = null;
    for (let v = vMax; v >= 90; v -= 8) {
      const pl = rozvrh(v);
      for (const sx of [0.4, 0.34, 0.28]) {
        const vo = { stredX: sx, spodek: 0, hlavni: true };
        const vy = vyskaBezPrekryvu(h, vyrez, vo, [pl.obd], 0.86, 0.56, 0.03);
        const pk = prekryvS([{ zdroj: vyrez, box: boxVyrezu(h, vyrez, { ...vo, vyska: vy }) }], pl.obd);
        const skore = (pk > 0.03 ? 1000 : 0) + (0.86 - vy) * 300 + (vMax - v) * 1.2 + (0.4 - sx) * 60;
        if (!nej || skore < nej.skore) nej = { skore, pl, vo: { ...vo, vyska: vy } };
      }
      if (nej && nej.skore < 1000 && nej.pl.v === v) break;
    }
    plan = nej.pl; volby = nej.vo;
    pozadiTym(ctx, h);
    hraci(ctx, h, volby, { stredX: 0.8, odShora: 0.06, vyska: 0.36 });
  } else kresliFoto(ctx, 0, 0, W, h, st.cb);
  const { v, yPrvni } = plan;
  const nadpisObd = plan.obd;
  const g = ctx.createLinearGradient(0, h * 0.5, 0, h);
  g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(0.6, "rgba(0,0,0,0.55)"); g.addColorStop(1, "rgba(0,0,0,0.85)");
  ctx.fillStyle = g; ctx.fillRect(0, h * 0.5, W, h * 0.5);
  ctx.save(); ctx.globalAlpha = vidim(0.5); ctx.textAlign = "right"; ctx.textBaseline = "alphabetic";
  if (prekryv(nadpisObd) > 0.04) podklad(ctx, nadpisObd, 0.5);
  ctx.font = `${v}px ${P_CISLO}`;
  ctx.shadowColor = "rgba(0,0,0,0.55)"; ctx.shadowBlur = 24;
  radky.forEach((r, i) => { ctx.fillStyle = i === 0 ? "#ffffff" : akcent2(); ctx.fillText(r, R, yPrvni + i * v * 0.95); });
  ctx.shadowBlur = 0;
  if (pod) {
    ctx.globalAlpha = vidim(1.1);
    ctx.font = `700 28px ${P_STITEK}`; ctx.letterSpacing = "4px"; ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.fillText(pod.toUpperCase(), R, h - (h > 1500 ? 120 : 52), W - 120); ctx.letterSpacing = "0px";
  }
  ctx.restore();
  kresliZrno(ctx, W, h, 0.05);
  logo(ctx, "bila", { x: 46, y: 40, sirka: 110 });
}

function kresliDo(c, sablona = st.sablona) {
  const h = vyska();
  c.width = W; c.height = h;
  const ctx = c.getContext("2d");
  ctx.textBaseline = "alphabetic";
  obsazeno = [];
  ({ ikona: sablonaIkona, plakat: sablonaPlakat, vertikal: sablonaVertikal, karta: sablonaKarta,
    milnik: sablonaMilnik, rekord: sablonaRekord, narozeniny: sablonaNarozeniny, titulek: sablonaTitulek }[sablona] || sablonaIkona)(ctx, h);
}

// ---------------------------------------------------------- animované MP4 --
const DELKA_ANIM = 6, FPS_ANIM = 30;
const MUXER_URL = "https://cdn.jsdelivr.net/npm/mp4-muxer@5.2.2/build/mp4-muxer.js";
function nactiMuxer() {
  if (window.Mp4Muxer) return Promise.resolve(window.Mp4Muxer);
  return new Promise((ok, chyba) => { const sc = document.createElement("script"); sc.src = MUXER_URL; sc.onload = () => ok(window.Mp4Muxer); sc.onerror = () => chyba(new Error("Nepodařilo se načíst knihovnu pro MP4.")); document.head.appendChild(sc); });
}
async function exportujVideo() {
  if (typeof VideoEncoder === "undefined") { zprava("Tenhle prohlížeč neumí vytvořit video – použij Chrome nebo Edge.", "chyba"); return; }
  const b = $("#prVideo"); b.disabled = true;
  try {
    const h = vyska();
    const Mp4Muxer = await nactiMuxer();
    let kodek = "avc1.640028";
    try { kodek = (await window.DHReelsRender?.zjistiFormat?.())?.video || kodek; } catch { /* výchozí */ }
    const muxer = new Mp4Muxer.Muxer({ target: new Mp4Muxer.ArrayBufferTarget(), video: { codec: "avc", width: W, height: h, frameRate: FPS_ANIM }, fastStart: "in-memory", firstTimestampBehavior: "offset" });
    let chyba = null;
    const enc = new VideoEncoder({ output: (c, m) => muxer.addVideoChunk(c, m), error: (e) => { chyba = e; } });
    enc.configure({ codec: kodek, width: W, height: h, bitrate: 8_000_000, framerate: FPS_ANIM, avc: { format: "avc" } });
    const c = document.createElement("canvas");
    const n = DELKA_ANIM * FPS_ANIM;
    for (let i = 0; i < n; i++) {
      if (chyba) throw chyba;
      anim = i / FPS_ANIM;
      kresliDo(c);
      const fr = new VideoFrame(c, { timestamp: Math.round((i / FPS_ANIM) * 1e6), duration: Math.round(1e6 / FPS_ANIM) });
      enc.encode(fr, { keyFrame: i % 60 === 0 }); fr.close();
      while (enc.encodeQueueSize > 6) await new Promise((ok) => setTimeout(ok, 5));
      if (i % 15 === 0) zprava(`🎬 Skládám video… ${Math.round((i / n) * 100)} %`);
    }
    await enc.flush();
    if (chyba) throw chyba;
    muxer.finalize();
    G().stahniBlob(new Blob([muxer.target.buffer], { type: "video/mp4" }), `promo-${G().slug(st.data.prijmeni || st.jmeno || "hrac")}-${st.sablona}.mp4`);
    zprava(`Video staženo ✓ ${DELKA_ANIM} s – pomalý nájezd na fotku a postupně se objeví texty. Hudbu přidej přímo v Instagramu.`, "ok");
  } catch (e) { zprava(`Video se nepovedlo: ${esc(e.message)}`, "chyba"); }
  finally { anim = null; b.disabled = false; vykresli(); }
}

// ------------------------------------------------------------------ UI --

let kresliCekani = null;
function vykresli() {
  cancelAnimationFrame(kresliCekani);
  kresliCekani = requestAnimationFrame(() => {
    const c = $("#prPlatno");
    if (!c) return;
    kresliDo(c);
    $$("[data-pr-nahled]").forEach((m) => {
      const t = document.createElement("canvas");
      kresliDo(t, m.dataset.prNahled);
      m.width = 216; m.height = Math.round(216 * (t.height / t.width));
      m.getContext("2d").drawImage(t, 0, 0, m.width, m.height);
    });
  });
}

function zprava(t, druh = "") {
  const el = $("#prZprava");
  if (!el) return;
  el.innerHTML = t; el.className = `zprava ${druh}`; el.hidden = !t;
}

function vykresliFormular() {
  const d = st.data;
  const el = $("#prFormular");
  if (!el) return;
  el.innerHTML = `
    <div class="filtry">
      <label>Křestní jméno<input data-pr="krestni" value="${esc(d.krestni)}" placeholder="Mike"></label>
      <label>Příjmení (velké)<input data-pr="prijmeni" value="${esc(d.prijmeni)}" placeholder="Modano"></label>
      <label>Tým<input data-pr="nahore" value="${esc(d.nahore)}" placeholder="DALLAS STARS"></label>
      <label>Roky<input data-pr="roky" value="${esc(d.roky)}" placeholder="1989–2011"></label>
      <label class="cela">Věta (proč ho lidi milovali)<input data-pr="veta" value="${esc(d.veta)}" maxlength="90" placeholder="Elegance, kterou si Dallas pamatuje dodnes."></label>
    </div>
    <h3 class="pr-h3">NHL styl – Milník, Rekord, Narozeniny, Titulek</h3>
    <div class="filtry">
      <label>Číslo (Milník)<input data-pr="cislo" value="${esc(d.cislo)}" inputmode="numeric" placeholder="1921"></label>
      <label>Co to je<input data-pr="co" value="${esc(d.co)}" placeholder="BODŮ V NHL"></label>
      <label>Číslo dresu<input data-pr="dres" value="${esc(d.dres)}" inputmode="numeric" placeholder="68"></label>
      <label>Datum narození (Narozeniny)<input data-pr="narozen" type="date" value="${esc(d.narozen)}"></label>
      <label class="cela">Řádek dole (Milník)<input data-pr="dole" value="${esc(d.dole)}" maxlength="90" placeholder="Nejvíc ze všech Evropanů v historii NHL"></label>
      <label>Štítek (Rekord)<input data-pr="stitek" value="${esc(d.stitek)}" placeholder="REKORD KLUBU"></label>
      <label>Nadpis (Rekord)<input data-pr="nadpis" value="${esc(d.nadpis)}" placeholder="NEJVÍC ZÁPASŮ"></label>
      <label class="cela">Žebříček (Rekord) – řádek „Jméno | hodnota“<textarea data-pr="tabulka" rows="4" placeholder="Jágr J. | 1921&#10;Hossa M. | 1134">${esc(d.tabulka)}</textarea></label>
      <label>Nadpis (Titulek)<input data-pr="nadpisTitulek" value="${esc(d.nadpisTitulek || "")}" placeholder="MUŽ ZE ŽELEZA"></label>
      <label>Podnadpis (Titulek)<input data-pr="podnadpis" value="${esc(d.podnadpis || "")}" placeholder="Jediný, kdo…"></label>
      <label class="check"><input type="checkbox" data-pr-check="zemrel" ${d.zemrel ? "checked" : ""}> Už nežije (nedožité narozeniny)</label>
    </div>
    ${d.zdroje?.length ? `<p class="muted" style="font-size:12.5px;margin:10px 0 0">Zdroje: ${d.zdroje.map((z) => `<a href="${esc(z.uri)}" target="_blank" rel="noopener">${esc(z.titulek || z.uri)}</a>`).join(" · ")}</p>` : ""}
    ${st.kredit ? `<p class="muted" style="font-size:12.5px;margin:6px 0 0">${esc(st.kredit)} – autor fotky se přidá do popisku.</p>` : ""}
    ${st.kredit2 ? `<p class="muted" style="font-size:12.5px;margin:6px 0 0">Druhá fotka: ${esc(st.kredit2)}</p>` : ""}`;
  $("#prFoto2Info").textContent = st.foto2Id ? (vyrez2 ? "✓ druhá fotka vyříznutá" : "druhá fotka nahraná") : "zatím bez druhé fotky";
  $("#prPopisek").value = popisekSKreditem();
  $("#prBarva").value = st.barva; $("#prBarva2").value = st.barva2 || "#ffffff"; $("#prVyrezZap").checked = st.vyrezZap !== false;
  $("#prFormat").value = st.format; $("#prLogo").checked = st.logo; $("#prCb").checked = !!st.cb;
  $("#prZoom").value = st.foto.zoom;
  $("#prVylepsit").checked = st.vylepsit !== false; $("#prZare").checked = st.zare !== false;
  $$("[data-pr-sablona]").forEach((b) => b.classList.toggle("on", b.dataset.prSablona === st.sablona));
}

function popisekSKreditem() {
  const d = st.data;
  return [d.popisek, (d.hashtagy || []).join(" "), [st.kredit, st.kredit2].filter(Boolean).join("\n")].filter(Boolean).join("\n\n");
}

async function exportuj() {
  const c = document.createElement("canvas");
  kresliDo(c);
  const blob = await new Promise((ok) => c.toBlob(ok, "image/jpeg", 0.95));
  G().stahniBlob(blob, `promo-${G().slug(st.data.prijmeni || st.jmeno || "hrac")}-${st.sablona}.jpg`);
  toast("Grafika stažená ✓");
}

// tažení fotky v náhledu
function nastavTahani(c) {
  let start = null;
  c.addEventListener("pointerdown", (e) => { if (!foto) return; start = { x: e.clientX, y: e.clientY, fx: st.foto.x, fy: st.foto.y }; c.setPointerCapture(e.pointerId); });
  c.addEventListener("pointermove", (e) => {
    if (!start) return;
    const r = c.getBoundingClientRect();
    st.foto.x = Math.max(-1, Math.min(1, start.fx - ((e.clientX - start.x) / r.width) * 2.2));
    st.foto.y = Math.max(-0.45, Math.min(1, start.fy - ((e.clientY - start.y) / r.height) * 1.6));
    vykresli();
  });
  const konec = () => { if (start) { start = null; uloz(); } };
  c.addEventListener("pointerup", konec); c.addEventListener("pointercancel", konec);
}

function init() {
  const el = $("#promoObsah");
  if (!el) return;
  el.innerHTML = `
  <div class="pr-mrizka">
    <div>
      <div class="card">
        <h2>🎲 Koho udělat? <span class="muted">AI sama navrhne hráče a důvod – narozeniny, milníky, výročí, legendy – a ověří to</span></h2>
        <div class="akce" style="margin-top:0;align-items:center">
          <button type="button" class="btn" id="prNavrhyBtn">🎲 Navrhni hráče a události</button>
          <label style="margin:0;min-width:200px">Koho<select id="prKoho"><option value="mix">Mix (Češi + legendy NHL)</option><option value="cz">Čeští a slovenští hráči</option><option value="legendy">Legendy NHL</option><option value="hvezdy">Současné hvězdy NHL</option><option value="extraliga">Extraliga</option></select></label>
          <label class="check" style="margin:0"><input type="checkbox" id="prNavrhyAuto"> Navrhovat každý den automaticky</label>
        </div>
        <div class="zprava" id="prNavrhyZprava" hidden></div>
        <div id="prNavrhy"></div>
      </div>
      <div class="card">
        <h2>🔥 Promo hráče</h2>
        <p class="muted" style="margin-top:0">Grafika na oblíbeného hráče – i historického (Jágr, Modano, Hašek…) – ve stylu oficiálních grafik NHL: <b>Milník</b> s obřím číslem, <b>Rekord</b> klubu, <b>Narozeniny</b>, <b>Titulek</b>, nebo klidné tribute šablony. AI dohledá tým, barvy, milník, rekord i datum narození.</p>
        <div class="filtry">
          <label class="cela">Jméno hráče<input id="prJmeno" value="${esc(st.jmeno)}" placeholder="např. Mike Modano" autocomplete="off"></label>
        </div>
        <div class="akce">
          <button type="button" class="btn" id="prNavrhni">✨ Vytvořit</button>
          <button type="button" class="btn ghost" id="prNajdiFoto">🔍 Najít fotku</button>
          <label class="btn ghost">📷 Nahrát fotku<input type="file" id="prSoubor" accept="image/*"></label>
          <button type="button" class="btn ghost" data-vlozit-fotku title="Vložit fotku zkopírovanou do schránky (na počítači stačí Ctrl+V)">📋 Vložit</button>
        </div>
        <div id="prFotky" class="pr-fotky"></div>
        <div class="radek pr-foto2">
          <span class="muted" style="font-size:13px">Druhá fotka (akční, nepovinná):</span>
          <label class="btn ghost small">📷 Nahrát<input type="file" id="prSoubor2" accept="image/*"></label>
          <button type="button" class="btn ghost small" data-vlozit-fotku title="Vložit druhou fotku ze schránky">📋 Vložit</button>
          <button type="button" class="btn ghost small" id="prNajdiFoto2">🔍 Najít</button>
          <button type="button" class="btn ghost small" id="prBezFoto2">Odebrat</button>
          <small class="muted" id="prFoto2Info"></small>
        </div>
        <div class="zprava" id="prZprava" hidden></div>
        <p class="muted" style="font-size:12.5px;margin:10px 0 0">Jen skutečné fotky (Wikimedia Commons s autorem, nebo tvoje vlastní) – nic se negeneruje.</p>
      </div>
      <div class="card">
        <h2>Texty</h2>
        <div id="prFormular"></div>
      </div>
      <div class="card">
        <h2>Popisek pod post</h2>
        <textarea id="prPopisek" rows="7"></textarea>
        <div class="akce">
          <button type="button" class="btn ghost" id="prKopiruj">📋 Zkopírovat popisek</button>
          <button type="button" class="btn ghost" id="prPlan">📅 Do plánu</button>
        </div>
      </div>
    </div>
    <div>
      <div class="card pr-nahled-karta">
        <div class="pr-sablony">${Object.entries(SABLONY).map(([k, s]) => `<button type="button" class="pr-sablona" data-pr-sablona="${k}"><canvas data-pr-nahled="${k}" width="216" height="270"></canvas><b>${s.nazev}</b><small>${s.popis}</small></button>`).join("")}</div>
        <canvas id="prPlatno" class="pr-platno" width="1080" height="1350" title="Táhnutím posuneš fotku"></canvas>
        <div class="filtry tri" style="margin-top:12px">
          <label>Formát<select id="prFormat">${Object.entries(FORMATY).map(([k, f]) => `<option value="${k}">${f.nazev}</option>`).join("")}</select></label>
          <label>Barva týmu<input type="color" id="prBarva"></label>
          <label>Druhá barva<input type="color" id="prBarva2"></label>
          <label>Přiblížení fotky<input type="range" id="prZoom" min="1" max="2.2" step="0.01"></label>
          <label class="check"><input type="checkbox" id="prCb"> Černobílá fotka</label>
          <label class="check"><input type="checkbox" id="prVyrezZap"> Vyříznutý hráč</label>
          <label class="check"><input type="checkbox" id="prLogo"> Logo Deníku hokeje</label>
          <label class="check"><input type="checkbox" id="prVylepsit"> Vylepšit fotku (ostrost, kontrast)</label>
          <button type="button" class="btn ghost small" id="prVyrizniZnovu" title="Znovu vyřízne hráče přesným modelem a dočistí okraje">✂️ Vyříznout znovu</button>
          <label class="check"><input type="checkbox" id="prZare"> Záře za hráčem</label>
        </div>
        <div class="akce">
          <button type="button" class="btn" id="prStahnout">⬇️ Stáhnout obrázek</button>
          <button type="button" class="btn ghost" id="prVideo" title="6 s: pomalý nájezd na fotku a postupné objevení textů – do Reels a Stories">🎬 Video 6 s</button>
          <button type="button" class="btn ghost" id="prNovy">↺ Nový hráč</button>
        </div>
      </div>
    </div>
  </div>`;

  $("#prNavrhni").addEventListener("click", () => navrhni());
  $("#prNavrhyBtn").addEventListener("click", () => navrhniHrace());
  $("#prNavrhy").addEventListener("click", (e) => { const t = e.target.closest("[data-pr-navrh]"); if (t) pouzijNavrh(+t.dataset.prNavrh); });
  $("#prNavrhyAuto").checked = nactiJson(KLIC_NAVRHY_AUTO, false) === true;
  $("#prNavrhyAuto").addEventListener("change", (e) => ulozJson(KLIC_NAVRHY_AUTO, e.target.checked));
  vykresliNavrhy();
  if ($("#prNavrhyAuto").checked && (localStorage.getItem(`${KLIC_NAVRHY_AUTO}_posledni`) || "") !== AI()?.dnes?.()) setTimeout(() => navrhniHrace({ auto: true }), 8000);
  $("#prJmeno").addEventListener("keydown", (e) => { if (e.key === "Enter") navrhni(); });
  $("#prNajdiFoto").addEventListener("click", () => najdiFoto(false));
  $("#prFotky").addEventListener("click", (e) => {
    const t = e.target;
    if (t.id === "prGalerie") { najdiFotoGalerie(false); return; }
    if (t.dataset.prFotka2 !== undefined) { pouzijKandidata(+t.dataset.prFotka2, true); return; }
    if (t.dataset.prFotka !== undefined) pouzijKandidata(+t.dataset.prFotka);
  });
  $("#prVylepsit").addEventListener("change", (e) => { st.vylepsit = e.target.checked; uloz(); vyrez = pripravVyrez(vyrezSurovy) || vyrez; vyrez2 = pripravVyrez(vyrez2Surovy) || vyrez2; vykresli(); });
  $("#prZare").addEventListener("change", (e) => { st.zare = e.target.checked; uloz(); vykresli(); });
  $("#prVyrizniZnovu").addEventListener("click", async () => {
    if (!foto) { zprava("Nejdřív vyber fotku.", "chyba"); return; }
    await vyrizni();
    if (foto2 && st.foto2Id) nastavFoto2(await U().obrazekBlob(st.foto2Id), st.kredit2);
  });
  $("#prSoubor").addEventListener("change", async (e) => { const f = e.target.files[0]; e.target.value = ""; if (f) await nastavFoto(f, ""); });
  $("#prStahnout").addEventListener("click", exportuj);
  $("#prSoubor2").addEventListener("change", async (e) => { const f = e.target.files[0]; e.target.value = ""; if (f) await nastavFoto2(f, ""); });
  $("#prNajdiFoto2").addEventListener("click", najdiFoto2);
  $("#prBezFoto2").addEventListener("click", () => { st.foto2Id = null; st.vyrez2Id = null; st.kredit2 = ""; foto2 = null; vyrez2 = null; uloz(); vykresliFormular(); vykresli(); });
  $("#prVideo").addEventListener("click", exportujVideo);
  $("#prNovy").addEventListener("click", () => { if (!confirm("Začít s novým hráčem?")) return; st = prazdna(); foto = null; vyrez = null; foto2 = null; vyrez2 = null; vyrezSurovy = null; vyrez2Surovy = null; kandidati = []; vykresliKandidaty(); uloz(); $("#prJmeno").value = ""; vykresliFormular(); vykresli(); zprava(""); });
  $("#prKopiruj").addEventListener("click", async () => { try { await navigator.clipboard.writeText($("#prPopisek").value); toast("Popisek zkopírován ✓"); } catch { $("#prPopisek").select(); } });
  $("#prPlan").addEventListener("click", () => {
    window.DHPlan?.pridej({ nazev: `Promo: ${[st.data.krestni, st.data.prijmeni].filter(Boolean).join(" ") || st.jmeno}`, format: "post", zadani: $("#prPopisek").value });
    toast("Přidáno do plánu ✓");
  });
  $("#prPopisek").addEventListener("input", (e) => { st.data.popisek = e.target.value; uloz(); });
  $("#prBarva").addEventListener("input", (e) => { st.barva = e.target.value; uloz(); vykresli(); });
  $("#prBarva2").addEventListener("input", (e) => { st.barva2 = e.target.value; uloz(); vykresli(); });
  $("#prVyrezZap").addEventListener("change", (e) => { st.vyrezZap = e.target.checked; uloz(); vykresli(); });
  $("#prFormat").addEventListener("change", (e) => { st.format = e.target.value; uloz(); vykresli(); });
  $("#prZoom").addEventListener("input", (e) => { st.foto.zoom = +e.target.value; uloz(); vykresli(); });
  $("#prCb").addEventListener("change", (e) => { st.cb = e.target.checked; uloz(); vykresli(); });
  $("#prLogo").addEventListener("change", (e) => { st.logo = e.target.checked; uloz(); vykresli(); });
  el.addEventListener("click", (e) => {
    const s = e.target.closest("[data-pr-sablona]");
    if (s) { st.sablona = s.dataset.prSablona; uloz(); $$("[data-pr-sablona]").forEach((b) => b.classList.toggle("on", b === s)); vykresli(); }
  });
  el.addEventListener("change", (e) => { const t = e.target; if (t.dataset.prCheck) { st.data[t.dataset.prCheck] = t.checked; uloz(); vykresli(); } });
  el.addEventListener("input", (e) => {
    const t = e.target;
    if (t.dataset.pr) { st.data[t.dataset.pr] = t.value; uloz(); vykresli(); }
    if (t.dataset.prCheck) { st.data[t.dataset.prCheck] = t.checked; uloz(); vykresli(); }
  });
  nastavTahani($("#prPlatno"));
  vykresliFormular();
  (async () => {
    try {
      if (st.fotoId) foto = await U().obrazekImg(st.fotoId);
      if (st.vyrezId && st.vyrezModel !== VYREZ_VERZE && foto) st.vyrezId = null; // starý výřez → níž se vyřízne znovu
      if (st.vyrezId) { const img = await U().obrazekImg(st.vyrezId); const c = document.createElement("canvas"); c.width = img.naturalWidth; c.height = img.naturalHeight; c.getContext("2d").drawImage(img, 0, 0); vyrezSurovy = c; vyrez = pripravVyrez(c); }
      else if (foto) vyrizni();
      if (st.foto2Id) foto2 = await U().obrazekImg(st.foto2Id);
      if (st.vyrez2Id && st.vyrez2Model !== VYREZ_VERZE && foto2) { const b2 = await U().obrazekBlob(st.foto2Id); nastavFoto2(b2, st.kredit2); }
      else if (st.vyrez2Id) { const img = await U().obrazekImg(st.vyrez2Id); const c = document.createElement("canvas"); c.width = img.naturalWidth; c.height = img.naturalHeight; c.getContext("2d").drawImage(img, 0, 0); vyrez2Surovy = c; vyrez2 = pripravVyrez(c); }
      vykresliFormular();
    } catch { /* nic */ }
    if (document.fonts?.ready) await document.fonts.ready;
    vykresli();
  })();
  document.addEventListener("dh:zalozka", (e) => { if (e.detail === "promo") vykresli(); });
}

window.DHPromo = { get stav() { return st; }, vykresli, nastavFoto, nastavFoto2, kresliDo, exportujVideo };
init();
})();
