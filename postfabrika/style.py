"""Stylový profil účtu: načtení, uložení a naučení z reálných příspěvků."""

from __future__ import annotations

import json
import re
from pathlib import Path

from pydantic import BaseModel, Field

from . import llm


class HashtagStrategie(BaseModel):
    popis: str = Field(description="Jak účet pracuje s hashtagy (umístění, mix, jazyk).")
    pocet_min: int
    pocet_max: int
    stale_hashtagy: list[str] = Field(
        description="Značkové/opakující se hashtagy, které jsou skoro u každého postu (vč. #)."
    )
    typicke_hashtagy: list[str] = Field(description="Další často používané hashtagy (vč. #).")


class StylProfil(BaseModel):
    shrnuti: str = Field(description="2–4 věty: kdo účet je a jak zní.")
    ton: list[str] = Field(description="Přídavná jména popisující tón, např. 'věcný', 'emotivní'.")
    oslovovani: str = Field(description="Jak se oslovuje publikum (tykání/vykání/neosobně).")
    hooky: list[str] = Field(description="Vzorce prvních řádků (hooků) s krátkými příklady.")
    delka: str = Field(description="Typická délka textu (znaky/věty/odstavce).")
    formatovani: list[str] = Field(
        description="Pravidla formátování: odstavce, odrážky, velká písmena, oddělovače…"
    )
    emoji: str = Field(description="Jak a kde se používají emoji, kolik jich je.")
    oblibene_emoji: list[str]
    cta: list[str] = Field(description="Typické výzvy k akci (otázky, 'dej vědět v komentářích'…).")
    typicke_fraze: list[str] = Field(description="Opakující se slovní obraty a slovník.")
    hashtagy: HashtagStrategie
    nedelat: list[str] = Field(description="Co se ve stylu účtu nevyskytuje / čemu se vyhnout.")
    ukazky: list[str] = Field(
        default_factory=list, description="Doslovné reálné texty příspěvků jako vzor."
    )
    pocet_analyzovanych: int = 0
    je_vychozi: bool = Field(
        default=False,
        description="True = profil není naučený z reálných postů, jde jen o odhad.",
    )


class _VyberUkazek(BaseModel):
    profil: StylProfil
    indexy_ukazek: list[int] = Field(
        description="Indexy (0-based) 4–8 nejreprezentativnějších příspěvků ze vstupu."
    )


# ---------------------------------------------------------------- načítání ---


def nacti_profil(cesta: Path) -> StylProfil:
    if not cesta.exists():
        raise FileNotFoundError(
            f"Stylový profil {cesta} neexistuje. Spusť nejdřív `python -m postfabrika analyzuj …`."
        )
    return StylProfil.model_validate_json(cesta.read_text(encoding="utf-8"))


