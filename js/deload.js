/* ============================================================
   DELOAD — scarico programmato, deciso come farebbe un vero PT
   Legge il semaforo delle ultime 2 settimane: se la fatica si
   accumula (tante "dure"/"non finite") o il motore gira da troppe
   settimane senza pause, propone una settimana a -20%.
   Non è un premio: è strategia per spingere più forte dopo.
   ============================================================ */
const DELOAD_FACTOR = 0.8;     // -20% sui carichi
const DELOAD_DAYS = 7;

function deloadActive() {
  const d = state.deload;
  return !!(d && d.until && d.until >= todayStr());
}

// Analisi pura: quanta fatica si è accumulata?
function fatigueAnalysis() {
  const cutoff = localDate(new Date(Date.now() - 14 * 864e5));
  let evals = 0, score = 0;
  state.sessions.filter(x => x.date >= cutoff && !x.deload).forEach(x => {
    Object.values(x.exercises || {}).forEach(e => {
      if (e.quality === "clean") { evals++; }
      else if (e.quality === "hard") { evals++; score += 1; }
      else if (e.quality === "fail") { evals++; score += 2; }
    });
  });
  const ratio = evals ? +(score / (evals * 2)).toFixed(2) : 0;
  const weeksRun = weekStreak();
  let propose = false, reason = "";
  if (evals >= 6 && ratio >= 0.5) {
    propose = true;
    reason = "Nelle ultime 2 settimane oltre metà dei tuoi esercizi sono stati duri o non completati. Il corpo sta chiedendo tregua — e ignorarlo è il modo migliore per fermarsi un mese, non una settimana.";
  } else if (weeksRun >= 6 && evals >= 6 && ratio >= 0.35) {
    propose = true;
    reason = weeksRun + " settimane di fila senza pause e la fatica inizia a mordere. I muscoli crescono nel recupero: una settimana leggera ORA vale due pesanti DOPO.";
  }
  return { evals, ratio, weeksRun, propose, reason };
}

function startDeload() {
  const until = new Date(); until.setDate(until.getDate() + DELOAD_DAYS - 1);
  state.deload = { start: todayStr(), until: localDate(until) };
  saveState(state);
  renderWorkout();
  toast("🧊 Scarico attivo: carichi al -20% per 7 giorni. Testa fredda, tecnica perfetta.");
}
function snoozeDeload() {
  const until = new Date(); until.setDate(until.getDate() + 7);
  state.deload = { snoozeUntil: localDate(until) };
  saveState(state);
  renderWorkout();
  toast("Ok, il coach rispetta la scelta. Ne riparliamo tra una settimana — ma ascoltati.");
}

function renderDeloadBanner() {
  const host = $("deload-banner");
  if (!host) return;
  // scarico scaduto → si torna a spingere
  if (state.deload && state.deload.until && state.deload.until < todayStr()) {
    state.deload = null;
    saveState(state);
    toast("🔥 Scarico finito: pile ricaricate. Da oggi si torna a spingere.");
  }
  if (deloadActive()) {
    host.innerHTML = `
      <div class="deload-bar active">
        <span class="db-ico">🧊</span>
        <span class="db-txt"><b>Scarico attivo fino a ${fmtShort(state.deload.until)}</b> · carichi al -20%. Non barare verso l'alto: oggi vinci recuperando.</span>
      </div>`;
    return;
  }
  const snoozed = state.deload && state.deload.snoozeUntil && state.deload.snoozeUntil >= todayStr();
  const fa = fatigueAnalysis();
  if (fa.propose && !snoozed) {
    host.innerHTML = `
      <div class="deload-bar">
        <div class="db-head"><span class="db-ico">🧊</span><b>Il coach ha deciso: settimana di scarico.</b></div>
        <div class="db-txt">${fa.reason}</div>
        <div class="db-txt db-plan">Il piano: 7 giorni con gli stessi esercizi al <b>-20%</b>, tecnica maniacale. Poi si riparte a spingere più forte di prima.</div>
        <div class="db-btns">
          <button class="btn-outline" onclick="snoozeDeload()">Non ora</button>
          <button class="btn-save" onclick="startDeload()">🧊 Accetto lo scarico</button>
        </div>
      </div>`;
  } else {
    host.innerHTML = "";
  }
}

