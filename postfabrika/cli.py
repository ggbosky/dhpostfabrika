"""Příkazová řádka: `python -m postfabrika <příkaz>`."""

from __future__ import annotations

import argparse
import sys
import webbrowser
from pathlib import Path

from . import images, llm, pipeline, style
from .config import LICENCE, nacti_config
from .llm import LLMChyba


def _cmd_analyzuj(args: argparse.Namespace) -> int:
    cfg = nacti_config()
    prispevky = style.nacti_prispevky([Path(z) for z in args.zdroje])
    print(f"Načteno {len(prispevky)} příspěvků. Analyzuji styl (Gemini)…")
    profil = style.analyzuj(prispevky, cfg.model, max_postu=args.max)
    style.uloz_profil(profil, cfg.styl_soubor)
    print(f"\n✅ Stylový profil uložen do {cfg.styl_soubor}\n")
    print(style.profil_do_promptu(profil.model_copy(update={"ukazky": []})))
    return 0


def _cmd_styl(_: argparse.Namespace) -> int:
    cfg = nacti_config()
    profil = style.nacti_profil(cfg.styl_soubor)
    if profil.je_vychozi:
        print("⚠️  Výchozí (nenaučený) profil – spusť `analyzuj`.\n")
    else:
        print(f"Profil naučený z {profil.pocet_analyzovanych} příspěvků.\n")
    print(style.profil_do_promptu(profil))
    return 0


def _cmd_modely(_: argparse.Namespace) -> int:
    cfg = nacti_config()
    print(f"Nastavený model: {cfg.model}\n\nModely dostupné pro tvůj klíč:")
    for m in llm.dostupne_modely():
        print(f"  {m}")
    print("\nZměna: GEMINI_MODEL=<název> v souboru .env")
    return 0


def _cmd_generuj(args: argparse.Namespace) -> int:
    tema = args.tema or input("Téma / podnět příspěvku: ").strip()
    if not tema:
        print("Téma je prázdné.")
        return 1
    fakta = Path(args.fakta_soubor).read_text(encoding="utf-8") if args.fakta_soubor else args.fakta
    zadani = pipeline.Zadani(
        tema=tema,
        fakta=fakta,
        pokyn=args.pokyn,
        licence=args.licence,
        titulek=not args.bez_titulku,
        bez_obrazku=args.bez_obrazku,
        vlastni_obrazek=images.nacti_lokalni(args.obrazek) if args.obrazek else None,
        min_skore=args.min_skore,
    )
    v = pipeline.vytvor_post(zadani, nacti_config())

    print("\n" + "─" * 60 + f"\n{v.text}\n" + "─" * 60)
    if v.post.k_overeni:
        print("⚠️  Před publikací ověř:")
        for x in v.post.k_overeni:
            print(f"   • {x}")
    for u in v.upozorneni:
        print(f"⚠️  {u}")
    if args.otevrit:
        webbrowser.open((v.slozka / "nahled.html").resolve().as_uri())
    return 0


def _cmd_web(args: argparse.Namespace) -> int:
    from . import web

    web.spust(host=args.host, port=args.port, otevrit=not args.neotvirat)
    return 0


def main(argv: list[str] | None = None) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")  # emoji ve Windows konzoli

    ap = argparse.ArgumentParser(
        prog="postfabrika", description="Generátor Instagram příspěvků ve stylu @denik_hokeje"
    )
    sub = ap.add_subparsers(dest="prikaz")

    a = sub.add_parser("analyzuj", help="Naučí se styl z tvých reálných příspěvků")
    a.add_argument("zdroje", nargs="+", help="Instagram export (složka/JSON) nebo .txt soubory")
    a.add_argument("--max", type=int, default=200, help="Max. počet analyzovaných postů")
    a.set_defaults(fn=_cmd_analyzuj)

    s = sub.add_parser("styl", help="Vypíše aktuální stylový profil")
    s.set_defaults(fn=_cmd_styl)

    m = sub.add_parser("modely", help="Vypíše Gemini modely dostupné pro tvůj klíč")
    m.set_defaults(fn=_cmd_modely)

    g = sub.add_parser("generuj", help="Vygeneruje nový příspěvek k tématu")
    g.add_argument("tema", nargs="?", help="Téma / krátký podnět (když chybí, zeptá se)")
    g.add_argument("--fakta", help="Ověřená fakta (výsledek, střelci, čísla…)")
    g.add_argument("--fakta-soubor", help="Fakta ze souboru")
    g.add_argument("--pokyn", help="Doplňující pokyn (např. 'kratší, víc emocí')")
    g.add_argument("--obrazek", help="Použít vlastní obrázek místo hledání na webu")
    g.add_argument("--bez-obrazku", action="store_true", help="Jen text")
    g.add_argument("--bez-titulku", action="store_true", help="Nevkládat titulek do fotky")
    g.add_argument(
        "--licence", choices=list(LICENCE), help="Filtr licence fotek (výchozí z .env: upravy)"
    )
    g.add_argument(
        "--min-skore", type=int, default=40, help="Minimální skóre fotky 0–100 (výchozí 40)"
    )
    g.add_argument("--otevrit", action="store_true", help="Otevřít HTML náhled v prohlížeči")
    g.set_defaults(fn=_cmd_generuj)

    w = sub.add_parser("web", help="Spustí webové rozhraní v prohlížeči")
    w.add_argument("--host", default="127.0.0.1")
    w.add_argument("--port", type=int, default=8000)
    w.add_argument("--neotvirat", action="store_true", help="Neotevírat prohlížeč")
    w.set_defaults(fn=_cmd_web)

    args = ap.parse_args(argv)
    if not getattr(args, "fn", None):
        # Bez příkazu = webové rozhraní.
        args = ap.parse_args(["web"])
    try:
        return args.fn(args)
    except (LLMChyba, FileNotFoundError, ValueError, RuntimeError) as e:
        print(f"❌ {e}", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        return 130
