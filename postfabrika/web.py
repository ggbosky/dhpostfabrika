"""Jednoduché webové rozhraní: python -m postfabrika web  →  http://127.0.0.1:8000"""

from __future__ import annotations

import json
import os
import tempfile
import threading
import traceback
import uuid
import webbrowser
from pathlib import Path

from flask import Flask, abort, jsonify, request, send_from_directory
from PIL import Image, ImageOps

from . import pipeline, style
from .config import LICENCE, nacti_config
from .llm import LLMChyba

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 50 * 1024 * 1024

_ukoly: dict[str, dict] = {}
_zamek = threading.Lock()


def _spust_ukol(fn) -> str:
    uid = uuid.uuid4().hex[:12]
    ukol = {"stav": "bezi", "log": [], "vysledek": None, "chyba": None}
    with _zamek:
        _ukoly[uid] = ukol

    def log(zprava: str) -> None:
        ukol["log"].append(zprava)

    def beh() -> None:
        try:
            ukol["vysledek"] = fn(log)
            ukol["stav"] = "hotovo"
        except (LLMChyba, FileNotFoundError, ValueError, RuntimeError) as e:
            ukol["chyba"], ukol["stav"] = str(e), "chyba"
        except Exception as e:  # noqa: BLE001 – ať uživatel vidí chybu v prohlížeči
            traceback.print_exc()
            ukol["chyba"], ukol["stav"] = f"Neočekávaná chyba: {e}", "chyba"

    threading.Thread(target=beh, daemon=True).start()
    return uid


def _vysledek_json(v: pipeline.Vysledek) -> dict:
    slozka = v.slozka.name
    return {
        "slozka": slozka,
        "text": v.text,
        "obrazek": f"/vystup/{slozka}/obrazek.jpg" if v.ma_obrazek else None,
        "nahled": f"/vystup/{slozka}/nahled.html",
        "k_overeni": v.post.k_overeni,
        "upozorneni": v.upozorneni,
        "alt_text": v.post.alt_text,
        "foto": None
        if v.foto is None
        else {"web": v.foto.domena, "stranka": v.foto.stranka_url, "skore": v.skore,
              "zduvodneni": v.zduvodneni},
        "kandidati": [
            {"nahled": k.nahled_url, "web": k.domena, "skore": s, "stranka": k.stranka_url,
             "vybrana": v.foto is not None and k is v.foto}
            for k, s in v.kandidati
        ],
    }


# ------------------------------------------------------------------ API ---


@app.get("/")
def index():
    return _HTML


