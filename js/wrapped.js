/* ============================================================
   WRAPPED — il riepilogo mensile stile "Spotify Wrapped"
   Celebrazione + onestà: numeri del mese, progressi veri,
   pagella critica e una sfida concreta per il mese dopo.
   Tutto calcolato in locale dai tuoi dati, zero AI.
   ============================================================ */

/* ---------- STATISTICHE DEL MESE (funzione pura) ---------- */
function wrappedStats(mk) {                       // mk = "YYYY-MM"
  const inMonth = (d) => d && d.slice(0, 7) === mk;
  const sessions = state.sessions.filter(s => inMonth(s.date) && !((s.exercises && Object.keys(s.exercises).length === 0)));
  const [Y, M] = mk.split("-").map(Number);
  const daysInMonth = new Date(Y, M, 0).getDate();
  const weeks = daysInMonth / 7;

  // volume e qualità
  let volume = 0, clean = 0, hard = 0, fail = 0, setsTot = 0;
  sessions.forEach(s => {
    volume += sessionVolume(s);
    Object.values(s.exercises || {}).forEach(e => {
      setsTot += e.sets.length;
      if (e.quality === "clean") clean++;
      else if (e.quality === "hard") hard++;
      else if (e.quality === "fail") fail++;
    });
  });

  // esercizio con la crescita migliore nel mese (primo vs ultimo max kg)
  const perEx = {};
  sessions.slice().sort((a, b) => a.date.localeCompare(b.date)).forEach(s => {
    Object.keys(s.exercises || {}).forEach(k => {
      const mx = Math.max(...s.exercises[k].sets.map(x => x.w));
      if (!perEx[k]) perEx[k] = { first: mx, last: mx, n: 0 };
      perEx[k].last = mx; perEx[k].n++;
    });
  });
  let topEx = null;
  Object.entries(perEx).forEach(([k, v]) => {
    const gain = +(v.last - v.first).toFixed(1);
    if (!topEx || gain > topEx.gain) topEx = { key: k, name: (EXERCISES[k] ? EXERCISES[k].name : k), gain, from: v.first, to: v.last };
  });

  // PR: pesi mai visti prima del mese
  let prCount2 = 0;
  Object.keys(perEx).forEach(k => {
    let before = 0;
    state.sessions.filter(s => s.date.slice(0, 7) < mk).forEach(s => exSets(s, k).forEach(x => { if (x.w > before) before = x.w; }));
    if (before > 0 && perEx[k].last > before) prCount2++;
  });

  // pasti
  const mealDays = Object.keys(state.meals || {}).filter(inMonth).filter(d => state.meals[d].length);
  const pT = proteinTarget(), kT = kcalTarget();
  const protHit = mealDays.filter(d => dayTotals(d).protein >= pT).length;

  // peso
  const bwIn = (state.bodyweight || []).filter(b => inMonth(b.date)).sort((a, b) => a.date.localeCompare(b.date));
  const bwBefore = (state.bodyweight || []).filter(b => b.date.slice(0, 7) < mk).sort((a, b) => a.date.localeCompare(b.date));
  const wStart = bwIn.length ? bwIn[0].v : (bwBefore.length ? bwBefore[bwBefore.length - 1].v : null);
  const wEnd = bwIn.length ? bwIn[bwIn.length - 1].v : null;
  const wDelta = (wStart != null && wEnd != null) ? +(wEnd - wStart).toFixed(1) : null;

  // sedute PT (Denis)
  const ptSessions = (state.ptLifts || []).filter(l => inMonth(l.date)).length;

  // copertura muscolare del mese (per la pagella)
  const gCount = {}; let gTotal = 0;
  sessions.forEach(x => Object.keys(x.exercises || {}).forEach(k => {
    const meta = EXERCISES[k];
    if (!meta || !meta.bodyPart) return;
    const n = (x.exercises[k].sets || []).length || 0;
    gCount[meta.bodyPart] = (gCount[meta.bodyPart] || 0) + n;
    gTotal += n;
  }));
  const coverage = gTotal ? Object.fromEntries(Object.entries(gCount).map(([g, n]) => [g, Math.round((n / gTotal) * 100)])) : null;

  const expected = Math.round((state.profile && state.profile.daysPerWeek || 3) * weeks);
  return {
    mk, sessions: sessions.length, expected, volume: Math.round(volume), setsTot,
    clean, hard, fail, evals: clean + hard + fail,
    topEx, prCount: prCount2,
    mealDays: mealDays.length, daysInMonth, protHit,
    wStart, wEnd, wDelta, ptSessions, coverage,
    goal: (state.profile && state.profile.goal) || "massa"
  };
}

