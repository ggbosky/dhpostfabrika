"""Tenká vrstva nad Claude API se strukturovaným (Pydantic) výstupem."""

from __future__ import annotations

from typing import Any, TypeVar

import anthropic
from pydantic import BaseModel

T = TypeVar("T", bound=BaseModel)

_client: anthropic.Anthropic | None = None


class LLMChyba(RuntimeError):
    pass


def _klient() -> anthropic.Anthropic:
    global _client
    if _client is None:
        # Klíč se bere z ANTHROPIC_API_KEY (nebo z profilu `ant auth login`).
        _client = anthropic.Anthropic(max_retries=3)
    return _client


def strukturovane(
    *,
    model: str,
    system: str,
    content: str | list[dict[str, Any]],
    schema: type[T],
    effort: str = "high",
    max_tokens: int = 16000,
) -> T:
    """Zavolá Claude a vrátí validovanou instanci `schema`.

    Používá server-side fallback: pokud by model požadavek odmítl,
    API ho samo zopakuje na doporučeném záložním modelu.
    """
    try:
        resp = _klient().beta.messages.parse(
            model=model,
            max_tokens=max_tokens,
            system=system,
            messages=[{"role": "user", "content": content}],
            output_format=schema,
            output_config={"effort": effort},
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
        )
    except TypeError as e:
        if "authentication" not in str(e).lower():
            raise
        raise LLMChyba(
            "Chybí přihlašovací údaje ke Claude API – doplň ANTHROPIC_API_KEY do souboru .env."
        ) from e
    except anthropic.AuthenticationError as e:
        raise LLMChyba(
            "Neplatný nebo chybějící ANTHROPIC_API_KEY (zkontroluj soubor .env)."
        ) from e
    except anthropic.RateLimitError as e:
        raise LLMChyba("Claude API: překročen limit požadavků, zkus to za chvíli.") from e
    except anthropic.BadRequestError as e:
        raise LLMChyba(f"Claude API odmítlo požadavek: {e.message}") from e
    except anthropic.APIStatusError as e:
        raise LLMChyba(f"Claude API vrátilo chybu {e.status_code}: {e.message}") from e
    except anthropic.APIConnectionError as e:
        raise LLMChyba("Nepodařilo se spojit s Claude API (síť?).") from e

    if resp.stop_reason == "refusal":
        raise LLMChyba("Model odmítl požadavek zpracovat – zkus téma formulovat jinak.")
    if resp.stop_reason == "max_tokens":
        raise LLMChyba("Odpověď modelu byla useknutá (max_tokens).")
    if resp.parsed_output is None:
        raise LLMChyba("Model nevrátil platný strukturovaný výstup.")
    return resp.parsed_output
