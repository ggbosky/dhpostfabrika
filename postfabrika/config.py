"""Načtení konfigurace z prostředí / souboru .env."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent

load_dotenv(ROOT / ".env")

# Hodnoty filtru licence v DuckDuckGo obrázcích.
LICENCE = {
    "vse": None,  # bez filtru – nejvíc fotek, ale většinou chráněné autorským právem
    "komercni": "ShareCommercially",  # volně šiřitelné i komerčně (Creative Commons apod.)
    "upravy": "ModifyCommercially",  # navíc povolené úpravy (ořez, titulek)
    "verejne": "Public",  # public domain
}


def _bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    return raw.strip().lower() in {"1", "true", "ano", "yes", "on"}


@dataclass(frozen=True)
class Config:
    model: str
    licence: str
    region: str
    pridat_zdroj_fota: bool
    font_path: str | None
    styl_soubor: Path
    vystup_dir: Path


def nacti_config() -> Config:
    licence = os.getenv("FOTO_LICENCE", "upravy").strip().lower()
    if licence not in LICENCE:
        raise ValueError(f"FOTO_LICENCE musí být jedno z: {', '.join(LICENCE)}")
    return Config(
        model=os.getenv("GEMINI_MODEL", "gemini-flash-latest"),
        licence=licence,
        region=os.getenv("HLEDANI_REGION", "wt-wt"),
        pridat_zdroj_fota=_bool("PRIDAT_ZDROJ_FOTA", True),
        font_path=os.getenv("FONT_PATH") or None,
        styl_soubor=Path(os.getenv("STYL_SOUBOR", ROOT / "styl" / "profil.json")),
        vystup_dir=Path(os.getenv("VYSTUP_DIR", ROOT / "vystup")),
    )
