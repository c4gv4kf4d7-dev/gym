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

  // volume della settimana (kg totali sollevati), sedute PT comprese:
  // dei super esercizi registriamo solo il carico, quindi la seduta vale
  // kg × 15 (convenzione 3 serie × 5 ripetizioni da lavoro di forza)
  const ptVolWeek = (state.ptLifts || [])
    .filter(l => weekStart(l.date) === wk)
    .reduce((a, l) => a + PT_SEQUENCE.reduce((x, k) => x + (l[k] || 0) * 15, 0), 0);
  const volWeek = Math.round(state.sessions
    .filter(s => weekStart(s.date) === wk)
    .reduce((a, s) => a + sessionVolume(s), 0) + ptVolWeek);

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

  // PR del mese (pesi mai visti prima) — riusa la logica del Wrapped
  let prMonth = 0;
  try { prMonth = wrappedStats(mk).prCount; } catch (e) { /* wrapped non caricato */ }

  return {
    nick: (state.profile && (state.profile.nick || state.profile.name)) || "Atleta",
    days, weekDone, planned,
    streak: weekStreak(),
    monthDone, monthExpected, monthPct,
    volWeek, volDelta, prMonth,
    last: lastS ? { date: lastS.date, name: lastW ? lastW.name : "", emoji: lastW ? lastW.emoji : "🏋️" } : null
  };
}