/* ---------- PARAGONI DI VOLUME (il momento "wow") ---------- */
const VOL_UNITS = [
  [190000, "una balenottera azzurra 🐋"],
  [30000, "un autobus a due piani 🚌"],
  [12000, "uno scuolabus 🚌"],
  [6000, "un elefante africano 🐘"],
  [2500, "un rinoceronte 🦏"],
  [1200, "una Fiat Panda (quella vera) 🚗"],
  [700, "un cavallo da corsa 🐎"],
  [300, "un orso bruno 🐻"],
  [110, "uno scooter 🛵"],
  [70, "una lavatrice 🧺"]
];
function volumeComparison(kg) {
  if (!kg || kg < 70) return null;
  for (const [u, name] of VOL_UNITS) {
    if (kg >= u) {
      const n = Math.floor(kg / u);
      return n === 1 ? name : `${n} volte ${name.replace(/^un[oa]? /, "")}`;
    }
  }
  return null;
}

/* ---------- LA PAGELLA: celebra, critica, sfida ---------- */
function wrappedVerdict(st) {
  const cel = [], crit = [], chal = [];
  const att = st.expected ? st.sessions / st.expected : 0;

  // presenza
  if (att >= 1) cel.push(`Presenza perfetta: ${st.sessions} allenamenti su ${st.expected} previsti. Non si può chiedere di più.`);
  else if (att >= 0.75) cel.push(`${st.sessions} allenamenti su ${st.expected} previsti: costanza vera, non entusiasmo passeggero.`);
  else if (st.sessions > 0) crit.push(`${st.sessions} allenamenti su ${st.expected} previsti. Diciamocelo: il programma era un altro. Il corpo cresce con la costanza, non con le intenzioni.`);
  else crit.push(`Zero allenamenti registrati. Il mese fantasma. L'unico allenamento sbagliato è quello che non fai.`);

  // qualità
  if (st.evals >= 5) {
    const cleanRatio = st.clean / st.evals;
    if (cleanRatio >= 0.7) cel.push(`${st.clean} esercizi su ${st.evals} chiusi puliti: tecnica da manuale. È il momento di osare di più coi carichi.`);
    else if (st.fail / st.evals >= 0.3) crit.push(`${st.fail} esercizi non completati su ${st.evals}: stai correndo più del motore. Meglio un kg in meno fatto bene che due kg a metà.`);
    else cel.push(`Mix sano: hai spinto al limite senza romperti. Così si progredisce.`);
  }

  // progressi carichi
  if (st.topEx && st.topEx.gain > 0) cel.push(`${st.topEx.name}: da ${st.topEx.from} a ${st.topEx.to} kg in un mese (+${st.topEx.gain}). Questo è progresso che si vede al bilanciere.`);
  if (st.prCount > 0) cel.push(`${st.prCount} record personali battuti. 🏆`);
  if (st.sessions >= 4 && (!st.topEx || st.topEx.gain <= 0)) crit.push(`Ti sei allenato, ma i carichi non si sono mossi. O è stato un mese di consolidamento… o ti stai accomodando. Tu lo sai.`);

  // peso vs obiettivo
  if (st.wDelta != null) {
    if (st.goal === "massa") {
      if (st.wDelta >= 0.5 && st.wDelta <= 2) cel.push(`+${st.wDelta} kg sulla bilancia: crescita nel range giusto, massa pulita.`);
      else if (st.wDelta > 2) crit.push(`+${st.wDelta} kg in un mese è troppo veloce: parte non sarà muscolo. Occhio al surplus.`);
      else if (st.wDelta > 0) crit.push(`+${st.wDelta} kg: si cresce, ma piano. Per l'obiettivo servono ~1-2 kg/mese: aggiungi 100-150 kcal.`);
      else crit.push(`Peso fermo o in calo (${st.wDelta} kg) con obiettivo massa: la matematica non è opinabile — servono più calorie.`);
    } else if (st.goal === "dimagrimento") {
      if (st.wDelta <= -1 && st.wDelta >= -4) cel.push(`${st.wDelta} kg: dimagrimento nel ritmo giusto, senza bruciare muscolo.`);
      else if (st.wDelta > -0.3) crit.push(`Peso praticamente fermo (${st.wDelta} kg). Il deficit sulla carta non conta: conta quello reale.`);
    }
  }

  // radar muscolare: il gruppo dimenticato non si nasconde
  if (st.coverage && st.sessions >= 4) {
    const GLBL = { legs: "le gambe", chest: "il petto", back: "la schiena", shoulders: "le spalle", arms: "le braccia", core: "il core" };
    const groups = ["legs", "chest", "back", "shoulders", "arms", "core"].map(g => ({ g, v: st.coverage[g] || 0 }));
    const weakest = groups.reduce((m, e) => e.v < m.v ? e : m, groups[0]);
    const strongest = groups.reduce((m, e) => e.v > m.v ? e : m, groups[0]);
    if (weakest.v <= 5) crit.push(`Il radar parla chiaro: ${GLBL[weakest.g]} quasi assent${weakest.g === "legs" || weakest.g === "shoulders" ? "i" : "e"} (${weakest.v}% delle serie). Nessun gruppo cresce da solo.`);
    else if (strongest.v - weakest.v <= 15) cel.push(`Copertura muscolare equilibrata: hai allenato tutto il corpo, senza figli e figliastri.`);
  }

  // nutrizione
  if (st.mealDays >= st.daysInMonth * 0.8) cel.push(`Pasti tracciati ${st.mealDays} giorni su ${st.daysInMonth}: disciplina da professionista.`);
  else if (st.mealDays > 0 && st.mealDays < st.daysInMonth * 0.4) crit.push(`Pasti registrati solo ${st.mealDays} giorni su ${st.daysInMonth}: metà del lavoro si fa a tavola, e a tavola sei sparito.`);
  if (st.mealDays >= 5 && st.protHit / st.mealDays >= 0.7) cel.push(`Obiettivo proteine centrato ${st.protHit} giorni su ${st.mealDays} tracciati. I muscoli ringraziano.`);

  // sfida del mese prossimo (una sola, concreta)
  if (att < 0.75 && st.expected > 0) chal.push(`Copertura ${Math.max(st.sessions, 0)}/${st.expected} → il mese prossimo: NON saltare più di 1 allenamento a settimana.`);
  else if (st.topEx && st.topEx.gain <= 0 && st.sessions >= 4) chal.push(`Sblocca la progressione: +2,5 kg su ${st.topEx ? st.topEx.name : "un esercizio chiave"} entro fine mese.`);
  else if (st.mealDays < st.daysInMonth * 0.6) chal.push(`Traccia i pasti almeno 20 giorni: quello che non misuri, non migliora.`);
  else if (st.topEx) chal.push(`Alza l'asticella: ${st.topEx.name} a ${+(st.topEx.to + 2.5).toFixed(1)} kg fatti PULITI entro fine mese.`);
  else chal.push(`Primo obiettivo: 3 allenamenti a settimana, tutti registrati.`);

  // voto complessivo
  let score = 0;
  score += Math.min(1, att) * 40;
  score += st.evals ? (st.clean / st.evals) * 20 : 0;
  score += Math.min(1, st.mealDays / (st.daysInMonth * 0.8)) * 20;
  score += (st.prCount > 0 || (st.topEx && st.topEx.gain > 0)) ? 20 : 0;
  const grade = score >= 85 ? { t: "MESE D'ORO", e: "🥇" }
             : score >= 65 ? { t: "MESE SOLIDO", e: "💪" }
             : score >= 40 ? { t: "MESE COSÌ COSÌ", e: "😐" }
             : { t: "MESE FANTASMA", e: "👻" };

  return { cel, crit, chal, score: Math.round(score), grade };
}

