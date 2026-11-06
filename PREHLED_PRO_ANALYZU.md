# DH Post Fabrika – přehled projektu k analýze

## 1. Cíl

Lokální nástroj pro Instagram účet **@denik_hokeje** (český hokejový obsah). Uživatel zadá
jen téma / krátký podnět a nástroj vytvoří kompletní příspěvek:

- text v reálném stylu účtu (hook, hlavní text, CTA, hashtagy),
- automaticky vybranou, tematicky vhodnou a profesionálně vypadající fotku, oříznutou
  pro Instagram.

Repozitář: `github.com/ggbosky/dhpostfabrika`, větev `claude/intelligent-lovelace-qzitaa`.

## 2. Aktuální stav

| Oblast | Stav |
|---|---|
| Kód aplikace | hotový (Python, cca 700 řádků) |
| Offline testy (Claude i fotobanky nahrazené maketami) | 6/6 prochází |
| Ostrý běh s reálnými API | **zatím neproběhl** (v prostředí, kde vznikl kód, chyběly API klíče) |
| Analýza reálného stylu účtu | **neproběhla** – viz níže |

### Proč není styl účtu zanalyzovaný

Instagram bez přihlášení vrací jen login stránku, takže veřejné příspěvky nešlo stáhnout.
Neveřejné API Instagramu (scraping) bylo zablokované jako obcházení ochrany proti botům.
Vyhledávače texty účtu neindexují.

**Řešení:** analýza stylu je součástí aplikace (příkaz `analyzuj`). Vstupem jsou vlastní
texty příspěvků – oficiální export dat z Instagramu (JSON) nebo ručně vložené popisky.
Do té doby se používá výchozí profil, který je pouze **odhad** (označený `je_vychozi: true`).

## 3. Technologie

- **Python 3.10+**
- **Claude API** (oficiální SDK `anthropic`), model `claude-opus-5-5` (lze změnit v `.env`)
  – strukturovaný výstup validovaný přes Pydantic (`messages.parse`)
  – server-side fallback při odmítnutí požadavku
- **Pexels API + Unsplash API** – fotobanky s licencí pro bezplatné komerční použití
- **Pillow** – ořez, změna velikosti, titulek do obrázku
- **requests, python-dotenv**

Google Images záměrně nepoužité – většina obrázků je chráněná autorským právem.

## 4. Architektura a tok dat

```
[A] analyzuj (jednorázově)
    IG export JSON / .txt  →  načtení a vyčištění popisků
                           →  Claude: stylový profil + výběr 4–8 reprezentativních postů
                           →  styl/profil.json

[B] generuj "téma" [--fakta ...]
    1. Claude (text):  téma + profil + ukázky  →  hook, tělo, CTA, hashtagy,
                       titulek do obrázku, alt text, popis ideální fotky,
                       3–4 anglické dotazy do fotobank, seznam faktů k ověření
    2. Pexels + Unsplash: vyhledání podle dotazů, filtr min. 1080 px, bez duplicit
    3. Claude (vision): až 16 náhledů (base64, 512 px) → skóre 0–100 pro každou fotku,
                        vítěz + souřadnice hlavního motivu (fokus_x, fokus_y)
    4. Stažení v plném rozlišení → ořez 1080×1350 (4:5) kolem motivu
       → volitelně titulek do spodní části fotky (tmavý přechod + bílé tučné písmo)
    5. Uložení: vystup/<datum>_<slug>/
         obrazek.jpg, post.txt, post.json, nahled.html
```

## 5. Soubory

| Soubor | Obsah |
|---|---|
| `postfabrika/cli.py` | příkazy `analyzuj`, `styl`, `generuj`; bez příkazu interaktivní režim |
| `postfabrika/style.py` | načtení IG exportu (vč. opravy kódování), Pydantic model `StylProfil`, analýza, převod profilu do promptu |
| `postfabrika/generator.py` | model `Prispevek`, systémový prompt copywritera, složení finálního textu |
| `postfabrika/images.py` | vyhledání (Pexels, Unsplash), výběr fotky přes Claude vision, ořez 4:5, titulek do obrázku |
| `postfabrika/vystup.py` | uložení výstupu, HTML náhled ve stylu Instagramu s tlačítkem „Kopírovat text“ |
| `postfabrika/llm.py` | volání Claude API, ošetření chyb (klíč, limity, odmítnutí, useknutá odpověď) |
| `postfabrika/config.py` | konfigurace z `.env` |
| `styl/profil.json` | aktuální stylový profil (zatím výchozí odhad) |
| `tests/test_offline.py` | testy bez sítě |

