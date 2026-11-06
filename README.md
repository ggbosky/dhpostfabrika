# DH Post Fabrika 🏒

Lokální nástroj (Python), který podle zadaného tématu vygeneruje **hotový Instagram
příspěvek ve stylu účtu [@denik_hokeje](https://www.instagram.com/denik_hokeje/)**:

- chytlavý hook, hlavní text, CTA a sadu hashtagů,
- **sám najde a vybere nejvhodnější fotku** (Pexels + Unsplash, výběr dělá Claude
  „očima“ fotoeditora), ořízne ji na Instagram formát **4:5 (1080 × 1350)**,
- volitelně vloží krátký titulek přímo do fotky,
- uloží vše do složky (`obrazek.jpg`, `post.txt`, `post.json`, `nahled.html`).

## Jak to funguje

```
                 ┌──────────────────────────┐
  tvoje posty ──▶│ 1. analyzuj  (jednorázově)│──▶ styl/profil.json
 (IG export/txt) │   Claude: stylový profil  │    tón, hooky, délka, emoji,
                 └──────────────────────────┘    CTA, hashtagy, reálné ukázky
                                                        │
   téma ──▶ 2. generuj ─────────────────────────────────┤
              │                                          ▼
              ├─▶ Claude: text postu + brief fotky + EN dotazy do fotobank
              ├─▶ Pexels + Unsplash: až 16 kandidátů (filtr ≥ 1080 px)
              ├─▶ Claude vision: ohodnotí všechny, vybere vítěze + střed motivu
              ├─▶ stažení v plném rozlišení → ořez 4:5 kolem motivu (+ titulek)
              └─▶ vystup/2026-11-06_1830_tema/ {obrazek.jpg, post.txt, post.json, nahled.html}
```

| Soubor | Co dělá |
|---|---|
| `postfabrika/style.py` | načtení IG exportu / txt, analýza stylu, stylový profil |
| `postfabrika/generator.py` | generování textu postu ve stylu profilu |
| `postfabrika/images.py` | vyhledání fotek, výběr přes Claude vision, ořez 4:5, titulek v obrázku |
| `postfabrika/vystup.py` | uložení výstupu a HTML náhled ve stylu Instagramu |
| `postfabrika/llm.py` | volání Claude API se strukturovaným (validovaným) výstupem |
| `postfabrika/cli.py` | příkazy `analyzuj`, `styl`, `generuj` |

Proč Python: nejlepší podpora pro práci s obrázky (Pillow), oficiální Anthropic SDK
se strukturovaným výstupem přes Pydantic a jednoduché spuštění na Windows/macOS/Linuxu.

## Instalace

Potřebuješ Python 3.10+.

```bash
git clone https://github.com/ggbosky/dhpostfabrika.git
```

```bash
cd dhpostfabrika
```

```bash
python -m venv .venv
```

Aktivace prostředí – macOS/Linux:

```bash
source .venv/bin/activate
```

Windows (PowerShell):

```bash
.venv\Scripts\Activate.ps1
```

```bash
pip install -r requirements.txt
```

Pak zkopíruj `.env.example` na `.env` a doplň klíče:

| Proměnná | Kde ji získat | Nutné? |
|---|---|---|
| `ANTHROPIC_API_KEY` | <https://console.anthropic.com/> → API Keys | ano |
| `PEXELS_API_KEY` | <https://www.pexels.com/api/> (zdarma) | aspoň jedna fotobanka |
| `UNSPLASH_ACCESS_KEY` | <https://unsplash.com/developers> → New Application → Access Key (zdarma) | aspoň jedna fotobanka |

## Krok 1: Naučení stylu (jednou, pak občas zopakovat)

Aplikace si styl odvodí z **tvých reálných textů**. Dokud to neuděláš, používá jen
výchozí odhad (`styl/profil.json` s `"je_vychozi": true`) a při každém generování
na to upozorní.

**A) Oficiální export z Instagramu (nejlepší, všechny posty):**
Instagram → Nastavení → Centrum účtů → Vaše informace a oprávnění →
Stáhnout vaše informace → účet denik_hokeje → *Některé vaše informace* →
zaškrtni **Obsah** → formát **JSON** → kvalita médií „nízká“ (stačí text).
ZIP rozbal třeba do `styl/export/` a spusť:

