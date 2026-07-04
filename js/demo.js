/* ============================================================
   DEMO — profilo di esempio per chi entra senza account.
   Genera al volo uno stato realistico e coerente ("Alex"):
   8 settimane di allenamenti con progressione e semaforo, peso,
   composizione, pasti, sedute PT, calendario. Vive SOLO in
   memoria: nessun salvataggio, nessuna sincronizzazione, e i
   dati reali eventualmente presenti sul dispositivo non vengono
   né mostrati né toccati.
   ============================================================ */
window.DEMO_MODE = false;

function demoState() {
  const s = defaultState();
  const day = (offset) => { const d = new Date(); d.setDate(d.getDate() + offset); return localDate(d); };

  s.profile = {
    name: "Alex", nick: "Alex", age: 28, sex: "M", height: 178,
    goal: "massa", level: "intermedio", daysPerWeek: 3,
    equipment: "palestra", limitations: "", onboarded: true
  };
  s.goals = { startWeight: 71, targetWeight: 78, targetDate: null, goalType: "massa", note: "" };
  s.nutriGoal = { kcal: null, protein: null };   // segue il coach

  // ---- 8 settimane di allenamenti (lun/mer/ven), rotazione A/B/C ----
  const baseW = { legpress: 80, chestpress: 40, latmachine: 45, shoulderpress: 20, curl: 10, tricipiti: 20,
                  hipthrust: 60, chestfly: 30, pulley: 40, lateral: 8, hammer: 10, frenchpress: 12,
                  legext: 35, legcurl: 30, reversefly: 25, facepull: 18 };
  const wids = ["fullbody", "fullbodyB", "fullbodyC"];
  const QUAL = ["clean", "clean", "clean", "hard", "clean", "hard", "fail"];  // mix realistico
  let qi = 0, sid = 1;
  const today = new Date();
  const dow = today.getDay();                                  // allinea al lunedì corrente
  const lastMon = -((dow + 6) % 7);
  for (let week = 8; week >= 1; week--) {
    [0, 2, 4].forEach((wd, di) => {
      const off = lastMon - week * 7 + wd;
      if (off >= 0) return;                                    // solo nel passato
      const wid = wids[(week * 3 + di) % 3];
      const w = WORKOUTS.find(x => x.id === wid);
      const prog = Math.floor((8 - week) / 2) * 2.5;           // +2.5 kg ogni 2 settimane
      const exercises = {};
      w.exercises.forEach(k => {
        if (EXERCISES[k].time) return;
        const base = baseW[k] || 20;
        const wt = base + (EXERCISES[k].type === "dumbbell" ? Math.floor(prog / 2.5) * 2 : prog);
        const q = QUAL[qi++ % QUAL.length];
        const reps = q === "fail" ? 9 : 12;
        exercises[k] = { sets: [{ w: wt, r: reps }, { w: wt, r: reps }, { w: wt, r: q === "fail" ? reps - 2 : reps }], quality: q };
      });
      const ds = day(off);
      s.sessions.push({ id: sid++, date: ds, workoutId: wid, exercises,
        duration: 50 + (sid % 3) * 5, calories: 320 + (sid % 4) * 20,
        notes: sid % 5 === 0 ? "Bella energia oggi." : "" });
      s.schedule[ds] = { workoutId: wid, done: true };
    });
  }

  // ---- prossimi allenamenti (domani, +3, +5 col PT) ----
  s.schedule[day(1)] = { workoutId: "fullbody", done: false };
  s.schedule[day(3)] = { workoutId: "fullbodyB", done: false };
  s.schedule[day(5)] = { workoutId: "pt", done: false, pt: true };

  // ---- peso settimanale in crescita (71.0 → ~73.2) ----
  for (let week = 8; week >= 0; week--) {
    const off = lastMon - week * 7;
    if (off > 0) continue;
    s.bodyweight.push({ date: day(off), v: +(71 + (8 - week) * 0.28).toFixed(1) });
  }

  // ---- composizione ogni 2 settimane ----
  [8, 6, 4, 2, 0].forEach((week, i) => {
    const off = lastMon - week * 7;
    if (off > 0) return;
    s.composition.push({
      date: day(off),
      weight: +(71 + i * 0.55).toFixed(1),
      bodyFat: +(16.5 - i * 0.3).toFixed(1),
      skeletalMuscle: +(55.2 + i * 0.45).toFixed(2),
      boneMass: 3.1, bodyWater: +(58.5 + i * 0.2).toFixed(1),
      bmr: 1710 + i * 12, metabolicAge: 27
    });
  });
  s.composition.sort((a, b) => a.date.localeCompare(b.date));
  s.bodyweight.sort((a, b) => a.date.localeCompare(b.date));

  // ---- sedute PT: panca/stacco/squat in progressione ----
  s.ptLifts = [
    { date: day(-24), panca: 60, squat: null, stacco: null },
    { date: day(-17), panca: null, squat: null, stacco: 100 },
    { date: day(-10), panca: null, squat: 85, stacco: null },
    { date: day(-3), panca: 65, squat: null, stacco: null }
  ];

  // ---- pasti: ultimi 10 giorni, vicini ai target ----
  for (let i = 9; i >= 0; i--) {
    const ds = day(-i);
    const wobble = (i * 37) % 5;
    s.meals[ds] = [
      { id: i * 10 + 1, kcal: 620 + wobble * 10, protein: 35, t: "08:10" },
      { id: i * 10 + 2, kcal: 850 + wobble * 15, protein: 48, t: "13:25" },
      { id: i * 10 + 3, kcal: 900 + wobble * 12, protein: 52 + wobble, t: "20:15" }
    ];
    if (i === 6) s.meals[ds].pop();                            // un giorno sgarrato, realistico
  }

  return s;
}

function enterDemoMode() {
  window.DEMO_MODE = true;
  state = demoState();
  mergeCustomExercises();
  state.badges = earnedBadgeIds();                             // trofei coerenti coi dati demo
  workoutManuallyChosen = false;
  if (typeof renderWorkoutChips === "function") { renderWorkoutChips(); renderWorkout(); }
  const active = document.querySelector(".section.active");
  const id = active ? active.id : "";
  if (id === "section-progressi" && typeof renderProgress === "function") renderProgress();
  if (id === "section-obiettivi" && typeof renderGoals === "function") renderGoals();
  if (id === "section-calendario" && typeof renderCalendar === "function") renderCalendar();
  if (id === "section-pasti" && typeof renderMeals === "function") renderMeals();
}

function exitDemoMode() {
  if (!window.DEMO_MODE) return;
  window.DEMO_MODE = false;
  state = loadState();                                         // torna ai dati reali del dispositivo
  mergeCustomExercises();
}
