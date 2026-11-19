// Živé hledání témat na webu a ověřování faktů – vždy se zdroji.
(() => {
"use strict";

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const ZAMERENI = {
  mix: "mix zajímavostí: milníky, rekordy, statistické kuriozity a silné příběhy",
  rekordy: "rekordy a statistické kuriozity (nejvíc, nejrychleji, nejmladší, série, unikátní čísla)",
  milniky: "milníky a jubilea hráčů a týmů (kulaté počty bodů, gólů, zápasů, výher, výročí kariér)",
  pribehy: "silné historické příběhy a legendy (osudy hráčů, slavné zápasy, zákulisí, dramata)",
  kuriozity: "kuriozity a perličky, které skoro nikdo nezná",
};
const OBDOBI = {
  vyroci: "", // doplní se podle dnešního data (viz obdobiText)
  historie: `KDYKOLIV v historii hokeje. Data událostí ber z LIBOVOLNÝCH dnů a měsíců – NEVÁŽ je na dnešní datum
(žádná „výročí dnešního dne“). Udělej pestrý mix desetiletí (od 50. let po současnost) a různých měsíců.`,
  aktualne: "aktuální dění za posledních 14 dní (nové rekordy, právě dosažené milníky, unikátní statistiky)",
};
const KDE = {
  cz: "český hokej a Češi ve světě (NHL, KHL, reprezentace, extraliga)",
  svet: "světový hokej (NHL, olympiády, MS) – nejlépe s českou stopou, ale není podmínkou",
};
const ZDROJE_TIPY = "thehockeywriters.com, sport.ceskatelevize.cz, sportrevue.isport.blesk.cz/hokej, nhl.cz, nhl.com, hokej.cz, idnes.cz, isport.cz, hockey-reference.com, quanthockey.com, eliteprospects.com, iihf.com, Wikipedie";

const MESICE = ["ledna", "února", "března", "dubna", "května", "června", "července", "srpna", "září", "října", "listopadu", "prosince"];
const dnesniDen = () => { const d = new Date(); return `${d.getDate()}. ${MESICE[d.getMonth()]}`; };

function obdobiText(klic) {
  if (klic !== "vyroci") return OBDOBI[klic];
  const d = new Date();
  const EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][d.getMonth()];
  return `VÝROČÍ PŘESNĚ DNEŠNÍHO DNE: jen události, které se staly ${d.getDate()}. ${d.getMonth() + 1}. (tj. ${dnesniDen()}) v libovolném roce.
Každé téma MUSÍ mít datum přesně ${d.getDate()}. ${d.getMonth() + 1}. RRRR (den i měsíc musí sedět, rok libovolný). Jiné dny vůbec neuváděj –
raději vrať méně témat. Pole "datum" piš ve tvaru ${d.getDate()}. ${d.getMonth() + 1}. RRRR.
Hledej dotazy typu: "${dnesniDen()} hokej výročí", "${dnesniDen()} v historii hokeje", "${EN} ${d.getDate()} hockey history",
"on this day ${EN} ${d.getDate()} NHL", "${EN} ${d.getDate()} NHL milestone Czech", "${dnesniDen()} narozeniny hokejista".`;
}

// Sedí den i měsíc s dnešním datem? ("11. 11. 1998", "11.11.1998", "11. listopadu 1998")
function jeDnesniDen(t) {
  const d = new Date();
  const s = String(t.datum || "").toLowerCase();
  let m = s.match(/(\d{1,2})\.\s*(\d{1,2})\./);
  if (m) return +m[1] === d.getDate() && +m[2] === d.getMonth() + 1;
  m = s.match(/(\d{1,2})\.\s*([a-zúůěščřžýáíé]+)/);
  if (m) return +m[1] === d.getDate() && MESICE.some((nazev, i) => i === d.getMonth() && m[2].startsWith(nazev.slice(0, 4)));
  return false;
}

let temata = [];
let hledani = 0; // pořadí hledání – stará kontrola nesmí přepsat nová témata

function zdrojeHtml(zdroje) {
  if (zdroje === null || zdroje === undefined) return `<span class="muted">⏳ načítám zdroje…</span>`;
  if (!zdroje.length) return `<span class="bez-zdroje">⚠️ bez přímého zdroje – ověř ručně</span>`;
  return zdroje.map((z) => `<a href="${esc(z.uri)}" target="_blank" rel="noopener">${esc(z.titulek)}</a>`).join(" · ");
}

function zprava(html, druh = "") {
  const el = $("#tZprava");
  el.innerHTML = html;
  el.className = "zprava " + druh;
  el.hidden = !html;
}

async function najdiTemata() {
  const AI = window.DHAI;
  if (!AI.maKlic()) { zprava('Hledání potřebuje AI klíč (Claude nebo Gemini). <a href="#" data-jdi-na-ai>Nastavit klíč</a>', "chyba"); return; }
  const zamereni = ZAMERENI[$("#tZamereni").value];
  const jenDnes = $("#tObdobi").value === "vyroci";
  const obdobi = obdobiText($("#tObdobi").value);
  const oblast = KDE[$("#tKde").value];
  const vlastni = $("#tVlastni").value.trim();
  const b = $("#tHledej");
  const moje = ++hledani;
  const klicFiltru = JSON.stringify([$("#tZamereni").value, $("#tObdobi").value, $("#tKde").value, vlastni, AI.dnes()]);
  b.disabled = true;
  b.textContent = "Hledám na webu…";
  const start = Date.now();
  let videno = 0;
  const pocetTemat = (n) => `${n} ${n === 1 ? "téma" : n < 5 ? "témata" : "témat"}`;
  const odpocet = setInterval(() => {
    const s = Math.round((Date.now() - start) / 1000);
    zprava(videno ? `Načítám… zatím ${pocetTemat(videno)} (${s} s)` : `AI prohledává web a hledá zajímavosti se zdroji… ${s} s (obvykle do 15 s)`);
  }, 1000);
  zprava("AI prohledává web a hledá zajímavosti se zdroji…");
  const zOdkazu = temata.filter((t) => t.zOdkazu); // témata z odkazů zůstávají nahoře
  temata = zOdkazu;
  vykresli({});
  try {
    const r = await AI.hledatNaWebuProud({
      priTextu: (text) => {
        if (moje !== hledani) return;
        const nalezene = AI.objektyZTextu(text).filter((t) => t && t.titulek && (!jenDnes || jeDnesniDen(t)));
        if (nalezene.length > videno) {
          videno = nalezene.length;
          temata = [...zOdkazu, ...nalezene.map((t) => ({ ...t, fakta: (t.fakta || []).filter(Boolean), zdroje: null }))];
          vykresli({});
          zprava(`Načítám… zatím ${pocetTemat(videno)} (${Math.round((Date.now() - start) / 1000)} s)`);
        }
      },
      system: `Jsi rešeršista Instagramu Deník hokeje. Účet NEDĚLÁ zpravodajství (výsledky, přestupy, zranění),
ale zajímavosti: milníky, rekordy, statistické kuriozity${jenDnes ? ", výročí" : ""} a silné historické příběhy – věci, u kterých
fanoušek řekne „to jsem nevěděl“. Hledáš je na webu (Google).${jenDnes || $("#tObdobi").value === "aktualne" ? ` Dnešní datum: ${AI.dnes()}.` : ""}
Zásady:
- Uváděj JEN fakta, která jsi našel ve zdrojích: přesná čísla, data, jména, soupeře. Nic nedomýšlej.
- Každé téma musí být podložené alespoň jedním důvěryhodným zdrojem. Doporučené zdroje (ale můžeš hledat kdekoliv):
  ${ZDROJE_TIPY}.
- Když si nejsi jistý číslem nebo datem, téma vynech.
- Žádná běžná zpravodajská témata (výsledky kola, přestupy, zranění), pokud v nich není rekord nebo milník.`,
      zadani: `Najdi ${jenDnes ? "8" : "6"} nejzajímavějších témat.
Druh: ${zamereni}.
Období: ${obdobi}.
Oblast: ${oblast}.${vlastni ? `\nUpřesnění od redaktora: ${vlastni}` : ""}

Odpověz POUZE řádky JSON Lines – každé téma jeden řádek s jedním objektem, žádný jiný text:
{"titulek": "krátký úderný titulek", "datum": "kdy se to stalo (den. měsíc. rok, nebo rok)", "fakta": ["krátké ověřené fakto", "…"] (2–4), "proc_zajimave": "1 věta", "format": "post" nebo "carousel"}`,
    });
    if (moje !== hledani) return;
    let data = AI.objektyZTextu(r.text).filter((t) => t && t.titulek);
    const vsech = data.length;
    if (jenDnes) data = data.filter(jeDnesniDen);
    const vyrazeno = vsech - data.length;
    const nova = data.map((t) => {
      const fakta = (t.fakta || []).filter(Boolean);
      const zdroje = AI.zdrojeProText(r, [t.titulek, ...fakta, t.proc_zajimave].join(" "));
      return { ...t, fakta, zdroje };
    });
    temata = [...zOdkazu, ...nova];
    if (!nova.length) {
      vykresli({});
      zprava(jenDnes ? `Na ${dnesniDen()} jsem tentokrát nenašel nic, co by šlo podložit zdrojem${vyrazeno ? ` (${vyrazeno} témat s jiným datem jsem vyřadil)` : ""}. Zkus to znovu nebo jiný druh / oblast.` : "Nic jsem nenašel. Zkus jiné zaměření nebo delší období.", "varovani");
      return;
    }
    clearInterval(odpocet);
    vykresli(r);
    ulozVysledek(klicFiltru, r);
    b.disabled = false;
    b.textContent = "🔎 Najít témata";
    zprava(`${nova.length === 1 ? "Nalezeno" : nova.length < 5 ? "Nalezena" : "Nalezeno"} ${pocetTemat(nova.length)} za ${Math.round((Date.now() - start) / 1000)} s${jenDnes ? `, ${nova.length === 1 ? "z" : "všechna z"} ${dnesniDen()}` : ""}${vyrazeno ? ` (${vyrazeno} s jiným datem vyřazeno)` : ""}${r.preruseno ? " (Google odpovídal pomalu, ukazuji, co stihl)" : ""}. Můžeš rovnou tvořit – druhá kontrola faktů běží na pozadí a odznaky se doplní samy.`, "ok");
    overTemata(r, moje, nova).then(() => { if (moje === hledani) ulozVysledek(klicFiltru, r); }); // na pozadí, neblokuje
  } catch (e) {
    clearInterval(odpocet);
    zprava(esc(e.message), "chyba");
  } finally {
    clearInterval(odpocet);
    b.disabled = false;
    b.textContent = "🔎 Najít témata";
  }
}

// Poslední výsledky se pamatují, takže se po otevření záložky ukážou hned.
function ulozVysledek(klicFiltru, r) {
  try { localStorage.setItem("dhpf_temata", JSON.stringify({ klicFiltru, temata, dotazy: r.dotazy || [], cas: Date.now() })); } catch { /* nic */ }
}

function nactiPosledni() {
  let u = null;
  try { u = JSON.parse(localStorage.getItem("dhpf_temata")); } catch { /* nic */ }
  if (!u?.temata?.length) return;
  temata = u.temata;
  temata.forEach((t) => { if (!t.kontrola) t.kontrola = { stav: "nejiste", problem: "druhá kontrola nedoběhla" }; });
  vykresli({ dotazy: u.dotazy });
  const kdy = new Date(u.cas).toLocaleString("cs-CZ", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });
  zprava(`Poslední nalezená témata (${kdy}). Pro nová klikni na <b>🔎 Najít témata</b>.`);
}

