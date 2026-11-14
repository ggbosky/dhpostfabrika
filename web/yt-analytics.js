// YouTube Analytics: kanál a videa za zvolené období (YouTube Analytics API), čísla za celou dobu (YouTube Data API),
// udržení diváků u videa, AI rozbor výkonu. Imprese a CTR miniatur API nevydává – zobrazí se jen ručně zapsané.
(() => {
"use strict";

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const Y = () => window.DHYouTube;
const AI = () => window.DHAI;
const toast = (t, d) => window.DHToast?.(t, d);

const OBDOBI = { 7: "7 dní", 28: "28 dní", 90: "90 dní", 365: "365 dní" };
let obdobi = 28, vlastni = null; // vlastni = { od, do }
let data = null, razeni = { klic: "views", smer: -1 }, vybraneVideo = null, udrzeni = null, aiVysledek = null, nacitam = false;

const iso = (d) => d.toISOString().slice(0, 10);
const cislo = (n) => (Number.isFinite(n) ? Math.round(n).toLocaleString("cs-CZ") : "–");
const kratce = (n) => (!Number.isFinite(n) ? "–" : n >= 1e6 ? `${(n / 1e6).toLocaleString("cs-CZ", { maximumFractionDigits: 1 })} mil.` : n >= 1e4 ? `${Math.round(n / 1e3)} tis.` : n >= 1e3 ? `${(n / 1e3).toLocaleString("cs-CZ", { maximumFractionDigits: 1 })} tis.` : Math.round(n).toLocaleString("cs-CZ"));
const doba = (s) => (!Number.isFinite(s) ? "–" : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`);
const pct = (x) => (!Number.isFinite(x) ? "–" : `${x.toLocaleString("cs-CZ", { maximumFractionDigits: 1 })} %`);

function rozsah() {
  if (vlastni?.od && vlastni?.do) return { od: vlastni.od, do: vlastni.do };
  // Analytics mají zpoždění ~2 dny → konec = předevčírem
  const konec = new Date(Date.now() - 2 * 864e5);
  return { od: iso(new Date(konec - (obdobi - 1) * 864e5)), do: iso(konec) };
}

const radky = (r) => (r.rows || []).map((row) => Object.fromEntries(r.columnHeaders.map((h, i) => [h.name, row[i]])));

async function nacti() {
  nacitam = true; vykresli();
  try {
    await window.DHYtStudio.zajistiKanal();
    const { od, do: dd } = rozsah();
    const souhrnM = "views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,subscribersGained,subscribersLost,likes,comments,shares";
    const [souhrn, denne, poVideich] = await Promise.all([
      Y().report({ startDate: od, endDate: dd, metrics: souhrnM }),
      Y().report({ startDate: od, endDate: dd, metrics: "views,estimatedMinutesWatched,subscribersGained", dimensions: "day", sort: "day" }),
      Y().report({ startDate: od, endDate: dd, metrics: "views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,subscribersGained,likes,comments", dimensions: "video", sort: "-views", maxResults: 50 }),
    ]);
    const videaRadky = radky(poVideich);
    const info = videaRadky.length ? await Y().videaPodleId(videaRadky.map((r) => r.video)) : [];
    const mapa = new Map(info.map((v) => [v.id, v]));
    data = {
      od, do: dd, cas: Date.now(),
      souhrn: radky(souhrn)[0] || {},
      denne: radky(denne),
      videa: videaRadky.map((r) => ({ ...r, info: mapa.get(r.video) })),
    };
    aiVysledek = null;
  } catch (e) {
    data = { chyba: e.message };
  } finally { nacitam = false; vykresli(); }
}

async function nactiUdrzeni(id) {
  vybraneVideo = id; udrzeni = null; vykresli();
  try {
    const { od, do: dd } = rozsah();
    const r = await Y().report({ startDate: "2010-01-01", endDate: dd, metrics: "audienceWatchRatio,relativeRetentionPerformance", dimensions: "elapsedVideoTimeRatio", filters: `video==${id}` });
    udrzeni = { body: radky(r), od };
  } catch (e) { udrzeni = { chyba: e.message }; }
  vykresli();
}

// ------------------------------------------------------------------ grafy --

function sloupce(body, hodnota, popis) {
  if (!body.length) return `<p class="muted">Za období nejsou data.</p>`;
  const W = 900, H = 220, L = 48, R = 10, T = 10, B = 26;
  const max = Math.max(...body.map(hodnota), 1);
  const krok = 10 ** Math.floor(Math.log10(max / 4 || 1));
  const k = [1, 2, 2.5, 5, 10].map((x) => x * krok).find((x) => max / 4 <= x) || krok;
  const ticky = []; for (let v = 0; v <= max + k * 0.01; v += k) ticky.push(v); if (ticky.at(-1) < max) ticky.push(ticky.at(-1) + k);
  const top = ticky.at(-1);
  const pas = (W - L - R) / body.length, s = Math.max(2, Math.min(24, pas - 2));
  const y = (v) => T + (H - T - B) * (1 - v / top);
  return `<div class="st-graf ya-graf"><svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(popis)}">
    ${ticky.map((t) => `<line class="st-gridline" x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}"/><text class="st-osa" x="${L - 6}" y="${y(t) + 4}" text-anchor="end">${kratce(t)}</text>`).join("")}
    ${body.map((b, i) => { const v = hodnota(b), x = L + i * pas + (pas - s) / 2, yy = y(v), h = y(0) - yy, r = Math.min(4, h / 2, s / 2);
      return `<path d="M${x},${y(0)}V${yy + r}Q${x},${yy} ${x + r},${yy}H${x + s - r}Q${x + s},${yy} ${x + s},${yy + r}V${y(0)}Z" fill="#e01e26"><title>${esc(b.day)}: ${cislo(v)}</title></path>`; }).join("")}
    ${[0, Math.floor(body.length / 2), body.length - 1].filter((v, i, a) => a.indexOf(v) === i).map((i) => `<text class="st-osa" x="${L + i * pas + pas / 2}" y="${H - 6}" text-anchor="middle">${new Date(body[i].day).toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric" })}</text>`).join("")}
  </svg></div>`;
}

function krivka(body) {
  if (!body.length) return `<p class="muted">YouTube pro toto video udržení nevydal (bývá až od určitého počtu zhlédnutí).</p>`;
  const W = 900, H = 220, L = 48, R = 10, T = 10, B = 26;
  const max = Math.max(1, ...body.map((b) => b.audienceWatchRatio));
  const top = Math.ceil(max * 10) / 10;
  const x = (r) => L + (W - L - R) * r, y = (v) => T + (H - T - B) * (1 - v / top);
  const d = body.map((b, i) => `${i ? "L" : "M"}${x(b.elapsedVideoTimeRatio).toFixed(1)},${y(b.audienceWatchRatio).toFixed(1)}`).join("");
  const ticky = [0, top / 2, top];
  return `<div class="st-graf ya-graf"><svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Udržení diváků v průběhu videa">
    ${ticky.map((t) => `<line class="st-gridline" x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}"/><text class="st-osa" x="${L - 6}" y="${y(t) + 4}" text-anchor="end">${Math.round(t * 100)} %</text>`).join("")}
    <path d="${d}L${x(body.at(-1).elapsedVideoTimeRatio)},${y(0)}L${x(body[0].elapsedVideoTimeRatio)},${y(0)}Z" fill="rgba(224,30,38,.10)"/>
    <path d="${d}" fill="none" stroke="#e01e26" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    ${[0, 0.25, 0.5, 0.75, 1].map((r) => `<text class="st-osa" x="${x(r)}" y="${H - 6}" text-anchor="${r === 0 ? "start" : r === 1 ? "end" : "middle"}">${Math.round(r * 100)} %</text>`).join("")}
  </svg></div>`;
}

// ------------------------------------------------------------- vykreslení --

function vykresli() {
  const el = $("#ytstatsObsah");
  if (!el) return;
  if (!Y().pripojeno()) {
    el.innerHTML = `<div class="card"><h2>YouTube Analytics</h2><p class="muted" style="margin-top:0">Dosah, doba sledování a udržení tvých videí přímo z YouTube Analytics API. Nejdřív připoj kanál v YouTube Studiu.</p>
      <div class="akce"><button type="button" class="btn" data-jdi="youtube">▶ Otevřít YouTube Studio</button></div></div>`;
    return;
  }
  const { od, do: dd } = rozsah();
  const s = data?.souhrn || {};
  const vid = data?.videa ? [...data.videa].sort((a, b) => ((a[razeni.klic] ?? -1) > (b[razeni.klic] ?? -1) ? 1 : -1) * razeni.smer) : [];
  const SL = [["views", "Zhlédnutí"], ["estimatedMinutesWatched", "Doba sledování (min)"], ["averageViewDuration", "Prům. doba"], ["averageViewPercentage", "Prům. % zhlédnuto"], ["subscribersGained", "Noví odběratelé"], ["likes", "To se mi líbí"]];
  el.innerHTML = `
    <div class="card st-lista">
      <div class="st-filtry" role="group" aria-label="Období">${Object.entries(OBDOBI).map(([k, n]) => `<button type="button" class="chip ${!vlastni && +k === obdobi ? "on" : ""}" data-ya-obdobi="${k}">${n}</button>`).join("")}</div>
      <div class="radek" style="gap:6px"><input type="date" id="yaOd" value="${esc(vlastni?.od || od)}" style="width:auto"><span class="muted">–</span><input type="date" id="yaDo" value="${esc(vlastni?.do || dd)}" style="width:auto">
        <button type="button" class="btn small ghost" data-ya="vlastni">Použít</button></div>
      <button type="button" class="btn small" data-ya="nacti" ${nacitam ? "disabled" : ""}>${nacitam ? "Načítám…" : "↻ Načíst"}</button>
    </div>
    ${data?.chyba ? `<p class="zprava chyba">${esc(data.chyba)}</p>` : ""}
    ${!data ? `<div class="card" style="margin-top:18px"><p class="muted" style="margin:0">Klikni na <b>↻ Načíst</b>.</p></div>` : data.chyba ? "" : `
    <div class="st-dlazdice">
      ${dl("Zhlédnutí", kratce(s.views))}${dl("Doba sledování", `${kratce((s.estimatedMinutesWatched || 0) / 60)} h`)}
      ${dl("Prům. doba zhlédnutí", doba(s.averageViewDuration))}${dl("Prům. % zhlédnuto", pct(s.averageViewPercentage))}
      ${dl("Odběratelé", `${(s.subscribersGained || 0) - (s.subscribersLost || 0) >= 0 ? "+" : ""}${cislo((s.subscribersGained || 0) - (s.subscribersLost || 0))}`, `+${cislo(s.subscribersGained)} / −${cislo(s.subscribersLost)}`)}
    </div>
    <p class="muted ya-zdroj">Období ${new Date(data.od).toLocaleDateString("cs-CZ")} – ${new Date(data.do).toLocaleDateString("cs-CZ")} · zdroj: <b>YouTube Analytics API</b> (data mají zpoždění ~2 dny).
      <b>Imprese a CTR miniatur</b> API nevydává – najdeš je v YouTube Studiu → Analytika → Dosah; zapsat si je můžeš u miniatur (Historie & A/B).</p>
    <div class="card"><h2>Zhlédnutí po dnech</h2>${sloupce(data.denne, (b) => b.views, "Zhlédnutí po dnech")}</div>
    <div class="card" style="margin-top:18px">
      <div class="st-hlava"><h2>Videa v období</h2><span class="muted">top 50 · klikni na sloupec pro řazení · klikni na video pro udržení</span></div>
      <div class="st-tabulka"><table><thead><tr><th>Video</th>${SL.map(([k, n]) => `<th><button type="button" data-ya-radit="${k}">${n}${razeni.klic === k ? (razeni.smer > 0 ? " ▲" : " ▼") : ""}</button></th>`).join("")}</tr></thead>
      <tbody>${vid.map((v) => `<tr class="${v.video === vybraneVideo ? "on" : ""}"><td class="st-tab-text"><button type="button" class="ya-video" data-ya-video="${esc(v.video)}">${esc(v.info?.nazev || v.video)}</button></td>
        <td>${cislo(v.views)}</td><td>${cislo(v.estimatedMinutesWatched)}</td><td>${doba(v.averageViewDuration)}</td><td>${pct(v.averageViewPercentage)}</td><td>${cislo(v.subscribersGained)}</td><td>${cislo(v.likes)}</td></tr>`).join("")}</tbody></table></div>
    </div>
    ${vybraneVideo ? `<div class="card" style="margin-top:18px"><h2>Udržení diváků · ${esc(data.videa.find((v) => v.video === vybraneVideo)?.info?.nazev || "")}</h2>
      ${!udrzeni ? `<p class="muted">Načítám…</p>` : udrzeni.chyba ? `<p class="zprava chyba">${esc(udrzeni.chyba)}</p>` : `${krivka(udrzeni.body)}
      <p class="muted" style="font-size:12.5px">Podíl diváků, kteří v daném místě videa ještě sledují (za celou dobu). Prudký pokles na začátku = slabý háček / nesplněný slib miniatury.</p>`}</div>` : ""}
    <div class="card ai-karta" style="margin-top:18px">
      <div class="st-hlava"><h2>✨ AI rozbor výkonu</h2><span class="muted">vzorce v tvých datech a doporučení</span>
        <button type="button" class="btn small" data-ya="ai">${aiVysledek ? "↻ Znovu" : "✨ Rozebrat"}</button></div>
      <div id="yaAi">${aiVysledek ? aiHtml(aiVysledek) : `<p class="muted" style="margin:0">AI porovná témata, délky, dobu sledování a odběratele u tvých videí. Upozorní, co je jen souvislost (korelace) a co se dá ověřit.</p>`}</div>
    </div>`}`;
}

const dl = (n, h, p = "") => `<div class="st-dlazdice-k"><span>${n}</span><b>${h}</b>${p ? `<small>${p}</small>` : ""}</div>`;

function aiHtml(r) {
  return `<div class="st-ai"><div><h3 class="st-h3">Zjištění</h3><ul>${(r.zjisteni || []).map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>
    <div><h3 class="st-h3">Doporučení</h3><ul>${(r.doporuceni || []).map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div></div>
    ${r.upozorneni ? `<p class="muted" style="font-size:12.5px">⚠️ ${esc(r.upozorneni)}</p>` : ""}
    <h3 class="st-h3">Nápady na další videa</h3><div class="st-napady">${(r.napady || []).map((n, i) => `<div class="st-napad"><b>${esc(n.titulek)}</b><small class="muted">${esc(n.proc)}</small>
      <div class="radek" style="gap:6px;margin-top:6px"><button type="button" class="btn small ghost" data-ya-napad="${i}">📆 Do plánu</button></div></div>`).join("")}</div>`;
}

async function rozbor() {
  if (!AI().maKlic()) { toast("Rozbor potřebuje AI klíč.", "chyba"); return; }
  const el = $("#yaAi");
  el.innerHTML = `<p class="muted">AI čte data…</p>`;
  try {
    const tab = data.videa.map((v) => [v.info?.nazev || v.video, v.info?.publikovano?.slice(0, 10) || "", v.info?.delka ?? "", v.views, Math.round(v.estimatedMinutesWatched), Math.round(v.averageViewDuration), Math.round(v.averageViewPercentage), v.subscribersGained].join(" | "));
    aiVysledek = await AI().gemini({
      system: `Jsi analytik YouTube kanálu Deník hokeje (česká hokejová historie). Dostaneš skutečná data za období. Najdi vzorce: která témata, délky a typy videí
mají nejvíc zhlédnutí, nejdelší dobu sledování a nejvíc nových odběratelů. Piš česky, stručně, s čísly z dat. Nevymýšlej metriky, které v datech nejsou
(např. CTR, imprese). Korelace neznamená příčinu – do "upozorneni" napiš, co je jen souvislost a jak to ověřit. Málo dat = řekni to.`,
      zadani: `Období ${data.od} – ${data.do}. Souhrn: ${JSON.stringify(data.souhrn)}
VIDEA (název | publikováno | délka s | zhlédnutí | minut sledování | prům. doba s | prům. % | noví odběratelé):
${tab.join("\n")}`,
      schema: { type: "object", properties: { zjisteni: { type: "array", items: { type: "string" } }, doporuceni: { type: "array", items: { type: "string" } }, upozorneni: { type: "string" },
        napady: { type: "array", items: { type: "object", properties: { titulek: { type: "string" }, proc: { type: "string" } }, required: ["titulek", "proc"] } } }, required: ["zjisteni", "doporuceni", "upozorneni", "napady"] },
    });
    el.innerHTML = aiHtml(aiVysledek);
  } catch (e) { el.innerHTML = `<p class="zprava chyba">${esc(e.message)}</p>`; }
}

function init() {
  const el = $("#ytstatsObsah");
  if (!el) return;
  el.addEventListener("click", (e) => {
    const t = e.target.closest("button");
    if (!t) return;
    const d = t.dataset;
    if (d.yaObdobi) { obdobi = +d.yaObdobi; vlastni = null; nacti(); return; }
    if (d.ya === "vlastni") { const od = $("#yaOd").value, dd = $("#yaDo").value; if (od && dd && od <= dd) { vlastni = { od, do: dd }; nacti(); } else toast("Zkontroluj datum od–do.", "chyba"); return; }
    if (d.ya === "nacti") return nacti();
    if (d.ya === "ai") return rozbor();
    if (d.yaRadit) { razeni = { klic: d.yaRadit, smer: razeni.klic === d.yaRadit ? -razeni.smer : -1 }; vykresli(); return; }
    if (d.yaVideo) return nactiUdrzeni(d.yaVideo);
    if (d.yaNapad !== undefined) { const n = aiVysledek.napady[+d.yaNapad]; window.DHPlan?.pridej({ nazev: n.titulek, format: "youtube", zadani: n.proc }); toast("Nápad je v zásobníku Plánu 📆"); t.textContent = "✓ V plánu"; t.disabled = true; }
  });
  document.addEventListener("dh:zalozka", (e) => { if (e.detail === "ytstats") { vykresli(); if (Y().pripojeno() && !data && !nacitam) nacti(); } });
  document.addEventListener("dh:youtube", () => { if (!$("#zalozkaYtstats")?.hidden) vykresli(); });
  vykresli();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
