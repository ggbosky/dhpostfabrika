// Uložené rozpracované posty (koncepty) – v IndexedDB tohoto prohlížeče, i s fotkami.
(() => {
"use strict";

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const DB = "dhpf", STORE = "koncepty";
const TYPY = {
  post: { nazev: "Post", ikona: "✍️" },
  carousel: { nazev: "Carousel", ikona: "🎞️" },
  vyroci: { nazev: "Dnes před lety", ikona: "📅" },
};
const moduly = {};      // typ → { ziskej, obnov }
const aktualni = {};    // typ → id otevřeného konceptu

// ------------------------------------------------------------- IndexedDB --

let dbSlib = null;
function db() {
  if (!dbSlib) {
    dbSlib = new Promise((ok, chyba) => {
      if (!("indexedDB" in window)) { chyba(new Error("Tenhle prohlížeč neumí ukládat koncepty.")); return; }
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: "id" });
      r.onsuccess = () => ok(r.result);
      r.onerror = () => chyba(new Error("Ukládání v prohlížeči je zablokované (anonymní okno?)."));
    });
    dbSlib.catch(() => { dbSlib = null; });
  }
  return dbSlib;
}

async function tx(rezim, fn) {
  const d = await db();
  return new Promise((ok, chyba) => {
    const t = d.transaction(STORE, rezim);
    const vysledek = fn(t.objectStore(STORE));
    t.oncomplete = () => ok(vysledek?.result ?? vysledek);
    t.onerror = () => chyba(t.error || new Error("Uložení se nepovedlo."));
    t.onabort = () => chyba(t.error || new Error("Uložení se nepovedlo (málo místa?)."));
  });
}
const vsechny = () => tx("readonly", (s) => s.getAll());
const nacti = (id) => tx("readonly", (s) => s.get(id));
const smaz = (id) => tx("readwrite", (s) => s.delete(id));
const zapis = (zaznam) => tx("readwrite", (s) => s.put(zaznam));

// ---------------------------------------------------------------- obrázky --

// HTMLImageElement → JPEG Blob (nejvýš 2400 px na delší straně). Výsledek se pamatuje,
// takže automatické ukládání nepřevádí stejnou fotku pořád dokola.
const blobCache = new WeakMap();
async function obrazekNaBlob(img) {
  if (blobCache.has(img)) return blobCache.get(img);
  const blob = await obrazekNaBlobBezCache(img);
  if (blob) blobCache.set(img, blob);
  return blob;
}
function obrazekNaBlobBezCache(img, max = 2400) {
  const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
  const m = Math.min(1, max / Math.max(w, h));
  const c = document.createElement("canvas");
  c.width = Math.round(w * m);
  c.height = Math.round(h * m);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  return new Promise((ok) => {
    try { c.toBlob((b) => ok(b), "image/jpeg", 0.9); } catch { ok(null); } // fotka bez povolení CORS
  });
}

function blobNaObrazek(blob) {
  return new Promise((ok, chyba) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => chyba(new Error("Uloženou fotku se nepodařilo načíst."));
    img.src = URL.createObjectURL(blob);
  });
}

function nahledZPlatna(platno) {
  const c = document.createElement("canvas");
  c.width = 270; c.height = 338;
  c.getContext("2d").drawImage(platno, 0, 0, c.width, c.height);
  return new Promise((ok) => {
    try { c.toBlob((b) => ok(b), "image/jpeg", 0.8); } catch { ok(null); }
  });
}

// ----------------------------------------------------------------- ukládání --

function registruj(typ, modul) { moduly[typ] = modul; }
function zapomen(typ) { delete aktualni[typ]; stav(typ, ""); }

function stav(typ, text, druh = "ok") {
  const el = document.querySelector(`[data-koncept-stav="${typ}"]`);
  if (!el) return;
  el.innerHTML = text;
  el.className = `koncept-stav ${druh}`;
}

async function sestavZaznam(typ, id, puvodni, auto) {
  const { nazev, data, obrazky = {}, platno } = await moduly[typ].ziskej();
  const bloby = {};
  let vynechano = 0;
  for (const [klic, img] of Object.entries(obrazky)) {
    if (!img) continue;
    const blob = await obrazekNaBlob(img);
    if (blob) bloby[klic] = blob; else vynechano++;
  }
  return {
    zaznam: {
      id, typ, auto, nazev: (nazev || TYPY[typ].nazev).slice(0, 80), data, obrazky: bloby,
      nahled: platno ? await nahledZPlatna(platno) : null,
      vytvoreno: puvodni?.vytvoreno || Date.now(), upraveno: Date.now(),
    },
    vynechano,
  };
}

