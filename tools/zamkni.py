#!/usr/bin/env python3
"""Zamkne web heslem: celou aplikaci (HTML + všechny skripty) zašifruje AES-256-GCM.

Na GitHub Pages pak leží jen přihlašovací stránka se zašifrovaným obsahem. Bez hesla
z ní nejde aplikaci spustit ani přečíst – klíč se odvozuje z hesla (PBKDF2-SHA256)
a dešifruje se až v prohlížeči.

Použití:  APP_HESLO=... python3 tools/zamkni.py web _site
Bez hesla vytvoří jen stránku „aplikace je zamčená“ (nic z aplikace se nezveřejní).
"""
import base64
import json
import os
import re
import shutil
import sys

ITERACE = 600_000
SUL = "rc04h4ZEjneIRfadkU1iEA=="


def inline_skripty(zdroj: str, html: str) -> str:
    def nahrad(m):
        cesta = os.path.join(zdroj, m.group(1))
        with open(cesta, encoding="utf-8") as f:
            kod = f.read()
        kod = kod.replace("</script", "<\\/script")
        return f"<script>/* {m.group(1)} */\n{kod}\n</script>"
    return re.sub(r'<script src="([a-z0-9-]+\.js)(?:\?[^"]*)?"></script>', nahrad, html)


def zasifruj(data: bytes, heslo: str) -> dict:
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

    # Sůl je pevná (veřejná, to je u soli v pořádku) – „Zapamatovat“ pak vydrží i další nasazení.
    sul, iv = base64.b64decode(SUL), os.urandom(12)
    klic = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=sul, iterations=ITERACE).derive(heslo.encode("utf-8"))
    sifra = AESGCM(klic).encrypt(iv, data, None)
    b64 = lambda b: base64.b64encode(b).decode("ascii")
    return {"sul": b64(sul), "iv": b64(iv), "data": b64(sifra), "iterace": ITERACE}


def main():
    zdroj, cil = sys.argv[1], sys.argv[2]
    heslo = os.environ.get("APP_HESLO", "")
    shutil.rmtree(cil, ignore_errors=True)
    os.makedirs(cil)
    shutil.copytree(os.path.join(zdroj, "brand"), os.path.join(cil, "brand"))
    with open(os.path.join(os.path.dirname(__file__), "login.html"), encoding="utf-8") as f:
        sablona = f.read()

    if not heslo:
        obsah = {"zamceno": True}
        print("::warning::Chybí secret APP_HESLO – zveřejňuji jen stránku „aplikace je zamčená“. "
              "Přidej ho v Settings → Secrets and variables → Actions.")
    else:
        if len(heslo) < 10:
            print("::warning::Heslo je kratší než 10 znaků – doporučuju delší (zašifrovaný obsah je veřejný a krátké heslo jde uhodnout).")
        with open(os.path.join(zdroj, "index.html"), encoding="utf-8") as f:
            html = inline_skripty(zdroj, f.read())
        if re.search(r'<script src="(?!https?:)', html):
            sys.exit("Ve stránce zůstal nevložený lokální skript – přidej ho do inline_skripty.")
        obsah = zasifruj(html.encode("utf-8"), heslo)
        print(f"Zašifrováno {len(html) // 1024} kB aplikace.")

    with open(os.path.join(cil, "index.html"), "w", encoding="utf-8") as f:
        f.write(sablona.replace("/*__ZAMEK__*/null", json.dumps(obsah)))
    with open(os.path.join(cil, "robots.txt"), "w") as f:
        f.write("User-agent: *\nDisallow: /\n")


if __name__ == "__main__":
    main()
