"""Testy bez sítě a bez API klíčů (Claude i fotobanky jsou nahrazeny maketami)."""

import io
import json
from pathlib import Path

from PIL import Image

from postfabrika import cli, generator, images, style
from postfabrika.generator import Prispevek
from postfabrika.images import _Hodnoceni, _Vyber


def _post(**kw) -> Prispevek:
    base = dict(
        hook="🚨 Je to oficiální!",
        telo="Odstavec jedna.\n\nOdstavec dva.",
        cta="Co na to říkáte? 👇",
        hashtagy=["hokej", "#Extraliga", "#hokej", "#denik hokeje"],
        titulek_do_obrazku="Velká posila pro Kometu",
        alt_text="Hokejista při střele.",
        obrazek_brief="Hokejista v útoku",
        obrazek_dotazy=["ice hockey player shot", "ice hockey arena"],
        k_overeni=["délka smlouvy"],
    )
    base.update(kw)
    return Prispevek(**base)


def test_instagram_export_mojibake(tmp_path: Path):
    caption = "Kometa slaví! 🏒 Čeští fanoušci šílí #hokej"
    mojibake = caption.encode("utf-8").decode("latin-1")
    data = [
        {"media": [{"uri": "a.jpg", "title": mojibake}]},
        {"title": "Druhý post – dost dlouhý na to, aby prošel filtrem.", "media": [{"title": ""}]},
        {"media": [{"title": "krátké"}]},
    ]
    f = tmp_path / "posts_1.json"
    f.write_text(json.dumps(data), encoding="utf-8")
    assert style.nacti_prispevky([tmp_path]) == [caption, data[1]["title"]]


def test_txt_oddelovac(tmp_path: Path):
    (tmp_path / "p.txt").write_text(
        "První příspěvek, který je dost dlouhý.\n---\nDruhý příspěvek, taky dost dlouhý.\n",
        encoding="utf-8",
    )
    assert len(style.nacti_prispevky([tmp_path / "p.txt"])) == 2


def test_hashtagy_a_slozeni_textu():
    p = _post()
    p.hashtagy = generator._normalizuj_hashtagy(p.hashtagy)
    assert p.hashtagy == ["#hokej", "#Extraliga", "#denikhokeje"]
    text = generator.sloz_text(p, "📸 Jan / Pexels")
    assert text.startswith("🚨 Je to oficiální!\n\n")
    assert text.endswith("📸 Jan / Pexels\n\n#hokej #Extraliga #denikhokeje")


def test_orez_a_titulek():
    for velikost in [(4000, 2000), (1080, 1080), (1200, 3000)]:
        img = images.orizni_4x5(Image.new("RGB", velikost, "red"), 0.9, 0.1)
        assert img.size == (1080, 1350)
    out = images.pridej_titulek(img, "Žluťoučký kůň úpěl ďábelské ódy", None)
    assert out.size == (1080, 1350)


def test_vychozi_profil_je_validni():
    p = style.nacti_profil(Path(__file__).parent.parent / "styl" / "profil.json")
    assert p.je_vychozi
    assert "#denikhokeje" in style.profil_do_promptu(p)


def test_cely_tok_generuj(tmp_path: Path, monkeypatch):
    def jpeg(w, h):
        buf = io.BytesIO()
        Image.new("RGB", (w, h), "white").save(buf, "JPEG")
        return buf.getvalue()

    volani = []

    def fake_llm(*, schema, content, **_):
        volani.append(schema.__name__)
        if schema is Prispevek:
            return _post()
        assert sum(1 for b in content if b["type"] == "image") == 2
        return _Vyber(
            hodnoceni=[_Hodnoceni(index=0, skore=50, duvod="ok"), _Hodnoceni(index=1, skore=90, duvod="lepší")],
            nejlepsi_index=1, fokus_x=0.5, fokus_y=0.4, zduvodneni="Dynamická akce.",
        )

    kandidati = [
        images.Kandidat("pexels", str(i), 3000, 2000, "hockey", f"http://n/{i}", f"http://f/{i}",
                        "Autor", "http://a", "http://s")
        for i in range(2)
    ]
    monkeypatch.setattr("postfabrika.llm.strukturovane", fake_llm)
    monkeypatch.setattr(images, "vyhledej", lambda d, c: kandidati)
    monkeypatch.setattr(images, "_stahni", lambda url: jpeg(3000, 2000) if "/f/" in url else jpeg(300, 200))
    monkeypatch.setenv("PEXELS_API_KEY", "x")
    monkeypatch.setenv("VYSTUP_DIR", str(tmp_path))

    assert cli.main(["generuj", "Kometa podepsala nového útočníka", "--titulek-v-obrazku"]) == 0
    assert volani == ["Prispevek", "_Vyber"]
    slozka = next(tmp_path.iterdir())
    assert Image.open(slozka / "obrazek.jpg").size == (1080, 1350)
    text = (slozka / "post.txt").read_text(encoding="utf-8")
    assert "📸 Autor / Pexels" in text
    meta = json.loads((slozka / "post.json").read_text(encoding="utf-8"))
    assert meta["foto"]["id"] == "1"
    assert "Kopírovat text" in (slozka / "nahled.html").read_text(encoding="utf-8")
