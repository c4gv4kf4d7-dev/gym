/* ============================================================
   VISTA CALENDARIO
   ============================================================ */
function renderCalendar() {
  const year = calRef.getFullYear(), month = calRef.getMonth();
  const monthName = calRef.toLocaleDateString("it-IT", { month: "long", year: "numeric" });
  $("cal-month").textContent = monthName.charAt(0).toUpperCase() + monthName.slice(1);

  const first = new Date(year, month, 1);
  const startDay = (first.getDay() + 6) % 7; // lun=0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const dows = ["L", "M", "M", "G", "V", "S", "D"];

  let html = dows.map(d => `<div class="cal-dow">${d}</div>`).join("");
  for (let i = 0; i < startDay; i++) html += `<div class="cal-cell empty"></div>`;

  for (let d = 1; d <= daysInMonth; d++) {
    const ds = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const sched = state.schedule[ds];
    const isToday = ds === todayStr();
    const w = sched ? getWorkout(sched.workoutId) : null;
    // fatto anche SENZA programmazione: sessioni salvate e sedute PT contano
    const sess = state.sessions.find(x => x.date === ds);
    const ptDone = (state.ptLifts || []).some(l => l.date === ds);
    let dot = "";
    if (w) {
      dot = `<span class="cal-dot ${sched.done ? 'done' : ''}" style="background:${sched.pt ? '#A855F7' : w.color}" title="${w.name}${sched.done ? ' · fatto' : ''}">${sched.pt ? '🧑‍🏫' : w.emoji}</span>`;
    } else if (sess) {
      const sw = getWorkout(sess.workoutId);
      dot = `<span class="cal-dot done" style="background:${sw ? sw.color : '#9CA3AF'}" title="${sw ? sw.name : 'Allenamento'} · fatto">${sw ? sw.emoji : '🏋️'}</span>`;
    } else if (ptDone) {
      dot = `<span class="cal-dot done" style="background:#A855F7" title="Seduta PT · fatta">🧑‍🏫</span>`;
    }
    html += `
      <div class="cal-cell ${isToday ? 'today' : ''} ${(sched || sess || ptDone) ? 'has' : ''}" onclick="openDay('${ds}')">
        <span class="cal-num">${d}</span>
        <span class="cal-slot">${dot}</span>
      </div>`;
  }
  $("cal-grid").innerHTML = html;

  // prossimi allenamenti programmati
  const limit = new Date(); limit.setDate(limit.getDate() + 21);
  const limitStr = localDate(limit);
  const upcoming = Object.entries(state.schedule)
    .filter(([d]) => d >= todayStr() && d <= limitStr)
    .sort((a, b) => a[0].localeCompare(b[0]));
  const baseIdx = ptNextIndex();
  let ptCounter = 0;
  $("cal-upcoming").innerHTML = upcoming.length
    ? upcoming.map(([d, s]) => {
        const w = getWorkout(s.workoutId);
        const isPT = !!(s.pt || (w && w.pt));
        let nameHtml;
        if (isPT) {
          const moveIdx = (baseIdx + ptCounter) % PT_SEQUENCE.length; ptCounter++;
          nameHtml = `🧑‍🏫 PT — <b class="pt-next">${PT_SHORT[PT_SEQUENCE[moveIdx]]}</b>`;
        } else {
          // guardia: la scheda potrebbe essere stata eliminata dopo la programmazione
          nameHtml = w ? `${w.emoji} ${w.name}` : "🏋️ Allenamento";
        }
        return `<div class="up-row">
          <span class="up-dot" style="background:${isPT ? '#A855F7' : (w ? w.color : '#9CA3AF')}"></span>
          <span class="up-date">${fmtShort(d)}</span>
          <span class="up-name">${nameHtml}${(!isPT && s.note) ? ` <span class="up-note">· ${s.note}</span>` : ''}</span>
          <span class="up-status">${s.done ? '✓ fatto' : 'programmato'}</span>
        </div>`;
      }).join("")
    : `<div class="empty-mini">Nessun allenamento programmato. Tocca un giorno per aggiungerlo.</div>`;
}

function calNav(delta) { calRef.setMonth(calRef.getMonth() + delta); renderCalendar(); }

