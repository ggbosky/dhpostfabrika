"""Uložení hotového příspěvku: obrázek, text, metadata a HTML náhled."""

from __future__ import annotations

import datetime as dt
import html
import json
import re
import unicodedata
from pathlib import Path

from PIL import Image

from .generator import Prispevek
from .images import Kandidat


def _slug(text: str, max_len: int = 40) -> str:
    t = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    t = re.sub(r"[^a-zA-Z0-9]+", "-", t).strip("-").lower()
    return t[:max_len].strip("-") or "post"


def uloz(
    koren: Path,
    tema: str,
    prispevek: Prispevek,
    text: str,
    obrazek: Image.Image | None,
    foto: Kandidat | None,
    skore_fota: int | None,
    zduvodneni_fota: str | None,
    licence: str,
) -> Path:
    slozka = koren / f"{dt.datetime.now():%Y-%m-%d_%H%M%S}_{_slug(tema)}"
    slozka.mkdir(parents=True, exist_ok=True)

    (slozka / "post.txt").write_text(text + "\n", encoding="utf-8")

    if obrazek is not None:
        obrazek.save(slozka / "obrazek.jpg", "JPEG", quality=92, optimize=True, progressive=True)

    meta = {
        "tema": tema,
        "vytvoreno": dt.datetime.now().isoformat(timespec="seconds"),
        "prispevek": prispevek.model_dump(),
        "foto": None
        if foto is None
        else {
            "web": foto.domena,
            "stranka": foto.stranka_url,
            "obrazek_url": foto.obrazek_url,
            "popis": foto.titulek,
            "puvodni_rozliseni": f"{foto.sirka}x{foto.vyska}",
            "skore": skore_fota,
            "proc_vybrana": zduvodneni_fota,
            "filtr_licence": licence,
        },
    }
    (slozka / "post.json").write_text(
        json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    (slozka / "nahled.html").write_text(
        _nahled_html(text, prispevek, foto, obrazek is not None, licence), encoding="utf-8"
    )
    return slozka


def _nahled_html(
    text: str, p: Prispevek, foto: Kandidat | None, ma_obrazek: bool, licence: str
) -> str:
    e = html.escape
    body = list(p.k_overeni)
    if foto and licence == "vse":
        body.append("Fotka je z webu bez licenčního filtru – ověř, že ji smíš použít.")
    overit = "".join(f"<li>{e(x)}</li>" for x in body)
    kredit = (
        f'<p class="meta">Foto: <a href="{e(foto.stranka_url)}">{e(foto.domena)}</a> '
        f"(filtr licence: {e(licence)})</p>"
        if foto
        else ""
    )
    img = '<img src="obrazek.jpg" alt="' + e(p.alt_text) + '">' if ma_obrazek else ""
    return f"""<!doctype html>
<html lang="cs"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Náhled postu</title>
<style>
  :root {{ --bg:#fafafa; --card:#fff; --text:#111; --muted:#737373; --line:#dbdbdb; --warn:#fff4e5; }}
  @media (prefers-color-scheme: dark) {{
    :root {{ --bg:#000; --card:#121212; --text:#f5f5f5; --muted:#a8a8a8; --line:#262626; --warn:#3a2a10; }}
  }}
  body {{ margin:0; background:var(--bg); color:var(--text);
         font:15px/1.45 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif; }}
  .card {{ max-width:470px; margin:24px auto; background:var(--card);
          border:1px solid var(--line); border-radius:8px; overflow:hidden; }}
  .head {{ padding:12px 14px; font-weight:600; }}
  img {{ display:block; width:100%; aspect-ratio:4/5; object-fit:cover; }}
  .cap {{ padding:12px 14px; white-space:pre-wrap; }}
  .meta {{ padding:0 14px 12px; color:var(--muted); font-size:13px; margin:0; }}
  .warn {{ background:var(--warn); padding:10px 14px 10px 30px; margin:0; font-size:13px; }}
  button {{ margin:0 14px 14px; padding:8px 14px; border-radius:8px; border:0;
           background:#0095f6; color:#fff; font-weight:600; cursor:pointer; }}
</style></head><body>
<div class="card">
  <div class="head">denik_hokeje</div>
  {img}
  <div class="cap" id="cap">{e(text)}</div>
  <button onclick="navigator.clipboard.writeText(document.getElementById('cap').innerText)">Kopírovat text</button>
  {kredit}
  {'<ul class="warn"><b>Před publikací ověř:</b>' + overit + '</ul>' if overit else ''}
</div>
</body></html>
"""
