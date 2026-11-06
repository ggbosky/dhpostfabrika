"""Příkazová řádka: `python -m postfabrika <příkaz>`."""

from __future__ import annotations

import argparse
import sys
import webbrowser
from pathlib import Path

from . import generator, images, style, vystup
from .config import nacti_config
from .llm import LLMChyba


def _cmd_analyzuj(args: argparse.Namespace) -> int:
    cfg = nacti_config()
    prispevky = style.nacti_prispevky([Path(z) for z in args.zdroje])
    print(f"Načteno {len(prispevky)} příspěvků. Analyzuji styl…")
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


def _cmd_generuj(args: argparse.Namespace) -> int:
    cfg = nacti_config()
    profil = style.nacti_profil(cfg.styl_soubor)
    if profil.je_vychozi:
        print(
            "⚠️  Používám výchozí odhad stylu. Pro věrný styl spusť nejdřív\n"
            "    python -m postfabrika analyzuj <export nebo txt s příspěvky>\n"
        )

    tema = args.tema or input("Téma / podnět příspěvku: ").strip()
    if not tema:
        print("Téma je prázdné.")
        return 1
    fakta = Path(args.fakta_soubor).read_text(encoding="utf-8") if args.fakta_soubor else args.fakta

    print("✍️  Píšu text…")
    post = generator.generuj(tema, profil, cfg.model, fakta=fakta, poznamka=args.pokyn)

    obrazek = foto = zduvodneni = None
    if args.obrazek:
        print(f"🖼️  Používám vlastní obrázek {args.obrazek}")
        obrazek = images.orizni_4x5(images.nacti_lokalni(args.obrazek))
    elif args.bez_obrazku:
        pass
    elif not cfg.ma_fotobanku:
        print("⚠️  Chybí PEXELS_API_KEY i UNSPLASH_ACCESS_KEY – generuji bez obrázku.")
    else:
        print(f"🔎 Hledám fotky: {' | '.join(post.obrazek_dotazy)}")
        kandidati = images.vyhledej(post.obrazek_dotazy, cfg)
        if not kandidati:
            print("⚠️  Žádná vhodná fotka nenalezena.")
        else:
            print(f"🧐 Vybírám nejlepší z {min(len(kandidati), 16)} kandidátů…")
            text_bez_tagu = generator.sloz_text(post.model_copy(update={"hashtagy": []}))
            foto, vyber = images.vyber_nejlepsi(
                kandidati, tema, text_bez_tagu, post.obrazek_brief, cfg.model
            )
            zduvodneni = vyber.zduvodneni
            print(f"   → {foto.zdroj} #{foto.id} od {foto.autor}: {zduvodneni}")
            obrazek = images.orizni_4x5(
                images.stahni_plne(foto, cfg), vyber.fokus_x, vyber.fokus_y
            )

    if obrazek is not None and args.titulek_v_obrazku:
        obrazek = images.pridej_titulek(obrazek, post.titulek_do_obrazku, cfg.font_path)

    kredit = foto.kredit if (foto and cfg.pridat_kredit_fota) else None
    text = generator.sloz_text(post, kredit)
    slozka = vystup.uloz(cfg.vystup_dir, tema, post, text, obrazek, foto, zduvodneni)

    print("\n" + "─" * 60 + f"\n{text}\n" + "─" * 60)
    if post.k_overeni:
        print("⚠️  Před publikací ověř:")
        for x in post.k_overeni:
            print(f"   • {x}")
    print(f"\n📁 Uloženo do: {slozka}")
    if args.otevrit:
        webbrowser.open((slozka / "nahled.html").resolve().as_uri())
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

    g = sub.add_parser("generuj", help="Vygeneruje nový příspěvek k tématu")
    g.add_argument("tema", nargs="?", help="Téma / krátký podnět (když chybí, zeptá se)")
    g.add_argument("--fakta", help="Ověřená fakta (výsledek, střelci, čísla…)")
    g.add_argument("--fakta-soubor", help="Fakta ze souboru")
    g.add_argument("--pokyn", help="Doplňující pokyn (např. 'kratší, víc emocí')")
    g.add_argument("--obrazek", help="Použít vlastní obrázek místo fotobanky")
    g.add_argument("--bez-obrazku", action="store_true", help="Negenerovat obrázek")
    g.add_argument(
        "--titulek-v-obrazku", action="store_true", help="Vložit krátký titulek do fotky"
    )
    g.add_argument("--otevrit", action="store_true", help="Otevřít HTML náhled v prohlížeči")
    g.set_defaults(fn=_cmd_generuj)

    args = ap.parse_args(argv)
    if not getattr(args, "fn", None):
        # Bez příkazu = interaktivní generování.
        args = ap.parse_args(["generuj", "--otevrit", *(argv or [])])
    try:
        return args.fn(args)
    except (LLMChyba, FileNotFoundError, ValueError, RuntimeError) as e:
        print(f"❌ {e}", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        return 130