/* ---------- EXPORT ICS: gli allenamenti nel calendario di iPhone ----------
   Genera un file .ics con tutto il piano futuro (eventi giornata intera).
   È una fotografia: se sposti gli allenamenti, ri-esporti. */
function icsContent() {
  const t = todayStr();
  const entries = Object.entries(state.schedule || {})
    .filter(([d, s]) => d >= t && !s.done)
    .sort((a, b) => a[0].localeCompare(b[0]));
  if (!entries.length) return null;
  const baseIdx = ptNextIndex();
  let ptc = 0;
  const events = entries.map(([d, s]) => {
    const w = getWorkout(s.workoutId);
    const isPT = !!(s.pt || (w && w.pt));
    const title = isPT
      ? "🧑‍🏫 PT — " + PT_SHORT[PT_SEQUENCE[(baseIdx + ptc++) % PT_SEQUENCE.length]]
      : (w ? `${w.emoji} ${w.name}` : "Allenamento");
    const dt = d.replace(/-/g, "");
    const nd = new Date(d + "T00:00:00"); nd.setDate(nd.getDate() + 1);
    return [
      "BEGIN:VEVENT",
      "UID:gym-" + d + "@allenamento",
      "DTSTART;VALUE=DATE:" + dt,
      "DTEND;VALUE=DATE:" + localDate(nd).replace(/-/g, ""),
      "SUMMARY:" + title.replace(/[,;]/g, " "),
      "END:VEVENT"
    ].join("\r\n");
  }).join("\r\n");
  return "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Allenamento//IT\r\nCALSCALE:GREGORIAN\r\nX-WR-CALNAME:Allenamento\r\n" + events + "\r\nEND:VCALENDAR";
}

/* Pubblica l'ICS su Supabase Storage (bucket pubblico "calendars"):
   così il bottone può aprire un vero webcal:// e iOS si ABBONA al
   calendario — niente file, e gli aggiornamenti arrivano da soli. */
async function publishICS() {
  const c = window.__cloud || {};
  const user = c.user && c.user();
  if (!c.sb || !user || window.DEMO_MODE) return false;
  const ics = icsContent();
  if (!ics) return false;
  const { error } = await c.sb.storage.from("calendars")
    .upload(user.id + ".ics", new Blob([ics], { type: "text/calendar" }),
            { upsert: true, contentType: "text/calendar", cacheControl: "60" });
  return !error;
}
window.icsOnSync = function () { publishICS().then(() => {}, () => {}); };

async function exportICS() {
  const ics = icsContent();
  if (!ics) { toast("Nessun allenamento in programma da esportare"); return; }
  // 1) via maestra: abbonamento webcal:// (serve il login)
  const c = window.__cloud || {};
  const user = c.user && c.user();
  if (user && !window.DEMO_MODE) {
    toast("📅 Preparo il calendario…");
    const ok = await publishICS();
    if (ok) {
      const host = String(SUPABASE_URL).replace(/^https?:\/\//, "");
      window.location.href = `webcal://${host}/storage/v1/object/public/calendars/${user.id}.ics`;
      return;
    }
  }
  // 2) fallback (sloggati o storage non pronto): foglio di condivisione
  try {
    const file = new File([ics], "allenamenti.ics", { type: "text/calendar" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: "Allenamenti" });
      return;
    }
  } catch (e) { if (e && e.name === "AbortError") return; /* altrimenti fallback */ }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
  a.download = "allenamenti.ics";
  document.body.appendChild(a);
  a.click();
  a.remove();
  toast("📅 File creato: aprilo per aggiungere gli eventi al calendario");
}

