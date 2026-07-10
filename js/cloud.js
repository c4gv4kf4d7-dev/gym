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
  // handle per i moduli satellite (crew): client condiviso + utente corrente
  window.__cloud = { sb, user: () => currentUser };
  let currentToken = null;   // access token per il flush keepalive
  let cloudHadData = false;  // il cloud aveva dati all'ultimo pull (anti-wipe)
  let pushTimer = null;

  // Il salvataggio originale (solo localStorage)
  const _localSave = saveState;
  const PENDING_KEY = "gym_pending";   // c'è una modifica locale non ancora sul cloud

  // Sovrascrive saveState globale: salva in locale + (se loggato) sincronizza
  saveState = function (s) {
    _localSave(s);
    if (currentUser && !window.DEMO_MODE) {
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
    // ANTI-WIPE: mai sovrascrivere un cloud pieno con uno stato locale vuoto
    // (es. localStorage azzerato da Safari): in quel caso si fa pull, non push.
    if (cloudHadData && !hasData(state)) {
      console.warn("[cloud] push bloccato: stato locale vuoto ma il cloud ha dati");
      localStorage.removeItem(PENDING_KEY);
      setSyncStatus("Recupero i dati dal cloud…");
      pullCloud();
      return;
    }
    setSyncStatus("Sincronizzo…");
    try {
      const { error } = await sb.from("user_states").upsert({
        user_id: currentUser.id,
        data: state,
        updated_at: new Date().toISOString()
      });
      if (error) throw error;
      if (hasData(state)) cloudHadData = true;
      localStorage.removeItem(PENDING_KEY);
      setSyncStatus("Sincronizzato ✓");
      if (window.crewOnSync) window.crewOnSync();   // aggiorna la vetrinetta crew
      // Cronologia versioni (assicurazione sui dati): best-effort, se la
      // tabella non esiste ancora l'errore viene ignorato.
      sb.from("state_history").insert({ user_id: currentUser.id, data: state })
        .then(() => {}, () => {});
    } catch (e) {
      console.warn("[cloud] push fallito", e);
      setSyncStatus("Offline — salvato in locale");
    }
  }

  // Flush immediato quando l'app va in background o si chiude.
  // Usa fetch keepalive: sopravvive alla chiusura della pagina (le fetch
  // normali su pagehide vengono spesso uccise da iOS prima di partire).
  function flushPending() {
    if (!currentUser || localStorage.getItem(PENDING_KEY) !== "1") return;
    if (cloudHadData && !hasData(state)) return;   // stessa guardia anti-wipe
    if (!currentToken) { pushCloud(); return; }
    try {
      fetch(SUPABASE_URL + "/rest/v1/user_states?on_conflict=user_id", {
        method: "POST",
        keepalive: true,
        headers: {
          "apikey": SUPABASE_ANON_KEY,
          "Authorization": "Bearer " + currentToken,
          "Content-Type": "application/json",
          "Prefer": "resolution=merge-duplicates"
        },
        body: JSON.stringify({ user_id: currentUser.id, data: state, updated_at: new Date().toISOString() })
      }).then(r => { if (r.ok) localStorage.removeItem(PENDING_KEY); }).catch(() => {});
    } catch (e) { pushCloud(); }
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
        cloudHadData = true;
        state = applyMigrations(Object.assign(defaultState(), data.data));
        _localSave(state);
        refreshUI();
        setSyncStatus("Sincronizzato ✓");
        if (window.crewOnLogin) window.crewOnLogin();
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

  /* ---------- RECUPERO PASSWORD ---------- */
  let recoveryMode = false;

  async function forgotPw() {
    const email = val("acct-email");
    if (!email) { setAuthMsg("Scrivi prima la tua email nel campo qui sopra, poi ritocca il link."); return; }
    setAuthMsg("Invio email di recupero…");
    const { error } = await sb.auth.resetPasswordForEmail(email, {
      redirectTo: "https://c4gv4kf4d7-dev.github.io/gym/"
    });
    if (error) setAuthMsg("Errore: " + error.message);
    else setAuthMsg("📬 Email inviata a " + email + ": apri il link che trovi dentro e potrai scegliere una nuova password.");
  }

  async function setNewPw() {
    const pw = val("acct-newpw");
    if (pw.length < 6) { setAuthMsg("La password deve avere almeno 6 caratteri."); return; }
    setAuthMsg("Salvo…");
    const { error } = await sb.auth.updateUser({ password: pw });
    if (error) { setAuthMsg("Errore: " + error.message); return; }
    recoveryMode = false;
    renderAccountUI();
    if (typeof toast === "function") toast("🔑 Password aggiornata!");
  }

  sb.auth.onAuthStateChange((_event, session) => {
    if (_event === "PASSWORD_RECOVERY") {
      recoveryMode = true;
      setTimeout(() => { if (typeof goAccount === "function") goAccount(); }, 400);
    }
    currentUser = session ? session.user : null;
    currentToken = session ? session.access_token : null;
    if (!currentUser) cloudHadData = false;
    if (currentUser && (_event === "INITIAL_SESSION" || _event === "SIGNED_IN")) {
      if (typeof exitDemoMode === "function") exitDemoMode();   // prima di leggere il cloud
      pullCloud();
    }
    else if (currentUser) { /* TOKEN_REFRESHED ecc.: niente pull, solo token aggiornato */ }
    else {
      // Nessun account → modalità vetrina: profilo di ESEMPIO, zero dati reali
      if (window.crewOnLogout) window.crewOnLogout();
      if (typeof enterDemoMode === "function") enterDemoMode();
      if (_event === "INITIAL_SESSION" && window.showWelcome) window.showWelcome();
    }
    renderAccountUI();
  });

  /* ---------- UI ---------- */
  function val(id) { const e = document.getElementById(id); return e ? e.value.trim() : ""; }

  function setSyncStatus(msg) {
    const e = document.getElementById("sync-status");
    if (e) e.textContent = msg;
    // pallino di stato sul chip in alto: verde = ok, giallo = in corso/offline
    const chip = document.getElementById("header-account");
    if (chip && currentUser) {
      chip.classList.remove("sync-ok", "sync-warn");
      chip.classList.add(msg.indexOf("✓") >= 0 ? "sync-ok" : "sync-warn");
    }
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
  window.cloudRefreshChip = renderHeaderChip;

  // Modalità vetrina: invito ad accedere quando non loggati
  function renderGuestBanner() {
    const host = document.getElementById("guest-banner");
    if (!host) return;
    host.innerHTML = currentUser ? "" : `
      <div class="guest-banner" onclick="goAccount()">
        <div class="gb-emoji">👀</div>
        <div class="gb-txt"><b>Stai guardando un profilo di ESEMPIO.</b><br>Dati, grafici e trofei sono finti: accedi per costruire i tuoi, veri.</div>
        <div class="gb-cta">Accedi →</div>
      </div>`;
  }

  function renderAccountUI() {
    renderHeaderChip();
    renderGuestBanner();
    const el = document.getElementById("account-card");
    if (!el) return;
    // Da loggati il widget è ridondante (lo stato sync è il pallino sul nick
    // in alto): la sezione compare solo per login o recupero password.
    const lbl = document.getElementById("account-label");
    const hidden = currentUser && !recoveryMode;
    el.style.display = hidden ? "none" : "";
    if (lbl) lbl.style.display = hidden ? "none" : "";
    if (hidden) { el.innerHTML = ""; return; }
    if (currentUser && recoveryMode) {
      el.innerHTML =
        '<div class="acct-intro"><b>🔑 Imposta la nuova password.</b> Sei entrato dal link di recupero: scegli la nuova password qui sotto.</div>' +
        '<form action="#" method="post" onsubmit="cloudSetNewPw();return false;">' +
          '<input id="acct-newpw" name="new-password" class="acct-input" type="password" autocomplete="new-password" placeholder="Nuova password (min 6)">' +
          '<button type="submit" class="btn-save" style="width:100%">Salva nuova password</button>' +
        '</form>' +
        '<div class="acct-msg" id="acct-msg"></div>';
      return;
    }
    {
      // form vero con name/autocomplete: serve al portachiavi iCloud per
      // suggerire le credenziali salvate in automatico
      el.innerHTML =
        '<div class="acct-intro">Accedi per sincronizzare i tuoi dati e ritrovarli su ogni dispositivo.</div>' +
        '<form id="acct-form" action="#" method="post" onsubmit="cloudSignIn();return false;">' +
          '<input id="acct-email" name="email" class="acct-input" type="email" inputmode="email" autocomplete="username" placeholder="Email">' +
          '<input id="acct-pw" name="password" class="acct-input" type="password" autocomplete="current-password" placeholder="Password (min 6)">' +
          '<div class="acct-btns">' +
            '<button type="button" class="btn-outline" onclick="cloudSignUp()">Registrati</button>' +
            '<button type="submit" class="btn-save">Accedi</button>' +
          '</div>' +
        '</form>' +
        '<button class="acct-forgot" onclick="cloudForgotPw()">Ho dimenticato la password</button>' +
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
  window.cloudForgotPw = forgotPw;
  window.cloudSetNewPw = setNewPw;
  window.goAccount = function () {
    const btn = document.querySelector('.nav-item[onclick*="obiettivi"]');
    switchView("obiettivi", btn);
    const card = document.getElementById("account-card");
    if (card) card.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  renderAccountUI();
})();