/* ---------- OVERLAY A SLIDE ---------- */
let wrpSlides = [], wrpIndex = 0;

function wrappedMonthName(mk) {
  const [y, m] = mk.split("-");
  const n = new Date(+y, +m - 1, 1).toLocaleDateString("it-IT", { month: "long" });
  return n.charAt(0).toUpperCase() + n.slice(1) + " " + y;
}

function buildWrappedSlides(mk) {
  const st = wrappedStats(mk);
  const v = wrappedVerdict(st);
  const slides = [];

  slides.push({ cls: "w-intro", html: `
    <div class="w-kicker">Il tuo mese, raccontato dai numeri</div>
    <div class="w-huge">${wrappedMonthName(mk).split(" ")[0].toUpperCase()}</div>
    <div class="w-sub">WRAPPED · ${mk.split("-")[0]}</div>
    <div class="w-hint">tocca per continuare →</div>` });

  slides.push({ cls: "w-grad1", html: `
    <div class="w-kicker">Ti sei presentato</div>
    <div class="w-big">${st.sessions}</div>
    <div class="w-lbl">allenament${st.sessions === 1 ? "o" : "i"} <span class="w-dim">su ${st.expected} previsti</span></div>
    ${st.ptSessions ? `<div class="w-note">di cui ${st.ptSessions} sedut${st.ptSessions === 1 ? "a" : "e"} coi super esercizi 🧑‍🏫</div>` : ""}` });

  const comp = volumeComparison(st.volume);
  slides.push({ cls: "w-grad2", html: `
    <div class="w-kicker">Hai sollevato in totale</div>
    <div class="w-big">${st.volume.toLocaleString("it-IT")}<span class="w-unit">kg</span></div>
    ${comp ? `<div class="w-lbl">più o meno come <b>${comp}</b></div>` : `<div class="w-lbl">${st.setsTot} serie portate a casa</div>`}` });

  if (st.topEx && st.topEx.gain > 0) {
    slides.push({ cls: "w-grad3", html: `
      <div class="w-kicker">Il tuo colpo migliore</div>
      <div class="w-med">${st.topEx.name}</div>
      <div class="w-big">${st.topEx.from} → ${st.topEx.to}<span class="w-unit">kg</span></div>
      <div class="w-lbl">+${st.topEx.gain} kg in un mese${st.prCount ? ` · ${st.prCount} PR battut${st.prCount === 1 ? "o" : "i"} 🏆` : ""}</div>` });
  }

  if (st.evals > 0) {
    slides.push({ cls: "w-grad4", html: `
      <div class="w-kicker">Come le hai chiuse</div>
      <div class="w-qrow"><span class="w-qn" style="color:#10B981">${st.clean}</span><span class="w-ql">🟢 pulite</span></div>
      <div class="w-qrow"><span class="w-qn" style="color:#F59E0B">${st.hard}</span><span class="w-ql">🟡 dure</span></div>
      <div class="w-qrow"><span class="w-qn" style="color:#FF4D6D">${st.fail}</span><span class="w-ql">🔴 non finite</span></div>` });
  }

  if (st.wDelta != null || st.mealDays > 0) {
    slides.push({ cls: "w-grad5", html: `
      <div class="w-kicker">Fuori dalla palestra</div>
      ${st.wDelta != null ? `<div class="w-big">${st.wDelta > 0 ? "+" : ""}${st.wDelta}<span class="w-unit">kg</span></div><div class="w-lbl">sulla bilancia (${st.wStart} → ${st.wEnd})</div>` : ""}
      ${st.mealDays ? `<div class="w-note">🍽️ pasti tracciati ${st.mealDays}/${st.daysInMonth} giorni · proteine centrate ${st.protHit} volte</div>` : ""}` });
  }

  slides.push({ cls: "w-final", html: `
    <div class="w-kicker">La pagella del coach</div>
    <div class="w-grade">${v.grade.e}</div>
    <div class="w-med">${v.grade.t}</div>
    <div class="w-score">${v.score}/100</div>
    <div class="w-verdict">
      ${v.cel.slice(0, 2).map(x => `<div class="w-v w-good">✅ ${x}</div>`).join("")}
      ${v.crit.slice(0, 2).map(x => `<div class="w-v w-bad">🔥 ${x}</div>`).join("")}
      <div class="w-v w-chal">🎯 <b>La sfida:</b> ${v.chal[0]}</div>
    </div>
    <button class="btn-save w-close" onclick="closeWrapped()">Si torna in palestra 💪</button>` });

  return slides;
}

