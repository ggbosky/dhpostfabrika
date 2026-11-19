// Vkládání fotek ze schránky: Ctrl+V kdekoliv na stránce (mimo textová pole) pošle zkopírovanou fotku
// tam, kam by šla přes „📷 Nahrát“ na právě otevřené stránce. Tlačítka „📋 Vložit“ (data-vlozit-fotku)
// čtou schránku přímo – hodí se na telefonu, kde Ctrl+V není.
(() => {
"use strict";

const $ = (s, el = document) => el.querySelector(s);

// Kam fotka na které stránce patří (stejný input, jaký používá tlačítko Nahrát).
const CILE = {
  post: () => $("#foto"),
  carousel: () => $("#slidy .slide-karta.on input[data-akce='foto']") || $("#slidy .slide-karta input[data-akce='foto']"),
  vyroci: () => $("#vFotoSoubor"),
  promo: () => $("#prSoubor"),
  miniatury: () => $("#mtSoubory"),
  youtube: () => $("#ysMiniSoubor"),
  reels: () => $("#rImport"),
  temata: () => $("#tOdkazFoto"),
};
const POPIS = {
  post: "do postu", carousel: "do vybraného slidu", vyroci: "jako hlavní fotka", promo: "do promo grafiky",
  miniatury: "jako vzor stylu (fotku hráče nahraj tlačítkem 📷 Nahrát fotku hráče)", youtube: "jako miniatura",
  reels: "do záběrů", temata: "jako screenshot",
};

const toast = (t, druh) => window.DHToast?.(t, druh);
const jeObrazekUrl = (t) => /^data:image\//i.test(t) || /^https?:\/\/\S+$/i.test(t);

// Obrázek z adresy → File. Cizí weby často nepovolí stažení (CORS), pak přes veřejný obrazový proxy.
async function stahni(url) {
  const zkus = async (u) => {
    const r = await fetch(u);
    if (!r.ok) throw new Error(String(r.status));
    const b = await r.blob();
    if (!b.type.startsWith("image/")) throw new Error("není obrázek");
    return b;
  };
  let blob;
  try { blob = await zkus(url); } catch {
    if (url.startsWith("data:")) throw new Error("Obrázek ze schránky nejde přečíst.");
    blob = await zkus(`https://images.weserv.nl/?url=${encodeURIComponent(url)}&output=jpg&q=92`)
      .catch(() => { throw new Error("Obrázek z té adresy nejde stáhnout. Zkopíruj přímo fotku (pravým tlačítkem → Kopírovat obrázek)."); });
  }
  return new File([blob], `vlozena-fotka.${(blob.type.split("/")[1] || "jpg").replace("jpeg", "jpg")}`, { type: blob.type });
}

// Schránka často pojmenuje fotku „image.png“ – dáme jí srozumitelné jméno.
function pojmenuj(f, i) {
  if (f.name && !/^image\.\w+$/i.test(f.name)) return f;
  const pripona = (f.type.split("/")[1] || "png").replace("jpeg", "jpg");
  return new File([f], `vlozena-fotka-${new Date().toISOString().slice(11, 19).replace(/:/g, "")}${i ? `-${i}` : ""}.${pripona}`, { type: f.type });
}

function predej(input, soubory, kam) {
  const dt = new DataTransfer();
  (input.multiple ? soubory : soubory.slice(0, 1)).forEach((f, i) => dt.items.add(pojmenuj(f, i)));
  input.files = dt.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));
  toast(`📋 Fotka vložena ${POPIS[kam] || ""}`.trim(), "ok");
}

// Ctrl+V: soubory obrázků, nebo <img> z HTML, nebo adresa obrázku jako text.
document.addEventListener("paste", async (e) => {
  if (e.defaultPrevented) return; // už zpracovalo konkrétní místo (např. karta Téma z odkazu)
  const kam = window.DHShell?.aktualni;
  const najdi = CILE[kam];
  const cil = najdi?.();
  const dt = e.clipboardData;
  if (!cil || !dt) return;
  const vPoli = e.target?.closest?.("input:not([type=file]), textarea, [contenteditable=''], [contenteditable='true']");
  const text = dt.getData("text/plain").trim();
  let soubory = [...dt.files].filter((f) => f.type.startsWith("image/"));
  // Ve textovém poli s textem ve schránce je to běžné vložení textu (např. z Wordu chodí text i obrázek).
  if (vPoli && (text || !soubory.length)) return;
  let url = "";
  if (!soubory.length) {
    const html = dt.getData("text/html");
    const m = html && html.match(/<img[^>]+src=["']([^"']+)["']/i);
    if (m) url = m[1].replace(/&amp;/g, "&");
    else if (jeObrazekUrl(text) && (/^data:image\//i.test(text) || /\.(jpe?g|png|webp|gif|avif)(\?|#|$)/i.test(text) || /upload\.wikimedia\.org|images\.|\/image|\/photo/i.test(text))) url = text;
    if (!url) return;
  }
  e.preventDefault();
  try {
    if (url) { toast("Stahuji fotku ze schránky…", "info"); soubory = [await stahni(url)]; }
    predej(najdi() || cil, soubory, kam);
  } catch (chyba) {
    toast(chyba.message, "chyba");
  }
});

// Tlačítka „📋 Vložit“ – čtou schránku přes Clipboard API (iPhone ukáže bublinu „Vložit“).
async function zeSchranky() {
  if (!navigator.clipboard?.read) throw new Error("Tenhle prohlížeč neumí číst fotky ze schránky. Klikni do stránky a stiskni Ctrl+V.");
  let polozky;
  try { polozky = await navigator.clipboard.read(); } catch {
    throw new Error("Prohlížeč nepovolil čtení schránky. Klikni do stránky a stiskni Ctrl+V, nebo povol přístup ke schránce.");
  }
  for (const p of polozky) {
    const typ = p.types.find((t) => t.startsWith("image/"));
    if (typ) return [new File([await p.getType(typ)], "image.png", { type: typ })];
  }
  for (const p of polozky) {
    if (!p.types.includes("text/plain")) continue;
    const t = (await (await p.getType("text/plain")).text()).trim();
    if (jeObrazekUrl(t)) return [await stahni(t)];
  }
  throw new Error("Ve schránce není žádná fotka. Zkopíruj obrázek (pravým tlačítkem / podržením → Kopírovat obrázek) a zkus to znovu.");
}

document.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-vlozit-fotku]");
  if (!b) return;
  e.preventDefault();
  const input = b.closest(".foto-radek, .radek, .akce, .cela, .foto-blok")?.querySelector("input[type=file]");
  if (!input) return;
  const kam = window.DHShell?.aktualni;
  try {
    b.disabled = true;
    predej(input, await zeSchranky(), kam);
  } catch (chyba) {
    toast(chyba.message, "chyba");
  } finally {
    b.disabled = false;
  }
});

window.DHSchranka = { stahni };
})();
