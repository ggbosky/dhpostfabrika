"""Celý postup tvorby postu – sdílí ho příkazová řádka i webové rozhraní."""

from __future__ import annotations

import dataclasses
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable

from PIL import Image

from . import generator, images, style, vystup
from .config import Config
from .generator import Prispevek

Log = Callable[[str], None]


@dataclass
class Zadani:
    tema: str
    fakta: str | None = None
    pokyn: str | None = None
    licence: str | None = None  # None = podle .env
    titulek: bool = True
    bez_obrazku: bool = False
    vlastni_obrazek: Image.Image | None = None
    min_skore: int = 40


@dataclass
class Vysledek:
    slozka: Path
    text: str
    post: Prispevek
    ma_obrazek: bool
    foto: images.Kandidat | None = None
    skore: int | None = None
    zduvodneni: str | None = None
    kandidati: list[tuple[images.Kandidat, int]] = field(default_factory=list)
    upozorneni: list[str] = field(default_factory=list)


def _vyber_fotku(z: Zadani, cfg: Config, post: Prispevek, log: Log, v: dict) -> Image.Image | None:
    log(f"🔎 Hledám fotky (licence: {cfg.licence}): {' | '.join(post.obrazek_dotazy)}")
    kandidati = images.vyhledej(post.obrazek_dotazy, cfg)
    if not kandidati:
        v["upozorneni"].append(
            "Žádná vhodná fotka nenalezena. Buď nic neprošlo filtrem licence (zkus jiný "
            "filtr nebo vlastní fotku), nebo je DuckDuckGo dočasně nedostupný / omezuje "
            "počet dotazů."
        )
        log("⚠️  Žádná vhodná fotka nenalezena.")
        return None

    log(f"🧐 Gemini Vision hodnotí {min(len(kandidati), 16)} z {len(kandidati)} kandidátů…")
    text_bez_tagu = generator.sloz_text(post.model_copy(update={"hashtagy": []}))
    poradi, vyber = images.ohodnot(kandidati, z.tema, text_bez_tagu, post.obrazek_brief, cfg.model)
    v["kandidati"] = poradi
    for k, s in poradi[:3]:
        log(f"   {s:>3} b  {k.domena}  {k.titulek[:60]}")

    log("⬇️  Stahuji fotku v plném rozlišení…")
    vysledek = images.stahni_nejlepsi(poradi, vyber, min_skore=z.min_skore)
    if vysledek is None:
        v["upozorneni"].append(
            f"Žádná fotka nedosáhla {z.min_skore} bodů nebo nešla stáhnout."
        )
        log("⚠️  Žádná fotka neprošla.")
        return None
    foto, img, fx, fy, skore = vysledek
    v["foto"], v["skore"] = foto, skore
    v["zduvodneni"] = (
        vyber.zduvodneni if foto is poradi[0][0] else "náhradník (vítěz nešel stáhnout)"
    )
    log(f"   → vybráno: {foto.domena} ({skore} b) – {v['zduvodneni']}")
    return images.orizni_4x5(img, fx, fy)


def vytvor_post(z: Zadani, cfg: Config, log: Log = print) -> Vysledek:
    if z.licence:
        cfg = dataclasses.replace(cfg, licence=z.licence)
    profil = style.nacti_profil(cfg.styl_soubor)
    v: dict = {"upozorneni": [], "kandidati": [], "foto": None, "skore": None, "zduvodneni": None}
    if profil.je_vychozi:
        v["upozorneni"].append(
            "Používám výchozí odhad stylu – pro věrný styl nejdřív nahraj své příspěvky."
        )

    log("✍️  Gemini píše text…")
    post = generator.generuj(z.tema, profil, cfg.model, fakta=z.fakta, poznamka=z.pokyn)

    obrazek = None
    if z.vlastni_obrazek is not None:
        log("🖼️  Používám vlastní obrázek")
        obrazek = images.orizni_4x5(z.vlastni_obrazek)
    elif not z.bez_obrazku:
        obrazek = _vyber_fotku(z, cfg, post, log, v)

    if obrazek is not None and z.titulek:
        obrazek = images.pridej_titulek(obrazek, post.titulek_do_obrazku, cfg.font_path)

    foto = v["foto"]
    if foto and cfg.licence == "vse":
        v["upozorneni"].append(
            f"Fotka je z webu bez licenčního filtru – ověř, že ji smíš použít: {foto.stranka_url}"
        )
    kredit = foto.kredit if (foto and cfg.pridat_zdroj_fota) else None
    text = generator.sloz_text(post, kredit)
    slozka = vystup.uloz(
        cfg.vystup_dir, z.tema, post, text, obrazek, foto, v["skore"], v["zduvodneni"], cfg.licence
    )
    log(f"📁 Uloženo do: {slozka}")
    return Vysledek(
        slozka=slozka,
        text=text,
        post=post,
        ma_obrazek=obrazek is not None,
        foto=foto,
        skore=v["skore"],
        zduvodneni=v["zduvodneni"],
        kandidati=v["kandidati"],
        upozorneni=v["upozorneni"],
    )