function vykresli(r) {
  $("#tSeznam").innerHTML = temata.map((t, i) => `
    <article class="tema ${t.kontrola?.stav === "rozpor" ? "spatne" : ""}">
      <div class="tema-hlava">
        <h3>${esc(t.titulek)}</h3>
        ${t.datum ? `<span class="muted">${esc(t.datum)}</span>` : ""}
      </div>
      ${t.zOdkazu ? `<span class="z-odkazu">🔗 z odkazu · ${esc(domenaOdkazu(t.zOdkazu))}</span>` : ""}
      <ul>${t.fakta.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>
      ${t.proc_zajimave ? `<p class="proc">💡 ${esc(t.proc_zajimave)}</p>` : ""}
      <p class="kontrola ${t.kontrola?.stav || "ceka"}">${kontrolaHtml(t)}</p>
      <p class="zdroje">Zdroje: ${zdrojeHtml(t.zdroje)}</p>
      <div class="akce" style="margin-top:10px">
        <button type="button" class="btn small" data-post="${i}">✍️ Post</button>
        <button type="button" class="btn small ghost" data-carousel="${i}">🎞️ Carousel</button>
        <button type="button" class="btn small ghost" data-reel="${i}">🎬 Reel</button>
        <button type="button" class="btn small ghost" data-do-planu="${i}" title="Uložit do zásobníku nápadů v plánu">📆 Do plánu</button>
        ${jeDnesniDen(t) ? `<button type="button" class="btn small ghost" data-vyroci="${i}">📅 Dnes před lety</button>` : ""}
      </div>
    </article>`).join("") +
    (r.dotazy?.length ? `<p class="muted" style="font-size:12px">Hledáno: ${r.dotazy.map(esc).join(" · ")}</p>` : "");
}

