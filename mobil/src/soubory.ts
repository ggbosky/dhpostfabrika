// Ukládání stažených souborů do paměti telefonu + galerie + sdílení.
import { Directory, File, Paths } from "expo-file-system";
import * as MediaLibrary from "expo-media-library";
import * as Sharing from "expo-sharing";

const slozka = () => {
  const d = new Directory(Paths.document, "stazene");
  if (!d.exists) d.create({ idempotent: true, intermediates: true });
  return d;
};

// Bezpečné a jedinečné jméno souboru (stejné jméno → „nazev (2).png“)
function volneJmeno(nazev: string): File {
  const ciste = nazev.replace(/[\\/:*?"<>|]+/g, "-").slice(0, 120) || "soubor";
  const tecka = ciste.lastIndexOf(".");
  const zaklad = tecka > 0 ? ciste.slice(0, tecka) : ciste;
  const pripona = tecka > 0 ? ciste.slice(tecka) : "";
  const d = slozka();
  let f = new File(d, ciste);
  for (let n = 2; f.exists; n++) f = new File(d, `${zaklad} (${n})${pripona}`);
  return f;
}

// Probíhající přenosy z webu (soubor chodí po kouscích; zápisy musí jít popořadě)
type Prenos = { soubor: File; nazev: string; mime: string; velikost: number; fronta: Promise<void> };
const prenosy = new Map<string, Prenos>();

export function zacniPrenos(id: string, nazev: string, mime: string, velikost: number) {
  const soubor = volneJmeno(nazev);
  soubor.create({ overwrite: true });
  prenosy.set(id, { soubor, nazev: soubor.name, mime, velikost, fronta: Promise.resolve() });
}

export function pridejKus(id: string, base64: string) {
  const p = prenosy.get(id);
  if (!p) return;
  p.fronta = p.fronta.then(() => p.soubor.write(base64, { encoding: "base64", append: true }));
}

export async function dokonciPrenos(id: string) {
  const p = prenosy.get(id);
  if (!p) return null;
  await p.fronta;
  prenosy.delete(id);
  return { uri: p.soubor.uri, nazev: p.nazev, mime: p.mime || hadejMime(p.nazev), velikost: p.velikost };
}

export function hadejMime(nazev: string): string {
  const p = nazev.toLowerCase().split(".").pop() || "";
  return ({ png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", mp4: "video/mp4", webm: "video/webm", zip: "application/zip", srt: "text/plain", txt: "text/plain", wav: "audio/wav", mp3: "audio/mpeg" } as Record<string, string>)[p] || "application/octet-stream";
}

export const jeMedium = (mime: string) => /^(image|video)\//.test(mime);

export async function doGalerie(uri: string): Promise<void> {
  const prava = await MediaLibrary.requestPermissionsAsync(true);
  if (!prava.granted) throw new Error("Aplikace nemá povolený přístup ke galerii (Nastavení telefonu → Aplikace → DH Fabrika → Oprávnění).");
  await MediaLibrary.Asset.create(uri);
}

export async function sdilej(uri: string, mime: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) throw new Error("Sdílení není v tomhle zařízení dostupné.");
  await Sharing.shareAsync(uri, { mimeType: mime, dialogTitle: "Sdílet z DH Fabriky" });
}

export function smazSoubor(uri: string) {
  try { const f = new File(uri); if (f.exists) f.delete(); } catch { /* už neexistuje */ }
}

export function velikostText(b: number): string {
  if (b >= 1048576) return `${(b / 1048576).toFixed(1)} MB`;
  if (b >= 1024) return `${Math.round(b / 1024)} kB`;
  return `${b} B`;
}
