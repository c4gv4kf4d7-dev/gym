/* ============================================================
   CLOUD — login opzionale + sincronizzazione stato via Supabase
   - Login opzionale: l'app funziona identica anche offline/non loggati.
   - Da loggati: lo stato viene salvato nella propria riga (user_states).
     Accedi da un altro dispositivo → ritrovi i tuoi dati.
   - Il cloud è la "verità" quando ci sono dati; il localStorage resta
     come copia offline.
   ============================================================ */
(function () {
  if (!window.supabase || typeof SUPABASE_URL === "undefined") {
    console.warn("[cloud] Supabase non disponibile — sync disattivata");
    return;
  }

  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  let currentUser = null;
  let pushTimer = null;

  // Il salvataggio originale (solo localStorage)
  const _localSave = saveState;

  // Sovrascrive saveState globale: salva in locale + (se loggato) sincronizza
  saveState = function (s) {
    _localSave(s);
    if (currentUser) schedulePush();
  };

  function hasData(d) {
    if (!d) return false;
    return (d.sessions && d.sessions.length) ||
           (d.schedule && Object.keys(d.schedule).length) ||
           (d.bodyweight && d.bodyweight.length) ||
           (d.composition && d.composition.length) ||
           (d.meals && Object.keys(d.meals).length);
  }

  /* ---------- SYNC ---------- */
  function schedulePush() {
    clearTimeout(pushTimer);
    pushTimer = setTimeout(pushCloud, 1500);
  }

  async function pushCloud() {
    if (!currentUser) return;
    setSyncStatus("Sincronizzo…");
    try {
      const { error } = await sb.from("user_states").upsert({
        user_id: currentUser.id,
        data: state,
        updated_at: new Date().toISOString()
      });
      if (error) throw error;
      setSyncStatus("Sincronizzato ✓");
    } catch (e) {
      console.warn("[cloud] push fallito", e);
      setSyncStatus("Offline — salvato in locale");
    }
  }

  async function pullCloud() {
    if (!currentUser) return;
    setSyncStatus("Sincronizzo…");
    try {
      const { data, error } = await sb.from("user_states")
        .select("data").eq("user_id", currentUser.id).maybeSingle();
      if (error) throw error;

      if (data && hasData(data.data)) {
        // Il cloud ha dati → sono la verità
        state = applyMigrations(Object.assign(defaultState(), data.data));
        _localSave(state);
        refreshUI();
        setSyncStatus("Sincronizzato ✓");
      } else {
        // Primo accesso con questo account: nessun dato nel cloud
        firstLogin();
      }
    } catch (e) {
      console.warn("[cloud] pull fallito", e);
      setSyncStatus("Offline — uso i dati locali");
    }
  }

  function firstLogin() {
    if (hasData(state)) {
      const upload = window.confirm(
        "Primo accesso con questo account.\n\n" +
        "Vuoi CARICARE i dati attualmente presenti su questo telefono nel tuo account?\n\n" +
        "• OK = carica questi dati\n" +
        "• Annulla = parti da zero (account vuoto)"
      );
      if (upload) {
        pushCloud();
        setSyncStatus("Dati caricati ✓");
        return;
      }
    }
    // Account nuovo e vuoto
    state = defaultState();
    _localSave(state);
    refreshUI();
    pushCloud();
    setSyncStatus("Account nuovo — parti da zero");
  }

  /* ---------- AUTH ---------- */
  async function signIn() {
    const email = val("acct-email"), pw = val("acct-pw");
    if (!email || !pw) { setAuthMsg("Inserisci email e password."); return; }
    setAuthMsg("Accesso in corso…");
    const { error } = await sb.auth.signInWithPassword({ email, password: pw });
    if (error) setAuthMsg("Errore: " + error.message);
  }

  async function signUp() {
    const email = val("acct-email"), pw = val("acct-pw");
    if (!email || !pw) { setAuthMsg("Inserisci email e password."); return; }
    if (pw.length < 6) { setAuthMsg("La password deve avere almeno 6 caratteri."); return; }
    setAuthMsg("Registrazione…");
    const { data, error } = await sb.auth.signUp({ email, password: pw });
    if (error) { setAuthMsg("Errore: " + error.message); return; }
    if (!data.session) setAuthMsg("Registrato! Controlla l'email per confermare, poi accedi.");
    // se la conferma email è disattivata, onAuthStateChange fa il resto
  }

  async function signOut() {
    await sb.auth.signOut();
  }

  sb.auth.onAuthStateChange((_event, session) => {
    currentUser = session ? session.user : null;
    if (currentUser) pullCloud();
    renderAccountUI();
  });

  /* ---------- UI ---------- */
  function val(id) { const e = document.getElementById(id); return e ? e.value.trim() : ""; }

  function setSyncStatus(msg) {
    const e = document.getElementById("sync-status");
    if (e) e.textContent = msg;
  }
  function setAuthMsg(msg) {
    const e = document.getElementById("acct-msg");
    if (e) e.textContent = msg;
  }

  function currentNick() {
    return (typeof state !== "undefined" && state.profile && state.profile.nick) ? state.profile.nick : "";
  }
  function displayName() {
    return currentNick() || (currentUser && currentUser.email ? currentUser.email.split("@")[0] : "Account");
  }

  function renderHeaderChip() {
    const chip = document.getElementById("header-account");
    if (!chip) return;
    if (currentUser) {
      chip.textContent = "👤 " + displayName();
      chip.classList.add("in");
    } else {
      chip.textContent = "Accedi";
      chip.classList.remove("in");
    }
  }

  function renderAccountUI() {
    renderHeaderChip();
    const el = document.getElementById("account-card");
    if (!el) return;
    if (currentUser) {
      el.innerHTML =
        '<div class="acct-row">' +
          '<span class="acct-badge">☁️</span>' +
          '<div class="acct-info">' +
            '<div class="acct-email">👤 ' + displayName() + '</div>' +
            '<div class="acct-status" id="sync-status">Connesso</div>' +
          '</div>' +
        '</div>' +
        '<div class="acct-field-lbl">Nickname (mostrato in alto)</div>' +
        '<div class="acct-nick">' +
          '<input id="acct-nick-input" class="acct-input" maxlength="18" placeholder="Es. il tuo nome">' +
          '<button class="btn-outline acct-nick-btn" onclick="cloudSaveNick()">Salva</button>' +
        '</div>' +
        '<div class="acct-email-sub">Account: ' + (currentUser.email || "") + '</div>' +
        '<button class="btn-secondary" onclick="cloudSignOut()">Esci</button>';
      const ni = document.getElementById("acct-nick-input");
      if (ni) ni.value = currentNick();
    } else {
      el.innerHTML =
        '<div class="acct-intro">Accedi per sincronizzare i tuoi dati e ritrovarli su ogni dispositivo.</div>' +
        '<input id="acct-email" class="acct-input" type="email" inputmode="email" autocomplete="username" placeholder="Email">' +
        '<input id="acct-pw" class="acct-input" type="password" autocomplete="current-password" placeholder="Password (min 6)">' +
        '<div class="acct-btns">' +
          '<button class="btn-outline" onclick="cloudSignUp()">Registrati</button>' +
          '<button class="btn-save" onclick="cloudSignIn()">Accedi</button>' +
        '</div>' +
        '<div class="acct-msg" id="acct-msg"></div>';
    }
  }

  function refreshUI() {
    if (typeof renderWorkoutChips === "function") renderWorkoutChips();
    if (typeof renderWorkout === "function") renderWorkout();
    const active = document.querySelector(".section.active");
    const id = active ? active.id : "";
    if (id === "section-progressi" && typeof renderProgress === "function") renderProgress();
    if (id === "section-obiettivi" && typeof renderGoals === "function") renderGoals();
    if (id === "section-calendario" && typeof renderCalendar === "function") renderCalendar();
    if (id === "section-pasti" && typeof renderMeals === "function") renderMeals();
    renderAccountUI();
  }

  // Esponi gli handler per gli onclick
  window.cloudSignIn = signIn;
  window.cloudSignUp = signUp;
  window.cloudSignOut = signOut;
  window.cloudSaveNick = function () {
    const v = val("acct-nick-input");
    state.profile = state.profile || {};
    state.profile.nick = v;
    saveState(state);            // salva in locale + push su cloud
    renderAccountUI();
    if (typeof toast === "function") toast(v ? "Nick salvato ✓" : "Nick rimosso");
  };
  window.goAccount = function () {
    const btn = document.querySelector('.nav-item[onclick*="obiettivi"]');
    switchView("obiettivi", btn);
    const card = document.getElementById("account-card");
    if (card) card.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  renderAccountUI();
})();