function kontrolaHtml(t) {
  const k = t.kontrola;
  if (!k) return "⏳ Druhá kontrola faktů probíhá…";
  if (k.stav === "overeno") return "✅ Ověřeno druhým nezávislým hledáním";
  if (k.stav === "rozpor") return `❌ Rozpor: ${esc(k.problem || "některá fakta nesedí")}`;
  if (k.stav === "chyba") return `⚠️ Druhou kontrolu se nepodařilo udělat (${esc(k.problem)}) – ověř ručně`;
  return `⚠️ Nejisté: ${esc(k.problem || "nepodařilo se potvrdit")} – ověř ručně`;
}

// Druhé, nezávislé hledání: ověří fakta všech témat najednou.
async function overTemata(r, moje, cile = temata) {
  const AI = window.DHAI;
  const tato = cile;
  try {
    const k = await AI.hledatNaWebu({
      casovyLimit: 45000,
      system: `Jsi přísný fact-checker hokejové redakce. Nezávisle ověř fakta vyhledáváním na webu. Dnešní datum: ${AI.dnes()}.
Za "overeno" označ téma jen tehdy, když jsi našel potvrzení klíčových čísel, dat, týmů i soupeřů.
Pokud cokoliv nesedí (rok, den a měsíc, tým, soupeř, číslo, pořadí), je to "rozpor" a napiš, co je správně.`,
      zadani: `Ověř tato témata:
${JSON.stringify(cile.map((t, id) => ({ id, titulek: t.titulek, datum: t.datum, fakta: t.fakta })), null, 1)}

Odpověz POUZE blokem \`\`\`json s polem:
[{"id": 0, "stav": "overeno" | "rozpor" | "nejiste", "problem": "u rozporu co nesedí a jak je to správně, u nejistého co se nepodařilo potvrdit, jinak prázdné"}]`,
    });
    if (moje !== hledani) return;
    const data = AI.jsonZTextu(k.text);
    for (const v of Array.isArray(data) ? data : []) {
      const t = cile[Number(v.id)];
      if (t) t.kontrola = { stav: ["overeno", "rozpor", "nejiste"].includes(v.stav) ? v.stav : "nejiste", problem: v.problem || "" };
    }
    cile.forEach((t) => { if (!t.kontrola) t.kontrola = { stav: "nejiste", problem: "kontrola téma vynechala" }; });
  } catch (e) {
    if (moje !== hledani) return;
    tato.forEach((t) => { t.kontrola = { stav: "chyba", problem: e.message }; });
  }
  if (moje !== hledani) return;
  const poradi = { overeno: 0, nejiste: 1, chyba: 1, rozpor: 2 };
  // témata z odkazů nahoře, pak ověřená
  temata.sort((x, y) => (x.zOdkazu ? 0 : 1) - (y.zOdkazu ? 0 : 1) || (poradi[x.kontrola?.stav] ?? 1) - (poradi[y.kontrola?.stav] ?? 1));
  vykresli(r);
  const ok = cile.filter((t) => t.kontrola?.stav === "overeno").length;
  const spatne = cile.filter((t) => t.kontrola?.stav === "rozpor").length;
  if (cile.every((t) => t.kontrola?.stav === "chyba")) return; // chybu kontroly ukazují odznaky
  if (cile.every((t) => t.zOdkazu)) {
    odkazZprava(`Témata z odkazu: ${cile.length} · ✅ ověřeno ${ok}${spatne ? ` · ❌ rozpor ${spatne} (zkontroluj, co nesedí)` : ""}. Níž v seznamu vyber <b>✍️ Post</b>, <b>🎞️ Carousel</b>, <b>🎬 Reel</b> nebo <b>📆 Do plánu</b>.`, spatne ? "varovani" : "ok");
    return;
  }
  zprava(`Nalezeno ${cile.length} témat · ✅ ověřeno ${ok}${spatne ? ` · ❌ rozpor ${spatne} (ty raději nepoužívej)` : ""}. Vyber formát: <b>✍️ Post</b>, <b>🎞️ Carousel</b> nebo <b>🎬 Reel</b>, případně si téma ulož <b>📆 Do plánu</b>${temata.some(jeDnesniDen) ? " (u dnešních výročí i <b>📅 Dnes před lety</b>)" : ""}.`, spatne ? "varovani" : "ok");
}