## 6. Datové modely (zkráceně)

**StylProfil:** shrnutí, tón, oslovování, vzorce hooků, délka, pravidla formátování,
práce s emoji + oblíbené emoji, vzorce CTA, typické fráze, strategie hashtagů
(min/max počet, stálé značkové, typické), co nedělat, doslovné ukázky postů,
počet analyzovaných postů, příznak výchozího odhadu.

**Prispevek:** hook, tělo, CTA, hashtagy, titulek do obrázku, alt text, brief fotky,
dotazy do fotobank (anglicky), fakta k ověření.

## 7. Klíčová pravidla v promptech

- Generátor se řídí stylovým profilem a reálnými ukázkami (ukázky slouží jako vzor tónu,
  obsah se nekopíruje).
- **Nevymýšlet fakta** – výsledky, statistiky, citace, přestupy, jména a data jen ze
  zadání nebo z `--fakta`; jinak vložit `[DOPLNIT: …]` a uvést v seznamu k ověření.
- Žádné typické AI fráze („pojďme se podívat“, „v dnešním příspěvku“…).
- Výběr fotky: tematická shoda je nejdůležitější (pozemní hokej, florbal, NFL ani cizí
  klubové znaky nejsou vhodné), pak kvalita (ostrost, světlo, dynamika) a použitelnost
  na výšku bez vodoznaků.

## 8. Výchozí odhad stylu (NENÍ ověřený na reálných postech)

Krátké zpravodajsko-fanouškovské texty: hook s 1 emoji („🚨 Je to oficiální!“),
2–4 krátké odstavce (cca 300–700 znaků), střídmé emoji (🏒 🚨 🔥 🇨🇿 🥅 👇),
na konci otázka na fanoušky, 5–10 hashtagů v jednom řádku
(`#denikhokeje #hokej #extraliga #nhl #ceskyhokej …`).

## 9. Známá omezení a rizika

1. **Styl zatím není naučený** – dokud neproběhne `analyzuj` na reálných postech,
   výstup nebude znít jako účet.
2. **Fotobanky nemají konkrétní hráče, zápasy ani klubové dresy.** U zpráv
   o konkrétních hráčích je fotka jen ilustrační; řešení je vlastní nebo licencovaná
   fotka (`--obrazek`).
3. **Neotestováno naostro** – reálná volání API (Claude, Pexels, Unsplash) zatím
   neproběhla; možné drobné chyby v napojení.
4. **Aktuálnost** – model nemá přístup k aktuálním výsledkům a zprávám; fakta musí
   dodat uživatel (`--fakta`).
5. **Formát** – jen jedna fotka (žádný carousel, žádné Reels), žádné automatické
   publikování na Instagram.
6. **Náklady** – cca 2 volání Claude na post (řádově jednotky Kč), analýza stylu jednorázově.

## 10. Možná rozšíření

- Napojení na zdroj aktuálních zpráv/výsledků (RSS, API ligy) jako automatická `--fakta`.
- Carousel (více slidů s textem), šablony grafiky v barvách účtu, logo/vodoznak.
- Generování více variant hooku a výběr nejlepší.
- Jednoduché webové rozhraní místo příkazové řádky.
- Publikování přes Instagram Graph API (vyžaduje Business/Creator účet a Meta aplikaci).
- Zpětná vazba: sledovat výkon postů a upravovat profil podle toho, co funguje.

## 11. Spuštění

```
pip install -r requirements.txt
cp .env.example .env        # doplnit ANTHROPIC_API_KEY + PEXELS_API_KEY a/nebo UNSPLASH_ACCESS_KEY
python -m postfabrika analyzuj styl/export          # nebo styl/ukazky s prispevky.txt
python -m postfabrika generuj "Kometa podepsala útočníka z NHL" --fakta "..." --otevrit
```

## 12. Otázky k posouzení

1. Je dvoukrokový přístup (naučit styl z exportu → generovat) správný, nebo existuje
   lepší legální způsob, jak získat texty postů?
2. Jsou Pexels/Unsplash pro hokejový zpravodajský účet dostačující, nebo je potřeba
   jiný zdroj fotek (ČTK, Profimedia, klubové tiskové fotky, vlastní fotky)?
3. Které rozšíření z bodu 10 má největší přínos v poměru k práci?
4. Je lepší držet nástroj jako příkazovou řádku, nebo udělat jednoduché webové rozhraní?
