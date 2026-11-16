// Obrazovka „Nastavení“ – adresa fabriky, automatické ukládání do galerie, úklid stažených souborů.
import { useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { B, VYCHOZI_ADRESA } from "../barvy";
import type { Nastaveni as TNastaveni } from "../ulozeni";

type Props = {
  nastaveni: TNastaveni;
  onUloz: (n: TNastaveni) => void;
  onSmazVse: () => void;
  pocetStazenych: number;
};

export default function Nastaveni({ nastaveni, onUloz, onSmazVse, pocetStazenych }: Props) {
  const [adresa, setAdresa] = useState(nastaveni.adresa);

  const ulozAdresu = () => {
    const a = adresa.trim();
    if (!/^https:\/\//.test(a)) { Alert.alert("Adresa musí začínat https://"); return; }
    onUloz({ ...nastaveni, adresa: a.endsWith("/") ? a : `${a}/` });
    Alert.alert("Uloženo", "Fabrika se načte z nové adresy.");
  };

  return (
    <ScrollView contentContainerStyle={st.obsah}>
      <View style={st.karta}>
        <Text style={st.nadpis}>Adresa fabriky</Text>
        <TextInput value={adresa} onChangeText={setAdresa} style={st.vstup} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholderTextColor={B.tlumeny} placeholder={VYCHOZI_ADRESA} />
        <View style={st.radek}>
          <Pressable style={[st.tl, st.tlHlavni]} onPress={ulozAdresu}><Text style={st.tlText}>Uložit</Text></Pressable>
          <Pressable style={st.tl} onPress={() => setAdresa(VYCHOZI_ADRESA)}><Text style={st.tlText}>Výchozí</Text></Pressable>
        </View>
      </View>

      <View style={st.karta}>
        <View style={st.prepinac}>
          <View style={{ flex: 1 }}>
            <Text style={st.nadpis}>Ukládat rovnou do galerie</Text>
            <Text style={st.popis}>Stažené obrázky a videa se hned uloží i do Fotek / Galerie.</Text>
          </View>
          <Switch value={nastaveni.rovnouDoGalerie} onValueChange={(v) => onUloz({ ...nastaveni, rovnouDoGalerie: v })} trackColor={{ true: B.cervena, false: B.cara }} thumbColor="#fff" />
        </View>
      </View>

      <View style={st.karta}>
        <Text style={st.nadpis}>Stažené soubory</Text>
        <Text style={st.popis}>V aplikaci je uloženo {pocetStazenych} souborů.</Text>
        <Pressable style={[st.tl, { alignSelf: "flex-start", marginTop: 8 }]} onPress={() => Alert.alert("Smazat všechny stažené soubory?", "Z galerie se nic nesmaže.", [{ text: "Zrušit", style: "cancel" }, { text: "Smazat", style: "destructive", onPress: onSmazVse }])}>
          <Text style={st.tlText}>Smazat vše</Text>
        </Pressable>
      </View>

      <View style={st.karta}>
        <Text style={st.nadpis}>Dobré vědět</Text>
        <Text style={st.popis}>• Klíče (Claude, Gemini, ElevenLabs), koncepty a projekty se ukládají v aplikaci – zvlášť od prohlížeče v počítači.</Text>
        <Text style={st.popis}>• Připojení YouTube (přihlášení Googlem) uvnitř aplikace Google nedovolí – YouTube Studio používej v prohlížeči v počítači.</Text>
        <Text style={st.popis}>• Renderování videí je náročné – na telefonu může trvat déle než na počítači.</Text>
      </View>
    </ScrollView>
  );
}

const st = StyleSheet.create({
  obsah: { padding: 14, gap: 12 },
  karta: { backgroundColor: B.karta, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: B.cara, gap: 6 },
  nadpis: { color: B.text, fontSize: 16, fontWeight: "800" },
  popis: { color: B.tlumeny, fontSize: 13.5, lineHeight: 19 },
  vstup: { backgroundColor: "#0d0d0d", color: B.text, borderRadius: 12, borderWidth: 1, borderColor: B.cara, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, marginTop: 4 },
  radek: { flexDirection: "row", gap: 8, marginTop: 8 },
  prepinac: { flexDirection: "row", alignItems: "center", gap: 12 },
  tl: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 999, backgroundColor: B.karta2, borderWidth: 1, borderColor: B.cara },
  tlHlavni: { backgroundColor: B.cervena, borderColor: B.cervena },
  tlText: { color: "#fff", fontSize: 13.5, fontWeight: "700" },
});