def uloz_profil(profil: StylProfil, cesta: Path) -> None:
    cesta.parent.mkdir(parents=True, exist_ok=True)
    cesta.write_text(
        json.dumps(profil.model_dump(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


def _oprav_kodovani(text: str) -> str:
    """Instagram export ukládá UTF-8 jako latin-1 escapy ("Ä\x8d" místo "č")."""
    try:
        return text.encode("latin-1").decode("utf-8")
    except (UnicodeEncodeError, UnicodeDecodeError):
        return text


def _z_jsonu(data: object, out: list[str]) -> None:
    # Popisky jsou v exportu pod klíčem "title" (u postu i u jednotlivých médií).
    if isinstance(data, dict):
        for k, v in data.items():
            if k == "title" and isinstance(v, str):
                out.append(_oprav_kodovani(v))
            else:
                _z_jsonu(v, out)
    elif isinstance(data, list):
        for item in data:
            _z_jsonu(item, out)


def _z_textu(text: str) -> list[str]:
    # Příspěvky oddělené řádkem obsahujícím jen --- (nebo více pomlček).
    return [p.strip() for p in re.split(r"^\s*-{3,}\s*$", text, flags=re.MULTILINE)]


def nacti_prispevky(zdroje: list[Path]) -> list[str]:
    """Načte texty příspěvků z Instagram exportu (JSON) a/nebo z .txt souborů."""
    soubory: list[Path] = []
    for z in zdroje:
        if z.is_dir():
            soubory += sorted(p for p in z.rglob("*") if p.suffix.lower() in {".json", ".txt"})
        elif z.exists():
            soubory.append(z)
        else:
            raise FileNotFoundError(f"Soubor/složka neexistuje: {z}")

    texty: list[str] = []
    for s in soubory:
        if s.suffix.lower() == ".json":
            try:
                _z_jsonu(json.loads(s.read_text(encoding="utf-8")), texty)
            except json.JSONDecodeError:
                continue
        else:
            texty += _z_textu(s.read_text(encoding="utf-8"))

    # Filtr: jen skutečné popisky (ne názvy alb apod.), bez duplicit, pořadí zachováno.
    videno: set[str] = set()
    vysledek = []
    for t in texty:
        t = t.strip()
        if len(t) < 25 or t in videno:
            continue
        videno.add(t)
        vysledek.append(t)
    return vysledek


# ----------------------------------------------------------------- analýza ---

_SYSTEM_ANALYZA = """Jsi zkušený social-media analytik a copywriter se specializací na \
český sportovní (hokejový) obsah. Dostaneš reálné texty příspěvků jednoho Instagram \
účtu. Tvým úkolem je co nejpřesněji popsat JEHO styl tak, aby podle tvého popisu šlo \
psát nové příspěvky k nerozeznání od originálu.

Zásady:
- Popisuj jen to, co v textech skutečně vidíš. Nic si nedomýšlej.
- Buď konkrétní a měřitelný (počty znaků, počty emoji, počty hashtagů, pozice CTA).
- U hooků, CTA a frází uváděj krátké doslovné příklady z textů.
- Hashtagy přepisuj přesně (včetně diakritiky a velikosti písmen), s #.
- Vše piš česky."""


def analyzuj(prispevky: list[str], model: str, max_postu: int = 200) -> StylProfil:
    if len(prispevky) < 5:
        raise ValueError(
            f"Na spolehlivou analýzu je potřeba aspoň 5 příspěvků (máš {len(prispevky)}). "
            "Ideálně 20–50."
        )
    vzorek = prispevky[:max_postu]
    blok = "\n\n".join(f"<post index=\"{i}\">\n{t}\n</post>" for i, t in enumerate(vzorek))
    vysledek = llm.strukturovane(
        model=model,
        system=_SYSTEM_ANALYZA,
        content=(
            f"Zde je {len(vzorek)} příspěvků účtu (od nejnovějších):\n\n{blok}\n\n"
            "Vytvoř stylový profil a vyber indexy 4–8 příspěvků, které styl "
            "reprezentují nejlépe (různé typy obsahu)."
        ),
        schema=_VyberUkazek,
        effort="high",
    )
    profil = vysledek.profil
    profil.ukazky = [vzorek[i] for i in vysledek.indexy_ukazek if 0 <= i < len(vzorek)][:8]
    profil.pocet_analyzovanych = len(vzorek)
    profil.je_vychozi = False
    return profil


def profil_do_promptu(p: StylProfil) -> str:
    """Převede profil na čitelný text pro systémový prompt generátoru."""
    h = p.hashtagy
    radky = [
        f"SHRNUTÍ: {p.shrnuti}",
        f"TÓN: {', '.join(p.ton)}",
        f"OSLOVOVÁNÍ: {p.oslovovani}",
        "HOOKY (první řádek):\n" + "\n".join(f"- {x}" for x in p.hooky),
        f"DÉLKA: {p.delka}",
        "FORMÁTOVÁNÍ:\n" + "\n".join(f"- {x}" for x in p.formatovani),
        f"EMOJI: {p.emoji} Oblíbené: {' '.join(p.oblibene_emoji)}",
        "CTA:\n" + "\n".join(f"- {x}" for x in p.cta),
        "TYPICKÉ FRÁZE:\n" + "\n".join(f"- {x}" for x in p.typicke_fraze),
        (
            f"HASHTAGY: {h.popis} Počet {h.pocet_min}–{h.pocet_max}. "
            f"Vždy: {' '.join(h.stale_hashtagy) or '—'}. "
            f"Časté: {' '.join(h.typicke_hashtagy) or '—'}"
        ),
        "NEDĚLAT:\n" + "\n".join(f"- {x}" for x in p.nedelat),
    ]
    if p.ukazky:
        radky.append(
            "REÁLNÉ UKÁZKY PŘÍSPĚVKŮ (vzor tónu a formy, NEkopírovat obsah):\n"
            + "\n\n".join(f"<ukazka>\n{u}\n</ukazka>" for u in p.ukazky)
        )
    return "\n\n".join(radky)
