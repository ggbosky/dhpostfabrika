# DH Fabrika – mobilní aplikace (React Native / Expo)

Nativní aplikace pro Android a iPhone. Uvnitř běží celá DH Post Fabrika (WebView).
Aplikace kolem ní přidává věci, které web v telefonu neumí:

- **Stažené soubory**: obrázky, carousely a MP4 z fabriky se uloží do paměti telefonu. Odtud jdou **sdílet do Instagramu** nebo **uložit do galerie**.
- **Nastavení**: adresa fabriky a „ukládat rovnou do galerie“. Ukládá se v telefonu přes **AsyncStorage**.
- **Ostatní**:
  - offline obrazovka;
  - systémové tlačítko Zpět;
  - odkazy ven se otevřou v prohlížeči;
  - kopírování do schránky;
  - mikrofon pro namlouvání.

Aktualizace fabriky se v aplikaci projeví samy, protože se načítá z webu. Novou instalaci potřebuješ jen při změně kódu v této složce.

Projekt je ověřený na Expo SDK 58: `npx tsc --noEmit` a `npx expo-doctor` (20/20) prošly. `npx expo export --platform android` sestaví balíček.

---

## 1) Příprava počítače (jednou)

1. Nainstaluj **Node.js LTS** z https://nodejs.org (instalátor, vše nech výchozí).
2. Otevři terminál (Windows: **PowerShell**, Mac: **Terminál**) a ověř:
   ```bash
   node -v
   npm -v
   ```
3. Založ si zdarma účet na **https://expo.dev** (e-mail + heslo).

## 2) Založení projektu

### Varianta A – vzít hotovou složku `mobil/` z repozitáře (nejjednodušší)

```bash
cd cesta/ke/stazenemu/repozitari/mobil
npm install
```

### Varianta B – založit projekt od nuly a pak zkopírovat soubory

```bash
npx create-expo-app@latest dh-fabrika --template blank-typescript
cd dh-fabrika
npx expo install react-native-webview @react-native-async-storage/async-storage expo-file-system expo-sharing expo-media-library expo-clipboard expo-haptics expo-splash-screen expo-font @expo/vector-icons react-native-safe-area-context
```

Pak do složky `dh-fabrika` zkopíruj z repozitáře (složka `mobil/`) a přepiš:

- `App.tsx`
- `app.json`
- `eas.json`
- celou složku `src/`
- celou složku `assets/` (ikony)

Kontrola, že je vše v pořádku:

```bash
npx tsc --noEmit
npx expo-doctor
```

## 3) Instalační soubor přes EAS Build (cloud, zdarma)

```bash
npx eas-cli@latest login
npx eas-cli@latest init
```

`init` se zeptá, jestli vytvořit projekt na expo.dev. Odpověz **Y**. Do `app.json` se doplní `projectId`.

### Android – soubor `.apk`

```bash
npx eas-cli@latest build -p android --profile apk
```

- Při prvním buildu se zeptá na **Android keystore**. Odpověz **Y** (vygenerovat), EAS ho bezpečně uloží.
- Build běží v cloudu, na bezplatném plánu se čeká ve frontě (obvykle 5–30 min). Průběh je vidět na expo.dev → Projects → dh-fabrika → Builds.
- Na konci se zobrazí **odkaz a QR kód**.
- **Instalace do telefonu:**
  1. Otevři odkaz nebo QR kód v telefonu a stáhni `.apk`.
  2. Klepni na stažený soubor.
  3. Povol **„Instalovat neznámé aplikace“** pro prohlížeč, ze kterého jsi stahoval.
  4. Klepni na **Instalovat**.

### iPhone

Apple instalaci mimo App Store bez placeného **Apple Developer Programu (99 USD/rok)** nedovolí. S ním:

```bash
npx eas-cli@latest device:create
npx eas-cli@latest build -p ios --profile ios-telefon
```

- `device:create` vytvoří odkaz. Otevři ho na iPhonu a nainstaluj profil, tím se telefon zaregistruje.
- Build se přihlásí k tvému Apple účtu a podepíše aplikaci pro zaregistrované telefony.
- Výsledný odkaz otevři na iPhonu a nainstaluj.
- Na iOS 16+ pak zapni **Nastavení → Soukromí a zabezpečení → Režim vývojáře**.

Bez placeného účtu jde jen build pro simulátor na Macu: `--profile ios-simulator`.

## 4) Nová verze aplikace

Při změně kódu v `mobil/` spusť build znovu stejným příkazem a novou `.apk` nainstaluj přes starou, data zůstanou.

Změny ve webové fabrice (nové funkce, opravy) **nevyžadují nový build**, aplikace je načte sama.

## Omezení

- **Přihlášení Googlem uvnitř aplikace Google blokuje**, takže **YouTube Studio a Analytics** používej v prohlížeči v počítači.
- Aplikace má **vlastní úložiště**, odděleně od prohlížeče v počítači. AI klíče a heslo do fabriky je potřeba v aplikaci zadat znovu. Při přihlášení zaškrtni „Zapamatovat 30 dní“.
- Renderování videí je náročné, na telefonu je pomalejší než na počítači.