function zadaniZTematu(t) {
  return `${t.titulek}${t.datum ? ` (${t.datum})` : ""}
Ověřená fakta (používej jen tato, nic nepřidávej):
${t.fakta.map((f) => `- ${f}`).join("\n")}
Zdroje: ${(t.zdroje || []).map((z) => z.titulek).join(", ") || "neuvedeny"}${t.zOdkazu ? `\nPůvodní článek / příspěvek: ${t.zOdkazu}` : ""}${t.kontrola?.stav === "rozpor" ? `
POZOR – kontrola faktů našla rozpor: ${t.kontrola.problem}. Použij opravené údaje.` : ""}`;
}

// ------------------------------------------------------- téma z odkazu --
// Redaktor vloží odkaz (článek, Facebook, Instagram…), případně text a screenshoty.
// AI obsah přečte (web_fetch / URL context), fakta ověří hledáním a vrátí témata ve stejném tvaru.

const KLIC_ODKAZY = "dhpf_odkazy";
const ZAVRENE = /(^|\.)(facebook\.com|fb\.com|fb\.watch|instagram\.com|threads\.net|x\.com|twitter\.com|tiktok\.com)$/i;
let screenshoty = []; // { mime, data, nahled }

function domenaOdkazu(u) { try { return new URL(u).hostname.replace(/^(www|m|mobile)\./, ""); } catch { return "odkaz"; } }
const jeZavreny = (u) => { try { return ZAVRENE.test(new URL(u).hostname); } catch { return false; } };

