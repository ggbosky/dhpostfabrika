# DH Post Fabrika 🏒 – Deník hokeje

Nástroj, který z pár údajů vytvoří **hotový Instagram příspěvek pro
[@denik_hokeje](https://www.instagram.com/denik_hokeje/)** – text s hashtagy
a obrázek 1080×1350 s titulkem. Má dvě verze:

| | Webová verze (bez klíčů) | Verze v Pythonu s AI |
|---|---|---|
| Kde běží | v prohlížeči, <https://ggbosky.github.io/dhpostfabrika/> | na počítači |
| Klíče / účty | žádné (AI návrhy volitelně s bezplatným Gemini klíčem) | bezplatný Google Gemini klíč |
| Texty | šablony + tvoje hashtagy a výzvy | Gemini píše podle naučeného stylu |
| Fotky | nahraješ vlastní | najde a ohodnotí sama (DuckDuckGo + Gemini Vision) |

## ▶️ Webová verze bez klíčů (doporučeno)

**Adresa:** <https://ggbosky.github.io/dhpostfabrika/>

Běží jen v prohlížeči (počítač i mobil). Nepotřebuje žádný API klíč, účet ani server,
nic se nikam neposílá. Texty se skládají z hokejových šablon, žádná AI.

1. Vyber, co se stalo: **výsledek zápasu, přestup, rekord/milník, zranění, pozvánka
   na zápas** nebo **obecná zpráva**, a vyplň pár políček.
2. **Vytvořit post** → hotový text (hook, text, výzva pro fanoušky, hashtagy).
   **🎲 Jiná varianta** napíše totéž jinými slovy. Text jde ručně upravit.
3. **Nahraj fotku** (nebo ji přetáhni na náhled) → ořízne se na 1080×1350 (4:5),
   přidá se titulek a podpis účtu. Výřez posuneš tažením, přiblížíš posuvníkem.
   Bez fotky vznikne grafika s titulkem.
4. **Kopírovat text** a **Stáhnout obrázek** → nahrát na Instagram.

Záložka **Carousel** (podle šablony Deníku hokeje, až 20 slidů):
- **Titulní slide** – velký červený a bílý nápis, fotka, ikona „posuň dál“.
- **Další slidy** – nadpis a text přes fotku. Slovo v `*hvězdičkách*` je v nadpisu
  červené, v textu žluté. Enter v nadpisu = nový řádek.
- Logo Deníku hokeje je na každém slidu vlevo nahoře (bílé/černé automaticky podle fotky).
- **Stáhnout všechny slidy** → ZIP s obrázky v pořadí + `popisek.txt`. Na mobilu
  **Uložit do telefonu** pošle slidy rovnou do galerie.
- **Vytvořit ze slidů** napíše popisek pod carousel s hashtagy.
- Texty slidů se pamatují i po zavření stránky (fotky ne).

Logo je i na jednoduchém postu (záložka **Nový post**).

Záložka **📅 Dnes před lety** – single post podle šablony „Dnes před X lety“ (PSD Deníku hokeje):
velká fotka nahoře, plynulý přechod do černé, vpravo nahoře `DNES PŘED 31 LETY` (počítá se sám
z data) a žluté datum, malá kulatá fotka s barevným rámečkem a text písmem Anton, kde slova
v `*hvězdičkách*` mají barvu zvýraznění (modrá, červená, žlutá… nebo vlastní). AI umí navrhnout
text, popisek, barvu týmu i obě fotky; z **Témat** se sem jde tlačítkem **📅 Dnes před lety**.

### 🎬 Reels Factory – historické dokumenty z autentických záběrů

Záložka **🎬 Reels** vyrábí vertikální MP4 (1080×1920, H.264, 30 fps) **přímo v prohlížeči** – bez serveru
a bez předplatného. Postup v 7 krocích:

1. **Nový reel** – téma (nebo ✨ návrh témat od AI), délka 30/45/60/90 s, styl vyprávění, jazyky hledání.
2. **Rešerše** – AI (Claude nebo Gemini s webem) hledá fakta v libovolném jazyce, píše je česky, u každého jistota
   a zdroje; „Ověřit fakta znovu“ = druhé nezávislé ověření, sporná fakta se vyřadí.
3. **Scénář** – 4 varianty háčku se silou (vybere nejsilnější), scény s českým voiceoverem, nápisem,
   popisem záběru a vyhledávacími dotazy v 7 jazycích (cs, en, ru, sv, fi, de, fr). Vše jde upravit,
   jednotlivé scény přepsat AI.
4. **Záběry** – hledání ve zdrojích a štítky 👁 lze sledovat / ⬇ lze načíst / ✅ licence k použití:
   - **Wikimedia Commons** – videa s volnou licencí, rovnou použitelná (zdarma, bez klíče),
   - **Internet Archive** – náhled a odkaz, soubor stáhnout ručně a importovat (zdarma),
   - **YouTube Data API** – volitelný bezplatný klíč; délka, licence, časové značky; jen sledování/odkaz,
   - **web přes AI** (YouTube, NHL.com, iVysílání ČT, IIHF…) – odkazy ke sledování, YouTube ověřené,
   - **vlastní import** autorizovaných souborů (s potvrzením práv a poznámkou o původu).
   Nic se nestahuje tam, kde to zdroj nedovoluje.
5. **Střih** – výběr a pořadí záběrů, začátek úseku, vodorovný výřez, režim „vyplnit“ nebo „celý záběr
   s rozmazaným pozadím“, přiblížení, původní zvuk (atmosféra), barevné úpravy, logo, outro.
6. **Hlas a titulky** – český hlas **Piper „Jirka“** (open-source, běží v prohlížeči, model ~60 MB se
   stáhne jednou) nebo vlastní nahrávka z mikrofonu, tempo; titulky časované přesně podle hlasu každé
   scény (proto není potřeba Whisper), ruční úprava textu a časů; vlastní hudba s hlasitostí.
7. **Export a historie** – kontrola kvality (≥ 85 % pohyblivého videa, minimum záběrů, žádné opakování,
   práva ke všem záběrům, český hlas a titulky, zdroje faktů, délka, formát). Při chybě se **render
   zablokuje** a vypíše proč. Pak render MP4, historie, hromadný ZIP, scénář (.txt), titulky (.srt),
   popisek s kredity záběrů a dokument se zdroji a licencemi.

Projekty se ukládají samy (IndexedDB prohlížeče, i s importovanými videi a hlasem).

| Funkce | Co potřebuje |
|---|---|
| střih, render MP4, titulky, Commons, Internet Archive, import, mikrofon | nic (zdarma) |
| český hlas Piper | nic (zdarma), jednorázové stažení modelu |
| rešerše, scénář, AI hledání na webu | AI klíč – Claude nebo bezplatný Gemini (Můj styl → AI pomocník) |
| YouTube hledání | volitelný bezplatný YouTube Data API klíč (krok 1) |
| zvuk AAC (doporučeno pro Instagram) | Chrome nebo Edge na Windows / macOS; jinde Opus |

### 💾 Koncepty – rozpracované posty

V záložkách **Nový post**, **Carousel** i **Dnes před lety** je tlačítko **💾 Uložit koncept**.
Uloží se všechno včetně fotek (do úložiště tohoto prohlížeče, nikam se neposílá). V záložce
**💾 Koncepty** je seznam s náhledy – **Otevřít** vrátí post přesně tam, kde jsi skončil,
a další uložení přepíše tuhle verzi. Navíc se rozpracovaná práce v každé záložce **ukládá
automaticky** (každých pár sekund) a po otevření stránky se sama vrátí – v Konceptech je
označená „automaticky“. Koncepty jsou vázané na prohlížeč a zařízení
(mobil a počítač mají každý své); v anonymním okně se po zavření smažou.

### 🔎 Témata a ověřování faktů (s AI klíčem)

- Záložka **🔎 Témata**: AI prohledá web (Google) a najde 6 **zajímavostí** – milníky, rekordy,
  statistické kuriozity, výročí („stalo se v tento den“) a historické příběhy; žádné běžné
  zpravodajství. Doporučené zdroje: thehockeywriters.com, sport.ceskatelevize.cz,
  sportrevue.isport.blesk.cz, nhl.cz (a další). U každého tématu jsou fakta a **odkazy na zdroje**
  a potom **druhá nezávislá kontrola**: ✅ ověřeno / ❌ rozpor (co nesedí) / ⚠️ nejisté.
  Témata se zobrazují postupně, jak přicházejí (obvykle do 15–20 s, nejdéle 30 s); kontrola
  doběhne na pozadí a ověřená témata se seřadí nahoru. Volba **Výročí** hledá jen události
  přesně z dnešního dne a měsíce (v jakémkoli roce) – jiná data aplikace vyřadí.
  Tlačítkem **✍️ Post** nebo **🎞️ Carousel** z tématu rovnou vznikne příspěvek, do popisku se
  přidá řádek `ℹ️ Zdroj: …`.
- Tlačítko **🔎 Ověřit fakta** (u textu postu i u popisku carouselu): AI dohledá každé
  tvrzení na webu a označí ho ✅ potvrzeno / ❌ rozpor (se správnou hodnotou) / ⚠️ nepotvrzeno,
  vždy s odkazy na zdroje.
- AI se může splést i se zdroji – před zveřejněním si je proklikni.

### 🧭 Ovládání a orientace

- **Boční panel** (na mobilu spodní lišta) dělí aplikaci na *Start* (Přehled, Témata), *Tvořit*
  (Post, Carousel, Dnes před lety, Reels), *Organizace* (Plán, Koncepty) a *Nastavení*.
  Každá stránka má nahoře popis a kroky „co dělat“; adresa (#post, #plan…) funguje i s tlačítkem Zpět.
- **Přehled** – rychlé zadání pro AI („Vytvořit jako“ post / carousel / výročí / reel), rozpracované
  koncepty, plán na příštích 7 dní, výročí dnešního dne jedním klikem a stav nastavení.
- **📆 Plán publikace** – týdenní kalendář a zásobník nápadů. Záznamy jde přetahovat mezi dny,
  kliknutím na štítek měnit stav (nápad → rozpracováno → připraveno → publikováno) a tlačítkem
  *Vytvořit/Otevřít* je rovnou otevřít ve správném formátu. Do plánu se dá uložit téma z *Témat*,
  uložený koncept i rozpracovaný post (tlačítko *Do plánu* nahoře). *Zkopírovat týden* dá plán jako text.
- **📱 Náhled v IG** – ukáže post / carousel tak, jak bude vypadat ve feedu (se swipováním slidů
  a zkráceným popiskem „… více“) a zkontroluje délku popisku, první větu a počet hashtagů.
- **Ctrl+K** (nebo `/`) – rychlé hledání: přejít kamkoliv, otevřít koncept nebo záznam z plánu,
  spustit akci. **Ctrl+S** uloží rozpracovaný koncept.

### ✨ AI pomocník (volitelné)

Nahoře v záložkách **Nový post** i **Carousel** je pole **Návrh od AI**: napíšeš téma
a fakta, AI napíše text (u carouselu všechny slidy i popisek) a stránka sama najde
volně použitelné fotky (Wikimedia Commons, záložně Openverse). Autor a licence fotky
se samy přidají do popisku. Pak všechno upravíš ručně jako obvykle – u každého slidu je
**🔍 Najít fotku** (jiná fotka) a **📷 Vlastní fotka**.

Potřebuje jeden AI klíč – záložka **Můj styl → AI pomocník**:

- **Claude (Anthropic)** – doporučeno. Klíč `sk-ant-…` z Anthropic Console (API keys),
  placeno z kreditu v Console (předplatné Claude.ai sem nepatří). Model si vybereš:
  **Opus 5.5** (výchozí, nejlepší texty), **Sonnet 5.5** (rychlejší, levnější),
  **Haiku 5.5** (nejrychlejší, nejlevnější). Hledání a ověřování používá webové
  vyhledávání Claude se zdroji.
- **Google Gemini** – zdarma z <https://aistudio.google.com/apikey>, asi 20 návrhů denně
  na model (aplikace modely střídá), limit se obnovuje v 9:00.

Když vyplníš oba, pracuje Claude a Gemini se použije jen jako záloha, když Claude selže
(např. dojde kredit). Klíče zůstávají jen v tvém prohlížeči. Bez klíče aplikace funguje
dál, jen bez tlačítek ✨. Fakta, která má AI za nejistá,
vypíše v seznamu **Před zveřejněním ověř**.

Záložka **Můj styl**: vlož svoje starší posty (export z Instagramu `posts_1.json`
nebo zkopírované texty oddělené `---`). Stránka zjistí tvoje hashtagy, jejich počet,
jestli používáš emoji a jaké otázky dáváš na konec – a od té doby je používá.
Styl i historie se ukládají jen v tvém prohlížeči.

Kód webu je ve složce `web/`. Po každé změně ho GitHub sám znovu zveřejní
(`.github/workflows/pages.yml`). Poprvé je potřeba jednou zapnout GitHub Pages:
repozitář → **Settings → Pages → Source: GitHub Actions**.

---

Níže je **pokročilá verze v Pythonu s AI** (Google Gemini píše texty a sama hledá
a hodnotí fotky). Ta potřebuje bezplatný Gemini API klíč.

## Struktura projektu

```
dhpostfabrika/
├── web/                webová verze bez klíčů (GitHub Pages)
│   ├── index.html
│   ├── sablony.js      šablony textů
│   ├── grafika.js      logo, ořez fotky, stažení a sdílení
│   ├── koncepty.js     ukládání rozpracovaných postů (IndexedDB, i s fotkami)
│   ├── ai.js           volitelný AI pomocník (Claude / Gemini) + hledání volných fotek
│   ├── zpravy.js       živé hledání témat na webu a ověřování faktů se zdroji
│   ├── reels.js        Reels Factory – 7 kroků (rešerše, scénář, záběry, střih, hlas, export)
│   ├── reels-zabery.js hledání záběrů (Commons, Internet Archive, YouTube, web) a knihovna
│   ├── reels-render.js střihový engine, náhled, render MP4 (WebCodecs), kontrola kvality
│   ├── reels-hlas.js   český hlas Piper TTS, mikrofon, mix zvuku
│   ├── reels-ulozeni.js projekty a média v IndexedDB
│   ├── app.js          tvorba postu, učení stylu
│   └── carousel.js     carousel podle šablony
├── postfabrika/        verze s AI (Python + Gemini)
│   ├── __main__.py     spuštění přes python -m postfabrika
│   ├── cli.py          příkazy web / analyzuj / styl / modely / generuj
│   ├── web.py          webové rozhraní (Flask) na http://127.0.0.1:8000
│   ├── pipeline.py     celý postup tvorby postu (sdílí ho web i příkazová řádka)
│   ├── config.py       nastavení z .env
│   ├── llm.py          Gemini API: strukturovaný JSON výstup, opakování při limitech
│   ├── style.py        načtení IG exportu, analýza stylu, stylový profil
│   ├── generator.py    text postu ve stylu profilu
│   ├── images.py       DuckDuckGo → Gemini Vision skóre → stažení → ořez 4:5 → titulek
│   └── vystup.py       uložení výstupu + HTML náhled ve stylu Instagramu
├── styl/
│   ├── profil.json     stylový profil (dokud nespustíš analyzuj, jen výchozí odhad)
│   └── ukazky/         sem můžeš vložit své příspěvky jako .txt
├── vystup/             vygenerované posty
├── tests/              testy bez sítě a bez klíčů
├── requirements.txt
└── .env.example
```

## Jak to funguje

```
 [1] analyzuj (jednorázově)
     IG export / .txt ──▶ Gemini: stylový profil ──▶ styl/profil.json
                          (tón, hooky, délka, emoji, CTA, hashtagy + reálné ukázky)

 [2] generuj "téma" [--fakta "…"]
     ├─▶ Gemini: hook, tělo, CTA, hashtagy, titulek do fotky, brief fotky, EN dotazy
     ├─▶ DuckDuckGo obrázky: filtr licence, min. 900 px, bez fotobank s vodoznakem
     ├─▶ Gemini Vision: až 16 náhledů → skóre 0–100 + střed hlavního motivu
     ├─▶ stažení vítěze v plném rozlišení (když web blokuje, bere se další v pořadí)
     ├─▶ ořez 1080×1350 kolem motivu + titulek do spodní části
     └─▶ vystup/2026-11-06_1830_tema/ {obrazek.jpg, post.txt, post.json, nahled.html}
```

## 1. Bezplatný Gemini klíč (1 minuta)

1. Otevři **<https://aistudio.google.com/apikey>** a přihlas se Google účtem.
2. Klikni **Create API key** (případně potvrď vytvoření projektu).
3. Klíč zkopíruj – vložíš ho do `.env` (viz níže).

Free tier nevyžaduje platební kartu. Má limity na počet požadavků za minutu a za den
(aktuální čísla pro tvůj klíč najdeš v AI Studiu v sekci *Rate limit*). Jeden post
= 2 požadavky, analýza stylu = 1 požadavek, takže na běžné použití to bohatě stačí.
Když limit dojde, aplikace sama počká a zkusí to znovu.

> ⚠️ Ve free tieru může Google používat vstupy a výstupy ke zlepšování svých modelů.
> Neposílej do aplikace nic důvěrného.

## 2. Instalace

Potřebuješ Python 3.10+ (<https://www.python.org/downloads/>, na Windows zaškrtni
„Add Python to PATH“).

```bash
git clone https://github.com/ggbosky/dhpostfabrika.git
```

```bash
cd dhpostfabrika
```

```bash
python -m venv .venv
```

Aktivace – Windows (PowerShell):

```bash
.venv\Scripts\Activate.ps1
```

macOS / Linux:

```bash
source .venv/bin/activate
```

```bash
pip install -r requirements.txt
```

Zkopíruj `.env.example` na `.env` a doplň `GEMINI_API_KEY=…`. Ověření, že klíč funguje
(vypíše modely, které můžeš používat):

```bash
python -m postfabrika modely
```

## 3. Naučení stylu (jednou, pak občas zopakovat)

Dokud tohle neuděláš, aplikace používá jen **výchozí odhad stylu** a při každém
generování na to upozorní.

**A) Export z Instagramu (nejlepší):** Instagram → Nastavení → Centrum účtů →
Vaše informace a oprávnění → Stáhnout vaše informace → účet denik_hokeje →
*Některé vaše informace* → **Obsah** → formát **JSON** → kvalita médií nízká.
ZIP rozbal do `styl/export/` a spusť:

```bash
python -m postfabrika analyzuj styl/export
```

**B) Ručně:** vlož 20–50 popisků do `styl/ukazky/prispevky.txt`, oddělených řádkem `---`:

```bash
python -m postfabrika analyzuj styl/ukazky
```

Kontrola výsledku (profil jde ručně doladit v `styl/profil.json`):

```bash
python -m postfabrika styl
```

## 4. Generování

### Webové rozhraní (nejpohodlnější)

```bash
python -m postfabrika
```

Otevře se prohlížeč na <http://127.0.0.1:8000>:
- **Nový post** – zadáš téma, fakta a filtr licence (případně nahraješ vlastní fotku),
  vidíš průběh, hotový post ve stylu Instagramu, tlačítka *Kopírovat text* a
  *Stáhnout obrázek* a všechny kandidáty s jejich skóre od Gemini Vision.
- **Naučit styl** – nahraješ `posts_1.json` z exportu nebo vložíš své popisky.

Server běží jen na tvém počítači; ukončíš ho v terminálu klávesami Ctrl+C.

### Příkazová řádka

Přímo s tématem a fakty (u výsledků a přestupů vždy doporučeno – Gemini nemá
aktuální zprávy a nesmí si nic vymýšlet):

```bash
python -m postfabrika generuj "Sparta porazila Pardubice" --fakta "4:3 pp, rozhodl Horák v 63. min" --otevrit
```

| Volba | Význam |
|---|---|
| `--fakta "…"` / `--fakta-soubor f.txt` | podklady, ze kterých má text vycházet |
| `--pokyn "kratší, víc emocí"` | doplňující pokyn k tónu/délce |
| `--licence upravy\|komercni\|verejne\|vse` | filtr licence fotek (výchozí `upravy`) |
| `--min-skore 60` | minimální skóre fotky od Gemini (výchozí 40) |
| `--bez-titulku` | nevkládat titulek do fotky |
| `--obrazek moje.jpg` | použít vlastní fotku (jen ořez 4:5 + titulek) |
| `--bez-obrazku` | jen text |
| `--otevrit` | otevřít `nahled.html` v prohlížeči |

