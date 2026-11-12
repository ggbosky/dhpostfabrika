// Single post „Dnes před X lety“ podle PSD šablony Deníku hokeje.
(() => {
"use strict";

const G = window.DHG;
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const W = 1080, H = 1350;
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const ANTON = '"Anton", "Impact", "Arial Narrow", sans-serif';
const MONT = '"Montserrat", "Arial Black", sans-serif';
const SEDA = "#b4b3b3";
const ZLUTA = "#ffc000";
// Rozmístění podle PSD (1080 × 1350).
const LOGO_POLOHA = { x: 25, y: 18, sirka: 144 };
const VLOZKA = { x: 29, r: 186.5, mezera: 51 };
const FOTO_V = 1110; // hlavní fotka pokrývá horních 1110 px (zbytek je černý přechod)

const stav = {
  datum: "", nadpis: "", nadpisAuto: true, text: "", barva: "#005db8", logo: "seda",
  foto: null, pohled: { zoom: 1, cx: 0.5, cy: 0.35 }, kreditFoto: "",
  vlozka: null, pohledV: { zoom: 1, cx: 0.5, cy: 0.4 }, kreditVlozka: "",
  dotazFoto: "", dotazVlozka: "", tahani: "foto",
};
let zdrojeNavrhu = [];
const platno = () => $("#vPlatno");

// --------------------------------------------------------------- datum --

function rozeberDatum(text) {
  const t = (text || "").trim();
  let m = t.match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})$/);
  if (m) return { d: +m[1], m: +m[2], r: +m[3] };
  m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return { d: +m[3], m: +m[2], r: +m[1] };
  m = t.match(/(\d{4})/);
  return m ? { d: 0, m: 0, r: +m[1] } : null;
}

function nadpisZData(text) {
  const d = rozeberDatum(text);
  if (!d) return "DNES PŘED X LETY";
  const dnes = new Date();
  let let_ = dnes.getFullYear() - d.r;
  if (d.m && (dnes.getMonth() + 1 < d.m || (dnes.getMonth() + 1 === d.m && dnes.getDate() < d.d))) let_ -= 1;
  if (let_ <= 0) return "DNES PŘED X LETY"; // letošní datum: nech šablonový text, ať je vidět, že chybí rok události
  // „DNES“ jen když výročí připadá opravdu na dnešek; jinak jen „PŘED X LETY“.
  const dnesJe = d.d === dnes.getDate() && d.m === dnes.getMonth() + 1;
  const pred = let_ === 1 ? "PŘED ROKEM" : `PŘED ${let_} LETY`;
  return dnesJe ? `DNES ${pred}` : pred;
}

const hezkeDatum = (text) => {
  const d = rozeberDatum(text);
  return d && d.d ? `${d.d}.${d.m}.${d.r}` : (text || "").trim();
};

// ------------------------------------------------------------ kreslení --