// Odkaz bez sledovacích parametrů (mibextid, rdid, share_url, fbclid, utm_*…).
function cistyOdkaz(u) {
  try {
    const x = new URL(String(u).trim().replace(/[),.;!?]+$/, ""));
    if (!/^https?:$/.test(x.protocol)) return "";
    for (const k of [...x.searchParams.keys()]) {
      if (/^(utm_|__)/.test(k) || ["mibextid", "rdid", "share_url", "fbclid", "igsh", "igshid", "si", "ref", "refsrc", "_rdr", "s"].includes(k)) x.searchParams.delete(k);
    }
    x.hash = "";
    return x.toString();
  } catch { return ""; }
}
const odkazyZTextu = (text) => [...new Set((String(text).match(/https?:\/\/[^\s<>"']+/gi) || []).map(cistyOdkaz).filter(Boolean))];

function nactiOdkazy() { try { return JSON.parse(localStorage.getItem(KLIC_ODKAZY)) || []; } catch { return []; } }
function ulozOdkazy(seznam) { try { localStorage.setItem(KLIC_ODKAZY, JSON.stringify(seznam.slice(0, 60))); } catch { /* plné úložiště */ } }

function pridejDoSeznamu(url, text, zmena = {}) {
  const seznam = nactiOdkazy();
  let p = seznam.find((x) => x.url === url);
  if (!p) { p = { url, text: "", cas: Date.now(), stav: "novy" }; seznam.unshift(p); }
  if (text) p.text = text;
  Object.assign(p, zmena);
  ulozOdkazy(seznam);
  vykresliOdkazy();
}

function vykresliOdkazy() {
  const seznam = nactiOdkazy();
  const el = $("#tOdkazySeznam");
  if (!seznam.length) { el.innerHTML = ""; return; }
  const kdy = (c) => new Date(c).toLocaleString("cs-CZ", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });
  el.innerHTML = `<h3>Uložené odkazy (${seznam.length})</h3>` + seznam.map((p, i) => `
    <div class="to-polozka">
      <span>${p.stav === "hotovo" ? "✅" : "🔗"}</span>
      <div class="to-info">
        <a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(domenaOdkazu(p.url))} · ${esc(p.url.replace(/^https?:\/\/(www\.)?[^/]+/, "") || "/")}</a>
        <small>${kdy(p.cas)}${p.stav === "hotovo" ? ` · zpracováno${p.pocet ? ` (${p.pocet} ${p.pocet === 1 ? "téma" : p.pocet < 5 ? "témata" : "témat"})` : ""}` : " · čeká"}${p.text ? ` · ${esc(p.text.slice(0, 90))}` : ""}</small>
      </div>
      <button type="button" class="btn small ghost" data-odkaz-vem="${i}" title="Načíst do formuláře">${p.stav === "hotovo" ? "↻ Znovu" : "✨ Zpracovat"}</button>
      <button type="button" class="btn small ghost" data-odkaz-smaz="${i}" title="Odebrat ze seznamu">🗑️</button>
    </div>`).join("");
}

function vykresliScreenshoty() {
  $("#tOdkazFotky").innerHTML = screenshoty.map((s, i) => `
    <div class="to-nahled"><img src="${s.nahled}" alt="screenshot ${i + 1}"><button type="button" data-odeber-shot="${i}" title="Odebrat">×</button></div>`).join("");
}

async function pridejScreenshoty(soubory) {
  const AI = window.DHAI;
  for (const f of soubory) {
    if (!f.type.startsWith("image/") || screenshoty.length >= 4) continue;
    try {
      const o = await AI.obrazekProAI(f, 1600, 0.85);
      screenshoty.push({ ...o, nahled: `data:${o.mime};base64,${o.data}` });
    } catch (e) { odkazZprava(esc(e.message), "chyba"); }
  }
  vykresliScreenshoty();
}

function odkazZprava(html, druh = "") {
  const el = $("#tOdkazZprava");
  el.innerHTML = html;
  el.className = "zprava " + druh;
  el.hidden = !html;
}

function ulozNaPozdeji() {
  const odkazy = odkazyZTextu($("#tOdkazy").value);
  if (!odkazy.length) { odkazZprava("Vlož odkaz začínající https://", "chyba"); return; }
  const text = $("#tOdkazText").value.trim();
  odkazy.forEach((u) => pridejDoSeznamu(u, text));
  $("#tOdkazy").value = "";
  $("#tOdkazText").value = "";
  odkazZprava(`Uloženo do seznamu (${odkazy.length}). Až budeš chtít, klikni u odkazu na <b>✨ Zpracovat</b>.`, "ok");
}

async function temataZOdkazu() {
  const AI = window.DHAI;
  if (!AI.maKlic()) { odkazZprava('Potřebuje AI klíč (Claude nebo Gemini). <a href="#" data-jdi-na-ai>Nastavit klíč</a>', "chyba"); return; }
  const odkazy = odkazyZTextu($("#tOdkazy").value);
  const text = $("#tOdkazText").value.trim();
  if (!odkazy.length && !text && !screenshoty.length) { odkazZprava("Vlož odkaz (začíná https://), text příspěvku nebo screenshot.", "chyba"); return; }
  const zavrene = odkazy.filter(jeZavreny);
  const b = $("#tZOdkazu");
  const moje = ++hledani; // zastaví zápis běžícího hledání témat
  const obrazky = screenshoty.map(({ mime, data }) => ({ mime, data }));
  b.disabled = true;
  b.textContent = "Čtu odkaz…";
  const start = Date.now();
  const odpocet = setInterval(() => odkazZprava(`AI čte ${odkazy.length > 1 ? "odkazy" : obrazky.length && !odkazy.length ? "screenshot" : "odkaz"} a ověřuje fakta na webu… ${Math.round((Date.now() - start) / 1000)} s (obvykle do minuty)`), 1000);
  odkazZprava("AI čte obsah a ověřuje fakta na webu…");
  try {
    const r = await AI.hledatNaWebu({
      casovyLimit: 60000,
      obrazky,
      odkazy: odkazy.length > 0,
      system: `Jsi rešeršista Instagramu Deník hokeje (zajímavosti, milníky, rekordy, kuriozity a silné příběhy – ne zpravodajství).
Redaktor ti poslal článek nebo příspěvek, který ho zaujal. Postup:
1) Přečti obsah odkazů nástrojem na čtení stránek (web_fetch / URL context). Facebook, Instagram a X často bez přihlášení
   nejdou přečíst – pak vycházej z textu a screenshotů od redaktora (screenshoty jsou přiložené obrázky, přečti z nich text).
2) Vyber z obsahu to nejzajímavější pro fanoušky hokeje.
3) Klíčová fakta (čísla, data, jména, týmy, soupeře) ověř a doplň hledáním na webu. Co v obsahu ani ve zdrojích není, nepiš.
Piš česky, i když je článek v jiném jazyce. Dnešní datum: ${AI.dnes()}.
NIKDY nevymýšlej obsah podle adresy odkazu nebo podle toho, co by tam „asi“ mohlo být. Když obsah nemáš
(stránka nejde přečíst a redaktor nedal text ani screenshot), odpověz jen řádkem {"nenacteno": true, "duvod": "krátce proč"}.`,
      zadani: `${odkazy.length ? `Odkazy:\n${odkazy.map((u) => `- ${u}`).join("\n")}\n` : "Odkaz redaktor nedal.\n"}${text ? `Text / poznámka od redaktora:\n"""\n${text.slice(0, 6000)}\n"""\n` : ""}${obrazky.length ? `Přiloženo screenshotů: ${obrazky.length}.\n` : ""}
Udělej z toho 1–3 témata (víc jen když obsah opravdu nabízí víc samostatných příběhů).
Odpověz POUZE řádky JSON Lines – každé téma jeden řádek s jedním objektem, žádný jiný text:
{"titulek": "krátký úderný titulek", "datum": "kdy se to stalo (den. měsíc. rok, nebo rok; prázdné když není)", "fakta": ["krátké ověřené fakto", "…"] (2–5), "proc_zajimave": "1 věta", "format": "post" nebo "carousel", "odkaz": "URL odkazu, ze kterého téma je (nebo prázdné)"}`,
    });
    clearInterval(odpocet);
    if (moje !== hledani) return;
    const objekty = AI.objektyZTextu(r.text);
    const nenacteno = objekty.find((o) => o?.nenacteno);
    const nalezene = objekty.filter((t) => t && t.titulek && Array.isArray(t.fakta));
    const neprectene = (r.nactene || []).filter((n) => !n.ok).map((n) => n.url);
    if (!nalezene.length) {
      const proc = nenacteno?.duvod ? ` (${esc(nenacteno.duvod)})` : "";
      odkazZprava(zavrene.length || neprectene.length
        ? `AI odkaz nepřečetla${proc}. ${zavrene.length ? "Facebook / Instagram / X bez přihlášení obsah neukáže." : ""} Zkopíruj prosím text příspěvku do pole <b>Text příspěvku</b> nebo přidej <b>📷 screenshot</b> a zkus to znovu.`
        : `Z obsahu se nepodařilo udělat téma${proc}. Zkus přidat text příspěvku nebo screenshot.`, "varovani");
      return;
    }
    const nova = nalezene.map((t) => {
      const fakta = (t.fakta || []).filter(Boolean);
      const puvod = cistyOdkaz(t.odkaz) || odkazy[0] || "";
      const zWebu = AI.zdrojeProText(r, [t.titulek, ...fakta, t.proc_zajimave].join(" "))
        .filter((z) => cistyOdkaz(z.uri) !== puvod);
      const zdroje = [...(puvod ? [{ titulek: `🔗 ${domenaOdkazu(puvod)} (původní)`, uri: puvod }] : []), ...zWebu];
      return { ...t, fakta, zdroje, zOdkazu: puvod || null };
    });
    temata = [...nova, ...temata];
    vykresli(r);
    ulozVysledek("odkaz", r);
    odkazy.forEach((u) => pridejDoSeznamu(u, text, { stav: "hotovo", pocet: nova.filter((t) => t.zOdkazu === u).length || nova.length, zpracovano: Date.now() }));
    $("#tOdkazy").value = "";
    $("#tOdkazText").value = "";
    screenshoty = [];
    vykresliScreenshoty();
    const varovani = neprectene.length && !text && !obrazky.length
      ? " ⚠️ Stránku se nepodařilo přečíst celou – fakta jsou jen z hledání na webu, zkontroluj je."
      : "";
    odkazZprava(`Hotovo za ${Math.round((Date.now() - start) / 1000)} s: ${nova.length} ${nova.length === 1 ? "téma" : nova.length < 5 ? "témata" : "témat"} – najdeš ${nova.length === 1 ? "ho" : "je"} níž nahoře v seznamu. Druhá kontrola faktů běží na pozadí.${varovani}`, varovani ? "varovani" : "ok");
    $("#tSeznam").scrollIntoView({ behavior: "smooth", block: "start" });
    overTemata(r, moje, nova).then(() => { if (moje === hledani) ulozVysledek("odkaz", r); });
  } catch (e) {
    odkazZprava(esc(e.message), "chyba");
  } finally {
    clearInterval(odpocet);
    b.disabled = false;
    b.textContent = "✨ Udělat z toho témata";
  }
}

function initOdkazy() {
  vykresliOdkazy();
  $("#tZOdkazu").addEventListener("click", temataZOdkazu);
  $("#tOdkazUloz").addEventListener("click", ulozNaPozdeji);
  $("#tOdkazFoto").addEventListener("change", (e) => { pridejScreenshoty([...e.target.files]); e.target.value = ""; });
  $("#tOdkazKarta").addEventListener("paste", (e) => {
    const soubory = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith("image/"));
    if (soubory.length) { e.preventDefault(); pridejScreenshoty(soubory); }
  });
  $("#tOdkazKarta").addEventListener("dragover", (e) => e.preventDefault());
  $("#tOdkazKarta").addEventListener("drop", (e) => {
    const soubory = [...(e.dataTransfer?.files || [])].filter((f) => f.type.startsWith("image/"));
    if (soubory.length) { e.preventDefault(); pridejScreenshoty(soubory); }
  });
  $("#tOdkazy").addEventListener("input", () => {
    const z = odkazyZTextu($("#tOdkazy").value).filter(jeZavreny);
    if (z.length && !$("#tOdkazText").value.trim() && !screenshoty.length) {
      odkazZprava(`${esc(domenaOdkazu(z[0]))} AI bez přihlášení většinou nepřečte. Pro jistotu zkopíruj text příspěvku do pole níž nebo přidej screenshot (fotka s popiskem).`, "varovani");
    } else if ($("#tOdkazZprava").classList.contains("varovani")) odkazZprava("");
  });
  $("#tOdkazKarta").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.odeberShot !== undefined) { screenshoty.splice(Number(b.dataset.odeberShot), 1); vykresliScreenshoty(); return; }
    const seznam = nactiOdkazy();
    if (b.dataset.odkazSmaz !== undefined) { seznam.splice(Number(b.dataset.odkazSmaz), 1); ulozOdkazy(seznam); vykresliOdkazy(); return; }
    if (b.dataset.odkazVem !== undefined) {
      const p = seznam[Number(b.dataset.odkazVem)];
      if (!p) return;
      $("#tOdkazy").value = p.url;
      $("#tOdkazText").value = p.text || "";
      temataZOdkazu();
    }
  });
}