function openWrapped(mk) {
  wrpSlides = buildWrappedSlides(mk);
  wrpIndex = 0;
  state.wrappedSeen = state.wrappedSeen || [];
  if (!state.wrappedSeen.includes(mk)) { state.wrappedSeen.push(mk); saveState(state); }
  $("wrapped").classList.add("show");
  document.body.style.overflow = "hidden";
  renderWrappedSlide();
  if (typeof renderWrappedBanner === "function") renderWrappedBanner();
}

function renderWrappedSlide() {
  const s = wrpSlides[wrpIndex];
  $("wrapped").innerHTML = `
    <div class="w-slide ${s.cls}" onclick="nextWrappedSlide(event)">
      <button class="w-x" onclick="event.stopPropagation();closeWrapped()">✕</button>
      <div class="w-dots">${wrpSlides.map((_, i) => `<span class="${i <= wrpIndex ? "on" : ""}"></span>`).join("")}</div>
      <div class="w-content">${s.html}</div>
    </div>`;
}

function nextWrappedSlide(ev) {
  if (ev && ev.target && (ev.target.tagName === "BUTTON")) return;
  if (wrpIndex < wrpSlides.length - 1) { wrpIndex++; renderWrappedSlide(); }
}

function closeWrapped() {
  $("wrapped").classList.remove("show");
  $("wrapped").innerHTML = "";
  document.body.style.overflow = "";
}

