// Obrazovka „Stažené“: obrázky a videa uložené z fabriky – sdílet (Instagram…), uložit do galerie, smazat.
import { Ionicons } from "@expo/vector-icons";
import { Alert, FlatList, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { B } from "../barvy";
import { doGalerie, jeMedium, sdilej, smazSoubor, velikostText } from "../soubory";
import type { Stazeny } from "../ulozeni";

type Props = { seznam: Stazeny[]; onZmena: (novy: Stazeny[]) => void };

export default function Stazene({ seznam, onZmena }: Props) {
  const akce = async (fn: () => Promise<void>, hotovo: string) => {
    try { await fn(); if (hotovo) Alert.alert("Hotovo", hotovo); } catch (e) { Alert.alert("Nepovedlo se", e instanceof Error ? e.message : String(e)); }
  };
  const smaz = (s: Stazeny) =>
    Alert.alert("Smazat soubor?", s.nazev, [
      { text: "Zrušit", style: "cancel" },
      { text: "Smazat", style: "destructive", onPress: () => { smazSoubor(s.uri); onZmena(seznam.filter((x) => x.id !== s.id)); } },
    ]);

  if (!seznam.length) {
    return (
      <View style={st.prazdne}>
        <Ionicons name="download-outline" size={56} color={B.tlumeny} />
        <Text style={st.prazdneNadpis}>Zatím nic staženého</Text>
        <Text style={st.prazdneText}>Když ve fabrice klikneš na „Stáhnout“ (obrázek, carousel, MP4), soubor se uloží sem do telefonu. Odtud ho pošleš rovnou do Instagramu nebo uložíš do galerie.</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={seznam}
      keyExtractor={(s) => s.id}
      contentContainerStyle={st.seznam}
      renderItem={({ item: s }) => (
        <View style={st.karta}>
          {s.mime.startsWith("image/") ? (
            <Image source={{ uri: s.uri }} style={st.nahled} />
          ) : (
            <View style={[st.nahled, st.ikona]}>
              <Ionicons name={s.mime.startsWith("video/") ? "film-outline" : "document-outline"} size={30} color={B.text} />
            </View>
          )}
          <View style={st.info}>
            <Text style={st.nazev} numberOfLines={2}>{s.nazev}</Text>
            <Text style={st.meta}>{velikostText(s.velikost)} · {new Date(s.cas).toLocaleString("cs-CZ")}</Text>
            <View style={st.tlacitka}>
              <Pressable style={[st.tl, st.tlHlavni]} onPress={() => akce(() => sdilej(s.uri, s.mime), "")}>
                <Ionicons name="share-social-outline" size={16} color="#fff" />
                <Text style={st.tlText}>Sdílet</Text>
              </Pressable>
              {jeMedium(s.mime) && (
                <Pressable style={st.tl} onPress={() => akce(() => doGalerie(s.uri), "Uloženo do galerie.")}>
                  <Ionicons name="images-outline" size={16} color={B.text} />
                  <Text style={st.tlText}>Do galerie</Text>
                </Pressable>
              )}
              <Pressable style={st.tl} onPress={() => smaz(s)} accessibilityLabel="Smazat">
                <Ionicons name="trash-outline" size={16} color={B.tlumeny} />
              </Pressable>
            </View>
          </View>
        </View>
      )}
    />
  );
}

const st = StyleSheet.create({
  seznam: { padding: 14, gap: 12 },
  karta: { flexDirection: "row", gap: 12, backgroundColor: B.karta, borderRadius: 16, padding: 12, borderWidth: 1, borderColor: B.cara },
  nahled: { width: 84, height: 105, borderRadius: 10, backgroundColor: B.karta2 },
  ikona: { alignItems: "center", justifyContent: "center" },
  info: { flex: 1, gap: 4 },
  nazev: { color: B.text, fontSize: 15, fontWeight: "700" },
  meta: { color: B.tlumeny, fontSize: 12.5 },
  tlacitka: { flexDirection: "row", gap: 8, marginTop: "auto", flexWrap: "wrap" },
  tl: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: B.karta2, borderWidth: 1, borderColor: B.cara },
  tlHlavni: { backgroundColor: B.cervena, borderColor: B.cervena },
  tlText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  prazdne: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 10 },
  prazdneNadpis: { color: B.text, fontSize: 18, fontWeight: "800" },
  prazdneText: { color: B.tlumeny, fontSize: 14, textAlign: "center", lineHeight: 20 },
});
