"""Vyhledání fotek (DuckDuckGo), výběr přes Gemini Vision a příprava pro Instagram."""

from __future__ import annotations

import io
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlparse

import requests
from ddgs import DDGS
from ddgs.exceptions import DDGSException, RatelimitException
from PIL import Image, ImageDraw, ImageFont, ImageOps
from pydantic import BaseModel, Field

from . import llm
from .config import LICENCE, Config

IG_SIRKA, IG_VYSKA = 1080, 1350  # formát 4:5 – na Instagramu zabírá nejvíc plochy
MIN_KRATSI_STRANA = 900  # menší fotky by se musely moc zvětšovat
MAX_VELIKOST = 20 * 1024 * 1024
TIMEOUT = 20
UA = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/130.0 Safari/537.36 dh-postfabrika/2.0"
}

# Fotobanky/weby, jejichž obrázky jsou s vodoznakem nebo nejdou použít.
BLOKOVANE_DOMENY = (
    "gettyimages.", "istockphoto.", "shutterstock.", "alamy.", "dreamstime.",
    "depositphotos.", "123rf.", "stock.adobe.", "agefotostock.", "vectorstock.",
    "pinterest.", "pinimg.", "freepik.", "profimedia.", "ctkfoto.",
)


@dataclass
class Kandidat:
    titulek: str
    obrazek_url: str
    nahled_url: str
    stranka_url: str
    sirka: int
    vyska: int

    @property
    def domena(self) -> str:
        return urlparse(self.stranka_url or self.obrazek_url).netloc.removeprefix("www.")

    @property
    def kredit(self) -> str:
        return f"📸 Foto: {self.domena}"


# ------------------------------------------------------------- vyhledávání ---


def _hledej(dotaz: str, cfg: Config, pocet: int) -> list[dict]:
    for pokus in range(3):
        try:
            return DDGS().images(
                dotaz,
                region=cfg.region,
                safesearch="moderate",
                size="Large",
                license_image=LICENCE[cfg.licence],
                max_results=pocet,
                backend="duckduckgo",
            )
        except RatelimitException:
            time.sleep(5 * (pokus + 1))
        except DDGSException as e:
            if "no results" not in str(e).lower():  # ddgs hlásí prázdný výsledek výjimkou
                print(f"  ! vyhledávání '{dotaz}' selhalo: {e}")
            return []
    print(f"  ! DuckDuckGo omezil počet dotazů ('{dotaz}'), zkus to za chvíli.")
    return []


def vyhledej(dotazy: list[str], cfg: Config, na_dotaz: int = 25) -> list[Kandidat]:
    out: list[Kandidat] = []
    videno: set[str] = set()
    for dotaz in dotazy:  # postupně, ať DuckDuckGo neblokuje
        for r in _hledej(dotaz, cfg, na_dotaz):
            url = r.get("image") or ""
            try:
                w, h = int(r.get("width") or 0), int(r.get("height") or 0)
            except (TypeError, ValueError):
                continue
            k = Kandidat(
                titulek=r.get("title") or "",
                obrazek_url=url,
                nahled_url=r.get("thumbnail") or url,
                stranka_url=r.get("url") or "",
                sirka=w,
                vyska=h,
            )
            if (
                not url.startswith("http")
                or url in videno
                or min(w, h) < MIN_KRATSI_STRANA
                or any(b in url or b in k.stranka_url for b in BLOKOVANE_DOMENY)
            ):
                continue
            videno.add(url)
            out.append(k)
    return out


def _pestry_vyber(kandidati: list[Kandidat], limit: int) -> list[Kandidat]:
    """Střídá weby, ať do užšího výběru nejde 16 fotek z jednoho zdroje."""
    po_domenach: dict[str, list[Kandidat]] = {}
    for k in kandidati:
        po_domenach.setdefault(k.domena, []).append(k)
    out: list[Kandidat] = []
    while len(out) < limit and any(po_domenach.values()):
        for fronta in po_domenach.values():
            if fronta and len(out) < limit:
                out.append(fronta.pop(0))
    return out


# ------------------------------------------------------------------- výběr ---


class Hodnoceni(BaseModel):
    index: int
    skore: int = Field(description="0–100, celková vhodnost pro tento post.")
    duvod: str = Field(description="Krátké zdůvodnění česky.")


class Vyber(BaseModel):
    hodnoceni: list[Hodnoceni] = Field(description="Hodnocení každé fotky.")
    nejlepsi_index: int
    fokus_x: float = Field(description="Vodorovná pozice hlavního motivu vítězné fotky, 0.0–1.0.")
    fokus_y: float = Field(description="Svislá pozice hlavního motivu vítězné fotky, 0.0–1.0.")
    zduvodneni: str = Field(description="Proč vyhrála právě tahle fotka (1–2 věty česky).")


