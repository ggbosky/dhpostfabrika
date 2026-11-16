// Data aplikace v paměti telefonu (AsyncStorage): nastavení a seznam stažených souborů.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { VYCHOZI_ADRESA } from "./barvy";

export type Nastaveni = {
  adresa: string;          // adresa webové fabriky
  rovnouDoGalerie: boolean; // obrázky a videa ukládat automaticky do galerie
};

export type Stazeny = {
  id: string;
  nazev: string;
  uri: string;      // file:// v paměti aplikace
  mime: string;
  velikost: number; // bajty
  cas: number;      // Date.now()
};

const KLIC_NASTAVENI = "dh:nastaveni";
const KLIC_STAZENE = "dh:stazene";

export const VYCHOZI_NASTAVENI: Nastaveni = { adresa: VYCHOZI_ADRESA, rovnouDoGalerie: false };

export async function nactiNastaveni(): Promise<Nastaveni> {
  try {
    const t = await AsyncStorage.getItem(KLIC_NASTAVENI);
    return { ...VYCHOZI_NASTAVENI, ...(t ? JSON.parse(t) : {}) };
  } catch {
    return { ...VYCHOZI_NASTAVENI };
  }
}

export async function ulozNastaveni(n: Nastaveni): Promise<void> {
  await AsyncStorage.setItem(KLIC_NASTAVENI, JSON.stringify(n));
}

export async function nactiStazene(): Promise<Stazeny[]> {
  try {
    const t = await AsyncStorage.getItem(KLIC_STAZENE);
    return t ? (JSON.parse(t) as Stazeny[]) : [];
  } catch {
    return [];
  }
}

export async function ulozStazene(seznam: Stazeny[]): Promise<void> {
  await AsyncStorage.setItem(KLIC_STAZENE, JSON.stringify(seznam.slice(0, 300)));
}

export async function pridejStazeny(s: Stazeny): Promise<Stazeny[]> {
  const seznam = [s, ...(await nactiStazene())];
  await ulozStazene(seznam);
  return seznam;
}