async function uloz(typ, jakoNovy = false) {
  if (!moduly[typ]) return;
  stav(typ, "Ukládám…", "");
  try {
    const id = (!jakoNovy && aktualni[typ]) || `${typ}-${Date.now()}`;
    const puvodni = aktualni[typ] && !jakoNovy ? await nacti(id) : null;
    const { zaznam, vynechano } = await sestavZaznam(typ, id, puvodni, false);
    await zapis(zaznam);
    aktualni[typ] = id;
    try { navigator.storage?.persist?.(); } catch { /* nic */ }
    const cas = new Date().toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" });
    stav(typ, `Uloženo ${cas} ✓${vynechano ? ` (${vynechano} fotku z webu nešlo uložit – po otevření ji najdi znovu)` : ""} → <a href="#" data-otevri-koncepty>Koncepty</a>`);
    vykresliSeznam();
    return id;
  } catch (e) {
    stav(typ, `Uložení se nepovedlo: ${esc(e.message)}`, "chyba");
    alert(`Koncept se nepodařilo uložit: ${e.message}`);
  }
}

// ------------------------------------------------- automatické ukládání --
// Rozpracovaná práce se průběžně ukládá sama (záznam „auto-…“) a po otevření stránky se vrátí.

const otisky = {};
const posledniAktivita = {};
let autoBezi = false;

async function otisk(typ) {
  const { data, obrazky = {} } = await moduly[typ].ziskej();
  return JSON.stringify(data) + Object.values(obrazky).map((i) => (i ? i.src : "")).join("|");
}

async function autoUloz(typ) {
  if (!moduly[typ]) return;
  try {
    const o = await otisk(typ);
    if (o === otisky[typ]) return;
    const id = `auto-${typ}`;
    const { zaznam } = await sestavZaznam(typ, id, await nacti(id), true);
    await zapis(zaznam);
    otisky[typ] = o;
    if ($("#zalozkaKoncepty") && !$("#zalozkaKoncepty").hidden) vykresliSeznam();
  } catch { /* automatické ukládání nesmí rušit práci */ }
}

async function autoTik() {
  if (autoBezi) return;
  autoBezi = true;
  try {
    for (const typ of Object.keys(moduly)) {
      if (Date.now() - (posledniAktivita[typ] || 0) < 120000) await autoUloz(typ);
    }
  } finally { autoBezi = false; }
}

async function obnovAutomaticke() {
  for (const typ of Object.keys(moduly)) {
    try {
      const z = await nacti(`auto-${typ}`);
      if (!z) continue;
      const obrazky = {};
      for (const [klic, blob] of Object.entries(z.obrazky || {})) {
        try { obrazky[klic] = await blobNaObrazek(blob); } catch { /* nic */ }
      }
      await moduly[typ].obnov(z.data, obrazky);
      otisky[typ] = await otisk(typ);
    } catch { /* nic */ }
  }
}

