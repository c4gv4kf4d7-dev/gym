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
  const PENDING_KEY = "gym_pending";   // c'è una modifica locale non ancora sul cloud

  // Sovrascrive saveState globale: salva in locale + (se loggato) sincronizza
  saveState = function (s) {
    _localSave(s);
    if (currentUser) {
      localStorage.setItem(PENDING_KEY, "1");
      schedulePush();
    }
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
    pushTimer = setTimeout(pushCloud, 700);
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
      localStorage.removeItem(PENDING_KEY);
      setSyncStatus("Sincronizzato ✓");
    } catch (e) {
      console.warn("[cloud] push fallito", e);
      setSyncStatus("Offline — salvato in locale");
    }
  }

  // Flush immediato quando l'app va in background o si chiude
  function flushPending() {
    if (currentUser && localStorage.getItem(PENDING_KEY) === "1") pushCloud();
  }
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flushPending(); });
  window.addEventListener("pagehide", flushPending);

  async function pullCloud() {
    if (!currentUser) return;
    // Se ci sono modifiche locali non ancora sincronizzate, caricale sul cloud
    // invece di sovrascriverle con dati più vecchi.
    if (localStorage.getItem(PENDING_KEY) === "1") {
      await pushCloud();
      refreshUI();
      return;
    }
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
        if (window.maybeStartOnboarding) window.maybeStartOnboarding();
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
        if (window.maybeStartOnboarding) window.maybeStartOnboarding();
        return;
      }
    }
    // Account nuovo e vuoto
    state = defaultState();
    _localSave(state);
    refreshUI();
    pushCloud();
    setSyncStatus("Account nuovo — parti da zero");
    if (window.maybeStartOnboarding) window.maybeStartOnboarding();
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
    else if (_event === "INITIAL_SESSION" && window.showWelcome) window.showWelcome();
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

  // Modalità vetrina: invito ad accedere quando non loggati
  function renderGuestBanner() {
    const host = document.getElementById("guest-banner");
    if (!host) return;
    host.innerHTML = currentUser ? "" : `
      <div class="guest-banner" onclick="goAccount()">
        <div class="gb-emoji">🔓</div>
        <div class="gb-txt"><b>Questa app può essere tua.</b><br>Accedi per sbloccare scheda personalizzata, obiettivi su misura e progressi sincronizzati.</div>
        <div class="gb-cta">Accedi →</div>
      </div>`;
  }

  function renderAccountUI() {
    renderHeaderChip();
    renderGuestBanner();
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
        '<div class="acct-email-sub">Account: ' + (currentUser.email || "") + '</div>' +
        '<button class="btn-secondary" onclick="cloudSignOut()">Esci</button>';
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
  window.goAccount = function () {
    const btn = document.querySelector('.nav-item[onclick*="obiettivi"]');
    switchView("obiettivi", btn);
    const card = document.getElementById("account-card");
    if (card) card.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  renderAccountUI();
})();
