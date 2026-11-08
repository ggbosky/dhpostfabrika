// Živé hledání témat na webu a ověřování faktů – vždy se zdroji.
(() => {
"use strict";

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const ZAMERENI = {
  vse: "český hokej obecně (extraliga, Češi v NHL, reprezentace)",
  extraliga: "česká Tipsport extraliga",
  nhl: "čeští a slovenští hráči v NHL",
  repre: "česká hokejová reprezentace",
  prestupy: "přestupy, podpisy smluv a zranění v českém hokeji a u Čechů v NHL",
};
const OBDOBI = {
  "2": "za posledních 48 hodin",
  "7": "za posledních 7 dní",
  vyroci: "VÝROČÍ: co se v historii českého a světového hokeje stalo přesně v dnešní den (a v nejbližších dnech) – kulatá výročí slavných zápasů, titulů, rekordů a osobností",
};

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
  const vlastni = $("#tVlastni").value.trim();
  const b = $("#tHledej");
  b.disabled = true;
  b.textContent = "Hledám na webu…";
  zprava("AI prohledává web a ověřuje fakta… (obvykle 15–60 s)");
  $("#tSeznam").innerHTML = "";
  try {
    const r = await AI.hledatNaWebu({
      system: `Jsi rešeršista redakce Instagramu Deník hokeje. Hledáš na webu (Google) aktuální a ověřitelné hokejové
zprávy a zajímavosti, ze kterých půjde udělat poutavý post. Dnešní datum: ${AI.dnes()}.
Zásady:
- Uváděj JEN fakta, která jsi našel ve zdrojích: konkrétní skóre, čísla, jména, data. Nic nedomýšlej.
- Každé téma musí být podložené alespoň jedním důvěryhodným zdrojem (hokej.cz, idnes.cz, isport.cz, sport.cz,
  livesport.cz, ct24/ctsport, nhl.com, eliteprospects, oficiální weby klubů apod.).
- Když si nejsi jistý datem nebo číslem, téma vynech.
- Vybírej to, co fanoušky opravdu zaujme: drama, rekordy a milníky, výkony Čechů, přestupy, zranění klíčových
  hráčů, zajímavé statistiky, výročí.`,
      zadani: `Najdi 6 nejzajímavějších témat. Zaměření: ${zamereni}. Období: ${obdobi}.${vlastni ? `\nUpřesnění od redaktora: ${vlastni}` : ""}

Odpověz POUZE blokem \`\`\`json s polem objektů:
[{"titulek": "krátký titulek", "datum": "den. měsíc. rok události", "fakta": ["věta s konkrétním ověřeným faktem", "…"],
  "proc_zajimave": "1 věta, proč to fanoušky zaujme", "format": "post" nebo "carousel"}]`,
    });
    const data = AI.jsonZTextu(r.text);
    temata = (Array.isArray(data) ? data : data.temata || []).map((t) => {
      const fakta = (t.fakta || []).filter(Boolean);
      const zdroje = AI.zdrojeProText(r, [t.titulek, ...fakta, t.proc_zajimave].join(" "));
      return { ...t, fakta, zdroje };
    });
    if (!temata.length) { zprava("Nic jsem nenašel. Zkus jiné zaměření nebo delší období.", "varovani"); return; }
    vykresli(r);
    const bez = temata.filter((t) => !t.zdroje.length).length;
    zprava(`Nalezeno ${temata.length} témat${bez ? ` – u ${bez} chybí přímý zdroj, ty ověř ručně` : ", každé se zdrojem"}. Klikni na <b>✍️ Post</b> nebo <b>🎞️ Carousel</b>.`, bez ? "varovani" : "ok");
  } catch (e) {
    zprava(esc(e.message), "chyba");
  } finally {
    b.disabled = false;
    b.textContent = "🔎 Najít témata";
  }
}

function vykresli(r) {
  $("#tSeznam").innerHTML = temata.map((t, i) => `
    <article class="tema">
      <div class="tema-hlava">
        <h3>${esc(t.titulek)}</h3>
        ${t.datum ? `<span class="muted">${esc(t.datum)}</span>` : ""}
      </div>
      <ul>${t.fakta.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>
      ${t.proc_zajimave ? `<p class="proc">💡 ${esc(t.proc_zajimave)}</p>` : ""}
      <p class="zdroje">Zdroje: ${zdrojeHtml(t.zdroje)}</p>
      <div class="akce" style="margin-top:10px">
        <button type="button" class="btn small" data-post="${i}">✍️ Post</button>
        <button type="button" class="btn small ghost" data-carousel="${i}">🎞️ Carousel${t.format === "carousel" ? " (doporučeno)" : ""}</button>
      </div>
    </article>`).join("") +
    (r.dotazy?.length ? `<p class="muted" style="font-size:12px">Hledáno: ${r.dotazy.map(esc).join(" · ")}</p>` : "");
}

function zadaniZTematu(t) {
  return `${t.titulek}${t.datum ? ` (${t.datum})` : ""}
Ověřená fakta (používej jen tato, nic nepřidávej):
${t.fakta.map((f) => `- ${f}`).join("\n")}
Zdroje: ${t.zdroje.map((z) => z.titulek).join(", ") || "neuvedeny"}`;
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
