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
  vyroci: "VÝROČÍ: události, které se staly přesně v dnešní den nebo v nejbližších 7 dnech (v libovolném roce) – ideálně kulatá výročí",
  historie: "kdykoliv v historii hokeje",
  aktualne: "aktuální dění za posledních 14 dní (nové rekordy, právě dosažené milníky, unikátní statistiky)",
};
const KDE = {
  cz: "český hokej a Češi ve světě (NHL, KHL, reprezentace, extraliga)",
  svet: "světový hokej (NHL, olympiády, MS) – nejlépe s českou stopou, ale není podmínkou",
};
const ZDROJE_TIPY = "thehockeywriters.com, sport.ceskatelevize.cz, sportrevue.isport.blesk.cz/hokej, nhl.cz, nhl.com, hokej.cz, idnes.cz, isport.cz, hockey-reference.com, quanthockey.com, eliteprospects.com, iihf.com, Wikipedie";

let temata = [];

function zdrojeHtml(zdroje) {
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
  if (!AI.maKlic()) { zprava('Hledání potřebuje bezplatný Gemini klíč. <a href="#" data-jdi-na-ai>Nastavit klíč</a>', "chyba"); return; }
  const zamereni = ZAMERENI[$("#tZamereni").value];
  const obdobi = OBDOBI[$("#tObdobi").value];
  const oblast = KDE[$("#tKde").value];
  const vlastni = $("#tVlastni").value.trim();
  const b = $("#tHledej");
  b.disabled = true;
  b.textContent = "Hledám na webu…";
  zprava("AI prohledává web a hledá zajímavosti se zdroji… (obvykle 15–60 s)");
  $("#tSeznam").innerHTML = "";
  try {
    const r = await AI.hledatNaWebu({
      system: `Jsi rešeršista Instagramu Deník hokeje. Účet NEDĚLÁ zpravodajství (výsledky, přestupy, zranění),
ale zajímavosti: milníky, rekordy, statistické kuriozity, výročí a silné historické příběhy – věci, u kterých
fanoušek řekne „to jsem nevěděl“. Hledáš je na webu (Google). Dnešní datum: ${AI.dnes()}.
Zásady:
- Uváděj JEN fakta, která jsi našel ve zdrojích: přesná čísla, data, jména, soupeře. Nic nedomýšlej.
- Každé téma musí být podložené alespoň jedním důvěryhodným zdrojem. Doporučené zdroje (ale můžeš hledat kdekoliv):
  ${ZDROJE_TIPY}.
- Když si nejsi jistý číslem nebo datem, téma vynech.
- Žádná běžná zpravodajská témata (výsledky kola, přestupy, zranění), pokud v nich není rekord nebo milník.`,
      zadani: `Najdi 6 nejzajímavějších témat.
Druh: ${zamereni}.
Období: ${obdobi}.
Oblast: ${oblast}.${vlastni ? `\nUpřesnění od redaktora: ${vlastni}` : ""}

Odpověz POUZE blokem \`\`\`json s polem objektů:
[{"titulek": "krátký úderný titulek", "datum": "kdy se to stalo (den. měsíc. rok, nebo rok)", "fakta": ["věta s konkrétním ověřeným faktem", "…" (3–5 faktů)],
  "proc_zajimave": "1 věta, proč to fanoušky zaujme", "format": "post" nebo "carousel" (příběh s více fakty = carousel)}]`,
    });
    const data = AI.jsonZTextu(r.text);
    temata = (Array.isArray(data) ? data : data.temata || []).map((t) => {
      const fakta = (t.fakta || []).filter(Boolean);
      const zdroje = AI.zdrojeProText(r, [t.titulek, ...fakta, t.proc_zajimave].join(" "));
      return { ...t, fakta, zdroje };
    });
    if (!temata.length) { zprava("Nic jsem nenašel. Zkus jiné zaměření nebo delší období.", "varovani"); return; }
    vykresli(r);
    zprava(`Nalezeno ${temata.length} témat. Teď je AI ještě jednou nezávisle ověřuje…`, "varovani");
    b.textContent = "Ověřuju fakta…";
    await overTemata(r);
  } catch (e) {
    zprava(esc(e.message), "chyba");
  } finally {
    b.disabled = false;
    b.textContent = "🔎 Najít témata";
  }
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
        <button type="button" class="btn small ghost" data-carousel="${i}">🎞️ Carousel${t.format === "carousel" ? " (doporučeno)" : ""}</button>
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
async function overTemata(r) {
  const AI = window.DHAI;
  try {
    const k = await AI.hledatNaWebu({
      system: `Jsi přísný fact-checker hokejové redakce. Nezávisle ověř fakta vyhledáváním na webu. Dnešní datum: ${AI.dnes()}.
Za "overeno" označ téma jen tehdy, když jsi našel potvrzení klíčových čísel, dat, týmů i soupeřů.
Pokud cokoliv nesedí (rok, datum, tým, soupeř, číslo, pořadí), je to "rozpor" a napiš, co je správně.`,
      zadani: `Ověř tato témata:
${JSON.stringify(temata.map((t, id) => ({ id, titulek: t.titulek, datum: t.datum, fakta: t.fakta })), null, 1)}

Odpověz POUZE blokem \`\`\`json s polem:
[{"id": 0, "stav": "overeno" | "rozpor" | "nejiste", "problem": "u rozporu co nesedí a jak je to správně, u nejistého co se nepodařilo potvrdit, jinak prázdné"}]`,
    });
    const data = AI.jsonZTextu(k.text);
    for (const v of Array.isArray(data) ? data : []) {
      const t = temata[Number(v.id)];
      if (t) t.kontrola = { stav: ["overeno", "rozpor", "nejiste"].includes(v.stav) ? v.stav : "nejiste", problem: v.problem || "" };
    }
    temata.forEach((t) => { if (!t.kontrola) t.kontrola = { stav: "nejiste", problem: "kontrola téma vynechala" }; });
  } catch (e) {
    temata.forEach((t) => { t.kontrola = { stav: "chyba", problem: e.message }; });
  }
  vykresli(r);
  const ok = temata.filter((t) => t.kontrola.stav === "overeno").length;
  const spatne = temata.filter((t) => t.kontrola.stav === "rozpor").length;
  zprava(`Nalezeno ${temata.length} témat · ✅ ověřeno ${ok}${spatne ? ` · ❌ rozpor ${spatne} (ty raději nepoužívej)` : ""}. Klikni na <b>✍️ Post</b> nebo <b>🎞️ Carousel</b>.`, spatne ? "varovani" : "ok");
}

function zadaniZTematu(t) {
  return `${t.titulek}${t.datum ? ` (${t.datum})` : ""}
Ověřená fakta (používej jen tato, nic nepřidávej):
${t.fakta.map((f) => `- ${f}`).join("\n")}
Zdroje: ${t.zdroje.map((z) => z.titulek).join(", ") || "neuvedeny"}${t.kontrola?.stav === "rozpor" ? `
POZOR – kontrola faktů našla rozpor: ${t.kontrola.problem}. Použij opravené údaje.` : ""}`;
}

// ---------------------------------------------------------- ověření faktů --

async function overFakta(text, cil, tlacitko) {
  const AI = window.DHAI;
  const vypis = (html, druh = "") => { cil.innerHTML = html ? `<div class="zprava ${druh}">${html}</div>` : ""; };
  if (!text.trim()) { vypis("Není co ověřovat – nejdřív vytvoř text.", "chyba"); return; }
  if (!AI.maKlic()) { vypis('Ověřování potřebuje bezplatný Gemini klíč. <a href="#" data-jdi-na-ai>Nastavit klíč</a>', "chyba"); return; }
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
  $("#tHledej").addEventListener("click", najdiTemata);
  $("#tSeznam").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.post) {
      const t = temata[Number(b.dataset.post)];
      window.DHPost.navrhni(zadaniZTematu(t), t.zdroje);
    } else if (b.dataset.carousel) {
      const t = temata[Number(b.dataset.carousel)];
      window.DHCarousel.navrhni(zadaniZTematu(t), t.zdroje, Math.min(6, Math.max(3, t.fakta.length)));
    }
  });
  $("#overitPost").addEventListener("click", (e) => overFakta($("#text").value, $("#overeniPost"), e.currentTarget));
  $("#cOverit").addEventListener("click", (e) => overFakta(window.DHCarousel.textKOvereni(), $("#cOvereni"), e.currentTarget));
}

init();
})();