function openDay(ds) {
  const d = new Date(ds + "T00:00:00").toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });
  $("modal-title").textContent = d.charAt(0).toUpperCase() + d.slice(1);

  // Se quel giorno è stato fatto un allenamento → mostra i dettagli, non il selettore
  const session = state.sessions.find(s => s.date === ds);
  if (session) {
    $("modal-body").innerHTML = sessionDetailHTML(session);
  } else {
    const sched = state.schedule[ds];
    $("modal-body").innerHTML = `
      <p class="modal-q">Quale scheda vuoi programmare?</p>
      <div class="modal-opts ${sched ? 'has-sel' : ''}">
        ${SCHEDULABLE().map(w => `
          <button class="modal-opt ${sched && sched.workoutId === w.id ? 'sel' : ''}"
                  style="border-color:${w.color};color:${sched && sched.workoutId === w.id ? w.color : 'var(--text)'}" onclick="assignDay('${ds}','${w.id}')">
            <span class="modal-opt-emoji">${w.emoji}</span>
            <span>${w.name}</span>
          </button>`).join("")}
      </div>
      ${sched ? `<button class="modal-clear" onclick="clearDay('${ds}')">🗑 Rimuovi programmazione</button>` : ''}`;
  }
  $("modal").classList.add("show");
}

function sessionDetailHTML(s) {
  const w = getWorkout(s.workoutId);
  const sched = state.schedule[s.date];
  const meta = [
    s.duration ? `⏱ ${s.duration} min` : null,
    s.calories ? `🔥 ${s.calories} kcal` : null,
    `🏋️ ${Math.round(sessionVolume(s))} kg di volume`
  ].filter(Boolean);

  const rows = Object.keys(s.exercises || {})
    .map(k => {
      const sets = s.exercises[k].sets;
      const q = s.exercises[k].quality;
      const qIcon = q === 'clean' ? '✅' : q === 'hard' ? '⚠️' : q === 'fail' ? '❌' : '';
      const pr = bestPR(k);
      const max = Math.max(...sets.map(x => x.w));
      const isPr = max >= pr && pr > 0;
      return `<div class="sd-row">
        <span class="sd-name">${EXERCISES[k] ? EXERCISES[k].name : k}${isPr ? ' 🏆' : ''} ${qIcon}</span>
        <span class="sd-sets">${sets.map(x => `${x.w}×${x.r}`).join(' · ')}</span>
      </div>`;
    }).join("");

  return `
    <div class="sd-head" style="background:${w ? w.color : '#999'}">
      <div class="sd-title">${w ? w.emoji + ' ' + w.name : 'Sessione'} ✓</div>
      ${sched && sched.note ? `<div class="sd-note">${sched.note}</div>` : ''}
    </div>
    <div class="sd-meta">${meta.join(' &nbsp;·&nbsp; ')}</div>
    <div class="sd-list">${rows || '<div class="empty-mini">Nessun peso registrato.</div>'}</div>
    ${s.notes ? `<div class="sd-notes">📝 ${s.notes}</div>` : ''}
    <button class="btn-save" style="margin-top:14px" onclick="closeModal();openRecap(${s.id})">📸 Riepilogo da salvare</button>
    <button class="modal-clear" onclick="deleteSession(${s.id})">🗑 Elimina questa sessione</button>`;
}

function deleteSession(id) {
  const sess = state.sessions.find(x => x.id === id);
  if (!sess) return;
  const schedEntry = state.schedule[sess.date];
  state.sessions = state.sessions.filter(x => x.id !== id);
  if (schedEntry && schedEntry.done && !state.sessions.some(x => x.date === sess.date)) {
    state.schedule[sess.date] = Object.assign({}, schedEntry, { done: false });
  }
  saveState(state); closeModal(); renderCalendar();
  toastUndo("🗑 Sessione del " + fmtShort(sess.date) + " eliminata.", () => {
    state.sessions.push(sess);
    state.sessions.sort((a, b) => a.date.localeCompare(b.date));
    if (schedEntry) state.schedule[sess.date] = schedEntry;
    saveState(state); renderCalendar();
  });
}

function assignDay(ds, workoutId) {
  const prev = state.schedule[ds];
  const w = getWorkout(workoutId);
  state.schedule[ds] = { workoutId, done: prev ? prev.done : false };
  if (w && w.pt) state.schedule[ds].pt = true;
  if (prev && prev.note) state.schedule[ds].note = prev.note;
  saveState(state);
  closeModal();
  renderCalendar();
}

function clearDay(ds) {
  delete state.schedule[ds];
  saveState(state);
  closeModal();
  renderCalendar();
}

function closeModal() { $("modal").classList.remove("show"); }
