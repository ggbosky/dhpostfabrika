// DH Post Fabrika – mobilní aplikace.
// Uvnitř běží celá webová fabrika (WebView); aplikace kolem ní přidává to, co web v telefonu neumí:
// ukládání obrázků a videí do telefonu a galerie, sdílení do Instagramu, seznam stažených souborů,
// nastavení (AsyncStorage), offline obrazovku a systémové tlačítko Zpět.
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, BackHandler, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { B } from "./src/barvy";
import { MOST_JS, type ZpravaMostu } from "./src/most";
import Nastaveni from "./src/obrazovky/Nastaveni";
import Stazene from "./src/obrazovky/Stazene";
import { doGalerie, dokonciPrenos, jeMedium, pridejKus, sdilej, smazSoubor, zacniPrenos } from "./src/soubory";
import { nactiNastaveni, nactiStazene, pridejStazeny, ulozNastaveni, ulozStazene, VYCHOZI_NASTAVENI, type Nastaveni as TNastaveni, type Stazeny } from "./src/ulozeni";

type Obrazovka = "fabrika" | "stazene" | "nastaveni";

export default function App() {
  return (
    <SafeAreaProvider>
      <Aplikace />
    </SafeAreaProvider>
  );
}

function Aplikace() {
  // (typy knihovny mají výchozí generikum „undefined“ → explicitně prázdný objekt)
  const web = useRef<WebView<Record<never, never>>>(null);
  const [obrazovka, setObrazovka] = useState<Obrazovka>("fabrika");
  const [nastaveni, setNastaveni] = useState<TNastaveni | null>(null);
  const [stazene, setStazene] = useState<Stazeny[]>([]);
  const [nacita, setNacita] = useState(true);
  const [chyba, setChyba] = useState<string | null>(null);
  const [lzeZpet, setLzeZpet] = useState(false);
  const [prenos, setPrenos] = useState<string | null>(null); // text „Ukládám…“
  const [klicWebu, setKlicWebu] = useState(0);              // změna = znovu načíst WebView

  // načtení dat z paměti telefonu
  useEffect(() => {
    (async () => {
      setNastaveni(await nactiNastaveni());
      setStazene(await nactiStazene());
    })();
  }, []);

  // systémové tlačítko Zpět (Android): podstránka → fabrika → historie fabriky → zavřít aplikaci
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (obrazovka !== "fabrika") { setObrazovka("fabrika"); return true; }
      if (lzeZpet) { web.current?.goBack(); return true; }
      return false;
    });
    return () => sub.remove();
  }, [obrazovka, lzeZpet]);

  const ulozNast = useCallback(async (n: TNastaveni) => {
    const zmenaAdresy = n.adresa !== nastaveni?.adresa;
    setNastaveni(n);
    await ulozNastaveni(n);
    if (zmenaAdresy) { setChyba(null); setKlicWebu((k) => k + 1); }
  }, [nastaveni]);

  // zprávy z webové fabriky (stahování souborů, schránka)
  const naZpravu = useCallback(async (e: WebViewMessageEvent) => {
    let z: ZpravaMostu;
    try { z = JSON.parse(e.nativeEvent.data); } catch { return; }
    try {
      if (z.typ === "start") {
        zacniPrenos(z.id, z.nazev, z.mime, z.velikost);
        setPrenos(`Ukládám ${z.nazev}…`);
      } else if (z.typ === "kus") {
        pridejKus(z.id, z.data);
      } else if (z.typ === "konec") {
        const hotovo = await dokonciPrenos(z.id);
        setPrenos(null);
        if (!hotovo) return;
        const zaznam: Stazeny = { id: z.id, nazev: hotovo.nazev, uri: hotovo.uri, mime: hotovo.mime, velikost: hotovo.velikost, cas: Date.now() };
        setStazene(await pridejStazeny(zaznam));
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        if (nastaveni?.rovnouDoGalerie && jeMedium(zaznam.mime)) {
          try { await doGalerie(zaznam.uri); } catch (er) { Alert.alert("Galerie", er instanceof Error ? er.message : String(er)); }
        }
        Alert.alert("Staženo ✓", zaznam.nazev, [
          { text: "Zavřít", style: "cancel" },
          ...(jeMedium(zaznam.mime) && !nastaveni?.rovnouDoGalerie ? [{ text: "Do galerie", onPress: () => { doGalerie(zaznam.uri).catch((er) => Alert.alert("Galerie", String(er?.message || er))); } }] : []),
          { text: "Sdílet", onPress: () => { sdilej(zaznam.uri, zaznam.mime).catch(() => {}); } },
        ]);
      } else if (z.typ === "chyba") {
        setPrenos(null);
        Alert.alert("Stažení se nepovedlo", z.zprava);
      } else if (z.typ === "schranka") {
        await Clipboard.setStringAsync(z.text);
      }
    } catch (er) {
      setPrenos(null);
      Alert.alert("Uložení se nepovedlo", er instanceof Error ? er.message : String(er));
    }
  }, [nastaveni]);

  const smazVse = async () => {
    stazene.forEach((s) => smazSoubor(s.uri));
    setStazene([]);
    await ulozStazene([]);
  };

  // odkazy mimo fabriku (YouTube, zdroje, Wikimedia…) otevřít v prohlížeči telefonu
  const hostitel = (() => { try { return new URL(nastaveni?.adresa || VYCHOZI_NASTAVENI.adresa).host; } catch { return ""; } })();
  const povolNacist = (url: string) => {
    if (/^(about:|blob:|data:)/.test(url)) return true;
    try {
      if (new URL(url).host === hostitel) return true;
    } catch { return true; }
    Linking.openURL(url).catch(() => {});
    return false;
  };

  if (!nastaveni) {
    return <View style={[st.kontejner, st.stred]}><ActivityIndicator color={B.cervena} size="large" /></View>;
  }

  return (
    <SafeAreaView style={st.kontejner} edges={["top", "bottom"]}>
      <StatusBar style="light" />
      {/* horní lišta */}
      <View style={st.lista}>
        {obrazovka === "fabrika" ? (
          <View style={st.logo}>
            <View style={st.logoZnak}><Text style={st.logoZnakText}>DH</Text></View>
            <Text style={st.logoText}>Post Fabrika</Text>
          </View>
        ) : (
          <Pressable style={st.zpet} onPress={() => setObrazovka("fabrika")} hitSlop={10}>
            <Ionicons name="chevron-back" size={22} color={B.text} />
            <Text style={st.logoText}>{obrazovka === "stazene" ? "Stažené" : "Nastavení"}</Text>
          </Pressable>
        )}
        <View style={st.ikony}>
          {obrazovka === "fabrika" && (
            <Pressable style={st.ikona} onPress={() => { setChyba(null); web.current?.reload(); }} hitSlop={8} accessibilityLabel="Načíst znovu">
              <Ionicons name="refresh" size={21} color={B.text} />
            </Pressable>
          )}
          <Pressable style={st.ikona} onPress={() => setObrazovka(obrazovka === "stazene" ? "fabrika" : "stazene")} hitSlop={8} accessibilityLabel="Stažené soubory">
            <Ionicons name={obrazovka === "stazene" ? "download" : "download-outline"} size={22} color={obrazovka === "stazene" ? B.cervena : B.text} />
            {stazene.length > 0 && <View style={st.odznak}><Text style={st.odznakText}>{stazene.length > 99 ? "99+" : stazene.length}</Text></View>}
          </Pressable>
          <Pressable style={st.ikona} onPress={() => setObrazovka(obrazovka === "nastaveni" ? "fabrika" : "nastaveni")} hitSlop={8} accessibilityLabel="Nastavení">
            <Ionicons name={obrazovka === "nastaveni" ? "settings" : "settings-outline"} size={21} color={obrazovka === "nastaveni" ? B.cervena : B.text} />
          </Pressable>
        </View>
      </View>

      {/* fabrika zůstává načtená i na ostatních obrazovkách (nic se neztratí) */}
      <View style={[st.kontejner, obrazovka !== "fabrika" && st.skryte]}>
        <WebView<Record<never, never>>
          key={klicWebu}
          ref={web}
          source={{ uri: nastaveni.adresa }}
          style={st.web}
          injectedJavaScriptBeforeContentLoaded={MOST_JS}
          onMessage={naZpravu}
          javaScriptEnabled
          domStorageEnabled
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          mediaCapturePermissionGrantType="grantIfSameHostElsePrompt"
          allowFileAccess
          setSupportMultipleWindows={false}
          allowsBackForwardNavigationGestures
          onShouldStartLoadWithRequest={(r) => povolNacist(r.url)}
          onLoadStart={() => setNacita(true)}
          onLoadEnd={() => setNacita(false)}
          onNavigationStateChange={(s) => setLzeZpet(s.canGoBack)}
          onError={(e) => setChyba(e.nativeEvent.description || "Fabriku se nepodařilo načíst.")}
          onHttpError={(e) => { if (e.nativeEvent.statusCode >= 500) setChyba(`Server odpověděl chybou ${e.nativeEvent.statusCode}.`); }}
          onContentProcessDidTerminate={() => web.current?.reload()}
          onRenderProcessGone={() => { setKlicWebu((k) => k + 1); return true; }}
          webviewDebuggingEnabled={__DEV__}
        />
        {nacita && !chyba && (
          <View style={st.nacitani} pointerEvents="none">
            <ActivityIndicator color={B.cervena} size="large" />
          </View>
        )}
        {chyba && (
          <View style={[st.prekryv, st.stred]}>
            <Ionicons name="cloud-offline-outline" size={56} color={B.tlumeny} />
            <Text style={st.chybaNadpis}>Fabrika se nenačetla</Text>
            <Text style={st.chybaText}>Zkontroluj připojení k internetu. ({chyba})</Text>
            <Pressable style={st.tlacitko} onPress={() => { setChyba(null); setKlicWebu((k) => k + 1); }}>
              <Ionicons name="refresh" size={18} color="#fff" />
              <Text style={st.tlacitkoText}>Zkusit znovu</Text>
            </Pressable>
          </View>
        )}
        {prenos && (
          <View style={st.prenos}>
            <ActivityIndicator color="#fff" size="small" />
            <Text style={st.prenosText} numberOfLines={1}>{prenos}</Text>
          </View>
        )}
      </View>

      {obrazovka === "stazene" && (
        <View style={st.kontejner}>
          <Stazene seznam={stazene} onZmena={async (novy) => { setStazene(novy); await ulozStazene(novy); }} />
        </View>
      )}
      {obrazovka === "nastaveni" && (
        <View style={st.kontejner}>
          <Nastaveni nastaveni={nastaveni} onUloz={ulozNast} onSmazVse={smazVse} pocetStazenych={stazene.length} />
        </View>
      )}
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  kontejner: { flex: 1, backgroundColor: B.pozadi },
  skryte: { display: "none" },
  stred: { alignItems: "center", justifyContent: "center" },
  lista: { height: 52, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: B.cara, backgroundColor: B.pozadi },
  logo: { flexDirection: "row", alignItems: "center", gap: 10 },
  logoZnak: { backgroundColor: B.cervena, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3, transform: [{ skewX: "-8deg" }] },
  logoZnakText: { color: "#fff", fontWeight: "900", fontSize: 14, letterSpacing: 0.5 },
  logoText: { color: B.text, fontWeight: "800", fontSize: 17 },
  zpet: { flexDirection: "row", alignItems: "center", gap: 4 },
  ikony: { flexDirection: "row", alignItems: "center", gap: 6 },
  ikona: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  odznak: { position: "absolute", top: 3, right: 1, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: B.cervena, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  odznakText: { color: "#fff", fontSize: 10.5, fontWeight: "800" },
  web: { flex: 1, backgroundColor: B.pozadi },
  nacitani: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(9,9,9,0.55)" },
  prekryv: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: B.pozadi, padding: 32, gap: 10 },
  chybaNadpis: { color: B.text, fontSize: 19, fontWeight: "800" },
  chybaText: { color: B.tlumeny, fontSize: 14, textAlign: "center" },
  tlacitko: { marginTop: 8, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: B.cervena, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 999 },
  tlacitkoText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  prenos: { position: "absolute", left: 16, right: 16, bottom: 20, flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "rgba(19,19,19,0.96)", borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, borderWidth: 1, borderColor: B.cara },
  prenosText: { color: B.text, fontSize: 14, fontWeight: "600", flex: 1 },
});