// ---------------------------------------------------------- ověření faktů --

async function overFakta(text, cil, tlacitko) {
  const AI = window.DHAI;
  const vypis = (html, druh = "") => { cil.innerHTML = html ? `<div class="zprava ${druh}">${html}</div>` : ""; };
  if (!text.trim()) { vypis("Není co ověřovat – nejdřív vytvoř text.", "chyba"); return; }
  if (!AI.maKlic()) { vypis('Ověřování potřebuje AI klíč (Claude nebo Gemini). <a href="#" data-jdi-na-ai>Nastavit klíč</a>', "chyba"); return; }
  const puvodni = tlacitko.textContent;
  tlacitko.disabled = true;
  tlacitko.textContent = "Ověřuju…";
  vypis("AI ověřuje fakta na webu… (obvykle 15–60 s)");
  try {
    const r = await AI.hledatNaWebu({
      system: `Jsi fact-checker hokejové redakce. Každé faktické tvrzení ověř vyhledáváním na webu. Dnešní datum: ${AI.dnes()}.
Ověřuj jen fakta (výsledky, skóre, čísla, statistiky, jména, týmy, data, citace, přestupy) – ne názory a emoce.`,
      zadani: `Ověř tento text příspěvku:
"""
${text.split(/\n{2,}/).filter((o) => !/^(ℹ️ Zdroj|📸 Foto)/u.test(o.trim())).join("\n\n").replace(/#[\p{L}\p{N}_]+/gu, "").trim()}
"""

Odpověz POUZE blokem \`\`\`json s polem:
[{"tvrzeni": "ověřované tvrzení", "stav": "potvrzeno" | "rozpor" | "nepotvrzeno",
  "spravne": "u rozporu správná hodnota podle zdrojů, jinak prázdné", "poznamka": "krátké vysvětlení"}]`,
    });
    const data = AI.jsonZTextu(r.text);
    const polozky = (Array.isArray(data) ? data : data.tvrzeni || []).map((p) => ({
      ...p, zdroje: AI.zdrojeProText(r, [p.tvrzeni, p.spravne, p.poznamka].join(" ")),
    }));
    if (!polozky.length) { vypis("V textu jsem nenašel žádná fakta k ověření.", "ok"); return; }
    const ikona = { potvrzeno: "✅", rozpor: "❌", nepotvrzeno: "⚠️" };
    const spatne = polozky.filter((p) => p.stav !== "potvrzeno").length;
    vypis(`<b>${spatne ? `${spatne} z ${polozky.length} tvrzení potřebuje kontrolu` : `Všech ${polozky.length} tvrzení potvrzeno`}</b>
      <ul class="overeni">${polozky.map((p) => `
        <li><span>${ikona[p.stav] || "⚠️"}</span><div><b>${esc(p.tvrzeni)}</b>
          ${p.stav === "rozpor" && p.spravne ? `<br>Správně: <b>${esc(p.spravne)}</b>` : ""}
          ${p.poznamka ? `<br><span class="muted">${esc(p.poznamka)}</span>` : ""}
          <br><small>Zdroje: ${zdrojeHtml(p.zdroje)}</small></div></li>`).join("")}</ul>`, spatne ? "varovani" : "ok");
  } catch (e) {
    vypis(esc(e.message), "chyba");
  } finally {
    tlacitko.disabled = false;
    tlacitko.textContent = puvodni;
  }
}

