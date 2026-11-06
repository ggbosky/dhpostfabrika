"""Testy bez sítě a bez API klíčů (Gemini i DuckDuckGo jsou nahrazeny maketami)."""

import io
import json
from pathlib import Path

from PIL import Image

from postfabrika import cli, generator, images, llm, style
from postfabrika.generator import Prispevek
from postfabrika.images import Hodnoceni, Vyber


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
    text = generator.sloz_text(p, "📸 Foto: web.cz")
    assert text.startswith("🚨 Je to oficiální!\n\n")
    assert text.endswith("📸 Foto: web.cz\n\n#hokej #Extraliga #denikhokeje")


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


def _jpeg(w, h):
    buf = io.BytesIO()
    Image.new("RGB", (w, h), "white").save(buf, "JPEG")
    return buf.getvalue()


def _kandidat(i, domena="web.cz"):
    return images.Kandidat(
        f"hockey {i}", f"http://{domena}/full/{i}.jpg", f"http://thumb/{i}",
        f"https://www.{domena}/clanek/{i}", 3000, 2000,
    )


def test_inline_refs_pro_gemini():
    schema = llm._inline_refs(style._VyberUkazek.model_json_schema())
    text = json.dumps(schema)
    assert "$ref" not in text and "$defs" not in text
    assert "pocet_min" in text  # vnořený HashtagStrategie je inline


def test_vyhledej_filtruje(monkeypatch):
    vysledky = [
        {"title": "ok", "image": "https://a.cz/1.jpg", "thumbnail": "t1", "url": "https://a.cz", "width": 2000, "height": 1300},
        {"title": "maly", "image": "https://a.cz/2.jpg", "thumbnail": "t2", "url": "https://a.cz", "width": 600, "height": 400},
        {"title": "getty", "image": "https://media.gettyimages.com/3.jpg", "thumbnail": "t3", "url": "https://gettyimages.com/x", "width": 2000, "height": 1300},
        {"title": "dup", "image": "https://a.cz/1.jpg", "thumbnail": "t1", "url": "https://a.cz", "width": 2000, "height": 1300},
    ]
    monkeypatch.setattr(images, "_hledej", lambda d, c, p: vysledky)
    out = images.vyhledej(["q1", "q2"], cli.nacti_config())
    assert [k.titulek for k in out] == ["ok"]


def test_pestry_vyber_stridá_weby():
    k = [_kandidat(i, "a.cz") for i in range(5)] + [_kandidat(9, "b.cz")]
    assert [x.domena for x in images._pestry_vyber(k, 3)] == ["a.cz", "b.cz", "a.cz"]


def test_cely_tok_generuj(tmp_path: Path, monkeypatch):
    volani = []

    def fake_llm(*, schema, content, **_):
        volani.append(schema.__name__)
        if schema is Prispevek:
            return _post()
        assert sum(1 for b in content if not isinstance(b, str)) == 3  # 3 obrázky
        return Vyber(
            hodnoceni=[Hodnoceni(index=0, skore=50, duvod="ok"),
                       Hodnoceni(index=1, skore=90, duvod="nejlepší"),
                       Hodnoceni(index=2, skore=70, duvod="dobrá")],
            nejlepsi_index=1, fokus_x=0.5, fokus_y=0.4, zduvodneni="Dynamická akce.",
        )

    def fake_stahni(url):
        if "/full/1" in url:
            raise OSError("403 – web blokuje stažení")  # vítěz nejde stáhnout
        return _jpeg(3000, 2000) if "/full/" in url else _jpeg(300, 200)

    monkeypatch.setattr("postfabrika.llm.strukturovane", fake_llm)
    monkeypatch.setattr(images, "vyhledej", lambda d, c: [_kandidat(i, f"web{i}.cz") for i in range(3)])
    monkeypatch.setattr(images, "_stahni", fake_stahni)
    monkeypatch.setenv("VYSTUP_DIR", str(tmp_path))

    assert cli.main(["generuj", "Kometa podepsala nového útočníka"]) == 0
    assert volani == ["Prispevek", "Vyber"]
    slozka = next(tmp_path.iterdir())
    assert Image.open(slozka / "obrazek.jpg").size == (1080, 1350)
    text = (slozka / "post.txt").read_text(encoding="utf-8")
    assert "📸 Foto: web2.cz" in text  # náhradník s 2. nejlepším skóre
    meta = json.loads((slozka / "post.json").read_text(encoding="utf-8"))
    assert meta["foto"]["skore"] == 70 and meta["foto"]["filtr_licence"] == "upravy"
    assert "Kopírovat text" in (slozka / "nahled.html").read_text(encoding="utf-8")


def test_generuj_bez_obrazku(tmp_path: Path, monkeypatch):
    monkeypatch.setattr("postfabrika.llm.strukturovane", lambda **kw: _post())
    monkeypatch.setenv("VYSTUP_DIR", str(tmp_path))
    assert cli.main(["generuj", "Test", "--bez-obrazku"]) == 0
    assert not (next(tmp_path.iterdir()) / "obrazek.jpg").exists()


def test_gemini_limit_a_zalozni_model(monkeypatch):
    from types import SimpleNamespace

    from google.genai import errors

    volani = []

    class FakeModels:
        def generate_content(self, *, model, contents, config):
            volani.append(model)
            assert config.response_mime_type == "application/json"
            if model == "neexistujici-model":
                raise errors.ClientError(404, {"error": {"message": "not found"}})
            if len(volani) == 2:
                raise errors.ClientError(429, {"error": {"message": "Please retry in 0.01s"}})
            return SimpleNamespace(text=_post().model_dump_json(), candidates=[])

    monkeypatch.setattr(llm, "_klient", lambda: SimpleNamespace(models=FakeModels()))
    monkeypatch.setattr(llm.time, "sleep", lambda s: None)
    out = llm.strukturovane(model="neexistujici-model", system="s", content="c", schema=Prispevek)
    assert out.hook == _post().hook
    assert volani == ["neexistujici-model", "gemini-flash-latest", "gemini-flash-latest"]
