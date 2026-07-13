/* ============================================================
   MODALITÀ ALLENAMENTO GUIDATA
   ============================================================ */
let guided = null;

const Q_ICON = {
  clean: `<svg viewBox="0 0 24 24" fill="none"><path d="M5 12.5l4.2 4.2L19 7" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  hard:  `<svg viewBox="0 0 24 24" fill="#fff"><path d="M12 2s5 3.6 5 8.8a5 5 0 11-10 0c0-1.8 1-3.2 1-3.2s.6 2.1 2.1 2.7C11.2 8.7 9 6.8 12 2z"/></svg>`,
  fail:  `<svg viewBox="0 0 24 24" fill="none"><path d="M6 9.5l6 6 6-6" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`
};

const G_MOTTOS = [
  "Una macchina alla volta, stai andando alla grande! 🔥",
  "Bella serie! Avanti con la prossima 💪",
  "Sei in pieno flow, non mollare 🚀",
  "Ogni esercizio è un mattone verso il tuo obiettivo 🧱",
  "Concentrato e preciso: così si cresce 🎯",
  "Quasi fatto, dai il meglio anche qui ⚡",
  "Stai costruendo il tuo fisico, serie dopo serie 🛠️"
];

// Messaggio motivazionale per esercizio, calibrato sull'ultima volta
function guidedMotivation(key) {
  if (deloadActive()) return "🧊 Settimana di scarico: -20%, esecuzione da manuale. Chi sa scaricare, poi stacca tutti.";
  const last = lastExercise(key);
  if (!last) return "🆕 Prima volta qui: trova il tuo peso, tecnica prima di tutto.";
  const q = last.quality;
  if (q === "clean") return "✅ L'ultima volta: tutto pulito. Oggi si spinge — è il giorno giusto per salire.";
  if (q === "hard") return "⚠️ L'ultima volta le hai sudate tutte. Oggi consolidiamo: stesso carico, chiudile da padrone.";
  if (q === "fail") return "❌ L'ultima volta non l'hai chiuso. Oggi si arriva in fondo, costi quel che costi.";
  return "📊 L'ultima volta non l'hai valutato: oggi chiudi le serie e dimmi com'è andata.";
}

function gMeta() { return EXERCISES[guided.keys[guided.exIndex]]; }
function gKey() { return guided.keys[guided.exIndex]; }

const GUIDED_KEY = "guided_session_v2";
function guidedSnapshot() {
  return { workoutId: guided.workoutId, keys: guided.keys, exIndex: guided.exIndex, setIndex: guided.setIndex, phase: guided.phase, data: guided.data, next: guided.next, status: guided.status };
}
function saveGuided() { try { localStorage.setItem(GUIDED_KEY, JSON.stringify(guidedSnapshot())); } catch (e) {} }
function loadGuided() { try { const r = localStorage.getItem(GUIDED_KEY); return r ? JSON.parse(r) : null; } catch (e) { return null; } }
function clearGuided() { localStorage.removeItem(GUIDED_KEY); }

function startGuided() {
  clearGuided();
  const w = getWorkout(currentWorkoutId);
  guided = { workoutId: w.id, keys: w.exercises.slice(), exIndex: 0, setIndex: 0, phase: "set", data: {}, status: {}, timer: null, next: null, history: [], menuReturn: "set" };
  $("guided").classList.add("show");
  document.body.style.overflow = "hidden";
  renderGuided();
}

function closeGuidedOverlay() {
  if (guided && guided.timer) clearInterval(guided.timer);
  guided = null;
  $("guided").classList.remove("show");
  $("guided").innerHTML = "";
  document.body.style.overflow = "";
}

// Chiusura con ✕ → mette in pausa e salva (riprendibile)
function pauseGuided() {
  if (!guided) return;
  if (guided.timer) { clearInterval(guided.timer); guided.timer = null; }
  if (guided.phase === "menu") guided.phase = guided.menuReturn || "set";   // non riaprire sul menù
  saveGuided();
  closeGuidedOverlay();
  renderWorkout();
}

function resumeGuided() {
  const snap = loadGuided();
  if (!snap) return;
  guided = Object.assign({ timer: null, history: [], status: {}, menuReturn: "set" }, snap);
  if (guided.phase === "menu") guided.phase = guided.menuReturn || "set";
  currentWorkoutId = guided.workoutId;
  renderWorkoutChips();
  $("guided").classList.add("show");
  document.body.style.overflow = "hidden";
  renderGuided();
}

function discardGuided() {
  const snap = loadGuided();
  const w = snap ? getWorkout(snap.workoutId) : null;
  $("modal-title").textContent = "Terminare l'allenamento?";
  $("modal-body").innerHTML = `
    <p class="modal-q">Sei sicuro di voler terminare l'allenamento in pausa${w ? ` (${w.emoji} ${w.name})` : ''}? I dati di questa sessione non ancora salvati andranno persi.</p>
    <div class="confirm-row">
      <button class="confirm-cancel" onclick="closeModal(); resumeGuided()">No, riprendi</button>
      <button class="confirm-danger" onclick="doDiscardGuided()">Sì, termina</button>
    </div>`;
  $("modal").classList.add("show");
}

function doDiscardGuided() {
  clearGuided();
  closeModal();
  renderWorkout();
}

function renderGuidedResume() {
  const el = $("guided-resume");
  if (!el) return;
  const snap = loadGuided();
  if (!snap) { el.innerHTML = ""; return; }
  const w = getWorkout(snap.workoutId);
  el.innerHTML = `
    <div class="resume-bar">
      <div class="resume-info">⏸️ Allenamento in pausa
        <span>${w ? w.emoji + ' ' + w.name : ''} · esercizio ${snap.exIndex + 1}/${snap.keys.length}</span>
      </div>
      <button class="resume-btn" onclick="resumeGuided()">Riprendi ▶︎</button>
      <button class="resume-x" onclick="discardGuided()" title="Elimina">✕</button>
    </div>`;
}

function gStore(key) { if (!guided.data[key]) guided.data[key] = { sets: [], quality: null }; return guided.data[key]; }

// Box "Occhio a" con i punti tecnici del PT
// Cues/passi/tip con fallback per nome-slug: gli esercizi custom (schede PT)
// hanno chiavi variabili, ma il nome è stabile.
function exSlugOf(key) { return nameSlug((EXERCISES[key] || {}).name); }
function stepsFor(key) {
  if (typeof EXERCISE_STEPS === "undefined") return null;
  return EXERCISE_STEPS[key] || EXERCISE_STEPS[exSlugOf(key)] || null;
}
function tipFor(ex) {
  const isPlaceholder = ex.tip && ex.tip.indexOf("importato dalla scheda") >= 0;
  if (isPlaceholder && typeof EXERCISE_TIPS_BYNAME !== "undefined") {
    const t = EXERCISE_TIPS_BYNAME[nameSlug(ex.name)];
    if (t) return t;
  }
  return ex.tip;
}

function cuesHTML(key) {
  const c = (typeof EXERCISE_CUES !== "undefined" && (EXERCISE_CUES[key] || EXERCISE_CUES[exSlugOf(key)])) || [];
  if (!c.length) return "";
  return `<div class="g-cues">
    <div class="g-cues-h">👁️ Occhio a…</div>
    <ul>${c.map(x => `<li>${x}</li>`).join("")}</ul>
  </div>`;
}

function renderGuided() {
  const meta = gMeta(), key = gKey();
  const N = guided.keys.length;
  const totalSets = meta.sets;
  const done = Object.values(guided.status || {}).filter(s => s === "done").length;
  const pct = Math.round((done / N) * 100);
  const canBack = (guided.history || []).length > 0;
  const top = `
    <div class="g-top">
      <button class="g-close" onclick="pauseGuided()" title="Metti in pausa">✕</button>
      <button class="g-back" onclick="guidedBack()" ${canBack ? '' : 'style="visibility:hidden"'} title="Indietro">‹</button>
      <div class="g-prog">${done}/${N} completati</div>
      ${guided.phase !== "menu" ? `<button class="g-menu-btn" onclick="openMenu()" title="Esercizi">☰</button>` : ''}
    </div>
    <div class="g-bar"><div class="g-bar-fill" style="width:${pct}%"></div></div>`;

  let body = "";
  if (guided.phase === "menu") {
    body = `
      <div class="g-body g-menu">
        <div class="g-menu-h">Esercizi · tocca per andarci</div>
        <div class="g-menu-list">
          ${guided.keys.map((k, idx) => {
            const st = guided.status[k], cur = idx === guided.exIndex;
            const ic = st === "done" ? "✓" : cur ? "●" : st === "skipped" ? "↪" : "○";
            const cls = st === "done" ? "gm-done" : cur ? "gm-cur" : st === "skipped" ? "gm-skip" : "gm-todo";
            const logged = (guided.data[k] && guided.data[k].sets.length) || 0;
            const sub = st === "done" ? "fatto" : st === "skipped" ? "saltato — da riprendere" : cur ? "in corso" : (logged ? logged + " serie fatte" : "da fare");
            return `<button class="g-menu-row ${cls}" onclick="jumpTo(${idx})">
              <span class="gm-ic">${ic}</span>
              <span class="gm-name">${EXERCISES[k].name}</span>
              <span class="gm-sub">${sub}</span>
            </button>`;
          }).join("")}
        </div>
        <button class="g-finish" onclick="finishGuided()">✅ Termina e salva ora</button>
        <button class="g-skip" onclick="closeMenu()">Continua l'allenamento</button>
      </div>`;
  } else if (guided.phase === "nextex") {
    const nkey = guided.keys[guided.next.exIndex];
    const nmeta = EXERCISES[nkey];
    const motto = G_MOTTOS[guided.exIndex % G_MOTTOS.length];
    const [badgeClass, badgeLabel] = badgeMap[nmeta.type];
    body = `
      <div class="g-body">
        <div class="g-trans-lbl">Prossimo esercizio</div>
        <img class="g-gif" src="assets/gifs/${nkey}.gif" onerror="gifFallback(this,'${nameSlug(nmeta.name)}')">
        <div class="g-name">${nmeta.name}</div>
        <div class="g-muscle">${nmeta.muscle} · <span class="g-eq">${badgeLabel}</span></div>
        <div class="g-motto">${motto}</div>
        <button class="g-done" onclick="guidedAdvance()">Vai → ${nmeta.name}</button>
      </div>`;
  } else if (guided.phase === "quality") {
    body = `
      <div class="g-body">
        <div class="g-qname">${meta.name}</div>
        <div class="g-qq">Com'è andata?</div>
        <div class="g-qcol">
          <button class="gq gq-clean" onclick="guidedQuality('clean')">
            <span class="gq-ico">${Q_ICON.clean}</span>
            <span class="gq-txt"><b>Pulito</b><small>Controllo totale, posso spingere</small></span>
          </button>
          <button class="gq gq-hard" onclick="guidedQuality('hard')">
            <span class="gq-ico">${Q_ICON.hard}</span>
            <span class="gq-txt"><b>Tosta</b><small>Completata ma a fatica</small></span>
          </button>
          <button class="gq gq-fail" onclick="guidedQuality('fail')">
            <span class="gq-ico">${Q_ICON.fail}</span>
            <span class="gq-txt"><b>Non finita</b><small>Forma persa o reps saltate</small></span>
          </button>
        </div>
      </div>`;
  } else if (guided.phase === "finish") {
    const nEx = Object.keys(guided.data).filter(k => guided.data[k].sets.length).length;
    body = `
      <div class="g-body">
        <div class="g-trans-lbl">Allenamento completato 🎉</div>
        <div class="g-name">Grande lavoro!</div>
        <div class="g-muscle">${nEx} esercizi registrati · due dati opzionali e chiudiamo</div>
        <div class="g-inputs" style="margin-top:18px">
          <div class="g-ig"><div class="g-ilbl">Durata (min)</div><input id="g-f-dur" type="number" inputmode="numeric" min="0" max="300" placeholder="—"></div>
          <div class="g-ix">·</div>
          <div class="g-ig"><div class="g-ilbl">Calorie</div><input id="g-f-cal" type="number" inputmode="numeric" min="0" max="3000" placeholder="—"></div>
        </div>
        <textarea class="g-notes" id="g-f-notes" placeholder="📝 Note sessione: energia, dolori, come ti sei sentito… (opzionale)"></textarea>
        <button class="g-done" onclick="guidedCommit()">💾 Salva sessione</button>
      </div>`;
  } else if (meta.time) {
    // plank: hold a tempo
    body = `
      <div class="g-body">
        <img class="g-gif" src="assets/gifs/${key}.gif" onerror="gifFallback(this,'${nameSlug(meta.name)}')">
        <div class="g-name">${meta.name}</div>
        <div class="g-muscle">${meta.muscle}</div>
        ${cuesHTML(key)}
        <div class="g-rest-time" id="g-hold">${parseInt(meta.time) || 30}"</div>
        <button class="g-done" id="g-holdbtn" onclick="guidedHold()">▶︎ Avvia ${parseInt(meta.time) || 30}"</button>
        <button class="g-skip" onclick="skipCurrent()">⤼ Salta — riprendi dopo</button>
      </div>`;
  } else {
    // set con peso × reps
    const sug = suggestion(key);
    const dset = guided.data[key] && guided.data[key].sets;
    const prevW = dset && dset.length ? dset[dset.length - 1].w : (sug.targetW != null ? sug.targetW : "");
    const prevR = dset && dset.length ? dset[dset.length - 1].r : (sug.targetReps != null ? sug.targetReps : "");
    body = `
      <div class="g-body">
        <img class="g-gif" src="assets/gifs/${key}.gif" onerror="gifFallback(this,'${nameSlug(meta.name)}')">
        <div class="g-name">${meta.name}</div>
        <div class="g-muscle">${meta.muscle} · Serie ${Math.min(guided.setIndex + 1, totalSets)}/${totalSets}</div>
        ${guided.setIndex === 0 ? `<div class="g-mot">${guidedMotivation(key)}</div>` : `<div class="g-sugg sugg-${sug.color}"><span class="sugg-label">Oggi:</span> ${sug.todayHtml}</div>`}
        ${cuesHTML(key)}
        <div class="g-inputs">
          <div class="g-ig"><div class="g-ilbl">Peso (kg)</div>
            <div class="g-step"><button class="g-pm" onclick="gStep('g-w',-2.5)">−</button><input id="g-w" type="number" inputmode="decimal" value="${prevW}" min="0" max="500" step="2.5"><button class="g-pm" onclick="gStep('g-w',2.5)">＋</button></div>
          </div>
          <div class="g-ix">×</div>
          <div class="g-ig"><div class="g-ilbl">Ripetizioni</div>
            <div class="g-step"><button class="g-pm" onclick="gStep('g-r',-1)">−</button><input id="g-r" type="number" inputmode="numeric" value="${prevR}" min="0" max="50"><button class="g-pm" onclick="gStep('g-r',1)">＋</button></div>
          </div>
        </div>
        <button class="g-done" onclick="guidedCompleteSet()">✓ Serie completata</button>
        <button class="g-skip" onclick="skipCurrent()">⤼ Salta — macchina occupata</button>
      </div>`;
  }
  $("guided").innerHTML = top + body;
  saveGuided();
}

function gStep(id, delta) {
  const e = $(id);
  const v = parseFloat(String(e.value).replace(",", ".")) || 0;
  e.value = Math.max(0, Math.round((v + delta) * 10) / 10);
}

function guidedCompleteSet() {
  const meta = gMeta(), key = gKey();
  if (!meta.time) {
    const wv = parseFloat($("g-w").value);
    const rv = parseInt($("g-r").value);
    if (isNaN(wv) || wv <= 0) { toast("Inserisci il peso della serie"); return; }
    gPush();
    gStore(key).sets.push({ w: wv, r: isNaN(rv) ? meta.reps : rv });
  } else {
    gPush();
  }
  if (guided.setIndex < meta.sets - 1) {
    guided.setIndex++;            // serie successiva, senza recupero (lo gestisci tu sull'Apple Watch)
    guided.phase = "set";
    renderGuided();
  } else if (!meta.time) {
    guided.phase = "quality";
    renderGuided();
  } else {
    goNextExercise();
  }
}

function guidedHold() {
  const btn = $("g-holdbtn"), el = $("g-hold");
  if (guided.timer) return;
  let rem = parseInt(gMeta().time) || 30;
  btn.textContent = "In corso...";
  guided.timer = setInterval(() => {
    rem--;
    if (rem <= 0) { clearInterval(guided.timer); guided.timer = null; guidedCompleteSet(); }
    else el.textContent = rem + '"';
  }, 1000);
}

function guidedQuality(q) {
  gPush();
  gStore(gKey()).quality = q;
  goNextExercise();
}

// indice del prossimo esercizio NON ancora completato (escluso quello corrente)
function nextPendingIndex(from) {
  const n = guided.keys.length;
  for (let i = 1; i < n; i++) {
    const idx = (from + i) % n;
    if (guided.status[guided.keys[idx]] !== "done") return idx;
  }
  return -1;
}
// da quale serie ripartire per un esercizio (continua se già iniziato)
function resumeSet(key) {
  const len = (guided.data[key] && guided.data[key].sets.length) || 0;
  return Math.min(len, EXERCISES[key].sets - 1);
}

function goNextExercise() {
  guided.status[gKey()] = "done";
  const ni = nextPendingIndex(guided.exIndex);
  if (ni < 0) { finishGuided(); return; }   // tutti completati
  guided.next = { exIndex: ni, setIndex: resumeSet(guided.keys[ni]) };
  guided.phase = "nextex";
  renderGuided();
}

// Salta l'esercizio corrente (macchina occupata) → vai al prossimo da fare, lo riprendi dopo
function skipCurrent() {
  const ni = nextPendingIndex(guided.exIndex);
  if (ni < 0) { toast("È l'ultimo esercizio rimasto 💪"); return; }
  gPush();
  guided.status[gKey()] = "skipped";
  guided.exIndex = ni;
  guided.setIndex = resumeSet(gKey());
  guided.phase = "set";
  renderGuided();
}

// Menù esercizi: salta a uno qualsiasi (anche per riprenderne uno saltato)
function openMenu() { guided.menuReturn = guided.phase; guided.phase = "menu"; renderGuided(); }
function closeMenu() { guided.phase = guided.menuReturn || "set"; renderGuided(); }
function jumpTo(idx) {
  guided.exIndex = idx;
  guided.setIndex = resumeSet(guided.keys[idx]);
  guided.phase = "set";
  renderGuided();
}

function applyNext() {
  guided.exIndex = guided.next.exIndex;
  guided.setIndex = guided.next.setIndex;
  guided.phase = "set";
  renderGuided();
}
function guidedAdvance() { gPush(); applyNext(); }   // pulsante "Vai →" (annullabile)

// salva lo stato corrente per poter tornare indietro
function gPush() {
  guided.history = guided.history || [];
  guided.history.push(JSON.parse(JSON.stringify({
    exIndex: guided.exIndex, setIndex: guided.setIndex, phase: guided.phase,
    data: guided.data, next: guided.next, status: guided.status
  })));
}
function guidedBack() {
  if (!guided.history || !guided.history.length) return;
  if (guided.timer) { clearInterval(guided.timer); guided.timer = null; }
  Object.assign(guided, guided.history.pop());
  renderGuided();
}

function finishGuided() {
  const any = Object.keys(guided.data).some(k => guided.data[k].sets.length);
  if (!any) { clearGuided(); closeGuidedOverlay(); toast("Allenamento chiuso (nessun dato)"); return; }
  guided.phase = "finish";
  renderGuided();
}

function guidedCommit() {
  const exercises = {};
  Object.keys(guided.data).forEach(k => {
    if (guided.data[k].sets.length) exercises[k] = guided.data[k];
  });
  const duration = parseInt($("g-f-dur").value) || null;
  const calories = parseInt($("g-f-cal").value) || null;
  const notes = $("g-f-notes").value.trim().replace(/[<>]/g, "");
  const wid = guided.workoutId;
  clearGuided();
  closeGuidedOverlay();
  commitSession(wid, exercises, { duration, calories, notes });
}
