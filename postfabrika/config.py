"""Načtení konfigurace z prostředí / souboru .env."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent

load_dotenv(ROOT / ".env")


def _bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    return raw.strip().lower() in {"1", "true", "ano", "yes", "on"}


@dataclass(frozen=True)
class Config:
    model: str
    pexels_key: str | None
    unsplash_key: str | None
    pridat_kredit_fota: bool
    font_path: str | None
    styl_soubor: Path
    vystup_dir: Path

    @property
    def ma_fotobanku(self) -> bool:
        return bool(self.pexels_key or self.unsplash_key)


def nacti_config() -> Config:
    return Config(
        model=os.getenv("CLAUDE_MODEL", "claude-opus-5-5"),
        pexels_key=os.getenv("PEXELS_API_KEY") or None,
        unsplash_key=os.getenv("UNSPLASH_ACCESS_KEY") or None,
        pridat_kredit_fota=_bool("PRIDAT_KREDIT_FOTA", True),
        font_path=os.getenv("FONT_PATH") or None,
        styl_soubor=Path(os.getenv("STYL_SOUBOR", ROOT / "styl" / "profil.json")),
        vystup_dir=Path(os.getenv("VYSTUP_DIR", ROOT / "vystup")),
    )
