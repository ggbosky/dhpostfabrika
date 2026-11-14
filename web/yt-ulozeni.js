// YouTube část – úložiště v IndexedDB tohoto prohlížeče.
// miniatury: projekty Thumbnail Factory · obrazky: Bloby (reference, vygenerované pozadí, finální miniatury)
// publikace: projekty nahrávání na YouTube (metadata, stav, historie)
(() => {
"use strict";

const DB = "dhpf_youtube";
const STORY = ["miniatury", "obrazky", "publikace"];
let dbSlib = null;

function db() {
  if (!dbSlib) {
    dbSlib = new Promise((ok, chyba) => {
      if (!("indexedDB" in window)) { chyba(new Error("Tenhle prohlížeč neumí ukládat projekty.")); return; }
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => { for (const s of STORY) if (!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s, { keyPath: "id" }); };
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

const uloz = (store, z) => tx(store, "readwrite", (s) => s.put(z));
const nacti = (store, id) => tx(store, "readonly", (s) => s.get(id));
const smaz = (store, id) => tx(store, "readwrite", (s) => s.delete(id));
const vsechny = (store) => tx(store, "readonly", (s) => s.getAll());
const noveId = (p) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

async function ulozObrazek(blob, meta = {}) {
  const id = meta.id || noveId("img");
  await uloz("obrazky", { id, blob, typ: blob.type, ...meta, vytvoreno: Date.now() });
  return id;
}
async function obrazekBlob(id) {
  const z = await nacti("obrazky", id);
  if (!z) throw new Error("Obrázek v úložišti chybí.");
  return z.blob;
}

// Blob → HTMLImageElement (s pamětí, aby se stejný obrázek nedekódoval pořád dokola).
const cache = new Map();
function blobNaImg(blob) {
  return new Promise((ok, chyba) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => chyba(new Error("Obrázek se nepodařilo načíst."));
    img.src = URL.createObjectURL(blob);
  });
}
async function obrazekImg(id) {
  if (!cache.has(id)) {
    const slib = obrazekBlob(id).then(blobNaImg);
    cache.set(id, slib);
    slib.catch(() => cache.delete(id));
  }
  return cache.get(id);
}

window.DHYtUloziste = { uloz, nacti, smaz, vsechny, noveId, ulozObrazek, obrazekBlob, obrazekImg, blobNaImg };
})();