_SYSTEM_VYBER = """Jsi fotoeditor hokejového Instagram účtu. Vybíráš jednu fotku k \
příspěvku. Hodnoť každou fotku 0–100 podle:
1. Tematické shody s příspěvkem (nejdůležitější). Fotka nesmí čtenáře mýlit – pozemní \
hokej, florbal, NFL nebo jiný klub/hráč, než o kterém je řeč, je velké mínus.
2. Profesionálního vzhledu: ostrost, světlo, kompozice, dynamika, emoce.
3. Použitelnosti pro Instagram ve formátu 4:5 (motiv jde oříznout na výšku).
4. Čistoty: vodoznak, logo agentury, vložený text, koláž nebo screenshot = skóre max. 20.
Fotky jsou označené indexem. Vrať hodnocení všech a vítěze. fokus_x/fokus_y udávají \
střed hlavního motivu vítězné fotky (0,0 = levý horní roh)."""


def _stahni(url: str) -> bytes:
    with requests.get(url, headers=UA, timeout=TIMEOUT, stream=True) as r:
        r.raise_for_status()
        typ = r.headers.get("Content-Type", "image/")
        if not typ.startswith("image/"):
            raise ValueError(f"není obrázek ({typ})")
        data = r.raw.read(MAX_VELIKOST + 1, decode_content=True)
    if len(data) > MAX_VELIKOST:
        raise ValueError("obrázek je příliš velký")
    return data


def _otevri(data: bytes) -> Image.Image:
    return ImageOps.exif_transpose(Image.open(io.BytesIO(data))).convert("RGB")


def _jako_jpeg(data: bytes, max_strana: int = 512) -> bytes:
    img = _otevri(data)
    img.thumbnail((max_strana, max_strana))
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=80)
    return buf.getvalue()


def _bezpecne(fn):
    try:
        return fn()
    except Exception:  # noqa: BLE001 – jeden špatný obrázek nesmí shodit celý výběr
        return None


def ohodnot(
    kandidati: list[Kandidat],
    tema: str,
    text_postu: str,
    brief: str,
    model: str,
    max_kandidatu: int = 16,
) -> tuple[list[tuple[Kandidat, int]], Vyber]:
    """Vrátí kandidáty seřazené podle skóre od Gemini Vision a celé hodnocení."""
    kandidati = _pestry_vyber(kandidati, max_kandidatu)

    with ThreadPoolExecutor(max_workers=8) as ex:
        nahledy = list(
            ex.map(lambda k: _bezpecne(lambda: _jako_jpeg(_stahni(k.nahled_url))), kandidati)
        )
    platne = [(k, n) for k, n in zip(kandidati, nahledy) if n]
    if not platne:
        raise RuntimeError("Nepodařilo se stáhnout žádný náhled fotky.")

    obsah: list = []
    for i, (k, data) in enumerate(platne):
        obsah.append(
            f"Fotka index={i} ({k.sirka}×{k.vyska}, web: {k.domena}, popis: {k.titulek or '—'})"
        )
        obsah.append(llm.obrazek(data))
    obsah.append(
        f"ZADANÉ TÉMA: {tema}\n\nCO MÁ FOTKA IDEÁLNĚ UKAZOVAT: {brief}\n\n"
        f"TEXT PŘÍSPĚVKU:\n{text_postu}\n\nOhodnoť všechny fotky a vyber nejlepší."
    )
    vyber = llm.strukturovane(model=model, system=_SYSTEM_VYBER, content=obsah, schema=Vyber)

    skore = {h.index: h.skore for h in vyber.hodnoceni}
    vitez = vyber.nejlepsi_index if 0 <= vyber.nejlepsi_index < len(platne) else None
    poradi = sorted(
        range(len(platne)), key=lambda i: (i == vitez, skore.get(i, 0)), reverse=True
    )
    return [(platne[i][0], skore.get(i, 0)) for i in poradi], vyber


def stahni_nejlepsi(
    poradi: list[tuple[Kandidat, int]], vyber: Vyber, min_skore: int = 40
) -> tuple[Kandidat, Image.Image, float, float, int] | None:
    """Stáhne první fotku z pořadí, která jde opravdu stáhnout v dobrém rozlišení."""
    for i, (k, s) in enumerate(poradi):
        if s < min_skore:
            break
        img = _bezpecne(lambda: _otevri(_stahni(k.obrazek_url)))
        if img is None or min(img.size) < MIN_KRATSI_STRANA:
            print(f"   ✗ {k.domena}: nejde stáhnout v plném rozlišení, zkouším další")
            continue
        # Střed motivu zná Gemini jen u vítěze, náhradníky ořezáváme na střed.
        fx, fy = (vyber.fokus_x, vyber.fokus_y) if i == 0 else (0.5, 0.45)
        return k, img, fx, fy, s
    return None


# ----------------------------------------------------- stažení a ořez 4:5 ---


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
    """Ztmavení spodní části + bílý tučný titulek."""
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
