"""Generování textu příspěvku v naučeném stylu."""

from __future__ import annotations

import datetime as dt

from pydantic import BaseModel, Field

from . import llm
from .style import StylProfil, profil_do_promptu


class Prispevek(BaseModel):
    hook: str = Field(description="První řádek – chytlavý titulek/hook přesně ve stylu účtu.")
    telo: str = Field(
        description="Hlavní text bez hooku, CTA a hashtagů. Odstavce odděluj prázdným řádkem."
    )
    cta: str = Field(description="Výzva k akci ve stylu účtu.")
    hashtagy: list[str] = Field(description="Hashtagy včetně znaku #, bez mezer uvnitř.")
    titulek_do_obrazku: str = Field(
        description="Velmi krátký titulek do grafiky (max. ~7 slov), bez emoji a hashtagů."
    )
    alt_text: str = Field(description="Alternativní popis obrázku pro nevidomé (1 věta).")
    obrazek_brief: str = Field(
        description="Česky: co přesně má ideální fotka ukazovat (motiv, nálada, kompozice)."
    )
    obrazek_dotazy: list[str] = Field(
        description=(
            "3–4 ANGLICKÉ dotazy pro vyhledávání fotek na webu, od nejkonkrétnějšího "
            "(jméno hráče/klubu, pokud je v zadání) po obecný; vždy s 'ice hockey', "
            "pokud jde o lední hokej."
        )
    )
    k_overeni: list[str] = Field(
        description=(
            "Konkrétní fakta, čísla, jména nebo data v textu, která je nutné před "
            "publikací ověřit. Prázdný seznam, pokud žádná nejsou."
        )
    )


_SYSTEM = """Jsi copywriter Instagram účtu @denik_hokeje. Píšeš nové příspěvky tak, \
aby byly k nerozeznání od reálných příspěvků účtu – stejný tón, délka, struktura, \
emoji, CTA i hashtagy. Řídíš se stylovým profilem níže; má přednost před tvými \
obecnými zvyky.

<stylovy_profil>
{profil}
</stylovy_profil>

Pravidla obsahu:
- Piš česky, přirozeně, bez kalků z angličtiny a bez AI frází ("v dnešním příspěvku", \
"pojďme se podívat", "nezapomeňte").
- NEVYMÝŠLEJ fakta. Výsledky, statistiky, citace, přestupy, data a jména uváděj jen \
pokud jsou v zadání nebo v dodaných faktech. Kde konkrétní údaj chybí a text by ho \
potřeboval, napiš [DOPLNIT: co] a uveď to v k_overeni.
- Hook musí zastavit scrollování, ale nesmí být clickbait, který text nesplní.
- Dodrž počet hashtagů a značkové hashtagy z profilu.
- Dnešní datum: {datum}."""


def generuj(
    tema: str,
    profil: StylProfil,
    model: str,
    fakta: str | None = None,
    poznamka: str | None = None,
) -> Prispevek:
    zadani = [f"TÉMA / PODNĚT: {tema}"]
    if fakta:
        zadani.append(f"OVĚŘENÁ FAKTA, ZE KTERÝCH VYCHÁZEJ:\n{fakta}")
    if poznamka:
        zadani.append(f"DOPLŇUJÍCÍ POKYN: {poznamka}")
    zadani.append("Napiš nový příspěvek.")

    dnes = dt.date.today()
    p = llm.strukturovane(
        model=model,
        system=_SYSTEM.format(
            profil=profil_do_promptu(profil), datum=f"{dnes.day}. {dnes.month}. {dnes.year}"
        ),
        content="\n\n".join(zadani),
        schema=Prispevek,
    )
    p.hashtagy = _normalizuj_hashtagy(p.hashtagy)
    return p


def _normalizuj_hashtagy(tagy: list[str]) -> list[str]:
    out, videno = [], set()
    for t in tagy:
        t = "#" + t.strip().lstrip("#").replace(" ", "")
        if len(t) > 1 and t.lower() not in videno:
            videno.add(t.lower())
            out.append(t)
    return out[:30]  # tvrdý limit Instagramu


def sloz_text(p: Prispevek, kredit: str | None = None) -> str:
    """Finální text připravený ke zkopírování do Instagramu."""
    casti = [p.hook.strip(), p.telo.strip(), p.cta.strip()]
    if kredit:
        casti.append(kredit)
    casti.append(" ".join(p.hashtagy))
    return "\n\n".join(c for c in casti if c)
