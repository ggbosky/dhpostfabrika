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
| Kód aplikace | hotový (Python), verze 2 – kompletně zdarma (Gemini free tier + DuckDuckGo) |
| Offline testy (Gemini i DuckDuckGo nahrazené maketami) | 11/11 prochází |
| Ostrý běh s reálnými API | **zatím neproběhl** (chyběl Gemini klíč; DuckDuckGo nešlo z vývojového prostředí zavolat kvůli jeho síťové proxy) |
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
- **Google Gemini API – free tier** (SDK `google-genai`), výchozí model `gemini-flash-latest`
  (alias na aktuální Flash; při neexistujícím modelu automaticky zkusí záložní)
  – text i vision, JSON výstup podle Pydantic schématu, automatické čekání při limitu (429)
- **DuckDuckGo obrázky** (knihovna `ddgs`, nástupce `duckduckgo_search`) – bez klíče,
  filtr licence (výchozí: volně použitelné komerčně vč. úprav), blokace fotobank s vodoznakem
- **Pillow** – ořez, změna velikosti, titulek do obrázku
- **requests, python-dotenv**

Jediný potřebný klíč: GEMINI_API_KEY zdarma z https://aistudio.google.com/apikey

## 4. Architektura a tok dat

```
[A] analyzuj (jednorázově)
    IG export JSON / .txt  →  načtení a vyčištění popisků
                           →  Gemini: stylový profil + výběr 4–8 reprezentativních postů
                           →  styl/profil.json

[B] generuj "téma" [--fakta ...]
    1. Gemini (text):  téma + profil + ukázky  →  hook, tělo, CTA, hashtagy,
                       titulek do obrázku, alt text, popis ideální fotky,
                       3–4 anglické dotazy pro hledání fotek, seznam faktů k ověření
    2. DuckDuckGo: vyhledání podle dotazů, filtr licence, min. 900 px, bez duplicit a vodoznaků
    3. Gemini Vision: až 16 náhledů (512 px, pestře z různých webů) → skóre 0–100,
                        vítěz + souřadnice hlavního motivu (fokus_x, fokus_y)
    4. Stažení v plném rozlišení (když web blokuje → další v pořadí) → ořez 1080×1350 (4:5)
       kolem motivu → titulek do spodní části fotky (tmavý přechod + bílé tučné písmo)
    5. Uložení: vystup/<datum>_<slug>/
         obrazek.jpg, post.txt, post.json, nahled.html
```

## 5. Soubory

| Soubor | Obsah |
|---|---|
| `postfabrika/cli.py` | příkazy `analyzuj`, `styl`, `generuj`; bez příkazu interaktivní režim |
| `postfabrika/style.py` | načtení IG exportu (vč. opravy kódování), Pydantic model `StylProfil`, analýza, převod profilu do promptu |
| `postfabrika/generator.py` | model `Prispevek`, systémový prompt copywritera, složení finálního textu |
| `postfabrika/images.py` | vyhledání (DuckDuckGo), skóre přes Gemini Vision, stažení s náhradníky, ořez 4:5, titulek do obrázku |
| `postfabrika/vystup.py` | uložení výstupu, HTML náhled ve stylu Instagramu s tlačítkem „Kopírovat text“ |
| `postfabrika/llm.py` | volání Gemini API, JSON schéma, čekání při limitech free tieru, záložní modely |
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
2. **Autorská práva k fotkám z webu.** Bez filtru licence je většina hokejových fotek
   chráněná (ČTK, Getty, kluby). S filtrem jsou fotky bezpečnější, ale je jich méně
   a filtr závisí na označení webu. Konkrétní hráči → vlastní/licencovaná fotka (`--obrazek`).
3. **Neotestováno naostro** – reálná volání Gemini a DuckDuckGo zatím neproběhla.
   DuckDuckGo nemá oficiální API; knihovna `ddgs` ho volá neoficiálně a může se rozbít
   nebo narazit na omezení počtu dotazů.
4. **Aktuálnost** – model nemá přístup k aktuálním výsledkům a zprávám; fakta musí
   dodat uživatel (`--fakta`).
5. **Formát** – jen jedna fotka (žádný carousel, žádné Reels), žádné automatické
   publikování na Instagram.
6. **Limity free tieru Gemini** – 2 požadavky na post; ve free tieru může Google data použít ke zlepšování modelů.

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
cp .env.example .env        # doplnit GEMINI_API_KEY (zdarma)
python -m postfabrika modely
python -m postfabrika analyzuj styl/export          # nebo styl/ukazky s prispevky.txt
python -m postfabrika generuj "Kometa podepsala útočníka z NHL" --fakta "..." --otevrit
```

## 12. Otázky k posouzení

1. Je dvoukrokový přístup (naučit styl z exportu → generovat) správný, nebo existuje
   lepší legální způsob, jak získat texty postů?
2. Jaký zdroj fotek je pro hokejový zpravodajský účet nejlepší kompromis mezi kvalitou
   a právní jistotou (DuckDuckGo s filtrem licence, Wikimedia Commons, klubové tiskové
   fotky, vlastní fotky)?
3. Které rozšíření z bodu 10 má největší přínos v poměru k práci?
4. Je lepší držet nástroj jako příkazovou řádku, nebo udělat jednoduché webové rozhraní?
