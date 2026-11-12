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
  $("#tSeznam").innerHTML = "";
  try {
    const r = await AI.hledatNaWebuProud({
      priTextu: (text) => {
        if (moje !== hledani) return;
        const nalezene = AI.objektyZTextu(text).filter((t) => t && t.titulek && (!jenDnes || jeDnesniDen(t)));
        if (nalezene.length > videno) {
          videno = nalezene.length;
          temata = nalezene.map((t) => ({ ...t, fakta: (t.fakta || []).filter(Boolean), zdroje: null }));
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
    temata = data.map((t) => {
      const fakta = (t.fakta || []).filter(Boolean);
      const zdroje = AI.zdrojeProText(r, [t.titulek, ...fakta, t.proc_zajimave].join(" "));
      return { ...t, fakta, zdroje };
    });
    if (!temata.length) {
      vykresli({});
      zprava(jenDnes ? `Na ${dnesniDen()} jsem tentokrát nenašel nic, co by šlo podložit zdrojem${vyrazeno ? ` (${vyrazeno} témat s jiným datem jsem vyřadil)` : ""}. Zkus to znovu nebo jiný druh / oblast.` : "Nic jsem nenašel. Zkus jiné zaměření nebo delší období.", "varovani");
      return;
    }
    clearInterval(odpocet);
    vykresli(r);
    ulozVysledek(klicFiltru, r);
    b.disabled = false;
    b.textContent = "🔎 Najít témata";
    zprava(`${temata.length === 1 ? "Nalezeno" : temata.length < 5 ? "Nalezena" : "Nalezeno"} ${pocetTemat(temata.length)} za ${Math.round((Date.now() - start) / 1000)} s${jenDnes ? `, ${temata.length === 1 ? "z" : "všechna z"} ${dnesniDen()}` : ""}${vyrazeno ? ` (${vyrazeno} s jiným datem vyřazeno)` : ""}${r.preruseno ? " (Google odpovídal pomalu, ukazuji, co stihl)" : ""}. Můžeš rovnou tvořit – druhá kontrola faktů běží na pozadí a odznaky se doplní samy.`, "ok");
    overTemata(r, moje).then(() => { if (moje === hledani) ulozVysledek(klicFiltru, r); }); // na pozadí, neblokuje
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
async function overTemata(r, moje) {
  const AI = window.DHAI;
  const tato = temata;
  try {
    const k = await AI.hledatNaWebu({
      casovyLimit: 45000,
      system: `Jsi přísný fact-checker hokejové redakce. Nezávisle ověř fakta vyhledáváním na webu. Dnešní datum: ${AI.dnes()}.
Za "overeno" označ téma jen tehdy, když jsi našel potvrzení klíčových čísel, dat, týmů i soupeřů.
Pokud cokoliv nesedí (rok, den a měsíc, tým, soupeř, číslo, pořadí), je to "rozpor" a napiš, co je správně.`,
      zadani: `Ověř tato témata:
${JSON.stringify(temata.map((t, id) => ({ id, titulek: t.titulek, datum: t.datum, fakta: t.fakta })), null, 1)}

Odpověz POUZE blokem \`\`\`json s polem:
[{"id": 0, "stav": "overeno" | "rozpor" | "nejiste", "problem": "u rozporu co nesedí a jak je to správně, u nejistého co se nepodařilo potvrdit, jinak prázdné"}]`,
    });
    if (moje !== hledani) return;
    const data = AI.jsonZTextu(k.text);
    for (const v of Array.isArray(data) ? data : []) {
      const t = temata[Number(v.id)];
      if (t) t.kontrola = { stav: ["overeno", "rozpor", "nejiste"].includes(v.stav) ? v.stav : "nejiste", problem: v.problem || "" };
    }
    temata.forEach((t) => { if (!t.kontrola) t.kontrola = { stav: "nejiste", problem: "kontrola téma vynechala" }; });
  } catch (e) {
    if (moje !== hledani) return;
    tato.forEach((t) => { t.kontrola = { stav: "chyba", problem: e.message }; });
  }
  if (moje !== hledani) return;
  const poradi = { overeno: 0, nejiste: 1, chyba: 1, rozpor: 2 };
  temata.sort((x, y) => (poradi[x.kontrola?.stav] ?? 1) - (poradi[y.kontrola?.stav] ?? 1)); // ověřená nahoru
  vykresli(r);
  const ok = temata.filter((t) => t.kontrola.stav === "overeno").length;
  const spatne = temata.filter((t) => t.kontrola.stav === "rozpor").length;
  if (temata.every((t) => t.kontrola.stav === "chyba")) return; // chybu kontroly ukazují odznaky
  zprava(`Nalezeno ${temata.length} témat · ✅ ověřeno ${ok}${spatne ? ` · ❌ rozpor ${spatne} (ty raději nepoužívej)` : ""}. Vyber formát: <b>✍️ Post</b>, <b>🎞️ Carousel</b> nebo <b>🎬 Reel</b>, případně si téma ulož <b>📆 Do plánu</b>${temata.some(jeDnesniDen) ? " (u dnešních výročí i <b>📅 Dnes před lety</b>)" : ""}.`, spatne ? "varovani" : "ok");
}

function zadaniZTematu(t) {
  return `${t.titulek}${t.datum ? ` (${t.datum})` : ""}
Ověřená fakta (používej jen tato, nic nepřidávej):
${t.fakta.map((f) => `- ${f}`).join("\n")}
Zdroje: ${(t.zdroje || []).map((z) => z.titulek).join(", ") || "neuvedeny"}${t.kontrola?.stav === "rozpor" ? `
POZOR – kontrola faktů našla rozpor: ${t.kontrola.problem}. Použij opravené údaje.` : ""}`;
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