function kresli() {
  const ctx = platno().getContext("2d");
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);
  if (stav.foto) G.kresliFoto(ctx, stav.foto, stav.pohled, W, FOTO_V);
  else {
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, "#4a0a0e"); g.addColorStop(0.55, "#160607"); g.addColorStop(1, "#050505");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }

  // Text dole: Anton, zvýraznění barvou.
  const sirka = W - 2 * 32 - 20; // skoro celá šířka (s mezerami mezi písmeny je text širší)
  let v = 70, radky = [];
  for (; v >= 48; v -= 2) {
    ctx.font = `400 ${v}px ${ANTON}`;
    ctx.letterSpacing = `${(0.02 * v).toFixed(1)}px`; // malé mezery mezi písmeny, ať text není nalepený
    radky = G.zalomBohaty(ctx, stav.text || "", sirka);
    if (radky.length <= 4) break;
  }
  const rozestup = Math.round(v * 1.15);
  const posledni = H - 136;
  const prvni = posledni - (radky.length - 1) * rozestup;
  const horniText = radky.length ? prvni - v * 0.86 : H - 200;

  G.ztmaveni(ctx, horniText - 565, horniText + 185, W, H);

  // Kulatá vložená fotka nad textem.
  if (stav.vlozka) {
    const cx = VLOZKA.x + VLOZKA.r, cy = horniText - VLOZKA.mezera - VLOZKA.r;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.65)";
    ctx.shadowBlur = 64;
    ctx.beginPath(); ctx.arc(cx, cy, VLOZKA.r, 0, Math.PI * 2); ctx.fillStyle = "#000"; ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, VLOZKA.r, 0, Math.PI * 2); ctx.clip();
    const d = VLOZKA.r * 2;
    ctx.translate(cx - VLOZKA.r, cy - VLOZKA.r);
    G.kresliFoto(ctx, stav.vlozka, stav.pohledV, d, d);
    ctx.restore();
    ctx.beginPath(); ctx.arc(cx, cy, VLOZKA.r - 2.5, 0, Math.PI * 2);
    ctx.lineWidth = 5; ctx.strokeStyle = stav.barva; ctx.stroke();
  }

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.font = `400 ${v}px ${ANTON}`;
  ctx.letterSpacing = `${(0.02 * v).toFixed(1)}px`;
  radky.forEach((r, i) => G.kresliBohatyRadek(ctx, r, 32, prvni + i * rozestup, stav.barva));

  // Pravý horní roh: DNES PŘED X LETY + datum.
  const nadpis = (stav.nadpisAuto ? nadpisZData(stav.datum) : stav.nadpis || "").toUpperCase();
  const datum = hezkeDatum(stav.datum);
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.45)";
  ctx.shadowBlur = 12;
  ctx.letterSpacing = "0.5px";
  ctx.font = `italic 800 32px ${MONT}`;
  // Ochranné pásmo vpravo: nadpis i datum vždy končí nejdál 30 px od okraje (počítá se se skutečným
  // přesahem kurzívy). Kratší řádek se centruje pod delší, takže nic nevyjede ven.
  const pravyOkraj = W - 30;
  const sirkaTextu = (t) => { const m = ctx.measureText(t); return Math.max(m.width, m.actualBoundingBoxRight || 0); };
  let velikost = 32;
  ctx.font = `italic 800 ${velikost}px ${MONT}`;
  while (velikost > 20 && Math.max(sirkaTextu(nadpis), datum ? sirkaTextu(datum) : 0) > 620) {
    velikost -= 2;
    ctx.font = `italic 800 ${velikost}px ${MONT}`;
  }
  const sN = nadpis ? sirkaTextu(nadpis) : 0;
  const sD = datum ? sirkaTextu(datum) : 0;
  const blok = Math.max(sN, sD);
  const stred = pravyOkraj - blok / 2;
  if (nadpis) {
    ctx.fillStyle = SEDA;
    ctx.fillText(nadpis, stred - sN / 2, 46);
  }
  if (datum) {
    ctx.fillStyle = ZLUTA;
    ctx.fillText(datum, stred - sD / 2, 46 + Math.round(velikost * 1.56));
  }
  ctx.restore();
  ctx.letterSpacing = "0px";

  G.kresliLogo(ctx, stav.logo, LOGO_POLOHA);
}

// ---------------------------------------------------------------- stav --

function ulozKoncept() {
  const { datum, nadpis, nadpisAuto, text, barva, logo, dotazFoto, dotazVlozka } = stav;
  try {
    localStorage.setItem("dhpf_vyroci", JSON.stringify({ datum, nadpis, nadpisAuto, text, barva, logo, dotazFoto, dotazVlozka, popisek: $("#vPopisek").value }));
  } catch { /* nic */ }
}

function nactiKoncept() {
  let k = null;
  try { k = JSON.parse(localStorage.getItem("dhpf_vyroci")); } catch { /* nic */ }
  Object.assign(stav, k ? { ...k } : {
    datum: "10.8.1995",
    text: "Z *Quebecu* do *Denveru* vznikla\n*síla*, která *změnila* hru a rychle\nsi získala *legendární* status.",
  });
  $("#vPopisek").value = k?.popisek || "";
}

