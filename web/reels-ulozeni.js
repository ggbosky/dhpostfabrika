// Reels Factory – úložiště projektů a médií (IndexedDB tohoto prohlížeče).
// projekty: JSON projektu · soubory: Blob médií (importovaná videa, hlas, hudba) · rendery: hotová MP4
(() => {
"use strict";

const DB = "dhpf_reels";
let dbSlib = null;

function db() {
  if (!dbSlib) {
    dbSlib = new Promise((ok, chyba) => {
      if (!("indexedDB" in window)) { chyba(new Error("Tenhle prohlížeč neumí ukládat projekty.")); return; }
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => {
        const d = r.result;
        for (const s of ["projekty", "soubory", "rendery"]) if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, { keyPath: "id" });
      };
      r.onsuccess = () => ok(r.result);
      r.onerror = () => chyba(new Error("Ukládání v prohlížeči je zablokované (anonymní okno?)."));
    });
    dbSlib.catch(() => { dbSlib = null; });
  }
  return dbSlib;
}

async function tx(store, rezim, fn) {
  const d = await db();
  return new Promise((ok, chyba) => {
    const t = d.transaction(store, rezim);
    const r = fn(t.objectStore(store));
    t.oncomplete = () => ok(r?.result);
    t.onerror = () => chyba(t.error || new Error("Uložení se nepovedlo."));
    t.onabort = () => chyba(t.error || new Error("Uložení se nepovedlo (málo místa v prohlížeči?)."));
  });
}

const uloz = (store, zaznam) => tx(store, "readwrite", (s) => s.put(zaznam));
const nacti = (store, id) => tx(store, "readonly", (s) => s.get(id));
const smaz = (store, id) => tx(store, "readwrite", (s) => s.delete(id));
const vsechny = (store) => tx(store, "readonly", (s) => s.getAll());

const noveId = (predpona) => `${predpona}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

// Soubory: Blob + metadata. URL se vytvoří jednou a drží v paměti.
const urlCache = new Map();
async function ulozSoubor(blob, meta = {}) {
  const id = meta.id || noveId("f");
  await uloz("soubory", { id, blob, typ: blob.type, nazev: meta.nazev || "", vytvoreno: Date.now() });
  return id;
}
async function souborUrl(id) {
  if (urlCache.has(id)) return urlCache.get(id);
  const z = await nacti("soubory", id);
  if (!z) throw new Error("Soubor v úložišti chybí (byl smazán?).");
  const u = URL.createObjectURL(z.blob);
  urlCache.set(id, u);
  return u;
}
async function souborBlob(id) {
  const z = await nacti("soubory", id);
  if (!z) throw new Error("Soubor v úložišti chybí (byl smazán?).");
  return z.blob;
}

async function pozadejTrvaleUloziste() {
  try { await navigator.storage?.persist?.(); } catch { /* nic */ }
}
async function obsazeno() {
  try {
    const e = await navigator.storage?.estimate?.();
    return e ? { pouzito: e.usage || 0, kvota: e.quota || 0 } : null;
  } catch { return null; }
}

window.DHReelsUloziste = { uloz, nacti, smaz, vsechny, noveId, ulozSoubor, souborUrl, souborBlob, pozadejTrvaleUloziste, obsazeno };
})();