/* ---------- SYNC + UI (solo con Supabase e login) ---------- */
(function () {
  let mates = [];           // vetrinette dei compagni di crew [{userId, nick, ...stats}]
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
    mates = (data || []).filter(r => r.user_id !== me().id)
      .map(r => Object.assign({ userId: r.user_id, updated: r.updated_at }, r.stats));
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

  window.crewNudge = function () {
    if (window.DEMO_MODE) { toast("👀 Nella demo il punzecchio è finto: accedi per punzecchiare davvero"); return; }
    if (!sb() || !me()) { toast("Accedi prima"); return; }
    if (!mates.length) { toast("Nessun compagno collegato alla crew"); return; }
    if (mates.length === 1) { crewNudgeTo(mates[0].userId); return; }
    // gruppo: scegli chi punzecchiare
    $("modal-title").textContent = "Chi punzecchi? 🔥";
    $("modal-body").innerHTML = `<div class="modal-opts">${mates.map(m => `
      <button class="modal-opt" onclick="closeModal();crewNudgeTo('${m.userId}')">
        <span class="modal-opt-emoji">🔥</span><span><b>${m.nick || "Atleta"}</b><br><small>${(m.weekDone || 0)} allenament${m.weekDone === 1 ? "o" : "i"} questa settimana</small></span>
      </button>`).join("")}</div>`;
    $("modal").classList.add("show");
  };

  window.crewNudgeTo = async function (uid) {
    const m = mates.find(x => x.userId === uid);
    if (!m) return;
    const my = computeCrewStats();
    const spice = (m.weekDone || 0) === 0
      ? `🔥 ${my.nick} ti ha punzecchiato: ancora 0 allenamenti questa settimana. Il divano non conta come panca.`
      : `🔥 ${my.nick} ti ha punzecchiato: è a ${my.weekDone} allenament${my.weekDone === 1 ? "o" : "i"} questa settimana. Tocca a te.`;
    const { error } = await sb().from("crew_nudges").insert({
      crew_id: myCrew.id, from_user: me().id, from_nick: my.nick,
      to_user: uid, txt: spice
    });
    if (error) toast("⚠️ Punzecchio non inviato: " + error.message);
    else toast(`🔥 Punzecchio inviato a ${m.nick || "il tuo socio"}! Lo vedrà alla prossima apertura`);
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
    myCrew = null; mates = [];
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
        <div class="acct-intro">${mates.length ? `Collegat${mates.length === 1 ? "o" : "i"}: <b>${mates.map(m => m.nick || "Atleta").join(", ")}</b> ✓` : "In attesa che qualcuno si unisca…"}</div>
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
        <div class="crew-row-lbl">Questa settimana · <b>${s.weekDone}</b> allenament${s.weekDone === 1 ? "o" : "i"}</div>
        <div class="crew-dots">${s.days.map(dot).join("")}</div>
        <div class="crew-line">🔥 <b>${s.streak}</b> settiman${s.streak === 1 ? "a" : "e"} di fila senza saltare</div>
        <div class="crew-line">🏋️ <b>${(s.volWeek || 0).toLocaleString("it-IT")}</b> kg sollevati questa settimana</div>
        <div class="crew-line">🏆 <b>${s.prMonth || 0}</b> record personali questo mese</div>
      </div>`;
  }

  window.renderCrewCard = function () {
    const el = document.getElementById("crew-card");
    if (!el) return;
    if (window.DEMO_MODE) {
      // vetrina: gruppo d'esempio a 3
      const my = computeCrewStats();
      const demo = [
        { userId: "d1", nick: "Luca", days: [2, 0, 2, 0, 0, 1, 0], weekDone: 2, planned: 2, streak: 3, volWeek: 5400, monthDone: 5, prMonth: 1 },
        { userId: "d2", nick: "Sara", days: [0, 2, 0, 2, 2, 0, 0], weekDone: 3, planned: 3, streak: 5, volWeek: 4100, monthDone: 7, prMonth: 2 }
      ];
      el.style.display = "";
      el.innerHTML = crewHTML(my, demo) +
        '<div class="crew-hint">👀 Esempio: con un account puoi sfidare gli amici veri.</div>';
      return;
    }
    if (!myCrew || !mates.length) { el.style.display = "none"; el.innerHTML = ""; return; }
    const my = computeCrewStats();
    el.style.display = "";
    el.innerHTML = crewHTML(my, mates) + `
      <button class="btn-outline crew-fire" onclick="crewNudge()">🔥 Punzecchia${mates.length === 1 ? " " + (mates[0].nick || "il socio") : "…"}</button>`;
  };

  // A due è un VS testa a testa; da tre in su diventa una classifica
  // (stesse metriche, il design si adatta al gruppo).
  function crewHTML(my, others) {
    const monthName = new Date().toLocaleDateString("it-IT", { month: "long" });
    const members = [Object.assign({}, my, { nick: "Tu", me: true }), ...others]
      .sort((a, b) => (b.monthDone || 0) - (a.monthDone || 0));
    const max = Math.max(...members.map(m => m.monthDone || 0), 1);
    const meIdx = members.findIndex(m => m.me);

    let lead;
    if (members.length === 2) {
      const a = my.monthDone || 0, b = others[0].monthDone || 0;
      lead = a > b ? `Guidi tu ${a}–${b}: non mollare adesso 💪` :
             a < b ? `${others[0].nick} è avanti ${b}–${a} — un allenamento e riapri la gara` :
             `Parità ${a}–${b}: la decide il prossimo che si allena`;
    } else {
      lead = meIdx === 0 ? `Sei in testa alla classifica 👑 — tienili dietro` :
             `${members[0].nick} guida con ${members[0].monthDone || 0} — sei a ${(members[0].monthDone || 0) - (my.monthDone || 0)} allenament${(members[0].monthDone || 0) - (my.monthDone || 0) === 1 ? "o" : "i"} dalla vetta`;
    }

    const bars = members.map((m, i) => `
      <div class="crew-duel">
        <div class="crew-duel-name">${members.length > 2 ? ["🥇", "🥈", "🥉"][i] || (i + 1) + "°" : ""} ${m.me ? "Tu" : (m.nick || "Atleta")}</div>
        <div class="crew-duel-bar"><div class="crew-duel-fill ${m.me ? "me" : ""}" style="width:${Math.round((m.monthDone || 0) / max * 100)}%"></div><span>${m.monthDone || 0}</span></div>
      </div>`).join("");

    const cols = members.map(m => col(m, !!m.me)).join("");
    return `
      <div class="chart-title">🤝 La sfida di ${monthName}</div>
      <div class="chart-sub">Chi si è allenato di più?</div>
      ${bars}
      <div class="crew-lead">${lead}</div>
      <div class="crew-grid ${members.length > 2 ? "crew-scroll" : ""}">${cols}</div>`;
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
    myCrew = null; mates = [];
    renderCrewSetup(); renderCrewCard();
  };
})();