/* ---------- ACCESSO: banner a inizio mese + card nei Progressi ---------- */
function monthHasData(mk) {
  return state.sessions.some(s => s.date.slice(0, 7) === mk) ||
         Object.keys(state.meals || {}).some(d => d.slice(0, 7) === mk && state.meals[d].length);
}
function prevMonthKey() {
  const d = new Date(); d.setDate(1); d.setDate(0);   // ultimo giorno del mese scorso
  return localDate(d).slice(0, 7);
}

function renderWrappedBanner() {
  const host = $("wrapped-banner");
  if (!host) return;
  const mk = prevMonthKey();
  const seen = (state.wrappedSeen || []).includes(mk);
  host.innerHTML = (!seen && monthHasData(mk))
    ? `<div class="wrapped-banner" onclick="openWrapped('${mk}')">
         <span class="wb2-emoji">🎁</span>
         <span class="wb2-txt"><b>Il tuo Wrapped di ${wrappedMonthName(mk).split(" ")[0]} è pronto!</b><br>Un mese di sudore in 30 secondi.</span>
         <span class="wb2-cta">Apri →</span>
       </div>`
    : "";
}

function renderWrappedCard() {
  const host = $("wrapped-card");
  if (!host) return;
  const months = [...new Set([
    ...state.sessions.map(s => s.date.slice(0, 7)),
    ...Object.keys(state.meals || {}).filter(d => state.meals[d].length).map(d => d.slice(0, 7))
  ])].sort((a, b) => b.localeCompare(a)).slice(0, 12);
  if (!months.length) { host.innerHTML = ""; host.style.display = "none"; return; }
  host.style.display = "";
  host.innerHTML = `
    <div class="chart-title">🎁 I tuoi Wrapped</div>
    <div class="chart-sub">Il riepilogo del mese, stile storia — celebrazione e pagella</div>
    <div class="hist-months" style="padding-bottom:2px">${months.map(mk =>
      `<button class="hist-month-tab" onclick="openWrapped('${mk}')">${wrappedMonthName(mk)}</button>`).join("")}</div>`;
}