// SOVRACCARICO PROGRESSIVO — suggerimento per l'esercizio di oggi
// La tab Allena è SOLO preparazione: i valori toccati lì finiscono in
// state.prep e diventano gli obiettivi proposti dal guidato (che è
// l'unico posto dove una sessione viene davvero registrata).
function suggestion(exKey) {
  const sug = suggestionBase(exKey);
  const prep = (state.prep || {})[exKey];
  if (prep && prep.w != null) {
    sug.targetW = prep.w;
    if (prep.reps) sug.targetReps = prep.reps;
    sug.todayHtml = `Preparato da te: <strong>${sug.targetW} kg</strong> × ${sug.targetReps} 🎯`;
  }
  return sug;
}

function suggestionBase(exKey) {
  const meta = EXERCISES[exKey];
  const last = lastExercise(exKey);
  const inc = meta.type === "dumbbell" ? 2 : 2.5;   // +2 manubri, +2.5 macchine/cavi
  const baseReps = meta.reps;        // base del contenitore (es. 12)
  const capReps = baseReps + 3;      // tetto del contenitore (es. 15)

  if (!last) {
    return { last: null, todayHtml: `Scegli un peso che ti dia serie pulite`,
             color: "gray", targetW: null, targetReps: baseReps };
  }

  const w = Math.max(...last.sets.map(s => s.w));

  // 🧊 SCARICO ATTIVO — carichi al -20%, arrotondati al passo dell'attrezzo
  if (deloadActive()) {
    const dw = Math.max(inc, Math.floor((w * DELOAD_FACTOR) / inc) * inc);   // arrotonda in GIÙ: lo scarico non si bara
    const day0 = new Date(last.date + "T00:00:00").toLocaleDateString("it-IT", { weekday: "long" });
    return { last, lastW: w, lastR: Math.min(...last.sets.map(x => x.r)), lastSets: last.sets.length, day: day0,
             todayHtml: `Scarico: <strong>${dw} kg</strong> × ${baseReps} — leggero, lento, perfetto 🧊`,
             color: "deload", targetW: dw, targetReps: baseReps };
  }

  const minR = Math.min(...last.sets.map(s => s.r));
  const nSets = last.sets.length;
  const q = last.quality;
  const day = new Date(last.date + "T00:00:00").toLocaleDateString("it-IT", { weekday: "long" });
  const base = { last, lastW: w, lastR: minR, lastSets: nSets, day };

  // 🔴 ROSSO — giornata storta: stesso peso, stesse ripetizioni, riprova
  if (q === "fail") {
    return { ...base, todayHtml: `Giornata storta? Riprova uguale: stesso peso e ripetizioni`, color: "red", targetW: w, targetReps: minR };
  }
  // 🟡 GIALLO — faticoso: resta fermo finché non diventa pulito
  if (q === "hard") {
    return { ...base, todayHtml: `Resta su questo peso e ripetizioni finché non diventa pulito`, color: "yellow", targetW: w, targetReps: minR };
  }
  // 🟢 VERDE — cresci in reps dentro il contenitore, poi sali di peso e ricominci
  if (nSets < meta.sets) {
    return { ...base, todayHtml: `Aggiungi una serie in più 🎯`, color: "green", targetW: w, targetReps: minR };
  }
  if (minR >= capReps) {
    const nw = +(w + inc).toFixed(1);   // tetto pieno → sali di peso, svuota il contenitore
    return { ...base, todayHtml: `Tetto ripetizioni raggiunto: sali di peso e riparti dalle base 🎯`, color: "green", targetW: nw, targetReps: baseReps };
  }
  if (minR >= baseReps) {               // dentro il range → +1 ripetizione
    return { ...base, todayHtml: `Aggiungi una ripetizione per serie 🎯`, color: "green", targetW: w, targetReps: minR + 1 };
  }
  // sotto le ripetizioni base ma pulito → completa le base con questo peso
  return { ...base, todayHtml: `Completa le ripetizioni con questo peso 🎯`, color: "green", targetW: w, targetReps: baseReps };
}

// Sessione di oggi per la scheda corrente (se esiste)
function todaySession(workoutId) {
  return state.sessions.find(s => s.date === todayStr() && s.workoutId === workoutId);
}

/* ---------- NAV ---------- */
function switchView(view, btn) {
  document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
  document.querySelectorAll(".section").forEach(s => s.classList.remove("active"));
  if (btn) btn.classList.add("active");
  $(`section-${view}`).classList.add("active");
  window.scrollTo(0, 0);
  if (view === "progressi") renderProgress();
  if (view === "obiettivi") renderGoals();
  if (view === "calendario") renderCalendar();
  if (view === "pasti") renderMeals();
}