Výstup:

```
vystup/2026-11-06_1830_sparta-porazila-pardubice/
├── obrazek.jpg   1080×1350 s titulkem, připraveno k nahrání
├── post.txt      hook, tělo, CTA, zdroj fotky, hashtagy
├── post.json     vše strukturovaně + skóre fotky, odkud je a proč vyhrála
└── nahled.html   náhled ve stylu Instagramu s tlačítkem „Kopírovat text“
```

Údaje, které je potřeba ověřit, Gemini místo vymýšlení označí `[DOPLNIT: …]` a vypíšou
se v sekci **„Před publikací ověř“**.

## ⚠️ Autorská práva k fotkám – přečti si

Fotky z vyhledávače **nejsou automaticky volné**. Většina hokejových fotek na webu patří
agenturám (ČTK, Getty, Profimedia) nebo klubům a jejich použití na Instagramu bez
svolení může vést k nahlášení postu nebo k požadavku na odškodnění.

Proto má aplikace ve výchozím stavu zapnutý **filtr licence `upravy`** – hledá jen
obrázky označené jako volně použitelné včetně komerčního využití a úprav (ořez a titulek
jsou úprava). Fotobanky s vodoznakem (Getty, Shutterstock, Alamy…) se rovnou vynechávají.

- Filtr licence je jen tak dobrý jako označení na webu – u důležitých postů klikni
  v náhledu na odkaz zdroje a licenci ověř.
- `--licence vse` najde nejvíc a nejlepších fotek, ale **odpovědnost za práva je na tobě**;
  aplikace pak výslovně upozorní, že je třeba práva ověřit.
- Pro zprávy o konkrétních hráčích a zápasech je nejjistější vlastní nebo licencovaná
  fotka přes `--obrazek`.

## Řešení problémů

| Problém | Řešení |
|---|---|
| `Chybí GEMINI_API_KEY` | doplň klíč do `.env` (ve složce projektu, ne `.env.example`) |
| `Vyčerpaný limit free tieru` | počkej pár minut; denní limit se obnovuje o půlnoci pacifického času |
| Model neexistuje | `python -m postfabrika modely` a nastav `GEMINI_MODEL` v `.env` |
| `Žádná vhodná fotka nenalezena` | zkus `--licence komercni`, jiné téma nebo za pár minut (DuckDuckGo občas omezí počet dotazů) |
| Titulek bez diakritiky | nastav `FONT_PATH` na tučný TTF font (např. `C:\Windows\Fonts\arialbd.ttf`) |

## Testy

Bez sítě a bez klíčů (Gemini i DuckDuckGo jsou nahrazené maketami):

```bash
pip install -r requirements-dev.txt
```

```bash
python -m pytest -q
```
