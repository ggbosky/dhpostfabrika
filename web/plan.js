// Plán publikace: týdenní kalendář + zásobník nápadů. Uložené jen v tomhle prohlížeči (localStorage).
(() => {
"use strict";

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const KLIC = "dhpf_plan";

const STAVY = { napad: "💡 Nápad", rozpracovano: "✏️ Rozpracováno", hotovo: "✅ Připraveno", publikovano: "📤 Publikováno" };
const PORADI = Object.keys(STAVY);
const FORMATY = {
  post: { nazev: "Post", barva: "#e01e26" },
  carousel: { nazev: "Carousel", barva: "#ffc000" },
  vyroci: { nazev: "Dnes před lety", barva: "#4da3ff" },
  reels: { nazev: "Reel", barva: "#b26bff" },
  jine: { nazev: "Jiné", barva: "#8a8a8a" },
};
const DNY = ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"];

const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dnesIso = () => iso(new Date());
const zIso = (s) => new Date(`${s}T12:00:00`);

let polozky = nacti();
let posun = 0; // o kolik týdnů od aktuálního
let upravovana = null;

function nacti() {
  try {
    const v = JSON.parse(localStorage.getItem(KLIC) || "[]");
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}

function uloz() {
  try { localStorage.setItem(KLIC, JSON.stringify(polozky)); }
  catch { window.DHToast?.("Plán se nepodařilo uložit (plné úložiště prohlížeče?).", "chyba"); }
  obnovPocty();
  vykresli();
  document.dispatchEvent(new CustomEvent("dh:plan"));
}

const novaId = () => `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function pridej(p) {
  const z = { id: novaId(), nazev: "", format: "post", stav: "napad", datum: "", cas: "", zadani: "", zdroje: [], konceptId: "", vytvoreno: Date.now(), ...p };
  if (!FORMATY[z.format]) z.format = "jine";
  polozky.push(z);
  uloz();
  return z;
}

function zmen(id, zmeny) {
  const p = polozky.find((x) => x.id === id);
  if (!p) return;
  Object.assign(p, zmeny);
  uloz();
}

function smaz(id) {
  polozky = polozky.filter((x) => x.id !== id);
  uloz();
}

// Pondělí týdne s posunem o `o` týdnů.
function pondeli(o = 0) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + o * 7);
  return d;
}

function dnyTydne(o) {
  const po = pondeli(o);
  return [...Array(7)].map((_, i) => { const d = new Date(po); d.setDate(po.getDate() + i); return d; });
}

function nadchazejici(dni = 7) {
  const od = dnesIso();
  const doD = new Date(); doD.setDate(doD.getDate() + dni - 1);
  const doIso = iso(doD);
  return polozky.filter((p) => p.datum && p.datum >= od && p.datum <= doIso)
    .sort((a, b) => (a.datum + (a.cas || "99")).localeCompare(b.datum + (b.cas || "99")));
}

function obnovPocty() {
  const n = nadchazejici(7).filter((p) => p.stav !== "publikovano").length;
  $$("[data-plan-pocet]").forEach((el) => { el.textContent = n ? String(n) : ""; });
}

// ----------------------------------------------------------------- vykreslení --

function polozkaHtml(p) {
  const f = FORMATY[p.format] || FORMATY.jine;
  return `<article class="pp ${p.stav}" draggable="true" data-id="${p.id}" style="--f:${f.barva}">
    <div class="pp-meta"><span>${f.nazev}</span><span>${esc(p.cas || "")}</span></div>
    <b>${esc(p.nazev || "Bez názvu")}</b>
    <button type="button" class="pp-stav ${p.stav}" data-pl-stav="${p.id}" title="Kliknutím posuneš stav dál">${STAVY[p.stav] || STAVY.napad}</button>
    <div class="pp-akce">
      <button type="button" data-pl-tvor="${p.id}" title="${p.konceptId ? "Otevřít uložený koncept" : "Otevřít ve správném formátu"}">${p.konceptId ? "Otevřít" : "Vytvořit"}</button>
      <button type="button" data-pl-uprav="${p.id}" title="Upravit">✎</button>
    </div>
  </article>`;
}

function rozsahTydne(dny) {
  const a = dny[0], b = dny[6];
  const mesic = (d) => d.toLocaleDateString("cs-CZ", { month: "long" });
  if (a.getMonth() === b.getMonth()) return `${a.getDate()}.–${b.getDate()}. ${b.toLocaleDateString("cs-CZ", { month: "long", year: "numeric" })}`;
  return `${a.getDate()}. ${mesic(a)} – ${b.getDate()}. ${mesic(b)} ${b.getFullYear()}`;
}

function vykresli() {
  const el = $("#planObsah");
  if (!el) return;
  const dny = dnyTydne(posun);
  const dnes = dnesIso();
  const vTydnu = polozky.filter((p) => p.datum >= iso(dny[0]) && p.datum <= iso(dny[6]));
  const pocet = (s) => vTydnu.filter((p) => p.stav === s).length;
  const zasobnik = polozky.filter((p) => !p.datum).sort((a, b) => b.vytvoreno - a.vytvoreno);
  const titulek = posun === 0 ? "Tento týden" : posun === 1 ? "Příští týden" : posun === -1 ? "Minulý týden" : "";

  el.innerHTML = `
    <div class="card">
      <div class="plan-lista">
        <div class="plan-tyden">
          <button type="button" class="ikona" data-pl-posun="-1" aria-label="Předchozí týden">‹</button>
          <b>${titulek ? `${titulek} · ` : ""}${rozsahTydne(dny)}</b>
          <button type="button" class="ikona" data-pl-posun="1" aria-label="Další týden">›</button>
          ${posun ? `<button type="button" class="btn small ghost" data-pl-posun="0">Dnes</button>` : ""}
        </div>
        <div class="plan-souhrn"><b>${vTydnu.length}</b> v týdnu · ${pocet("napad")} nápadů · ${pocet("rozpracovano")} rozpracováno · ${pocet("hotovo")} připraveno · ${pocet("publikovano")} publikováno</div>
        <div class="plan-legenda">${Object.values(FORMATY).slice(0, 4).map((f) => `<span style="--f:${f.barva}"><i></i>${f.nazev}</span>`).join("")}</div>
      </div>
      <div class="plan-mrizka">
        ${dny.map((d, i) => {
          const den = iso(d);
          const tu = polozky.filter((p) => p.datum === den).sort((a, b) => (a.cas || "99").localeCompare(b.cas || "99"));
          return `<div class="plan-den ${den === dnes ? "dnes" : ""} ${den < dnes ? "minuly" : ""}" data-den="${den}">
            <div class="pd-hlava"><span>${DNY[i]}${den === dnes ? " · dnes" : ""}</span><b>${d.getDate()}.</b></div>
            ${tu.map(polozkaHtml).join("")}
            <button type="button" class="plan-pridat" data-plan-novy="${den}">+ Přidat</button>
          </div>`;
        }).join("")}
      </div>
      <p class="muted" style="font-size:12.5px;margin:12px 0 0">Tip: záznamy jde přetahovat myší mezi dny i do zásobníku. Stav změníš kliknutím na štítek.</p>
    </div>
    <div class="card plan-zasobnik" data-den="">
      <h2>💡 Zásobník nápadů <span class="muted">${zasobnik.length ? `${zasobnik.length} bez data` : "témata, na která se chceš vrátit"}</span></h2>
      ${zasobnik.length ? `<div class="pz-mrizka">${zasobnik.map(polozkaHtml).join("")}</div>`
        : `<p class="muted" style="margin:0">Zatím prázdný. V záložce <a href="#temata" data-jdi="temata">Témata</a> klikni u zajímavosti na <b>📆 Do plánu</b>, nebo přidej vlastní nápad.</p>`}
      <div class="akce"><button type="button" class="btn small ghost" data-plan-novy="">+ Nový nápad</button></div>
    </div>`;
}

// -------------------------------------------------------------------- editor --

function upravit(p = {}) {
  const dlg = $("#planDialog");
  const existujici = p.id ? polozky.find((x) => x.id === p.id) : null;
  upravovana = existujici ? existujici.id : null;
  const z = { nazev: "", format: "post", stav: "napad", datum: "", cas: "", zadani: "", zdroje: [], konceptId: "", ...(existujici || p) };
  $("#planDlgTitul").textContent = existujici ? "Upravit záznam" : (z.datum ? "Naplánovat" : "Nový záznam v plánu");
  $("#plNazev").value = z.nazev || "";
  $("#plFormat").value = FORMATY[z.format] ? z.format : "jine";
  $("#plStav").value = STAVY[z.stav] ? z.stav : "napad";
  $("#plDatum").value = z.datum || "";
  $("#plCas").value = z.cas || "";
  $("#plZadani").value = z.zadani || "";
  const info = [];
  if (z.konceptId) info.push("Propojeno s uloženým konceptem.");
  if (z.zdroje?.length) info.push(`Zdroje: ${z.zdroje.map((x) => esc(x.titulek)).join(", ")}`);
  $("#plInfo").innerHTML = info.join(" ");
  $("#plSmazat").hidden = !existujici;
  dlg.dataset.konceptId = z.konceptId || "";
  dlg._zdroje = z.zdroje || [];
  dlg.showModal();
  setTimeout(() => (z.nazev ? $("#plDatum") : $("#plNazev")).focus(), 30);
}

function zFormulare() {
  const dlg = $("#planDialog");
  return {
    nazev: $("#plNazev").value.trim(),
    format: $("#plFormat").value,
    stav: $("#plStav").value,
    datum: $("#plDatum").value,
    cas: $("#plCas").value,
    zadani: $("#plZadani").value.trim(),
    konceptId: dlg.dataset.konceptId || "",
    zdroje: dlg._zdroje || [],
  };
}

function ulozFormular() {
  const data = zFormulare();
  if (!data.nazev) { $("#plNazev").focus(); return null; }
  let p;
  if (upravovana) { zmen(upravovana, data); p = polozky.find((x) => x.id === upravovana); }
  else p = pridej(data);
  $("#planDialog").close();
  const kdy = p.datum ? zIso(p.datum).toLocaleDateString("cs-CZ", { weekday: "long", day: "numeric", month: "numeric" }) : "zásobník nápadů";
  window.DHToast?.(`Uloženo do plánu: <b>${esc(p.nazev)}</b> (${kdy})`);
  return p;
}

async function vytvor(p) {
  if (!p) return;
  if (p.stav === "napad") zmen(p.id, { stav: "rozpracovano" });
  if (p.konceptId) {
    try { await window.DHKoncepty.otevri(p.konceptId); return; }
    catch { window.DHToast?.("Propojený koncept už neexistuje – otevírám nový.", "info"); }
  }
  const zadani = [p.nazev, p.zadani].filter(Boolean).join("\n\n");
  window.DHShell?.tvor(p.format === "jine" ? "post" : p.format, zadani, p.zdroje || []);
}

function textTydne() {
  const dny = dnyTydne(posun);
  const radky = [`Plán – ${rozsahTydne(dny)}`];
  dny.forEach((d, i) => {
    const tu = polozky.filter((p) => p.datum === iso(d)).sort((a, b) => (a.cas || "99").localeCompare(b.cas || "99"));
    if (!tu.length) return;
    radky.push("", `${DNY[i]} ${d.getDate()}. ${d.getMonth() + 1}.`);
    tu.forEach((p) => radky.push(`- ${p.cas ? `${p.cas} ` : ""}[${FORMATY[p.format]?.nazev || "Jiné"}] ${p.nazev} – ${STAVY[p.stav].replace(/^\S+\s/, "")}`));
  });
  return radky.length > 1 ? radky.join("\n") : `${radky[0]}\n\n(prázdný týden)`;
}

// ---------------------------------------------------------------- události --

function init() {
  $("#plFormat").innerHTML = Object.entries(FORMATY).map(([k, f]) => `<option value="${k}">${f.nazev}</option>`).join("");
  $("#plStav").innerHTML = Object.entries(STAVY).map(([k, s]) => `<option value="${k}">${s}</option>`).join("");

  $("#planForm").addEventListener("submit", (e) => { e.preventDefault(); ulozFormular(); });
  $("#plVytvorit").addEventListener("click", () => { const p = ulozFormular(); if (p) vytvor(p); });
  $("#plSmazat").addEventListener("click", () => {
    if (!upravovana || !confirm("Smazat tenhle záznam z plánu?")) return;
    smaz(upravovana);
    $("#planDialog").close();
  });

  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-plan-novy], [data-pl-stav], [data-pl-tvor], [data-pl-uprav], [data-pl-posun], [data-plan-kopirovat]");
    if (!t) return;
    const d = t.dataset;
    if (d.planNovy !== undefined) upravit({ datum: d.planNovy });
    else if (d.plStav) {
      const p = polozky.find((x) => x.id === d.plStav);
      if (p) zmen(p.id, { stav: PORADI[(PORADI.indexOf(p.stav) + 1) % PORADI.length] });
    } else if (d.plTvor) vytvor(polozky.find((x) => x.id === d.plTvor));
    else if (d.plUprav) upravit(polozky.find((x) => x.id === d.plUprav));
    else if (d.plPosun !== undefined) { posun = d.plPosun === "0" ? 0 : posun + Number(d.plPosun); vykresli(); }
    else if (d.planKopirovat !== undefined) {
      navigator.clipboard.writeText(textTydne()).then(() => window.DHToast?.("Plán týdne zkopírován ✓"), () => window.DHToast?.("Kopírování se nepovedlo.", "chyba"));
    }
  });

  // přetahování mezi dny
  const obsah = $("#planObsah");
  obsah.addEventListener("dragstart", (e) => {
    const p = e.target.closest?.(".pp");
    if (!p) return;
    e.dataTransfer.setData("text/plain", p.dataset.id);
    e.dataTransfer.effectAllowed = "move";
    p.classList.add("tahne");
  });
  obsah.addEventListener("dragend", () => $$(".tahne, .cil", obsah).forEach((x) => x.classList.remove("tahne", "cil")));
  obsah.addEventListener("dragover", (e) => {
    const cil = e.target.closest("[data-den]");
    if (!cil) return;
    e.preventDefault();
    $$(".cil", obsah).forEach((x) => x !== cil && x.classList.remove("cil"));
    cil.classList.add("cil");
  });
  obsah.addEventListener("drop", (e) => {
    const cil = e.target.closest("[data-den]");
    if (!cil) return;
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain");
    if (id) zmen(id, { datum: cil.dataset.den });
  });

  window.addEventListener("storage", (e) => { if (e.key === KLIC) { polozky = nacti(); obnovPocty(); vykresli(); } });
  obnovPocty();
  vykresli();
}

window.DHPlan = { pridej, upravit, polozky: () => polozky.slice(), nadchazejici, STAVY, FORMATY };
init();
})();