function doFormulare() {
  $("#vDatum").value = stav.datum;
  $("#vNadpisAuto").checked = stav.nadpisAuto;
  $("#vNadpis").value = stav.nadpisAuto ? nadpisZData(stav.datum) : stav.nadpis;
  $("#vNadpis").disabled = stav.nadpisAuto;
  $("#vText").value = stav.text;
  $("#vBarva").value = stav.barva;
  $("#vLogo").value = stav.logo;
  $("#vFotoInfo").textContent = stav.foto ? (stav.kreditFoto ? stav.kreditFoto.replace("📸 Foto: ", "") : "vlastní fotka") : "zatím bez fotky";
  $("#vVlozkaInfo").textContent = stav.vlozka ? (stav.kreditVlozka ? stav.kreditVlozka.replace("📸 Foto: ", "") : "vlastní fotka") : "bez kulaté fotky";
  $("#vZoomFoto").value = stav.pohled.zoom;
  $("#vZoomVlozka").value = stav.pohledV.zoom;
  $("#vVlozkaOvl").hidden = !stav.vlozka;
  $("#vBezVlozky").hidden = !stav.vlozka;
  prepocitejPopisek();
}

function prekresli() { kresli(); ulozKoncept(); }

// Kredity fotek a zdroje v popisku – odstavce těsně před hashtagy.
function nastavOdstavec(prefix, novy) {
  const el = $("#vPopisek");
  if (!el.value.trim() && !novy) return;
  const odstavce = el.value.split(/\n{2,}/).filter((o) => !o.trim().startsWith(prefix));
  if (novy) {
    const i = odstavce.length && odstavce[odstavce.length - 1].trim().startsWith("#") ? odstavce.length - 1 : odstavce.length;
    odstavce.splice(i, 0, novy);
  }
  el.value = odstavce.join("\n\n");
  prepocitejPopisek();
}
const aktualizujKredity = () => nastavOdstavec("📸 Foto:", [...new Set([stav.kreditFoto, stav.kreditVlozka].filter(Boolean))].join("\n"));

