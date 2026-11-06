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

# Když zvolený model neexistuje (Google modely občas přejmenuje/vypne), zkusí se další.
ZALOZNI_MODELY = ["gemini-flash-latest", "gemini-3.8-flash", "gemini-2.5-flash"]

_client: genai.Client | None = None


class LLMChyba(RuntimeError):
    pass


def _klient() -> genai.Client:
    global _client
    if _client is None:
        try:
            # Klíč se bere z GEMINI_API_KEY (nebo GOOGLE_API_KEY).
            _client = genai.Client()
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
    m = re.search(r"retry in ([\d.]+)s", str(e), re.IGNORECASE) or re.search(
        r"retryDelay['\"]?:\s*['\"]?(\d+)s", str(e)
    )
    return float(m.group(1)) + 1 if m else min(60.0, 8.0 * 2**pokus)


def strukturovane(
    *,
    model: str,
    system: str,
    content: str | list[Any],
    schema: type[T],
    max_pokusu: int = 4,
) -> T:
    """Zavolá Gemini a vrátí validovanou instanci `schema`.

    Při překročení limitu free tieru (429) nebo přetížení (503) počká a zkusí znovu.
    """
    config = types.GenerateContentConfig(
        system_instruction=system,
        response_mime_type="application/json",
        response_json_schema=_inline_refs(schema.model_json_schema()),
    )
    modely = [model] + [m for m in ZALOZNI_MODELY if m != model]
    posledni_chyba: Exception | None = None

    for m in modely:
        for pokus in range(max_pokusu):
            try:
                resp = _klient().models.generate_content(model=m, contents=content, config=config)
            except errors.ClientError as e:
                if e.code == 404:  # model neexistuje → další v pořadí
                    posledni_chyba = e
                    break
                if e.code == 429:
                    posledni_chyba = e
                    cekej = _cekani_z_chyby(e, pokus)
                    print(f"  … limit free tieru, čekám {cekej:.0f} s")
                    time.sleep(cekej)
                    continue
                if e.code in (401, 403) or "API key" in str(e):
                    raise LLMChyba("Neplatný GEMINI_API_KEY (zkontroluj soubor .env).") from e
                raise LLMChyba(f"Gemini odmítlo požadavek ({e.code}): {e.message}") from e
            except errors.ServerError as e:
                posledni_chyba = e
                time.sleep(min(30.0, 4.0 * 2**pokus))
                continue

            text = resp.text
            if not text:
                duvod = resp.candidates[0].finish_reason if resp.candidates else "neznámý"
                raise LLMChyba(f"Gemini nevrátilo žádný text (důvod: {duvod}).")
            try:
                return schema.model_validate_json(text)
            except ValidationError as e:
                posledni_chyba = e
                continue  # vzácně nevalidní JSON → zkusit znovu
        else:
            if isinstance(posledni_chyba, errors.ClientError) and posledni_chyba.code == 429:
                raise LLMChyba(
                    "Vyčerpaný limit free tieru Gemini. Zkus to za pár minut "
                    "(denní limit se obnovuje o půlnoci pacifického času)."
                ) from posledni_chyba

    raise LLMChyba(f"Gemini se nepodařilo zavolat: {posledni_chyba}")


def dostupne_modely() -> list[str]:
    out = []
    for m in _klient().models.list():
        akce = getattr(m, "supported_actions", None) or []
        if "generateContent" in akce:
            out.append(m.name.removeprefix("models/"))
    return sorted(out)
