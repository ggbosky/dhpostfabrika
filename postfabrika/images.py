"""Vyhledání, výběr (Claude vision) a příprava fotky pro Instagram."""

from __future__ import annotations

import base64
import io
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from pathlib import Path

import requests
from PIL import Image, ImageDraw, ImageFont, ImageOps
from pydantic import BaseModel, Field

from . import llm
from .config import Config

IG_SIRKA, IG_VYSKA = 1080, 1350  # formát 4:5 – na Instagramu zabírá nejvíc plochy
UA = {"User-Agent": "dh-postfabrika/1.0"}
TIMEOUT = 20


@dataclass
class Kandidat:
    zdroj: str  # "pexels" | "unsplash"
    id: str
    sirka: int
    vyska: int
    popis: str
    nahled_url: str
    plna_url: str
    autor: str
    autor_url: str
    stranka_url: str
    download_location: str | None = None  # Unsplash vyžaduje "ping" při stažení

    @property
    def kredit(self) -> str:
        banka = "Pexels" if self.zdroj == "pexels" else "Unsplash"
        return f"📸 {self.autor} / {banka}"


# ------------------------------------------------------------- vyhledávání ---


def _pexels(dotaz: str, key: str, pocet: int) -> list[Kandidat]:
    r = requests.get(
        "https://api.pexels.com/v1/search",
        params={"query": dotaz, "per_page": pocet, "size": "large"},
        headers={"Authorization": key, **UA},
        timeout=TIMEOUT,
    )
    r.raise_for_status()
    out = []
    for p in r.json().get("photos", []):
        src = p["src"]
        out.append(
            Kandidat(
                zdroj="pexels",
                id=str(p["id"]),
                sirka=p["width"],
                vyska=p["height"],
                popis=p.get("alt") or "",
                nahled_url=src["medium"],
                plna_url=f"{src['original']}?auto=compress&cs=tinysrgb&w=2400",
                autor=p.get("photographer", "neznámý"),
                autor_url=p.get("photographer_url", ""),
                stranka_url=p.get("url", ""),
            )
        )
    return out


def _unsplash(dotaz: str, key: str, pocet: int) -> list[Kandidat]:
    r = requests.get(
        "https://api.unsplash.com/search/photos",
        params={"query": dotaz, "per_page": pocet, "content_filter": "high"},
        headers={"Authorization": f"Client-ID {key}", "Accept-Version": "v1", **UA},
        timeout=TIMEOUT,
    )
    r.raise_for_status()
    utm = "?utm_source=dh_postfabrika&utm_medium=referral"
    out = []
    for p in r.json().get("results", []):
        out.append(
            Kandidat(
                zdroj="unsplash",
                id=p["id"],
                sirka=p["width"],
                vyska=p["height"],
                popis=p.get("alt_description") or p.get("description") or "",
                nahled_url=p["urls"]["small"],
                plna_url=f"{p['urls']['raw']}&w=2400&q=90&fm=jpg",
                autor=p["user"]["name"],
                autor_url=p["user"]["links"]["html"] + utm,
                stranka_url=p["links"]["html"] + utm,
                download_location=p["links"].get("download_location"),
            )
        )
    return out


def vyhledej(dotazy: list[str], cfg: Config, na_dotaz: int = 8) -> list[Kandidat]:
    ulohy = []
    for d in dotazy:
        if cfg.pexels_key:
            ulohy.append((_pexels, d, cfg.pexels_key))
        if cfg.unsplash_key:
            ulohy.append((_unsplash, d, cfg.unsplash_key))

    vysledky: list[Kandidat] = []
    with ThreadPoolExecutor(max_workers=6) as ex:
        futures = [ex.submit(fn, d, k, na_dotaz) for fn, d, k in ulohy]
        for f in futures:
            try:
                vysledky += f.result()
            except requests.RequestException as e:
                print(f"  ! vyhledávání selhalo: {e}")

    # Bez duplicit + jen fotky s dostatečným rozlišením pro 1080×1350.
    videno, out = set(), []
    for k in vysledky:
        klic = (k.zdroj, k.id)
        if klic in videno or k.sirka < IG_SIRKA or k.vyska < IG_SIRKA:
            continue
        videno.add(klic)
        out.append(k)
    return out


