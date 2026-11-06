"""Tenká vrstva nad Google Gemini API (free tier) se strukturovaným JSON výstupem."""

from __future__ import annotations

import copy
import re
import time
from typing import Any, TypeVar

from google import genai
from google.genai import errors, types
from pydantic import BaseModel, ValidationError

T = TypeVar("T", bound=BaseModel)

# Pořadí modelů pro GEMINI_MODEL=auto. Když je model přetížený nebo neexistuje,
# přejde se rychle na další (free tier bývá u nejnovějších modelů vytížený).
ZALOZNI_MODELY = [
    "gemini-3.8-flash",
    "gemini-3.7-flash",
    "gemini-3.6-flash",
    "gemini-3.5-flash",
    "gemini-2.5-flash",
    "gemini-3.1-flash-lite",
]
HTTP_TIMEOUT_MS = 120_000

_fungujici_model: str | None = None  # model, který naposledy odpověděl
_client: genai.Client | None = None


class LLMChyba(RuntimeError):
    pass


def _klient() -> genai.Client:
    global _client
    if _client is None:
        try:
            # Klíč se bere z GEMINI_API_KEY (nebo GOOGLE_API_KEY).
            _client = genai.Client(http_options=types.HttpOptions(timeout=HTTP_TIMEOUT_MS))
        except ValueError as e:
            raise LLMChyba(
                "Chybí GEMINI_API_KEY – vytvoř si ho zdarma na https://aistudio.google.com/apikey "
                "a vlož do souboru .env."
            ) from e
    return _client


def obrazek(data: bytes, mime: str = "image/jpeg") -> types.Part:
    return types.Part.from_bytes(data=data, mime_type=mime)


def _inline_refs(schema: dict[str, Any]) -> dict[str, Any]:
    """Pydantic dává vnořené modely do $defs/$ref – Gemini je lepší dát inline."""
    defs = schema.get("$defs", {})

    def walk(node: Any) -> Any:
        if isinstance(node, dict):
            if "$ref" in node:
                return walk(copy.deepcopy(defs[node["$ref"].split("/")[-1]]))
            return {k: walk(v) for k, v in node.items() if k not in {"$defs", "default"}}
        if isinstance(node, list):
            return [walk(x) for x in node]
        return node

    return walk(schema)


def _cekani_z_chyby(e: errors.APIError, pokus: int) -> float:
    """Kolik sekund Google žádá počkat ("retry in 9h29m2.7s", "retry in 34.2s")."""
    m = re.search(r"retry in ((?:\d+h)?(?:\d+m(?!s))?(?:[\d.]+s)?)", str(e), re.IGNORECASE)
    if m and m.group(1):
        casti = re.findall(r"([\d.]+)([hms])", m.group(1))
        return sum(float(x) * {"h": 3600, "m": 60, "s": 1}[j] for x, j in casti) + 1
    return min(60.0, 8.0 * 2**pokus)


def _poradi_modelu(model: str) -> list[str]:
    prvni = [m for m in (_fungujici_model, None if model == "auto" else model) if m]
    return list(dict.fromkeys(prvni + ZALOZNI_MODELY))


def strukturovane(
    *,
    model: str,
    system: str,
    content: str | list[Any],
    schema: type[T],
) -> T:
    """Zavolá Gemini a vrátí validovanou instanci `schema`.

    - 404 (model neexistuje) → hned další model,
    - 503/504 (přetížení) → jeden krátký pokus znovu, pak další model,
    - 429 (limit free tieru) → počká, kolik Google řekne, a zkusí znovu.
    """
    global _fungujici_model
    config = types.GenerateContentConfig(
        system_instruction=system,
        response_mime_type="application/json",
        response_json_schema=_inline_refs(schema.model_json_schema()),
    )
    posledni_chyba: Exception | None = None
    limit_vycerpan = False

    for m in _poradi_modelu(model):
        pokusy_pretizeni = pokusy_limitu = pokusy_json = 0
        while True:
            try:
                resp = _klient().models.generate_content(model=m, contents=content, config=config)
            except errors.ClientError as e:
                posledni_chyba = e
                if e.code == 404:
                    break
                if e.code == 429:
                    pokusy_limitu += 1
                    cekej = _cekani_z_chyby(e, pokusy_limitu)
                    if "PerDay" in str(e) or cekej > 90 or pokusy_limitu > 2:
                        # Denní limit modelu (free tier ~20 požadavků/den) → jiný model.
                        print(f"  … {m}: dnešní limit free tieru vyčerpán, zkouším jiný model")
                        limit_vycerpan = True
                        break
                    print(f"  … {m}: limit free tieru, čekám {cekej:.0f} s")
                    time.sleep(cekej)
                    continue
                if e.code in (401, 403) or "API key" in str(e):
                    raise LLMChyba("Neplatný GEMINI_API_KEY (zkontroluj soubor .env).") from e
                raise LLMChyba(f"Gemini odmítlo požadavek ({e.code}): {e.message}") from e
            except (errors.ServerError, httpx_chyby()) as e:
                posledni_chyba = e
                pokusy_pretizeni += 1
                if pokusy_pretizeni > 1:
                    print(f"  … {m} je přetížený, zkouším jiný model")
                    break
                time.sleep(3)
                continue

            text = resp.text
            if not text:
                duvod = resp.candidates[0].finish_reason if resp.candidates else "neznámý"
                raise LLMChyba(f"Gemini nevrátilo žádný text (důvod: {duvod}).")
            try:
                vysledek = schema.model_validate_json(text)
            except ValidationError as e:
                posledni_chyba = e
                pokusy_json += 1
                if pokusy_json > 1:
                    break
                continue
            _fungujici_model = m
            return vysledek

    if limit_vycerpan:
        raise LLMChyba(
            "Vyčerpaný limit free tieru Gemini u všech modelů (každý model má jen pár "
            "desítek požadavků denně). Limity se obnovují o půlnoci pacifického času "
            "(9:00 českého času)."
        ) from posledni_chyba
    raise LLMChyba(f"Žádný Gemini model teď neodpovídá, zkus to za chvíli. ({posledni_chyba})")


def httpx_chyby() -> type[Exception]:
    """Chyba sítě/timeoutu z HTTP knihovny, kterou google-genai používá."""
    for jmeno in ("httpx2", "httpx"):  # google-genai používá httpx2 (novější) nebo httpx
        try:
            return __import__(jmeno).TransportError
        except ImportError:
            continue
    return OSError  # pragma: no cover


def dostupne_modely() -> list[str]:
    out = []
    for m in _klient().models.list():
        akce = getattr(m, "supported_actions", None) or []
        if "generateContent" in akce:
            out.append(m.name.removeprefix("models/"))
    return sorted(out)
