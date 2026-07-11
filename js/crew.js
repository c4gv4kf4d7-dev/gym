/* ============================================================
   CREW — accountability a due (tu e un amico).
   Ognuno pubblica una "vetrinetta" di SOLI AGGREGATI su Supabase
   (tabella crew_stats, RLS: la legge solo chi è nella tua crew).
   Zero azioni richieste: la vetrinetta si aggiorna a ogni sync,
   quella dell'amico si legge all'apertura. Pesi, pasti e misure
   NON ne fanno parte: strutturalmente non condivisibili.
   ============================================================ */

/* ---------- LA VETRINETTA (funzione pura, testabile) ---------- */
function computeCrewStats() {
  const t = todayStr();
  const wk = weekStart(t);

  // pallini della settimana (lun→dom): 2 = fatto, 1 = in programma, 0 = niente
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(wk + "T00:00:00"); d.setDate(d.getDate() + i);
    const ds = localDate(d);
    if (state.sessions.some(s => s.date === ds) ||
        ((state.ptLifts || []).some(l => l.date === ds))) days.push(2);
    else if ((state.schedule || {})[ds] && !(state.schedule || {})[ds].done) days.push(1);
    else days.push(0);
  }

  // settimana: fatti (sessioni + sedute PT) vs previsti dal profilo
  const ptWeek = (state.ptLifts || []).filter(l => weekStart(l.date) === wk).length;
  const weekDone = thisWeekCount() + ptWeek;
  const planned = (state.profile && state.profile.daysPerWeek) || 3;

  // duello del mese: % del PROPRIO piano coperta finora (fair anche con piani diversi)
  const mk = t.slice(0, 7);
  const monthDone = state.sessions.filter(s => s.date.slice(0, 7) === mk).length +
                    (state.ptLifts || []).filter(l => l.date.slice(0, 7) === mk).length;
  const dom = parseInt(t.slice(8, 10), 10);
  const monthExpected = Math.max(1, Math.round(planned * dom / 7));
  const monthPct = Math.min(100, Math.round((monthDone / monthExpected) * 100));

  // volume della settimana (kg totali sollevati)
  const volWeek = Math.round(state.sessions
    .filter(s => weekStart(s.date) === wk)
    .reduce((a, s) => a + sessionVolume(s), 0));

  // volume vs LA PROPRIA media delle 4 settimane precedenti: misura lo
  // sforzo, non il livello — così chi solleva di più non vince "di rendita"
  let volDelta = null;
  {
    const byWeek = {};
    state.sessions.forEach(s => {
      const w = weekStart(s.date);
      if (w < wk) byWeek[w] = (byWeek[w] || 0) + sessionVolume(s);
    });
    const prev = Object.keys(byWeek).sort().slice(-4).map(k => byWeek[k]);
    if (prev.length >= 2) {
      const avg = prev.reduce((a, b) => a + b, 0) / prev.length;
      if (avg > 0) volDelta = Math.round((volWeek / avg - 1) * 100);
    }
  }

  // ultimo allenamento (per il "si è allenato ieri" che punge)
  const all = [...state.sessions].sort((a, b) => a.date.localeCompare(b.date));
  const lastS = all[all.length - 1];
  const lastW = lastS ? getWorkout(lastS.workoutId) : null;

  // PR del mese (pesi mai visti prima) — riusa la logica del Wrapped.
  // La pagella è testo pronto ("💪 72/100"), non l'oggetto interno.
  let prMonth = 0, grade = null, gradeMonth = null;
  try {
    const stM = wrappedStats(mk);
    prMonth = stM.prCount;
    const d0 = new Date(); d0.setDate(0);                    // pagella del mese scorso
    const prev = wrappedStats(localDate(d0).slice(0, 7));
    if (prev.sessions) {
      const v = wrappedVerdict(prev);
      grade = `${v.grade.e} ${v.score}/100`;
      gradeMonth = new Date(d0).toLocaleDateString("it-IT", { month: "long" });
    }
  } catch (e) { /* wrapped non caricato: pazienza */ }

  return {
    nick: (state.profile && (state.profile.nick || state.profile.name)) || "Atleta",
    days, weekDone, planned,
    streak: weekStreak(),
    monthDone, monthExpected, monthPct,
    volWeek, volDelta, prMonth, grade, gradeMonth,
    last: lastS ? { date: lastS.date, name: lastW ? lastW.name : "", emoji: lastW ? lastW.emoji : "🏋️" } : null
  };
}

