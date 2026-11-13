// Přehled: rychlý start s AI, formáty, rozpracované koncepty, plán na týden a stav nastavení.
(() => {
"use strict";

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const ik = (n) => `<svg class="ik"><use href="#i-${n}"/></svg>`;
const F = () => window.DHShell?.FORMATY || {};

let odkazy = [];

function pozdrav() {
  const h = new Date().getHours();
  return h < 9 ? "Dobré ráno" : h < 18 ? "Dobrý den" : "Dobrý večer";
}

function vykresli() {
  const el = $("#prehledObsah");
  if (!el) return;
  const datum = new Date().toLocaleDateString("cs-CZ", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const den = new Date().toLocaleDateString("cs-CZ", { day: "numeric", month: "long" });
  const formaty = Object.entries(F());
  el.innerHTML = `
    <div class="ph-uvod">
      <div class="ph-pozdrav">${pozdrav()} · ${datum}</div>
      <h2>Co dnes vytvoříme?</h2>
      <p class="muted" style="margin:0">Napiš téma a fakta – AI připraví návrh ve formátu, který vybereš. Nebo začni ručně kliknutím na formát níž.</p>
      <div class="ph-zadani">
        <textarea id="phZadani" placeholder="např. Jaromír Jágr odehrál první zápas v NHL 5. října 1990 za Pittsburgh…"></textarea>
        <div class="ph-tl"><span>Vytvořit jako</span>
          ${formaty.map(([k, f], i) => `<button type="button" class="btn small ${i ? "ghost" : ""}" data-ph-tvor="${k}">${ik(f.ikona)} ${f.nazev}</button>`).join("")}
        </div>
        <p class="muted" id="phBezKlice" style="margin:0;font-size:13px" hidden>AI je vypnutá – zadání se jen předvyplní. <a href="#" data-jdi-na-ai>Nastavit AI klíč</a></p>
      </div>
    </div>
    <div class="ph-mrizka">
      <div class="ph-formaty">
        ${formaty.map(([k, f]) => `<button type="button" class="ph-format" style="--f:${f.barva}" data-jdi="${k}">
          <span class="ik-box" style="--f:${f.barva}">${ik(f.ikona)}</span><b>${f.nazev}</b><span>${f.popis}</span><em>Začít →</em></button>`).join("")}
      </div>
      <div class="card ph-cela ph-statistiky" id="phStatistiky"></div>
      <div class="card ph-sirsi">
        <h2>Pokračuj v práci</h2>
        <div class="ph-seznam" id="phKoncepty"><p class="muted" style="margin:0">Načítám…</p></div>
        <div class="akce" style="margin-top:12px"><button type="button" class="btn small ghost" data-jdi="koncepty">Všechny koncepty →</button></div>
      </div>
      <div class="card ph-uzsi">
        <h2>Příštích 7 dní</h2>
        <div class="ph-seznam" id="phPlan"></div>
        <div class="akce" style="margin-top:12px">
          <button type="button" class="btn small ghost" data-jdi="plan">Otevřít plán →</button>
          <button type="button" class="btn small ghost" data-plan-novy="">+ Přidat</button>
        </div>
      </div>
      <div class="card ai-karta ph-sirsi">
        <h2>📅 Dnes v historii</h2>
        <p style="margin:0 0 4px">Co se v hokeji stalo <b>${den}</b> v minulých letech? AI to najde i se zdroji – hotový tip na „Dnes před X lety“.</p>
        <div class="akce">
          <button type="button" class="btn" data-ph-vyroci>${ik("vyroci")} Najít výročí dnešního dne</button>
          <button type="button" class="btn ghost" data-jdi="temata">Jiná témata</button>
        </div>
      </div>
      <div class="card ph-uzsi">
        <h2>Nastavení a zkratky</h2>
        <ul class="ph-kontrola" id="phKontrola"></ul>
        <div class="ph-zkratky" style="margin-top:14px">
          <span><kbd>Ctrl</kbd> <kbd>K</kbd></span><span>hledat a příkazy odkudkoliv</span>
          <span><kbd>Ctrl</kbd> <kbd>S</kbd></span><span>uložit rozpracovaný koncept</span>
          <span><kbd>Ctrl</kbd> <kbd>Enter</kbd></span><span>odeslat zadání pro AI</span>
        </div>
      </div>
    </div>`;
  vyplnStav();
  vyplnKoncepty();
  vyplnPlan();
  vyplnStatistiky();
}

function vyplnStatistiky() {
  const el = $("#phStatistiky");
  if (!el) return;
  const s = window.DHStatistiky?.prehled();
  if (!s) {
    el.innerHTML = `<div class="ph-st-prazdne"><span class="ik-box">${ik("statistiky")}</span>
      <div><b>Připoj Instagram a uvidíš, co funguje</b><small class="muted">Dosah, uložení, nejlepší čas na post a AI rozbor – oficiálně přes Instagram API nebo z exportu CSV.</small></div>
      <button type="button" class="btn small" data-jdi="statistiky">📊 Otevřít statistiky</button></div>`;
    return;
  }
  const k = (n, h, p) => `<div class="ph-st-k"><span>${n}</span><b>${h}</b>${p ? `<small>${p}</small>` : ""}</div>`;
  const cislo = (n) => (n == null ? "–" : n >= 1e4 ? `${Math.round(n / 1e3)} tis.` : n >= 1e3 ? `${(n / 1e3).toLocaleString("cs-CZ", { maximumFractionDigits: 1 })} tis.` : Math.round(n).toLocaleString("cs-CZ"));
  el.innerHTML = `<div class="ph-st">
    <div class="ph-st-hlava"><b>📊 Instagram · posledních 30 dní</b>${s.demo ? `<span class="pill warn">ukázková data</span>` : ""}
      <button type="button" class="btn small ghost" data-jdi="statistiky">Detail →</button></div>
    <div class="ph-st-mrizka">
      ${k("Sledující", cislo(s.profil?.sledujici))}
      ${k("Příspěvků", cislo(s.souhrn.pocet))}
      ${k("Průměrný dosah", cislo(s.souhrn.dosah))}
      ${k("Míra interakce", s.souhrn.mira == null ? "–" : `${(s.souhrn.mira * 100).toLocaleString("cs-CZ", { maximumFractionDigits: 1 })} %`)}
      ${k("Nejlepší čas", s.nejCas ? `${s.nejCas.denNazev} ${s.nejCas.od}–${s.nejCas.do} h` : "–", s.nejCas ? "🔥 podle tvých dat" : "málo dat")}
    </div></div>`;
}

function vyplnStav() {
  const AI = window.DHAI;
  const maAI = !!AI?.maKlic();
  const bez = $("#phBezKlice");
  if (bez) bez.hidden = maAI;
  const pAI = $("#pAI")?.textContent.replace(/^AI:\s*/i, "") || "";
  const styl = $("#pStyl");
  const stylOk = styl && !/výchozí/i.test(styl.textContent);
  const el = $("#phKontrola");
  if (!el) return;
  el.innerHTML = `
    <li class="${maAI ? "ok" : ""}"><i>${maAI ? "✓" : "!"}</i><span>${maAI ? `AI zapnutá – ${esc(pAI)}` : `AI vypnutá – <a href="#" data-jdi-na-ai>vložit klíč</a>`}</span></li>
    <li class="${stylOk ? "ok" : ""}"><i>${stylOk ? "✓" : "!"}</i><span>${stylOk ? "Styl naučený z tvých postů" : `Styl je výchozí – <a href="#styl" data-jdi="styl">nauč aplikaci svůj styl</a>`}</span></li>`;
}

async function vyplnKoncepty() {
  const el = $("#phKoncepty");
  if (!el) return;
  odkazy.splice(0).forEach((u) => URL.revokeObjectURL(u));
  let zaznamy = [];
  try { zaznamy = (await window.DHKoncepty?.seznam?.()) || []; } catch { /* prohlížeč neukládá */ }
  zaznamy.sort((a, b) => b.upraveno - a.upraveno);
  const rucni = new Set(zaznamy.filter((z) => !z.auto).map((z) => `${z.typ}|${z.nazev}`));
  zaznamy = zaznamy.filter((z) => !z.auto || !rucni.has(`${z.typ}|${z.nazev}`));
  if (!zaznamy.length) {
    el.innerHTML = `<p class="muted" style="margin:0">Zatím nic rozpracovaného. Začni formátem nahoře – práce se ukládá sama.</p>`;
    return;
  }
  el.innerHTML = zaznamy.slice(0, 4).map((z) => {
    const url = z.nahled ? URL.createObjectURL(z.nahled) : "";
    if (url) odkazy.push(url);
    const f = F()[z.typ] || { nazev: z.typ };
    const kdy = new Date(z.upraveno).toLocaleString("cs-CZ", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });
    return `<button type="button" class="ph-radek" data-otevri="${esc(z.id)}">
      ${url ? `<img src="${url}" alt="">` : `<span class="ph-mini"></span>`}
      <span><b>${esc(z.nazev)}</b><small>${esc(f.nazev)}${z.auto ? " · automaticky uloženo" : ""} · ${kdy}</small></span>
      ${ik("sipka")}</button>`;
  }).join("");
}

function vyplnPlan() {
  const el = $("#phPlan");
  if (!el) return;
  const P = window.DHPlan;
  const tu = P?.nadchazejici(7) || [];
  if (!tu.length) {
    el.innerHTML = `<p class="muted" style="margin:0">Na příštích 7 dní nic naplánovaného. U témat klikni na <b>📆 Do plánu</b> nebo přidej záznam.</p>`;
    return;
  }
  el.innerHTML = tu.slice(0, 6).map((p) => {
    const d = new Date(`${p.datum}T12:00`);
    const f = P.FORMATY[p.format] || P.FORMATY.jine;
    return `<button type="button" class="ph-radek" data-pl-uprav="${p.id}" style="border-left:3px solid ${f.barva}">
      <span class="ph-den">${d.toLocaleDateString("cs-CZ", { weekday: "short" })}<b>${d.getDate()}.</b></span>
      <span><b>${esc(p.nazev || "Bez názvu")}</b><small>${f.nazev}${p.cas ? ` · ${esc(p.cas)}` : ""} · ${P.STAVY[p.stav]}</small></span></button>`;
  }).join("");
}

function init() {
  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-ph-tvor], [data-ph-vyroci]");
    if (!t) return;
    if (t.dataset.phTvor) window.DHShell?.tvor(t.dataset.phTvor, $("#phZadani")?.value || "");
    else window.DHShell?.hledatVyroci();
  });
  document.addEventListener("keydown", (e) => {
    if (e.target.id === "phZadani" && e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      window.DHShell?.tvor("post", e.target.value);
    }
  });
  document.addEventListener("dh:zalozka", (e) => { if (e.detail === "prehled") { vyplnStav(); vyplnKoncepty(); vyplnPlan(); vyplnStatistiky(); } });
  document.addEventListener("dh:koncepty", () => { if (!$("#zalozkaPrehled").hidden) vyplnKoncepty(); });
  document.addEventListener("dh:plan", vyplnPlan);
  document.addEventListener("dh:statistiky", vyplnStatistiky);
  vykresli();
}

document.addEventListener("DOMContentLoaded", init);
})();