```bash
python -m postfabrika analyzuj styl/export
```

**B) Ručně:** vlož 20–50 popisků do `styl/ukazky/prispevky.txt`, oddělených řádkem `---`
(viz `styl/ukazky/README.md`), a spusť:

```bash
python -m postfabrika analyzuj styl/ukazky
```

Výsledný profil si můžeš prohlédnout (a v `styl/profil.json` i ručně doladit):

```bash
python -m postfabrika styl
```

## Krok 2: Generování příspěvků

Nejjednodušší – interaktivně (zeptá se na téma a na konci otevře náhled):

```bash
python -m postfabrika
```

Přímo s tématem:

```bash
python -m postfabrika generuj "Kometa Brno podepsala nového útočníka z NHL" --otevrit
```

S ověřenými fakty (doporučeno u výsledků a přestupů – model pak nemusí nic domýšlet):

```bash
python -m postfabrika generuj "Sparta porazila Pardubice" --fakta "Sparta–Pardubice 4:3 pp, rozhodl Horák v 63. min, 2 body Kousal"
```

Další volby:

| Volba | Význam |
|---|---|
| `--fakta "…"` / `--fakta-soubor soubor.txt` | podklady, ze kterých má text vycházet |
| `--pokyn "kratší, víc emocí"` | doplňující pokyn k tónu/délce |
| `--titulek-v-obrazku` | vloží krátký titulek do spodní části fotky (ztmavený přechod) |
| `--obrazek moje.jpg` | použije tvoji fotku (jen ořez 4:5), fotobanky se nevolají |
| `--bez-obrazku` | jen text |
| `--otevrit` | otevře `nahled.html` v prohlížeči |

### Výstup

```
vystup/2026-11-06_1830_kometa-brno-podepsala-noveho-utocnika/
├── obrazek.jpg   1080×1350, připraveno k nahrání
├── post.txt      hotový text (hook, tělo, CTA, kredit fotky, hashtagy)
├── post.json     vše strukturovaně + proč byla vybrána daná fotka
└── nahled.html   náhled ve stylu Instagramu s tlačítkem „Kopírovat text“
```

Pokud text obsahuje údaje, které je potřeba ověřit, model je místo vymýšlení označí
jako `[DOPLNIT: …]` a vypíše je v sekci **„Před publikací ověř“**.

## Důležité poznámky

- **Fotky konkrétních hráčů a zápasů ve fotobankách nejsou.** Pexels/Unsplash mají
  obecné hokejové fotky (akce, brankář, hala, puk, fanoušci). Pro zprávy o konkrétních
  hráčích použij vlastní nebo licencovanou fotku přes `--obrazek`.
- **Google Images záměrně nepoužívám** – většina výsledků je chráněná autorským
  právem a jejich použití na Instagramu by ti mohlo přinést nárok na odškodnění
  nebo stažení postu. Pexels i Unsplash povolují bezplatné komerční použití.
- **Kredit fotografa** se přidává do textu postu (`📸 Jméno / Unsplash`). Vypneš ho
  v `.env` přes `PRIDAT_KREDIT_FOTA=0` (u Unsplash je ale uvedení autora žádoucí).
- **Model:** výchozí je `claude-opus-5-5`, lze změnit přes `CLAUDE_MODEL` v `.env`.
  Odmítnuté požadavky se automaticky zkusí na záložním modelu (server-side fallback).
- **Náklady:** jeden post ≈ 2 volání Claude (text + výběr fotky), řádově jednotky
  korun. Analýza stylu je jednorázová.

## Testy

Testy běží bez sítě a bez API klíčů (Claude i fotobanky jsou nahrazené maketami):

```bash
pip install -r requirements-dev.txt
```

```bash
python -m pytest -q
```