# ------------------------------------------------------------------- výběr ---


class _Hodnoceni(BaseModel):
    index: int
    skore: int = Field(description="0–100, celková vhodnost pro tento post.")
    duvod: str


class _Vyber(BaseModel):
    hodnoceni: list[_Hodnoceni] = Field(description="Hodnocení každé fotky.")
    nejlepsi_index: int
    fokus_x: float = Field(description="Vodorovná pozice hlavního motivu vítězné fotky, 0.0–1.0.")
    fokus_y: float = Field(description="Svislá pozice hlavního motivu vítězné fotky, 0.0–1.0.")
    zduvodneni: str = Field(description="Proč vyhrála právě tahle fotka (1–2 věty česky).")


_SYSTEM_VYBER = """Jsi fotoeditor hokejového Instagram účtu. Vybíráš jednu fotku k \
příspěvku. Hodnoť:
1. Tematickou shodu s příspěvkem a zadáním (nejdůležitější). Fotka nesmí čtenáře \
mýlit – např. pozemní hokej, florbal nebo NFL nejsou lední hokej; cizí znaky klubů, \
které v příspěvku nejsou, jsou mínus.
2. Profesionální vzhled: ostrost, světlo, kompozice, dynamika, emoce.
3. Použitelnost pro Instagram ve formátu 4:5 (motiv jde oříznout na výšku), \
místo pro případný titulek, žádné vodoznaky ani text.
Fotky jsou očíslované indexem. Vrať hodnocení všech a vítěze. fokus_x/fokus_y \
udávají střed hlavního motivu vítězné fotky (0,0 = levý horní roh)."""


def _stahni(url: str) -> bytes:
    r = requests.get(url, headers=UA, timeout=TIMEOUT)
    r.raise_for_status()
    return r.content


def _jako_jpeg_b64(data: bytes, max_strana: int = 512) -> str:
    img = ImageOps.exif_transpose(Image.open(io.BytesIO(data))).convert("RGB")
    img.thumbnail((max_strana, max_strana))
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=80)
    return base64.standard_b64encode(buf.getvalue()).decode("ascii")


def vyber_nejlepsi(
    kandidati: list[Kandidat],
    tema: str,
    text_postu: str,
    brief: str,
    model: str,
    max_kandidatu: int = 16,
) -> tuple[Kandidat, _Vyber]:
    kandidati = kandidati[:max_kandidatu]

    # Náhledy stahujeme lokálně a posíláme jako base64 – spolehlivější než URL.
    with ThreadPoolExecutor(max_workers=8) as ex:
        nahledy = list(ex.map(lambda k: _bezpecne(lambda: _stahni(k.nahled_url)), kandidati))
    platne = [(k, n) for k, n in zip(kandidati, nahledy) if n]
    if not platne:
        raise RuntimeError("Nepodařilo se stáhnout žádný náhled fotky.")

    obsah: list[dict] = []
    for i, (k, data) in enumerate(platne):
        obsah.append({"type": "text", "text": f"Fotka index={i} ({k.sirka}×{k.vyska}, popis: {k.popis or '—'})"})
        obsah.append(
            {
                "type": "image",
                "source": {"type": "base64", "media_type": "image/jpeg", "data": _jako_jpeg_b64(data)},
            }
        )
    obsah.append(
        {
            "type": "text",
            "text": (
                f"ZADANÉ TÉMA: {tema}\n\nCO MÁ FOTKA IDEÁLNĚ UKAZOVAT: {brief}\n\n"
                f"TEXT PŘÍSPĚVKU:\n{text_postu}\n\nVyber nejlepší fotku."
            ),
        }
    )
    vyber = llm.strukturovane(
        model=model,
        system=_SYSTEM_VYBER,
        content=obsah,
        schema=_Vyber,
        effort="medium",
    )
    idx = vyber.nejlepsi_index if 0 <= vyber.nejlepsi_index < len(platne) else 0
    return platne[idx][0], vyber


def _bezpecne(fn):
    try:
        return fn()
    except Exception as e:  # noqa: BLE001 – jeden špatný náhled nesmí shodit výběr
        print(f"  ! náhled se nepodařilo stáhnout: {e}")
        return None