async function otevri(id) {
  const z = await nacti(id);
  if (!z) return;
  const m = moduly[z.typ];
  const obrazky = {};
  for (const [klic, blob] of Object.entries(z.obrazky || {})) {
    try { obrazky[klic] = await blobNaObrazek(blob); } catch { /* fotka chybí */ }
  }
  window.DHPost.prepniZalozku(z.typ);
  await m.obnov(z.data, obrazky);
  if (z.auto) { delete aktualni[z.typ]; stav(z.typ, "Obnovena automaticky uložená práce.", ""); }
  else { aktualni[z.typ] = z.id; stav(z.typ, `Otevřeno: <b>${esc(z.nazev)}</b> – „Uložit koncept“ přepíše tuhle verzi.`, ""); }
  otisky[z.typ] = await otisk(z.typ);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// ---------------------------------------------------------------- seznam --

const odkazy = [];
async function vykresliSeznam() {
  const el = $("#kSeznam");
  if (!el) return;
  let zaznamy;
  try { zaznamy = await vsechny(); } catch (e) { el.innerHTML = `<p class="muted">${esc(e.message)}</p>`; return; }
  odkazy.splice(0).forEach((u) => URL.revokeObjectURL(u));
  zaznamy.sort((a, b) => (b.auto ? 1 : 0) - (a.auto ? 1 : 0) || b.upraveno - a.upraveno);
  const rucni = zaznamy.filter((z) => !z.auto).length;
  $("#kPocet").textContent = rucni ? String(rucni) : "";
  document.dispatchEvent(new CustomEvent("dh:koncepty"));
  if (!zaznamy.length) {
    el.innerHTML = `<p class="muted">Zatím žádné koncepty. V záložce Nový post, Carousel nebo Dnes před lety klikni na <b>💾 Uložit koncept</b>.</p>`;
    return;
  }
  el.innerHTML = zaznamy.map((z) => {
    const nahled = z.nahled ? URL.createObjectURL(z.nahled) : "";
    if (nahled) odkazy.push(nahled);
    const t = TYPY[z.typ] || { nazev: z.typ, ikona: "📝" };
    const kdy = new Date(z.upraveno).toLocaleString("cs-CZ", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });
    const n = z.data?.slidy?.length || 0;
    const pocet = z.typ === "carousel" ? ` · ${n} ${n === 1 ? "slide" : n < 5 ? "slidy" : "slidů"}` : "";
    return `<article class="koncept">
      <button type="button" class="koncept-nahled" data-otevri="${esc(z.id)}" title="Otevřít">${nahled ? `<img src="${nahled}" alt="">` : "<span>bez náhledu</span>"}</button>
      <div class="koncept-info">
        <span class="koncept-typ">${t.ikona} ${t.nazev}${pocet}${z.auto ? ` <em class="auto">· automaticky</em>` : ""}</span>
        <b>${esc(z.nazev)}</b>
        <small class="muted">upraveno ${kdy}</small>
        <div class="radek" style="margin-top:8px">
          <button type="button" class="btn small" data-otevri="${esc(z.id)}">Otevřít</button>
          ${z.auto ? "" : `<button type="button" class="btn small ghost" data-naplanuj="${esc(z.id)}" data-typ="${esc(z.typ)}" data-nazev="${esc(z.nazev)}">📆 Naplánovat</button>
          <button type="button" class="btn small ghost" data-smaz="${esc(z.id)}">Smazat</button>`}
        </div>
      </div>
    </article>`;
  }).join("");
}

function init() {
  document.addEventListener("click", async (e) => {
    const t = e.target.closest("[data-uloz-koncept], [data-uloz-novy], [data-otevri], [data-smaz], [data-otevri-koncepty], [data-naplanuj]");
    if (!t) return;
    if (t.dataset.naplanuj) { window.DHPlan?.upravit({ format: t.dataset.typ, nazev: t.dataset.nazev, konceptId: t.dataset.naplanuj, stav: "rozpracovano" }); return; }
    if (t.dataset.ulozKoncept) uloz(t.dataset.ulozKoncept);
    else if (t.dataset.ulozNovy) { e.preventDefault(); uloz(t.dataset.ulozNovy, true); }
    else if (t.dataset.otevri) otevri(t.dataset.otevri).catch((err) => alert(err.message));
    else if (t.dataset.smaz) {
      if (!confirm("Smazat tenhle koncept?")) return;
      await smaz(t.dataset.smaz);
      Object.keys(aktualni).forEach((k) => { if (aktualni[k] === t.dataset.smaz) zapomen(k); });
      vykresliSeznam();
    } else if (t.dataset.otevriKoncepty !== undefined) { e.preventDefault(); window.DHPost.prepniZalozku("koncepty"); }
  });
  // aktivita v záložce = je co automaticky ukládat
  const zalozky = { zalozkaPost: "post", zalozkaCarousel: "carousel", zalozkaVyroci: "vyroci" };
  for (const [id, typ] of Object.entries(zalozky)) {
    const el = document.getElementById(id);
    if (!el) continue;
    for (const ev of ["input", "change", "click", "drop", "pointerup"]) el.addEventListener(ev, () => { posledniAktivita[typ] = Date.now(); }, true);
  }
  setInterval(autoTik, 4000);
  const ulozVse = () => { for (const typ of Object.keys(moduly)) if (posledniAktivita[typ]) autoUloz(typ); };
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") ulozVse(); });
  window.addEventListener("pagehide", ulozVse);
  document.querySelector('.tab[data-tab="koncepty"]')?.addEventListener("click", vykresliSeznam);

  obnovAutomaticke().then(vykresliSeznam);
}

window.DHKoncepty = { registruj, zapomen, uloz, otevri, vykresliSeznam, seznam: vsechny };
document.addEventListener("DOMContentLoaded", init);
})();
