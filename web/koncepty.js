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

// HTMLImageElement → JPEG Blob (nejvýš 2400 px na delší straně).
function obrazekNaBlob(img, max = 2400) {
  const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
  const m = Math.min(1, max / Math.max(w, h));
  const c = document.createElement("canvas");
  c.width = Math.round(w * m);
  c.height = Math.round(h * m);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  return new Promise((ok) => c.toBlob(ok, "image/jpeg", 0.9));
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
  return new Promise((ok) => c.toBlob(ok, "image/jpeg", 0.8));
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

async function uloz(typ, jakoNovy = false) {
  const m = moduly[typ];
  if (!m) return;
  stav(typ, "Ukládám…", "");
  try {
    const { nazev, data, obrazky = {}, platno } = await m.ziskej();
    const bloby = {};
    for (const [klic, img] of Object.entries(obrazky)) if (img) bloby[klic] = await obrazekNaBlob(img);
    const id = (!jakoNovy && aktualni[typ]) || `${typ}-${Date.now()}`;
    const puvodni = aktualni[typ] && !jakoNovy ? await nacti(id) : null;
    await zapis({
      id, typ, nazev: (nazev || TYPY[typ].nazev).slice(0, 80), data, obrazky: bloby,
      nahled: platno ? await nahledZPlatna(platno) : null,
      vytvoreno: puvodni?.vytvoreno || Date.now(), upraveno: Date.now(),
    });
    aktualni[typ] = id;
    try { navigator.storage?.persist?.(); } catch { /* nic */ }
    const cas = new Date().toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" });
    stav(typ, `Uloženo ${cas} ✓ <a href="#" data-otevri-koncepty>Koncepty</a>`);
    vykresliSeznam();
  } catch (e) {
    stav(typ, esc(e.message), "chyba");
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
  aktualni[z.typ] = z.id;
  stav(z.typ, `Otevřeno: <b>${esc(z.nazev)}</b> – „Uložit koncept“ přepíše tuhle verzi.`, "");
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
  zaznamy.sort((a, b) => b.upraveno - a.upraveno);
  $("#kPocet").textContent = zaznamy.length ? `(${zaznamy.length})` : "";
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
        <span class="koncept-typ">${t.ikona} ${t.nazev}${pocet}</span>
        <b>${esc(z.nazev)}</b>
        <small class="muted">upraveno ${kdy}</small>
        <div class="radek" style="margin-top:8px">
          <button type="button" class="btn small" data-otevri="${esc(z.id)}">Otevřít</button>
          <button type="button" class="btn small ghost" data-smaz="${esc(z.id)}">Smazat</button>
        </div>
      </div>
    </article>`;
  }).join("");
}

function init() {
  document.addEventListener("click", async (e) => {
    const t = e.target.closest("[data-uloz-koncept], [data-uloz-novy], [data-otevri], [data-smaz], [data-otevri-koncepty]");
    if (!t) return;
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
  vykresliSeznam();
}

window.DHKoncepty = { registruj, zapomen, uloz, otevri, vykresliSeznam };
document.addEventListener("DOMContentLoaded", init);
})();