# ----------------------------------------------------- stažení a ořez 4:5 ---


def stahni_plne(k: Kandidat, cfg: Config) -> Image.Image:
    if k.zdroj == "unsplash" and k.download_location and cfg.unsplash_key:
        # Podmínka Unsplash API: při stažení fotky zavolat download_location.
        _bezpecne(
            lambda: requests.get(
                k.download_location,
                headers={"Authorization": f"Client-ID {cfg.unsplash_key}", **UA},
                timeout=TIMEOUT,
            )
        )
    data = _stahni(k.plna_url)
    return ImageOps.exif_transpose(Image.open(io.BytesIO(data))).convert("RGB")


def nacti_lokalni(cesta: str | Path) -> Image.Image:
    return ImageOps.exif_transpose(Image.open(cesta)).convert("RGB")


def orizni_4x5(img: Image.Image, fokus_x: float = 0.5, fokus_y: float = 0.45) -> Image.Image:
    """Zvětší/zmenší fotku tak, aby pokryla 1080×1350, a ořízne ji kolem fokusu."""
    fokus_x = min(max(fokus_x, 0.0), 1.0)
    fokus_y = min(max(fokus_y, 0.0), 1.0)
    meritko = max(IG_SIRKA / img.width, IG_VYSKA / img.height)
    nova = img.resize(
        (max(IG_SIRKA, round(img.width * meritko)), max(IG_VYSKA, round(img.height * meritko))),
        Image.LANCZOS,
    )
    left = round(fokus_x * nova.width - IG_SIRKA / 2)
    top = round(fokus_y * nova.height - IG_VYSKA / 2)
    left = min(max(left, 0), nova.width - IG_SIRKA)
    top = min(max(top, 0), nova.height - IG_VYSKA)
    return nova.crop((left, top, left + IG_SIRKA, top + IG_VYSKA))


# ---------------------------------------------------- titulek do obrázku ---

_FONTY = [
    "C:/Windows/Fonts/arialbd.ttf",
    "C:/Windows/Fonts/segoeuib.ttf",
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/Library/Fonts/Arial Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    "/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf",
]


def _font(velikost: int, font_path: str | None) -> ImageFont.ImageFont:
    for p in [font_path, *_FONTY]:
        if p and Path(p).exists():
            return ImageFont.truetype(p, velikost)
    return ImageFont.load_default(size=velikost)


def _zalom(text: str, font, max_sirka: int, draw: ImageDraw.ImageDraw) -> list[str]:
    radky, aktualni = [], ""
    for slovo in text.split():
        zkus = f"{aktualni} {slovo}".strip()
        if draw.textlength(zkus, font=font) <= max_sirka:
            aktualni = zkus
        else:
            if aktualni:
                radky.append(aktualni)
            aktualni = slovo
    if aktualni:
        radky.append(aktualni)
    return radky


def pridej_titulek(img: Image.Image, titulek: str, font_path: str | None) -> Image.Image:
    """Ztmavení spodní části + bílý tučný titulek (volitelná funkce)."""
    img = img.copy().convert("RGBA")
    w, h = img.size
    gradient = Image.new("L", (1, h))
    for y in range(h):
        t = max(0.0, (y - h * 0.45) / (h * 0.55))
        gradient.putpixel((0, y), int(225 * t**1.4))
    cerna = Image.new("RGBA", (w, h), (0, 0, 0, 255))
    cerna.putalpha(gradient.resize((w, h)))
    img = Image.alpha_composite(img, cerna)

    draw = ImageDraw.Draw(img)
    okraj = 72
    velikost = 78
    while velikost >= 44:
        font = _font(velikost, font_path)
        radky = _zalom(titulek.upper(), font, w - 2 * okraj, draw)
        if len(radky) <= 4:
            break
        velikost -= 6
    vyska_radku = int(velikost * 1.15)
    y = h - okraj - vyska_radku * len(radky)
    for radek in radky:
        draw.text((okraj, y), radek, font=font, fill=(255, 255, 255, 255))
        y += vyska_radku
    return img.convert("RGB")