@app.get("/api/stav")
def stav():
    cfg = nacti_config()
    try:
        p = style.nacti_profil(cfg.styl_soubor)
        profil = {"je_vychozi": p.je_vychozi, "pocet": p.pocet_analyzovanych, "shrnuti": p.shrnuti}
    except FileNotFoundError:
        profil = None
    return jsonify(
        model=cfg.model,
        licence=cfg.licence,
        licence_moznosti=list(LICENCE),
        ma_klic=bool(os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")),
        profil=profil,
    )


@app.post("/api/generuj")
def generuj():
    f = request.form
    tema = (f.get("tema") or "").strip()
    if not tema:
        return jsonify(chyba="Zadej téma."), 400
    vlastni = None
    soubor = request.files.get("obrazek")
    if soubor and soubor.filename:
        try:
            vlastni = ImageOps.exif_transpose(Image.open(soubor.stream)).convert("RGB")
        except Exception:  # noqa: BLE001
            return jsonify(chyba="Nahraný soubor není obrázek."), 400
    licence = f.get("licence") or None
    if licence and licence not in LICENCE:
        return jsonify(chyba="Neznámý filtr licence."), 400
    zadani = pipeline.Zadani(
        tema=tema,
        fakta=(f.get("fakta") or "").strip() or None,
        pokyn=(f.get("pokyn") or "").strip() or None,
        licence=licence,
        titulek=f.get("titulek") == "1",
        bez_obrazku=f.get("bez_obrazku") == "1",
        vlastni_obrazek=vlastni,
        min_skore=int(f.get("min_skore") or 40),
    )
    uid = _spust_ukol(
        lambda log: _vysledek_json(pipeline.vytvor_post(zadani, nacti_config(), log))
    )
    return jsonify(id=uid)


@app.post("/api/analyzuj")
def analyzuj():
    tmp = Path(tempfile.mkdtemp(prefix="postfabrika_"))
    for i, s in enumerate(request.files.getlist("soubory")):
        if s and s.filename:
            pripona = Path(s.filename).suffix.lower()
            if pripona in {".json", ".txt"}:
                s.save(tmp / f"{i}{pripona}")
    vlozeno = (request.form.get("texty") or "").strip()
    if vlozeno:
        (tmp / "vlozeno.txt").write_text(vlozeno, encoding="utf-8")
    if not any(tmp.iterdir()):
        return jsonify(chyba="Nahraj soubor (JSON z exportu / .txt) nebo vlož texty."), 400

    def beh(log):
        cfg = nacti_config()
        prispevky = style.nacti_prispevky([tmp])
        log(f"📥 Načteno {len(prispevky)} příspěvků")
        log("🧠 Gemini analyzuje styl…")
        profil = style.analyzuj(prispevky, cfg.model)
        style.uloz_profil(profil, cfg.styl_soubor)
        log("✅ Stylový profil uložen")
        return {"profil": style.profil_do_promptu(profil.model_copy(update={"ukazky": []}))}

    return jsonify(id=_spust_ukol(beh))


@app.get("/api/ukol/<uid>")
def ukol(uid: str):
    u = _ukoly.get(uid)
    if u is None:
        abort(404)
    return jsonify(u)


@app.get("/api/historie")
def historie():
    cfg = nacti_config()
    out = []
    if cfg.vystup_dir.exists():
        for d in sorted(cfg.vystup_dir.iterdir(), reverse=True)[:12]:
            meta = d / "post.json"
            if not meta.exists():
                continue
            try:
                tema = json.loads(meta.read_text(encoding="utf-8")).get("tema", d.name)
            except json.JSONDecodeError:
                tema = d.name
            out.append({
                "tema": tema,
                "nahled": f"/vystup/{d.name}/nahled.html",
                "obrazek": f"/vystup/{d.name}/obrazek.jpg" if (d / "obrazek.jpg").exists() else None,
            })
    return jsonify(out)


@app.get("/vystup/<slozka>/<soubor>")
def vystup_soubor(slozka: str, soubor: str):
    cfg = nacti_config()
    return send_from_directory(cfg.vystup_dir.resolve() / slozka, soubor)


def spust(host: str = "127.0.0.1", port: int = 8000, otevrit: bool = True) -> None:
    url = f"http://{'127.0.0.1' if host in ('0.0.0.0', '::') else host}:{port}"
    print(f"🏒 DH Post Fabrika běží na {url}  (ukončení: Ctrl+C)")
    if otevrit:
        threading.Timer(1.0, lambda: webbrowser.open(url)).start()
    app.run(host=host, port=port, threaded=True, debug=False)


# ---------------------------------------------------------------- stránka ---

_HTML = r"""<!doctype html>
<html lang="cs"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>DH Post Fabrika</title>
<style>
  :root { --bg:#f4f5f7; --card:#fff; --text:#16181d; --muted:#6b7280; --line:#e3e5ea;
          --accent:#0b5cff; --accent-text:#fff; --warn:#fff4e0; --warn-text:#7a4b00;
          --err:#fdecec; --err-text:#9b1c1c; --ok:#e8f6ee; --log:#0f1115; --log-text:#d7dbe3; }
  @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
    --bg:#0e0f12; --card:#17191e; --text:#eef0f4; --muted:#9aa1ad; --line:#2a2d35;
    --accent:#4c8dff; --warn:#3a2c10; --warn-text:#ffd28a; --err:#3a1515; --err-text:#ffb4b4;
    --ok:#12301f; --log:#0a0b0e; } }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--text);
         font:15px/1.5 -apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; }
  header { display:flex; align-items:center; gap:12px; padding:14px 20px;
           border-bottom:1px solid var(--line); background:var(--card); flex-wrap:wrap; }
  header h1 { font-size:18px; margin:0; }
  .pill { font-size:12px; padding:3px 10px; border-radius:999px; background:var(--bg);
          border:1px solid var(--line); color:var(--muted); }
  .pill.warn { background:var(--warn); color:var(--warn-text); border-color:transparent; }
  .pill.ok { background:var(--ok); }
  nav { margin-left:auto; display:flex; gap:6px; }
  nav button { background:none; border:1px solid var(--line); color:var(--text);
               padding:6px 12px; border-radius:8px; cursor:pointer; font:inherit; }
  nav button.on { background:var(--accent); color:var(--accent-text); border-color:var(--accent); }
  main { max-width:1100px; margin:0 auto; padding:20px 16px 60px; display:grid;
         grid-template-columns: minmax(0,1fr) minmax(0,470px); gap:24px; }
  @media (max-width: 860px) { main { grid-template-columns:1fr; } }
  .card { background:var(--card); border:1px solid var(--line); border-radius:12px; padding:18px; }
  label { display:block; font-weight:600; margin:14px 0 6px; font-size:14px; }
  label:first-child { margin-top:0; }
  .hint { color:var(--muted); font-weight:400; font-size:13px; }
  input[type=text], textarea, select { width:100%; padding:10px 12px; border-radius:8px;
         border:1px solid var(--line); background:var(--bg); color:var(--text); font:inherit; }
  textarea { min-height:80px; resize:vertical; }
  .row { display:flex; gap:16px; flex-wrap:wrap; margin-top:14px; }
  .row label { display:flex; gap:6px; align-items:center; font-weight:400; margin:0; }
  .btn { margin-top:18px; width:100%; padding:12px; border:0; border-radius:10px;
         background:var(--accent); color:var(--accent-text); font-weight:600; font-size:16px; cursor:pointer; }
  .btn:disabled { opacity:.55; cursor:wait; }
  .btn.small { width:auto; margin:0; padding:8px 14px; font-size:14px; }
  .btn.ghost { background:none; color:var(--accent); border:1px solid var(--line); }
  #log, #logStyl { background:var(--log); color:var(--log-text); font:13px/1.5 ui-monospace,Consolas,monospace;
         border-radius:8px; padding:10px 12px; margin-top:16px; white-space:pre-wrap; display:none;
         max-height:220px; overflow:auto; }
  .ig { padding:0; overflow:hidden; }
  .ig .head { padding:12px 14px; font-weight:600; border-bottom:1px solid var(--line); }
  .ig img { display:block; width:100%; aspect-ratio:4/5; object-fit:cover; background:var(--bg); }
  .ig .cap { padding:12px 14px; white-space:pre-wrap; overflow-wrap:anywhere; }
  .ig .actions { display:flex; gap:8px; padding:0 14px 14px; flex-wrap:wrap; }
  .empty { color:var(--muted); text-align:center; padding:60px 20px; }
  .box { border-radius:8px; padding:10px 14px; margin:0 14px 12px; font-size:14px; }
  .box ul { margin:4px 0 0; padding-left:18px; }
  .box.warn { background:var(--warn); color:var(--warn-text); }
  .box.err { background:var(--err); color:var(--err-text); }
  .meta { color:var(--muted); font-size:13px; padding:0 14px 12px; }
  .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(88px,1fr)); gap:8px;
          padding:0 14px 14px; }
  .grid a { position:relative; display:block; border-radius:6px; overflow:hidden;
            border:2px solid transparent; }
  .grid a.vyb { border-color:var(--accent); }
  .grid img { width:100%; aspect-ratio:1; object-fit:cover; display:block; }
  .grid span { position:absolute; left:4px; bottom:4px; background:rgba(0,0,0,.7); color:#fff;
               font-size:11px; padding:1px 6px; border-radius:4px; }
  h3 { font-size:14px; margin:4px 14px 8px; color:var(--muted); font-weight:600; }
  .hist { display:flex; gap:10px; overflow-x:auto; padding-bottom:4px; }
  .hist a { flex:0 0 96px; color:var(--text); text-decoration:none; font-size:12px; }
  .hist img, .hist .ph { width:96px; aspect-ratio:4/5; object-fit:cover; border-radius:6px;
          display:block; background:var(--bg); border:1px solid var(--line); }
  pre.profil { white-space:pre-wrap; font-size:13px; background:var(--bg); padding:12px;
               border-radius:8px; max-height:420px; overflow:auto; }
  .hidden { display:none !important; }
  a { color:var(--accent); }
</style></head><body>
<header>
  <h1>🏒 DH Post Fabrika</h1>
  <span id="pStyl" class="pill">…</span>
  <span id="pKlic" class="pill">…</span>
  <nav><button id="tPost" class="on">Nový post</button><button id="tStyl">Naučit styl</button></nav>
</header>

<main id="vPost">
  <section>
    <form id="fPost" class="card">
      <label for="tema">Téma / podnět</label>
      <input type="text" id="tema" name="tema" required
             placeholder="např. Kometa Brno podepsala útočníka z NHL">
      <label for="fakta">Ověřená fakta <span class="hint">– výsledky, jména, čísla (Gemini nemá aktuální zprávy)</span></label>
      <textarea id="fakta" name="fakta" placeholder="např. 4:3 pp, rozhodl Horák v 63. min, Kousal 2 body"></textarea>
      <label for="pokyn">Doplňující pokyn <span class="hint">(volitelné)</span></label>
      <input type="text" id="pokyn" name="pokyn" placeholder="např. kratší, víc emocí">
      <label for="licence">Fotky z webu – filtr licence</label>
      <select id="licence" name="licence">
        <option value="upravy">Volně použitelné vč. úprav (nejbezpečnější)</option>
        <option value="komercni">Volně šiřitelné komerčně</option>
        <option value="verejne">Public domain</option>
        <option value="vse">Bez filtru – práva si hlídám sám</option>
      </select>
      <label for="obrazek">Nebo vlastní fotka <span class="hint">(volitelné – pak se na webu nehledá)</span></label>
      <input type="file" id="obrazek" name="obrazek" accept="image/*">
      <div class="row">
        <label><input type="checkbox" name="titulek" value="1" checked> Titulek do fotky</label>
        <label><input type="checkbox" name="bez_obrazku" value="1"> Jen text</label>
      </div>
      <button class="btn" id="bPost" type="submit">Vytvořit post</button>
      <div id="log"></div>
    </form>
    <div class="card" style="margin-top:16px">
      <label>Poslední posty</label>
      <div class="hist" id="hist"><span class="hint">zatím žádné</span></div>
    </div>
  </section>
  <section class="card ig" id="vysl">
    <div class="empty">Tady se objeví hotový post.</div>
  </section>
</main>

<main id="vStyl" class="hidden">
  <section>
    <form id="fStyl" class="card">
      <label>Export z Instagramu <span class="hint">(soubor posts_1.json, případně více JSON / .txt)</span></label>
      <input type="file" name="soubory" multiple accept=".json,.txt">
      <label for="texty">…nebo sem vlož 20–50 svých popisků <span class="hint">(odděl je řádkem ---)</span></label>
      <textarea id="texty" name="texty" style="min-height:220px"
        placeholder="🚨 První příspěvek…&#10;#hokej&#10;---&#10;Druhý příspěvek…"></textarea>
      <button class="btn" id="bStyl" type="submit">Naučit styl</button>
      <div id="logStyl"></div>
    </form>
    <p class="hint" style="margin:12px 4px">Export: Instagram → Nastavení → Centrum účtů → Vaše informace a oprávnění →
      Stáhnout vaše informace → Obsah → formát JSON.</p>
  </section>
  <section class="card">
    <label>Aktuální stylový profil</label>
    <pre class="profil" id="profil">…</pre>
  </section>
</main>

<script>
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

function tab(post) {
  $("#vPost").classList.toggle("hidden", !post); $("#vStyl").classList.toggle("hidden", post);
  $("#tPost").classList.toggle("on", post); $("#tStyl").classList.toggle("on", !post);
}
$("#tPost").onclick = () => tab(true);
$("#tStyl").onclick = () => tab(false);

async function stav() {
  const s = await (await fetch("/api/stav")).json();
  const p = s.profil;
  $("#pStyl").textContent = !p ? "Styl: chybí" : p.je_vychozi ? "Styl: výchozí odhad" : `Styl: naučený (${p.pocet} postů)`;
  $("#pStyl").className = "pill " + (!p || p.je_vychozi ? "warn" : "ok");
  $("#pKlic").textContent = s.ma_klic ? `Gemini: ${s.model}` : "Chybí GEMINI_API_KEY";
  $("#pKlic").className = "pill " + (s.ma_klic ? "ok" : "warn");
  $("#licence").value = s.licence;
  $("#profil").textContent = p ? p.shrnuti : "Profil zatím neexistuje.";
}

async function historie() {
  const h = await (await fetch("/api/historie")).json();
  if (!h.length) return;
  $("#hist").innerHTML = h.map(x => `<a href="${esc(x.nahled)}" target="_blank">
    ${x.obrazek ? `<img src="${esc(x.obrazek)}" alt="">` : `<div class="ph"></div>`}${esc(x.tema).slice(0, 40)}</a>`).join("");
}

async function sleduj(id, logEl) {
  logEl.style.display = "block";
  while (true) {
    const u = await (await fetch(`/api/ukol/${id}`)).json();
    logEl.textContent = u.log.join("\n") || "Spouštím…";
    logEl.scrollTop = logEl.scrollHeight;
    if (u.stav !== "bezi") return u;
    await new Promise(r => setTimeout(r, 1000));
  }
}

function vykresli(v) {
  const boxy = [];
  if (v.upozorneni.length) boxy.push(`<div class="box warn">${v.upozorneni.map(esc).join("<br>")}</div>`);
  if (v.k_overeni.length) boxy.push(`<div class="box warn"><b>Před publikací ověř:</b><ul>${v.k_overeni.map(x => `<li>${esc(x)}</li>`).join("")}</ul></div>`);
  const foto = v.foto ? `<div class="meta">Foto: <a href="${esc(v.foto.stranka)}" target="_blank">${esc(v.foto.web)}</a> · skóre ${v.foto.skore}/100 · ${esc(v.foto.zduvodneni)}</div>` : "";
  const kand = v.kandidati.length ? `<h3>Kandidáti podle Gemini Vision</h3><div class="grid">${v.kandidati.map(k =>
    `<a href="${esc(k.stranka)}" target="_blank" class="${k.vybrana ? "vyb" : ""}" title="${esc(k.web)}">
       <img src="${esc(k.nahled)}" alt="" loading="lazy" referrerpolicy="no-referrer"><span>${k.skore}</span></a>`).join("")}</div>` : "";
  $("#vysl").innerHTML = `<div class="head">denik_hokeje</div>
    ${v.obrazek ? `<img src="${esc(v.obrazek)}?t=${Date.now()}" alt="${esc(v.alt_text)}">` : ""}
    <div class="cap" id="cap">${esc(v.text)}</div>
    <div class="actions">
      <button class="btn small" id="bCopy">Kopírovat text</button>
      ${v.obrazek ? `<a class="btn small ghost" href="${esc(v.obrazek)}" download="${esc(v.slozka)}.jpg">Stáhnout obrázek</a>` : ""}
      <a class="btn small ghost" href="${esc(v.nahled)}" target="_blank">Otevřít náhled</a>
    </div>${foto}${boxy.join("")}${kand}`;
  $("#bCopy").onclick = async () => {
    await navigator.clipboard.writeText(v.text);
    $("#bCopy").textContent = "Zkopírováno ✓";
  };
}

$("#fPost").onsubmit = async e => {
  e.preventDefault();
  const b = $("#bPost"); b.disabled = true; b.textContent = "Pracuji… (obvykle 20–60 s)";
  try {
    const r = await fetch("/api/generuj", { method: "POST", body: new FormData(e.target) });
    const d = await r.json();
    if (!r.ok) throw new Error(d.chyba);
    const u = await sleduj(d.id, $("#log"));
    if (u.stav === "chyba") throw new Error(u.chyba);
    vykresli(u.vysledek); historie();
  } catch (err) {
    $("#vysl").innerHTML = `<div class="box err" style="margin:14px">❌ ${esc(err.message)}</div>`;
  } finally { b.disabled = false; b.textContent = "Vytvořit post"; }
};

$("#fStyl").onsubmit = async e => {
  e.preventDefault();
  const b = $("#bStyl"); b.disabled = true; b.textContent = "Analyzuji…";
  const logEl = $("#logStyl");
  try {
    const r = await fetch("/api/analyzuj", { method: "POST", body: new FormData(e.target) });
    const d = await r.json();
    if (!r.ok) throw new Error(d.chyba);
    const u = await sleduj(d.id, logEl);
    if (u.stav === "chyba") throw new Error(u.chyba);
    $("#profil").textContent = u.vysledek.profil; stav();
  } catch (err) {
    logEl.style.display = "block"; logEl.textContent = "❌ " + err.message;
  } finally { b.disabled = false; b.textContent = "Naučit styl"; }
};

stav(); historie();
</script>
</body></html>
"""