function prepocitejPopisek() {
  const text = $("#vPopisek").value;
  const znaky = [...text].length;
  const tagy = (text.match(/#[\p{L}\p{N}_]+/gu) || []).length;
  $("#vPocty").innerHTML = `<span class="${znaky > 2200 ? "spatne" : ""}">${znaky} / 2200 znaků</span><span class="${tagy > 30 ? "spatne" : ""}">${tagy} / 30 hashtagů</span>`;
}

async function nastavObrazek(kam, img, kredit) {
  if (kam === "foto") { stav.foto = img; stav.pohled = { zoom: 1, cx: 0.5, cy: 0.35 }; stav.kreditFoto = kredit; }
  else { stav.vlozka = img; stav.pohledV = { zoom: 1, cx: 0.5, cy: 0.4 }; stav.kreditVlozka = kredit; }
  if (kam === "vlozka") { stav.tahani = "vlozka"; $(`input[name=vTahani][value=vlozka]`).checked = true; }
  aktualizujKredity();
  doFormulare();
  prekresli();
}

async function najdiFoto(kam) {
  const vychozi = kam === "foto" ? stav.dotazFoto : stav.dotazVlozka;
  const v = await window.DHAI.vyberFoto(vychozi || (stav.text || "").replace(/\*/g, "").split(/\s+/).slice(0, 4).join(" "));
  if (v) nastavObrazek(kam, v.img, window.DHAI.kredit(v.foto));
}

// ------------------------------------------------------------------- AI --

const SCHEMA = {
  type: "object",
  properties: {
    datum: { type: "string", description: "den, kdy se událost PŮVODNĚ stala (rok v minulosti), ve tvaru D.M.RRRR" },
    text: { type: "string", description: "text do obrázku" },
    barva: { type: "string", description: "hex hlavní barvy týmu z příběhu, dobře čitelná na černé (např. #005DB8)" },
    popisek: { type: "string", description: "text pod příspěvek bez hashtagů" },
    hashtagy: { type: "array", items: { type: "string" } },
    foto_dotaz: { type: "string", description: "hlavní fotka: 2–4 slova, hlavně jméno hráče/týmu" },
    vlozka_dotaz: { type: "string", description: "malá kulatá fotka: jiný hráč/osobnost nebo logo týmu, 2–4 slova" },
    k_overeni: { type: "array", items: { type: "string" } },
  },
  required: ["datum", "text", "barva", "popisek", "hashtagy", "foto_dotaz", "vlozka_dotaz", "k_overeni"],
};

function vZprava(html, druh = "") {
  const el = $("#vAiZprava");
  el.innerHTML = html;
  el.className = "zprava " + druh;
  el.hidden = !html;
}

function citelnaBarva(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex || "").trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const jas = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return jas < 0.12 || jas > 0.92 ? null : `#${m[1].toLowerCase()}`;
}

async function navrhni() {
  window.DHKoncepty?.zapomen("vyroci");
  const AI = window.DHAI;
  const zadani = $("#vAiZadani").value.trim();
  if (!zadani) { vZprava("Napiš, jaké výročí chceš zpracovat.", "chyba"); return; }
  if (!AI.maKlic()) { vZprava('AI pomocník potřebuje AI klíč (Claude nebo Gemini). <a href="#" data-jdi-na-ai>Nastavit klíč</a>', "chyba"); return; }
  const b = $("#vAiNavrhni");
  b.disabled = true; b.textContent = "Píšu…";
  vZprava("AI píše text… (obvykle 5–15 s)");
  try {
    const r = await AI.gemini({
      system: `Jsi redaktor Instagramu Deník hokeje a píšeš single post „DNES PŘED X LETY“ – připomínku hokejového výročí.
Datum ("datum") je den, kdy se událost PŮVODNĚ stala – v minulém roce, nikdy letošní datum (z něj se počítá „před X lety“).
Text do obrázku ("text"): 1–2 úderné věty, celkem 60–120 znaků, ideálně 3 řádky oddělené \\n (každý řádek do ~32 znaků), BEZ emoji.
Pointa příběhu, ne suchý výčet. 3–5 klíčových slov obal hvězdičkami *takhle* – zobrazí se barvou týmu.
Popisek: první řádek hook s 📅 („📅 Dnes před 31 lety…“ jen pokud událost připadá na dnešní den, jinak „📅 Před 31 lety…“), pak 2–3 krátké odstavce s fakty a kontextem,
na konci otázka pro fanoušky. Hashtagy 6–10.
${AI.stylDoPromptu()}

${AI.PRAVIDLA}
- Dnešní datum: ${AI.dnes()}.`,
      zadani: `VÝROČÍ / PODKLADY OD REDAKTORA:\n${zadani}\n\nNapiš post.`,
      schema: SCHEMA,
    });
    stav.datum = r.datum || stav.datum;
    stav.nadpisAuto = true;
    stav.text = (r.text || "").replace(/(?:\p{Extended_Pictographic}|\p{Regional_Indicator})(?:\uFE0F|\u200D\p{Extended_Pictographic})*\s?/gu, "").trim();
    stav.barva = citelnaBarva(r.barva) || stav.barva;
    stav.dotazFoto = r.foto_dotaz || "";
    stav.dotazVlozka = r.vlozka_dotaz || "";
    const tagy = AI.cisteHashtagy(r.hashtagy);
    const zdroj = zdrojeNavrhu.length ? `ℹ️ Zdroj: ${zdrojeNavrhu.map((z) => z.titulek).join(", ")}` : "";
    $("#vPopisek").value = [r.popisek, zdroj, tagy.join(" ")].map((x) => (x || "").trim()).filter(Boolean).join("\n\n");
    stav.foto = null; stav.vlozka = null; stav.kreditFoto = ""; stav.kreditVlozka = "";
    doFormulare(); prekresli();

    const overit = (r.k_overeni || []).filter(Boolean);
    const seznam = overit.length ? `<br><b>Před zveřejněním ověř:</b><ul>${overit.map((o) => `<li>${esc(o)}</li>`).join("")}</ul>` : "";
    vZprava(`Text hotový, hledám fotky…${seznam}`, "varovani");
    const pouzite = new Set();
    const [hlavni, mala] = await Promise.all([
      AI.prvniFoto([stav.dotazFoto], pouzite),
      stav.dotazVlozka ? AI.prvniFoto([stav.dotazVlozka], pouzite) : Promise.resolve(null),
    ]);
    if (hlavni) { stav.foto = hlavni.img; stav.kreditFoto = AI.kredit(hlavni.foto); }
    if (mala && mala.foto.url !== hlavni?.foto.url) { stav.vlozka = mala.img; stav.kreditVlozka = AI.kredit(mala.foto); }
    aktualizujKredity(); doFormulare(); prekresli();
    vZprava(`Hotovo ✓ Fotky: ${[hlavni, mala].filter(Boolean).length} / 2. Všechno teď můžeš upravit – text, datum, barvu i fotky.${seznam}`, overit.length ? "varovani" : "ok");
  } catch (e) {
    vZprava(esc(e.message), "chyba");
  } finally {
    b.disabled = false; b.textContent = "✨ Navrhnout";
  }
}

window.DHKoncepty?.registruj("vyroci", {
  async ziskej() {
    kresli();
    const { foto, vlozka, ...zbytek } = stav;
    return {
      nazev: `${hezkeDatum(stav.datum)} ${(stav.text || "").replace(/\*/g, "").replace(/\s+/g, " ").slice(0, 50)}`.trim() || "Dnes před lety",
      data: { stav: zbytek, popisek: $("#vPopisek").value },
      obrazky: { foto, vlozka },
      platno: platno(),
    };
  },
  async obnov(d, obrazky) {
    Object.assign(stav, d.stav || {});
    stav.foto = obrazky.foto || null;
    stav.vlozka = obrazky.vlozka || null;
    $("#vPopisek").value = d.popisek || "";
    doFormulare();
    prekresli();
  },
});

window.DHVyroci = {
  navrhni(zadani, zdroje = []) {
    window.DHPost.prepniZalozku("vyroci");
    $("#vAiZadani").value = zadani;
    zdrojeNavrhu = zdroje;
    window.scrollTo({ top: 0, behavior: "smooth" });
    navrhni();
  },
  textKOvereni: () => [`${hezkeDatum(stav.datum)}: ${(stav.text || "").replace(/\*/g, "").replace(/\s+/g, " ")}`, $("#vPopisek").value].join("\n\n"),
};

// ---------------------------------------------------------------- start --

function init() {
  nactiKoncept();
  doFormulare();

  $("#vDatum").addEventListener("input", (e) => { stav.datum = e.target.value; if (stav.nadpisAuto) $("#vNadpis").value = nadpisZData(stav.datum); prekresli(); });
  $("#vNadpisAuto").addEventListener("change", (e) => {
    stav.nadpisAuto = e.target.checked;
    if (!stav.nadpisAuto && !stav.nadpis) stav.nadpis = nadpisZData(stav.datum);
    doFormulare(); prekresli();
  });
  $("#vNadpis").addEventListener("input", (e) => { stav.nadpis = e.target.value; prekresli(); });
  $("#vText").addEventListener("input", (e) => { stav.text = e.target.value; prekresli(); });
  $("#vBarva").addEventListener("input", (e) => { stav.barva = e.target.value; prekresli(); });
  $$("#vBarvy [data-barva]").forEach((b) => b.addEventListener("click", () => { stav.barva = b.dataset.barva; doFormulare(); prekresli(); }));
  $("#vLogo").addEventListener("change", (e) => { stav.logo = e.target.value; prekresli(); });

  const soubor = (kam) => async (e) => {
    try { nastavObrazek(kam, await G.nactiObrazek(e.target.files[0]), ""); } catch (err) { alert(err.message); }
    e.target.value = "";
  };
  $("#vFotoSoubor").addEventListener("change", soubor("foto"));
  $("#vVlozkaSoubor").addEventListener("change", soubor("vlozka"));
  $("#vFotoNajdi").addEventListener("click", () => najdiFoto("foto"));
  $("#vVlozkaNajdi").addEventListener("click", () => najdiFoto("vlozka"));
  $("#vBezVlozky").addEventListener("click", () => { stav.vlozka = null; stav.kreditVlozka = ""; stav.tahani = "foto"; $(`input[name=vTahani][value=foto]`).checked = true; aktualizujKredity(); doFormulare(); prekresli(); });
  $("#vZoomFoto").addEventListener("input", (e) => { if (!stav.foto) return; stav.pohled.zoom = +e.target.value; G.omezPohled(stav.foto, stav.pohled, W, FOTO_V); kresli(); });
  $("#vZoomVlozka").addEventListener("input", (e) => { if (!stav.vlozka) return; stav.pohledV.zoom = +e.target.value; G.omezPohled(stav.vlozka, stav.pohledV, VLOZKA.r * 2, VLOZKA.r * 2); kresli(); });
  $$("input[name=vTahani]").forEach((r) => r.addEventListener("change", () => { stav.tahani = r.value; }));
  G.tahani(platno(), W, H, () => {
    if (stav.tahani === "vlozka" && stav.vlozka) return { img: stav.vlozka, pohled: stav.pohledV, w: VLOZKA.r * 2, h: VLOZKA.r * 2 };
    return stav.foto ? { img: stav.foto, pohled: stav.pohled, w: W, h: FOTO_V } : null;
  }, kresli);

  const cil = $("#vNahled");
  cil.addEventListener("dragover", (e) => { e.preventDefault(); cil.classList.add("drop"); });
  cil.addEventListener("dragleave", () => cil.classList.remove("drop"));
  cil.addEventListener("drop", async (e) => {
    e.preventDefault(); cil.classList.remove("drop");
    try { nastavObrazek(stav.tahani === "vlozka" ? "vlozka" : "foto", await G.nactiObrazek(e.dataTransfer.files[0]), ""); } catch (err) { alert(err.message); }
  });

  $("#vAiNavrhni").addEventListener("click", navrhni);
  $("#vAiZadani").addEventListener("input", () => { zdrojeNavrhu = []; });
  $("#vPopisek").addEventListener("input", () => { prepocitejPopisek(); ulozKoncept(); });
  $("#vKopiruj").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText($("#vPopisek").value); } catch { $("#vPopisek").select(); document.execCommand("copy"); }
    const b = $("#vKopiruj"); b.textContent = "Zkopírováno ✓"; setTimeout(() => { b.textContent = "Kopírovat text"; }, 1600);
  });
  $("#vStahni").addEventListener("click", () => {
    kresli();
    const d = rozeberDatum(stav.datum);
    G.stahniPlatno(platno(), `denik-hokeje-dnes-pred-lety-${d ? `${d.r}-${d.m}-${d.d}` : "post"}.jpg`);
  });
  if (G.lzeSdilet()) {
    $("#vSdilej").hidden = false;
    $("#vSdilej").addEventListener("click", () => { kresli(); G.sdilej([platno()], ["denik-hokeje-dnes-pred-lety.jpg"]); });
  }

  kresli();
  if (document.fonts) {
    Promise.all([document.fonts.load(`400 72px Anton`), document.fonts.load(`italic 800 32px Montserrat`)]).then(kresli).catch(() => {});
  }
}

init();
})();
