/* ============================================================
   SETUP — onboarding nuovo utente + costruzione scheda
   (wizard a step, preset, builder manuale con analisi, import PT)
   ============================================================ */
(function () {

  /* ---------- CALCOLO TARGET (Mifflin-St Jeor) ---------- */
  function computeTargets(p) {
    const w = p.weight || 70, h = p.height || 175, age = p.age || 30;
    const bmr = Math.round(10 * w + 6.25 * h - 5 * age + (p.sex === "F" ? -161 : 5));
    const act = (p.daysPerWeek >= 5) ? 1.65 : (p.daysPerWeek >= 3) ? 1.5 : 1.35;
    const tdee = Math.round(bmr * act);
    const adj = { massa: 300, dimagrimento: -400, forza: 150, benessere: 0 }[p.goal] || 0;
    const kcal = Math.round((tdee + adj) / 10) * 10;
    const gPerKg = { massa: 1.9, dimagrimento: 2.0, forza: 1.8, benessere: 1.4 }[p.goal] || 1.6;
    const protein = Math.round(w * gPerKg);
    return { bmr, tdee, kcal, protein };
  }

  const GOAL_LABEL = { massa: "Massa muscolare", dimagrimento: "Dimagrimento", forza: "Forza", benessere: "Benessere" };
  const LEVEL_LABEL = { principiante: "Principiante", intermedio: "Intermedio", avanzato: "Avanzato" };

  /* ---------- WIZARD ONBOARDING ---------- */
  let ob = {};       // risposte raccolte
  let obStep = 0;

  const STEPS = [
    {
      id: "welcome", title: "Benvenuto! 👋",
      html: () => `
        <p class="ob-lead">Costruiamo la <b>tua</b> app in un paio di minuti: profilo, obiettivi e scheda su misura.</p>
        <input class="ob-input" id="ob-name" placeholder="Come ti chiami?" maxlength="20" value="${ob.name || ""}">`,
      save: () => { ob.name = val("ob-name"); return ob.name ? null : "Dimmi almeno il nome 🙂"; }
    },
    {
      id: "body", title: "Chi sei 📏",
      html: () => `
        <div class="ob-grid">
          <div class="ob-field"><label>Età</label><input class="ob-input" id="ob-age" type="number" inputmode="numeric" min="14" max="99" value="${ob.age || ""}"></div>
          <div class="ob-field"><label>Sesso</label>
            <div class="ob-seg" id="ob-sex">
              <button data-v="M" class="${ob.sex === "M" ? "sel" : ""}">M</button>
              <button data-v="F" class="${ob.sex === "F" ? "sel" : ""}">F</button>
            </div></div>
          <div class="ob-field"><label>Altezza (cm)</label><input class="ob-input" id="ob-h" type="number" inputmode="numeric" min="120" max="230" value="${ob.height || ""}"></div>
          <div class="ob-field"><label>Peso (kg)</label><input class="ob-input" id="ob-w" type="number" inputmode="decimal" step="0.1" min="30" max="250" value="${ob.weight || ""}"></div>
        </div>`,
      mount: () => segInit("ob-sex", v => ob.sex = v),
      save: () => {
        ob.age = num("ob-age"); ob.height = num("ob-h"); ob.weight = num("ob-w");
        if (!ob.age || !ob.height || !ob.weight) return "Compila età, altezza e peso";
        if (!ob.sex) return "Seleziona il sesso (serve per il calcolo calorie)";
        return null;
      }
    },
    {
      id: "goal", title: "Il tuo obiettivo 🎯",
      html: () => obChoice("ob-goal", ob.goal, [
        ["massa", "💪", "Massa muscolare", "Costruire muscolo con un surplus pulito"],
        ["dimagrimento", "🔥", "Dimagrimento", "Perdere grasso mantenendo il muscolo"],
        ["forza", "🏋️", "Forza", "Alzare di più sui fondamentali"],
        ["benessere", "🌿", "Benessere", "Muoversi, stare bene, tenersi in forma"]
      ]),
      mount: () => choiceInit("ob-goal", v => ob.goal = v),
      save: () => ob.goal ? null : "Scegli un obiettivo"
    },
    {
      id: "level", title: "Esperienza e frequenza 📆",
      html: () => `
        ${obChoice("ob-level", ob.level, [
          ["principiante", "🌱", "Principiante", "Meno di 6 mesi di palestra"],
          ["intermedio", "⚙️", "Intermedio", "Da 6 mesi a 2 anni"],
          ["avanzato", "🚀", "Avanzato", "Oltre 2 anni con costanza"]
        ])}
        <div class="ob-field" style="margin-top:14px"><label>Giorni a settimana</label>
          <div class="ob-seg" id="ob-days">${[2,3,4,5,6].map(d => `<button data-v="${d}" class="${ob.daysPerWeek === d ? "sel" : ""}">${d}</button>`).join("")}</div>
        </div>`,
      mount: () => { choiceInit("ob-level", v => ob.level = v); segInit("ob-days", v => ob.daysPerWeek = +v); },
      save: () => (!ob.level) ? "Scegli il livello" : (!ob.daysPerWeek ? "Quanti giorni ti alleni?" : null)
    },
    {
      id: "extra", title: "Ultimi dettagli 🔧",
      html: () => `
        <div class="ob-field"><label>Limitazioni fisiche (opzionale)</label>
          <input class="ob-input" id="ob-lim" placeholder="Es. spalla dx delicata, mal di schiena…" value="${ob.limitations || ""}"></div>
        <div class="ob-field" style="margin-top:12px"><label>Attrezzatura disponibile</label>
          <div class="ob-seg" id="ob-equip">
            <button data-v="palestra" class="${ob.equipment === "palestra" ? "sel" : ""}">Palestra completa</button>
            <button data-v="base" class="${ob.equipment === "base" ? "sel" : ""}">Manubri/base</button>
            <button data-v="corpo" class="${ob.equipment === "corpo" ? "sel" : ""}">Corpo libero</button>
          </div></div>`,
      mount: () => segInit("ob-equip", v => ob.equipment = v),
      save: () => { ob.limitations = val("ob-lim"); return ob.equipment ? null : "Scegli l'attrezzatura"; }
    },
    {
      id: "targets", title: "I tuoi target 🍽️",
      html: () => {
        const t = computeTargets(ob);
        ob._t = t;
        return `
        <p class="ob-lead">Calcolati sul tuo profilo (BMR ~${t.bmr} kcal, mantenimento ~${t.tdee}). <br>Se hai un PT con target diversi, modificali pure.</p>
        <div class="ob-grid">
          <div class="ob-field"><label>🔥 Calorie / giorno</label><input class="ob-input" id="ob-kcal" type="number" inputmode="numeric" value="${t.kcal}"></div>
          <div class="ob-field"><label>💪 Proteine (g) / giorno</label><input class="ob-input" id="ob-prot" type="number" inputmode="numeric" value="${t.protein}"></div>
        </div>`;
      },
      save: () => { ob.kcal = num("ob-kcal") || ob._t.kcal; ob.protein = num("ob-prot") || ob._t.protein; return null; }
    }
  ];

  function obChoice(id, sel, items) {
    return `<div class="ob-choices" id="${id}">${items.map(([v, e, t, s]) => `
      <button class="ob-choice ${sel === v ? "sel" : ""}" data-v="${v}">
        <span class="ob-choice-emoji">${e}</span>
        <span class="ob-choice-txt"><b>${t}</b><small>${s}</small></span>
      </button>`).join("")}</div>`;
  }
  function choiceInit(id, cb) {
    document.querySelectorAll(`#${id} .ob-choice`).forEach(b => b.onclick = () => {
      document.querySelectorAll(`#${id} .ob-choice`).forEach(x => x.classList.remove("sel"));
      b.classList.add("sel"); cb(b.dataset.v);
    });
  }
  function segInit(id, cb) {
    document.querySelectorAll(`#${id} button`).forEach(b => b.onclick = () => {
      document.querySelectorAll(`#${id} button`).forEach(x => x.classList.remove("sel"));
      b.classList.add("sel"); cb(b.dataset.v);
    });
  }
  const val = (id) => { const e = document.getElementById(id); return e ? e.value.trim() : ""; };
  const num = (id) => { const v = parseFloat(val(id)); return isNaN(v) ? null : v; };

  function overlay() { return document.getElementById("setup-overlay"); }

  function renderStep() {
    const s = STEPS[obStep];
    overlay().innerHTML = `
      <div class="ob-box">
        <button class="ob-close" onclick="closeSetup()" aria-label="Chiudi">✕</button>
        <div class="ob-progress">${STEPS.map((_, i) => `<span class="${i <= obStep ? "on" : ""}"></span>`).join("")}</div>
        <div class="ob-title">${s.title}</div>
        <div class="ob-body">${s.html()}</div>
        <div class="ob-err" id="ob-err"></div>
        <div class="ob-nav">
          ${obStep > 0 ? '<button class="btn-outline ob-back">Indietro</button>' : '<span></span>'}
          <button class="btn-save ob-next">${obStep === STEPS.length - 1 ? "Crea il mio profilo ✨" : "Avanti"}</button>
        </div>
      </div>`;
    if (s.mount) s.mount();
    const back = overlay().querySelector(".ob-back");
    if (back) back.onclick = () => { obStep--; renderStep(); };
    overlay().querySelector(".ob-next").onclick = () => {
      const err = s.save ? s.save() : null;
      if (err) { document.getElementById("ob-err").textContent = err; return; }
      if (obStep < STEPS.length - 1) { obStep++; renderStep(); }
      else finishOnboarding();
    };
  }

  function finishOnboarding() {
    state.profile = Object.assign(state.profile || {}, {
      name: ob.name, nick: state.profile.nick || ob.name,
      age: ob.age, sex: ob.sex, height: ob.height,
      goal: ob.goal, level: ob.level, daysPerWeek: ob.daysPerWeek,
      limitations: ob.limitations || "", equipment: ob.equipment,
      onboarded: true
    });
    state.nutriGoal = { kcal: ob.kcal, protein: ob.protein };
    // Registra il peso come prima misurazione SOLO se non ce ne sono già:
    // chi ha uno storico non deve vederselo sovrascritto dall'onboarding.
    state.bodyweight = state.bodyweight || [];
    if (!state.bodyweight.length) state.bodyweight.push({ date: todayStr(), v: ob.weight });
    if (state.goals && state.goals.startWeight == null) state.goals.startWeight = ob.weight;
    saveState(state);
    showBuilderChooser(true);
  }

  window.startOnboarding = function (prefill) {
    if (prefill && state.profile && state.profile.onboarded) { renderEditForm(); return; }
    ob = {};
    obStep = 0;
    overlay().classList.add("show");
    renderStep();
  };

  /* ---------- MODIFICA PROFILO (form unico, niente wizard) ---------- */
  function renderEditForm() {
    const p = state.profile || {};
    const sel = (opts, cur) => opts.map(([v, l]) => `<option value="${v}" ${cur === v ? "selected" : ""}>${l}</option>`).join("");
    overlay().classList.add("show");
    overlay().innerHTML = `
      <div class="ob-box ob-wide">
        <button class="ob-close" onclick="closeSetup()" aria-label="Chiudi">✕</button>
        <div class="ob-title">Modifica profilo ✏️</div>
        <div class="ob-body ob-scroll">
          <div class="ob-grid">
            <div class="ob-field"><label>Nome / nick</label><input class="ob-input" id="ed-name" maxlength="20" value="${p.name || ""}"></div>
            <div class="ob-field"><label>Età</label><input class="ob-input" id="ed-age" type="number" inputmode="numeric" value="${p.age || ""}"></div>
            <div class="ob-field"><label>Sesso</label><select class="ob-input" id="ed-sex">${sel([["M","M"],["F","F"]], p.sex)}</select></div>
            <div class="ob-field"><label>Altezza (cm)</label><input class="ob-input" id="ed-h" type="number" inputmode="numeric" value="${p.height || ""}"></div>
            <div class="ob-field"><label>Obiettivo</label><select class="ob-input" id="ed-goal">${sel([["massa","💪 Massa"],["dimagrimento","🔥 Dimagrimento"],["forza","🏋️ Forza"],["benessere","🌿 Benessere"]], p.goal)}</select></div>
            <div class="ob-field"><label>Livello</label><select class="ob-input" id="ed-level">${sel([["principiante","Principiante"],["intermedio","Intermedio"],["avanzato","Avanzato"]], p.level)}</select></div>
            <div class="ob-field"><label>Giorni/settimana</label><select class="ob-input" id="ed-days">${sel([[2,"2"],[3,"3"],[4,"4"],[5,"5"],[6,"6"]], p.daysPerWeek)}</select></div>
            <div class="ob-field"><label>Attrezzatura</label><select class="ob-input" id="ed-equip">${sel([["palestra","Palestra completa"],["base","Manubri/base"],["corpo","Corpo libero"]], p.equipment)}</select></div>
          </div>
          <div class="ob-field" style="margin-top:12px"><label>Limitazioni fisiche</label><input class="ob-input" id="ed-lim" value="${p.limitations || ""}"></div>
          <div class="ob-grid" style="margin-top:12px">
            <div class="ob-field"><label>🔥 Obiettivo kcal/giorno</label><input class="ob-input" id="ed-kcal" type="number" inputmode="numeric" value="${(state.nutriGoal && state.nutriGoal.kcal) || ""}" placeholder="auto"></div>
            <div class="ob-field"><label>💪 Obiettivo proteine (g)</label><input class="ob-input" id="ed-prot" type="number" inputmode="numeric" value="${(state.nutriGoal && state.nutriGoal.protein) || ""}"></div>
          </div>
        </div>
        <div class="ob-err" id="ob-err"></div>
        <div class="ob-nav">
          <button class="btn-outline" onclick="closeSetup()">Annulla</button>
          <button class="btn-save" onclick="saveProfileEdit()">Salva</button>
        </div>
      </div>`;
  }

  window.saveProfileEdit = function () {
    const name = val("ed-name");
    if (!name) { document.getElementById("ob-err").textContent = "Il nome non può essere vuoto"; return; }
    Object.assign(state.profile, {
      name, nick: name,
      age: num("ed-age") || state.profile.age,
      sex: val("ed-sex"),
      height: num("ed-h") || state.profile.height,
      goal: val("ed-goal"), level: val("ed-level"),
      daysPerWeek: +val("ed-days") || state.profile.daysPerWeek,
      equipment: val("ed-equip"),
      limitations: val("ed-lim")
    });
    state.nutriGoal = state.nutriGoal || {};
    state.nutriGoal.kcal = num("ed-kcal");           // vuoto = stima automatica
    state.nutriGoal.protein = num("ed-prot") || state.nutriGoal.protein || 150;
    saveState(state);
    toast("✅ Profilo aggiornato");
    closeSetup();
    if (typeof renderGoals === "function") renderGoals();
  };

  /* ---------- BENVENUTO (app aperta da sloggati) ---------- */
  window.showWelcome = function () {
    if (sessionStorage.getItem("welcomeShown")) return;
    sessionStorage.setItem("welcomeShown", "1");
    overlay().classList.add("show");
    overlay().innerHTML = `
      <div class="ob-box">
        <div class="ob-title">Ciao! 👋</div>
        <div class="ob-body">
          <p class="ob-lead">Il tuo personal trainer digitale: schede, progressi e nutrizione, tutto su misura.</p>
          <div class="ob-choices">
            <button class="ob-choice" onclick="welcomeGo('new')"><span class="ob-choice-emoji">🌱</span><span class="ob-choice-txt"><b>Sono nuovo</b><small>Crea il tuo account e costruiamo la tua app in 2 minuti</small></span></button>
            <button class="ob-choice" onclick="welcomeGo('login')"><span class="ob-choice-emoji">🔑</span><span class="ob-choice-txt"><b>Ho già un account</b><small>Accedi e ritrova i tuoi dati</small></span></button>
          </div>
        </div>
        <div class="ob-nav"><button class="btn-outline" style="flex:1" onclick="closeSetup()">Dai solo un'occhiata</button></div>
      </div>`;
  };
  window.welcomeGo = function (mode) {
    overlay().classList.remove("show"); overlay().innerHTML = "";
    if (typeof goAccount === "function") goAccount();
    setTimeout(() => {
      const msg = document.getElementById("acct-msg");
      if (msg) msg.textContent = mode === "new"
        ? "Scrivi email e una password (min 6 caratteri), poi tocca Registrati."
        : "Inserisci le credenziali e tocca Accedi.";
      const em = document.getElementById("acct-email");
      if (em) em.focus();
    }, 350);
  };

  // Avvio automatico: loggato ma profilo non ancora configurato
  window.maybeStartOnboarding = function () {
    if (state.profile && state.profile.onboarded) return;
    window.startOnboarding(false);
  };

  function closeSetup() {
    overlay().classList.remove("show");
    overlay().innerHTML = "";
    if (typeof renderWorkoutChips === "function") { renderWorkoutChips(); renderWorkout(); }
    if (typeof renderGoals === "function" && document.getElementById("section-obiettivi").classList.contains("active")) renderGoals();
  }
  window.closeSetup = closeSetup;

  /* ---------- SCELTA MODALITÀ SCHEDA ---------- */
  function showBuilderChooser(fromOnboarding) {
    const mine = state.myWorkouts || [];
    overlay().classList.add("show");
    overlay().innerHTML = `
      <div class="ob-box">
        <button class="ob-close" onclick="closeSetup()" aria-label="Chiudi">✕</button>
        <div class="ob-title">${fromOnboarding ? `Perfetto ${state.profile.name}! Ora la tua scheda 📋` : "Le tue schede 📋"}</div>
        <div class="ob-body">
          ${(!fromOnboarding && mine.length) ? `
            <div class="myw-list">${mine.map(w => `
              <div class="myw-row">
                <span class="myw-dot" style="background:${w.color}"></span>
                <span class="myw-name">${w.emoji} ${w.name}</span>
                <span class="myw-sub">${(w.exercises || []).length} es.</span>
                <button class="myw-del" onclick="deleteMyWorkout('${w.id}');showBuilderChooser(false)">✕</button>
              </div>`).join("")}</div>
            <div class="ob-group-lbl">Aggiungine una nuova</div>` : ""}
          <div class="ob-choices">
            <button class="ob-choice" onclick="setupPreset()"><span class="ob-choice-emoji">⚡️</span><span class="ob-choice-txt"><b>Scheda pronta</b><small>Consigliata per il tuo obiettivo e livello — parti subito</small></span></button>
            <button class="ob-choice" onclick="setupManual()"><span class="ob-choice-emoji">🧩</span><span class="ob-choice-txt"><b>Costruiscila tu</b><small>Scegli gli esercizi, l'app analizza l'equilibrio della scheda</small></span></button>
            <button class="ob-choice" onclick="setupImport()"><span class="ob-choice-emoji">📄</span><span class="ob-choice-txt"><b>Importa dal PT</b><small>Hai una scheda su carta o PDF? La convertiamo con l'AI</small></span></button>
          </div>
        </div>
        <div class="ob-nav"><button class="btn-outline" onclick="closeSetup()">${fromOnboarding ? "Più tardi" : "Chiudi"}</button><span></span></div>
      </div>`;
  }
  window.showBuilderChooser = showBuilderChooser;

  /* ---------- 1) PRESET ---------- */
  const PRESETS = {
    fullbody: { name: "Full Body", emoji: "💪", color: "#FF2D95", focus: "Tutto il corpo, 3 giorni", days: [["legpress","chestpress","latmachine","shoulderpress","curl","tricipiti","plank"]] },
    upperlower: { name: "Upper / Lower", emoji: "🔀", color: "#5B8DEF", focus: "4 giorni: sopra / sotto",
      days: [["chestpress","latmachine","shoulderpress","curl","tricipiti","facepull"], ["legpress","legext","legcurl","hipthrust","calf","plank"]],
      names: ["Upper", "Lower"] },
    ppl: { name: "Push / Pull / Legs", emoji: "🔺", color: "#F59E0B", focus: "5-6 giorni: spinta, tirata, gambe",
      days: [["chestpress","chestfly","shoulderpress","lateral","frenchpress","tricipiti"], ["latmachine","pulley","reversefly","curl","hammer","facepull"], ["legpress","legext","legcurl","hipthrust","calf","plank"]],
      names: ["Push", "Pull", "Legs"] }
  };
  function recommendedPreset() {
    const d = state.profile.daysPerWeek || 3, lvl = state.profile.level;
    if (d >= 5 && lvl !== "principiante") return "ppl";
    if (d >= 4 && lvl !== "principiante") return "upperlower";
    return "fullbody";
  }
  window.setupPreset = function () {
    const rec = recommendedPreset();
    overlay().innerHTML = `
      <div class="ob-box">
        <div class="ob-title">Schede pronte ⚡️</div>
        <div class="ob-body"><div class="ob-choices">
          ${Object.entries(PRESETS).map(([k, p]) => `
            <button class="ob-choice ${k === rec ? "sel" : ""}" onclick="applyPreset('${k}')">
              <span class="ob-choice-emoji">${p.emoji}</span>
              <span class="ob-choice-txt"><b>${p.name}${k === rec ? " · consigliata per te" : ""}</b><small>${p.focus}</small></span>
            </button>`).join("")}
        </div></div>
        <div class="ob-nav"><button class="btn-outline" onclick="showBuilderChooser(false)">Indietro</button><span></span></div>
      </div>`;
  };
  window.applyPreset = function (k) {
    const p = PRESETS[k];
    state.myWorkouts = p.days.map((exs, i) => ({
      id: "my_" + Date.now() + "_" + i,
      name: p.days.length > 1 ? `${p.name.split(" / ").length > 1 ? (p.names[i] || p.name) : p.name}` : p.name,
      emoji: p.emoji, color: [p.color, "#A855F7", "#10B981"][i % 3],
      sub: `${exs.length} esercizi`, focus: p.focus, exercises: exs, custom: true
    }));
    saveState(state);
    toast("📋 Scheda creata!");
    closeSetup();
  };

  /* ---------- 2) BUILDER MANUALE ---------- */
  let manualSel = [];
  const GROUPS = [["legs","🦵 Gambe"],["chest","🫁 Petto"],["back","🔙 Schiena"],["shoulders","🙆 Spalle"],["arms","💪 Braccia"],["core","🧘 Core"]];
  window.setupManual = function () {
    manualSel = [];
    renderManual();
  };
  function renderManual() {
    const byGroup = {};
    Object.entries(EXERCISES).forEach(([k, e]) => { (byGroup[e.bodyPart] = byGroup[e.bodyPart] || []).push([k, e]); });
    overlay().innerHTML = `
      <div class="ob-box ob-wide">
        <div class="ob-title">Costruisci la scheda 🧩 <span class="ob-count">${manualSel.length} esercizi</span></div>
        <div class="ob-body ob-scroll">
          ${GROUPS.map(([g, lbl]) => byGroup[g] ? `
            <div class="ob-group-lbl">${lbl}</div>
            <div class="ob-exgrid">${byGroup[g].map(([k, e]) => `
              <button class="ob-ex ${manualSel.includes(k) ? "sel" : ""}" onclick="toggleManualEx('${k}')">${e.name}</button>`).join("")}
            </div>` : "").join("")}
          <div class="ob-analysis" id="ob-analysis">${analysisHTML()}</div>
        </div>
        <div class="ob-nav">
          <button class="btn-outline" onclick="showBuilderChooser(false)">Indietro</button>
          <button class="btn-save" onclick="confirmManual()">Crea scheda (${manualSel.length})</button>
        </div>
      </div>`;
  }
  window.toggleManualEx = function (k) {
    manualSel = manualSel.includes(k) ? manualSel.filter(x => x !== k) : manualSel.concat(k);
    renderManual();
  };
  function analysisHTML() {
    if (manualSel.length < 2) return "";
    const tips = [];
    const parts = manualSel.map(k => EXERCISES[k].bodyPart);
    const count = (p) => parts.filter(x => x === p).length;
    if (manualSel.length < 4) tips.push("⚠️ Meno di 4 esercizi: scheda molto corta, va bene solo come richiamo.");
    if (manualSel.length > 9) tips.push("⚠️ Più di 9 esercizi: sessione lunga, rischi di calare di qualità. Valuta di dividerla in 2 giorni.");
    if (!count("legs")) tips.push("🦵 Nessun esercizio gambe: metà del corpo dimenticata!");
    const push = count("chest") + count("shoulders"), pull = count("back");
    if (push - pull >= 2) tips.push("⚖️ Molta spinta e poca tirata: aggiungi lavoro per la schiena (postura!).");
    if (pull - push >= 2) tips.push("⚖️ Molta tirata e poca spinta: bilancia con petto/spalle.");
    GROUPS.forEach(([g, lbl]) => { if (count(g) > 2) tips.push(`🔁 ${count(g)} esercizi ${lbl.split(" ")[1].toLowerCase()}: forse ridondanti, 2 bastano in una scheda.`); });
    if (!count("core") && manualSel.length >= 5) tips.push("🧘 Manca il core: un plank o crunch chiude bene la sessione.");
    if (!tips.length) tips.push("✅ Scheda equilibrata, ottimo lavoro!");
    return tips.map(t => `<div class="ob-tip">${t}</div>`).join("");
  }
  window.confirmManual = function () {
    if (manualSel.length < 3) { toast("Scegli almeno 3 esercizi"); return; }
    state.myWorkouts = (state.myWorkouts || []).concat([{
      id: "my_" + Date.now(), name: "La mia scheda", emoji: "🧩", color: "#FF2D95",
      sub: `${manualSel.length} esercizi`, focus: "Scheda personalizzata", exercises: manualSel.slice(), custom: true
    }]);
    saveState(state);
    toast("📋 Scheda creata!");
    closeSetup();
  };

  /* ---------- 3) IMPORT DA PT ---------- */
  const PT_PROMPT = `Converti la scheda di allenamento che ti allego (foto o testo) in JSON, usando ESATTAMENTE questo formato, senza alcun testo prima o dopo:

{
  "nome": "Nome scheda",
  "giorni": [
    {
      "nome": "Giorno A",
      "esercizi": [
        { "nome": "Panca piana", "gruppo": "petto", "serie": 3, "ripetizioni": 8, "riposo": "90", "attrezzo": "bilanciere" }
      ]
    }
  ]
}

Regole: "gruppo" ∈ petto|schiena|gambe|spalle|braccia|core. "attrezzo" ∈ bilanciere|manubri|macchina|cavi|corpo. "riposo" in secondi. Se un dato manca, stimalo con buon senso.`;

  window.setupImport = function () {
    overlay().innerHTML = `
      <div class="ob-box ob-wide">
        <div class="ob-title">Importa dal PT 📄</div>
        <div class="ob-body ob-scroll">
          <div class="ob-lead"><b>1.</b> Copia il prompt e incollalo in una chat con Claude (claude.ai) insieme alla foto della scheda.</div>
          <button class="btn-outline" style="width:100%;margin:8px 0" onclick="copyPTPrompt(this)">📋 Copia prompt per Claude</button>
          <div class="ob-lead"><b>2.</b> Incolla qui sotto il JSON che ti restituisce:</div>
          <textarea class="ob-json" id="ob-json" placeholder='{ "nome": "...", "giorni": [...] }'></textarea>
          <div class="ob-err" id="ob-err"></div>
        </div>
        <div class="ob-nav">
          <button class="btn-outline" onclick="showBuilderChooser(false)">Indietro</button>
          <button class="btn-save" onclick="importPTJson()">Importa scheda</button>
        </div>
      </div>`;
  };
  window.copyPTPrompt = function (btn) {
    const done = () => { btn.textContent = "✅ Copiato!"; setTimeout(() => btn.textContent = "📋 Copia prompt per Claude", 2000); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(PT_PROMPT).then(done).catch(() => fallbackCopy(done));
    else fallbackCopy(done);
    function fallbackCopy(cb) {
      const ta = document.createElement("textarea"); ta.value = PT_PROMPT; document.body.appendChild(ta);
      ta.select(); try { document.execCommand("copy"); } catch (e) {}
      document.body.removeChild(ta); cb();
    }
  };

  const GROUP_MAP = { petto: "chest", schiena: "back", gambe: "legs", spalle: "shoulders", braccia: "arms", core: "core" };
  const TOOL_MAP = { bilanciere: "barbell", manubri: "dumbbell", macchina: "machine", cavi: "cable", corpo: "body" };

  window.importPTJson = function () {
    const raw = val("ob-json").replace(/^```json?\s*/i, "").replace(/```\s*$/, "").trim();
    const err = (m) => { document.getElementById("ob-err").textContent = m; };
    let data;
    try { data = JSON.parse(raw); } catch (e) { err("JSON non valido: ricontrolla di aver incollato tutto (deve iniziare con { e finire con })."); return; }
    if (!data.giorni || !Array.isArray(data.giorni) || !data.giorni.length) { err('Formato inatteso: manca "giorni".'); return; }

    state.customExercises = state.customExercises || {};
    const newWorkouts = [];
    const colors = ["#FF2D95", "#5B8DEF", "#F59E0B", "#A855F7", "#10B981"];
    try {
      data.giorni.forEach((g, gi) => {
        if (!g.esercizi || !g.esercizi.length) throw new Error(`Il giorno "${g.nome || gi + 1}" non ha esercizi`);
        const keys = g.esercizi.map((e, ei) => {
          if (!e.nome) throw new Error("Esercizio senza nome");
          // riusa un esercizio della libreria se il nome coincide
          const found = Object.entries(EXERCISES).find(([, x]) => x.name.toLowerCase() === String(e.nome).toLowerCase());
          if (found) return found[0];
          const key = "cx_" + String(e.nome).toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 24) + "_" + gi + ei;
          state.customExercises[key] = {
            name: String(e.nome),
            muscle: e.gruppo ? (e.gruppo.charAt(0).toUpperCase() + e.gruppo.slice(1)) : "—",
            secondary: "—",
            type: TOOL_MAP[e.attrezzo] || "machine",
            sets: parseInt(e.serie) || 3,
            reps: parseInt(e.ripetizioni) || 10,
            rest: (parseInt(e.riposo) || 60) + '"',
            bodyPart: GROUP_MAP[e.gruppo] || "chest",
            tip: "Esercizio importato dalla scheda del tuo PT: chiedi a lui i dettagli di esecuzione."
          };
          return key;
        });
        newWorkouts.push({
          id: "my_" + Date.now() + "_" + gi,
          name: g.nome || `${data.nome || "Scheda PT"} ${gi + 1}`,
          emoji: "📄", color: colors[gi % colors.length],
          sub: `${keys.length} esercizi`, focus: data.nome || "Scheda del PT",
          exercises: keys, custom: true
        });
      });
    } catch (e) { err("Errore: " + e.message); return; }

    mergeCustomExercises();
    state.myWorkouts = (state.myWorkouts || []).concat(newWorkouts);
    saveState(state);
    toast(`📄 Importate ${newWorkouts.length} schede!`);
    closeSetup();
  };

  /* ---------- GESTIONE SCHEDE (dal Profilo) ---------- */
  window.deleteMyWorkout = function (id) {
    if (!confirm("Eliminare questa scheda? Le sessioni già registrate restano.")) return;
    state.myWorkouts = (state.myWorkouts || []).filter(w => w.id !== id);
    saveState(state);
    if (typeof renderGoals === "function") renderGoals();
    if (typeof renderWorkoutChips === "function") { renderWorkoutChips(); renderWorkout(); }
  };
})();