/* ---------- SYNC + UI (solo con Supabase e login) ---------- */
(function () {
  let mate = null;          // vetrinetta dell'amico (ultima letta)
  let mateUserId = null;
  let myCrew = null;        // { id, code }

  const cloud = () => (window.__cloud || {});
  const sb = () => cloud().sb;
  const me = () => cloud().user && cloud().user();

  /* --- parole per i codici invito: pronunciabili al telefono --- */
  const CODE_WORDS = ["FERRO", "GHISA", "PANCA", "SQUAT", "STACCO", "BILANCIERE", "MASSA", "PUMP"];
  function newCode() {
    return CODE_WORDS[Math.floor(Math.random() * CODE_WORDS.length)] + "-" +
           String(Math.floor(10 + Math.random() * 90));
  }

  async function crewPublish() {
    if (!sb() || !me() || !myCrew || window.DEMO_MODE) return;
    const stats = computeCrewStats();
    await sb().from("crew_stats").upsert({
      user_id: me().id, crew_id: myCrew.id, nick: stats.nick,
      stats, updated_at: new Date().toISOString()
    }).then(() => {}, () => {});
  }

  async function crewFetch() {
    if (!sb() || !me() || !myCrew) return;
    const { data } = await sb().from("crew_stats").select("user_id, nick, stats, updated_at")
      .eq("crew_id", myCrew.id);
    const other = (data || []).find(r => r.user_id !== me().id);
    mate = other ? Object.assign({ updated: other.updated_at }, other.stats) : null;
    mateUserId = other ? other.user_id : null;
    renderCrewCard(); renderCrewSetup();
    // punzecchi non letti → banner
    const { data: nudges } = await sb().from("crew_nudges")
      .select("id, from_nick, txt").eq("to_user", me().id).eq("seen", false);
    if (nudges && nudges.length) {
      const host = document.getElementById("weigh-banner");
      if (host) host.innerHTML += nudges.map(n => `
        <div class="weigh-banner"><span class="wb-txt">${n.txt}</span>
        <button class="wb-x" onclick="crewSeenNudge(${n.id}, this)" aria-label="Chiudi">✕</button></div>`).join("");
    }
  }

  window.crewSeenNudge = function (id, btn) {
    if (sb()) sb().from("crew_nudges").update({ seen: true }).eq("id", id).then(() => {}, () => {});
    const b = btn.closest(".weigh-banner"); if (b) b.remove();
  };

  window.crewNudge = async function () {
    if (!sb() || !me() || !mateUserId) return;
    const my = computeCrewStats();
    const spice = mate && mate.weekDone === 0
      ? `🔥 ${my.nick} ti ha punzecchiato: ancora 0 allenamenti questa settimana. Il divano non conta come panca.`
      : `🔥 ${my.nick} ti ha punzecchiato: lui è a ${my.weekDone}/${my.planned} questa settimana. Tocca a te.`;
    await sb().from("crew_nudges").insert({
      crew_id: myCrew.id, from_user: me().id, from_nick: my.nick,
      to_user: mateUserId, txt: spice
    }).then(() => {}, () => {});
    toast("🔥 Punzecchio inviato!");
  };

  window.crewCreate = async function () {
    if (!sb() || !me()) { toast("Accedi prima"); return; }
    const code = newCode();
    const { data, error } = await sb().from("crews")
      .insert({ code, created_by: me().id }).select("id, code").single();
    if (error) { toast("Errore: " + error.message); return; }
    myCrew = { id: data.id, code: data.code };
    state.crew = myCrew; saveState(state);
    await crewPublish(); renderCrewSetup(); renderCrewCard();
    toast("🤝 Crew creata! Manda il codice al tuo socio.");
  };

  window.crewJoin = async function () {
    if (!sb() || !me()) { toast("Accedi prima"); return; }
    const el = document.getElementById("crew-code-in");
    const code = el ? el.value.trim().toUpperCase() : "";
    if (!code) { toast("Scrivi il codice"); return; }
    const { data, error } = await sb().rpc("crew_id_for_code", { c: code });
    if (error || !data) { toast("Codice non trovato"); return; }
    myCrew = { id: data, code };
    state.crew = myCrew; saveState(state);
    await crewPublish(); await crewFetch();
    toast("🤝 Sei nella crew!");
  };

  window.crewLeave = async function () {
    if (sb() && me()) await sb().from("crew_stats").delete().eq("user_id", me().id).then(() => {}, () => {});
    myCrew = null; mate = null; mateUserId = null;
    state.crew = null; saveState(state);
    renderCrewSetup(); renderCrewCard();
    toast("Crew lasciata");
  };

  /* --- card nel Profilo: crea / unisciti / codice --- */
  window.renderCrewSetup = function () {
    const el = document.getElementById("crew-setup");
    if (!el) return;
    if (window.DEMO_MODE || !me()) {
      el.innerHTML = '<div class="acct-intro">Accedi per creare la tua crew: sfida un amico sulla costanza.</div>';
      return;
    }
    if (myCrew) {
      el.innerHTML = `
        <div class="acct-intro">Codice della tua crew (mandalo al tuo socio):</div>
        <div class="crew-code">${myCrew.code}</div>
        <div class="acct-intro">${mate ? `Socio collegato: <b>${mate.nick}</b> ✓` : "In attesa che il socio si unisca…"}</div>
        <button class="acct-exit" onclick="crewLeave()">Lascia la crew</button>`;
    } else {
      el.innerHTML = `
        <div class="acct-intro">Sfida un amico: chi rispetta di più il proprio piano?</div>
        <button class="btn-save" style="width:100%;margin-bottom:10px" onclick="crewCreate()">🤝 Crea una crew</button>
        <div class="crew-join">
          <input id="crew-code-in" class="acct-input" placeholder="Codice ricevuto (es. FERRO-42)" autocapitalize="characters">
          <button class="btn-outline" onclick="crewJoin()">Unisciti</button>
        </div>`;
    }
  };

  /* --- la card del duello (in cima a Progressi) ---
     Poche cose, spiegate: settimana coi giorni etichettati, streak,
     kg del mese e pagella. Il duello dice chiaramente qual è la sfida. */
  const DAY_LETTERS = ["L", "M", "M", "G", "V", "S", "D"];
  const dot = (v, i) => `<span class="crew-dot ${v === 2 ? 'on' : v === 1 ? 'plan' : ''}" title="${v === 2 ? 'fatto' : v === 1 ? 'in programma' : ''}">${DAY_LETTERS[i]}</span>`;
  function col(s, mine) {
    return `
      <div class="crew-col">
        <div class="crew-nick">${mine ? "Tu" : s.nick}</div>
        <div class="crew-row-lbl">Settimana · <b>${s.weekDone}</b> allenament${s.weekDone === 1 ? "o" : "i"} su <b>${s.planned}</b> previsti</div>
        <div class="crew-dots">${s.days.map(dot).join("")}</div>
        <div class="crew-line">🔥 <b>${s.streak}</b> settiman${s.streak === 1 ? "a" : "e"} di fila senza saltare</div>
        <div class="crew-line">🏋️ <b>${(s.volWeek || 0).toLocaleString("it-IT")}</b> kg sollevati questa settimana</div>
        ${s.grade ? `<div class="crew-line">📋 Pagella di ${s.gradeMonth || "…"}: <b>${s.grade}</b></div>` : ""}
      </div>`;
  }

  window.renderCrewCard = function () {
    const el = document.getElementById("crew-card");
    if (!el) return;
    if (window.DEMO_MODE) {
      // vetrina: mostra come sarebbe con un socio d'esempio
      const my = computeCrewStats();
      const luca = { nick: "Luca", days: [2, 0, 2, 0, 0, 1, 0], weekDone: 2, planned: 2,
                     streak: 3, volWeek: 5400, grade: "💪 68/100", gradeMonth: "giugno" };
      el.style.display = "";
      el.innerHTML = crewHTML(my, luca, 71, 100) +
        '<div class="crew-hint">👀 Esempio: con un account puoi sfidare un amico vero.</div>';
      return;
    }
    if (!myCrew || !mate) { el.style.display = "none"; el.innerHTML = ""; return; }
    const my = computeCrewStats();
    el.style.display = "";
    el.innerHTML = crewHTML(my, mate, my.monthPct, mate.monthPct) + `
      <button class="btn-outline crew-fire" onclick="crewNudge()">🔥 Punzecchia ${mate.nick}</button>`;
  };

  function crewHTML(my, other, myPct, otherPct) {
    const monthName = new Date().toLocaleDateString("it-IT", { month: "long" });
    const lead = myPct > otherPct ? `Per ora guidi tu: continua così 💪` :
                 myPct < otherPct ? `${other.nick} è avanti — un allenamento e lo riprendi` :
                 `Perfetta parità: la decide il prossimo allenamento`;
    return `
      <div class="chart-title">🤝 La sfida di ${monthName}</div>
      <div class="chart-sub">Vince chi completa più % del <b>proprio</b> programma entro fine mese</div>
      <div class="crew-duel">
        <div class="crew-duel-name">Tu</div>
        <div class="crew-duel-bar"><div class="crew-duel-fill me" style="width:${myPct}%"></div><span>${myPct}%</span></div>
      </div>
      <div class="crew-duel">
        <div class="crew-duel-name">${other.nick}</div>
        <div class="crew-duel-bar"><div class="crew-duel-fill" style="width:${otherPct}%"></div><span>${otherPct}%</span></div>
      </div>
      <div class="crew-lead">${lead}</div>
      <div class="crew-grid">${col(my, true)}${col(other, false)}</div>`;
  }

  /* --- aggancio al ciclo di vita del cloud --- */
  window.crewOnSync = function () {           // chiamato da cloud.js dopo push
    crewPublish();
  };
  window.crewOnLogin = function () {          // chiamato da cloud.js dopo pull
    myCrew = state.crew || null;
    crewPublish(); crewFetch();
    renderCrewSetup(); renderCrewCard();
  };
  window.crewOnLogout = function () {
    myCrew = null; mate = null; mateUserId = null;
    renderCrewSetup(); renderCrewCard();
  };
})();