function init() {
  $("#tDnesVolba").textContent = `Výročí – stalo se ${dnesniDen()} (v jakémkoli roce)`;
  nactiPosledni();
  initOdkazy();
  $("#tHledej").addEventListener("click", najdiTemata);
  $("#tSeznam").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.post) {
      const t = temata[Number(b.dataset.post)];
      window.DHPost.navrhni(zadaniZTematu(t), t.zdroje || []);
    } else if (b.dataset.vyroci) {
      const t = temata[Number(b.dataset.vyroci)];
      window.DHVyroci.navrhni(zadaniZTematu(t), t.zdroje || []);
    } else if (b.dataset.reel) {
      const t = temata[Number(b.dataset.reel)];
      window.DHShell?.reel(t.titulek, zadaniZTematu(t));
    } else if (b.dataset.doPlanu) {
      const t = temata[Number(b.dataset.doPlanu)];
      window.DHPlan?.pridej({ nazev: t.titulek, format: jeDnesniDen(t) ? "vyroci" : "post", zadani: zadaniZTematu(t), zdroje: t.zdroje || [] });
      window.DHToast?.("Téma je v zásobníku nápadů 📆 – najdeš ho v Plánu.");
      b.textContent = "✓ V plánu";
      b.disabled = true;
    } else if (b.dataset.carousel) {
      const t = temata[Number(b.dataset.carousel)];
      window.DHCarousel.navrhni(zadaniZTematu(t), t.zdroje || [], Math.min(6, Math.max(3, t.fakta.length)));
    }
  });
  $("#overitPost").addEventListener("click", (e) => overFakta($("#text").value, $("#overeniPost"), e.currentTarget));
  $("#cOverit").addEventListener("click", (e) => overFakta(window.DHCarousel.textKOvereni(), $("#cOvereni"), e.currentTarget));
  $("#vOverit").addEventListener("click", (e) => overFakta(window.DHVyroci.textKOvereni(), $("#vOvereni"), e.currentTarget));
}

init();
})();
