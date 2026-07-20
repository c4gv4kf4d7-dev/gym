/* ============================================================
   FOTO PROGRESSI — timeline della trasformazione fisica.
   3 angolazioni (fronte/lato/schiena) ogni 2 settimane, agganciate
   al check del lunedì (peso + misure). Le foto vivono in un bucket
   Supabase PRIVATO: l'app le mostra solo con URL firmati temporanei,
   nessuno oltre a te può vederle. In locale resta solo l'indice.
   ============================================================ */

const PHOTO_ANGLES = [["front", "Fronte"], ["side", "Lato"], ["back", "Schiena"]];

// Il check quindicinale è "scoperto" se l'ultimo set di foto ha 13+ giorni
function photoCheckDue() {
  const ph = state.photos || [];
  if (!ph.length) return true;
  const last = ph.map(p => p.date).sort().pop();
  return (new Date(todayStr() + "T00:00:00") - new Date(last + "T00:00:00")) / 864e5 >= 13;
}

(function () {
  const cloud = () => (window.__cloud || {});
  const sb = () => cloud().sb;
  const me = () => cloud().user && cloud().user();
  const urlCache = {};                       // path → URL firmato (vale ~1h)

  async function signedURL(path) {
    if (urlCache[path]) return urlCache[path];
    const { data, error } = await sb().storage.from("photos").createSignedUrl(path, 3600);
    if (error || !data) return null;
    urlCache[path] = data.signedUrl;
    return data.signedUrl;
  }

  /* --- upload: ridimensiona a max 1100px e carica nel bucket privato --- */
  window.photoUpload = function (input, angle) {
    const f = input.files && input.files[0];
    if (!f) return;
    input.value = "";
    if (!sb() || !me() || window.DEMO_MODE) { toast("Accedi per salvare le foto (restano private nel tuo account)"); return; }
    const img = new Image();
    img.onload = async () => {
      const MAX = 1100;
      const sc = Math.min(1, MAX / Math.max(img.width, img.height));
      const cv = document.createElement("canvas");
      cv.width = Math.round(img.width * sc); cv.height = Math.round(img.height * sc);
      cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
      URL.revokeObjectURL(img.src);
      const blob = await new Promise(r => cv.toBlob(r, "image/jpeg", 0.85));
      const date = todayStr();
      const path = `${me().id}/${date}_${angle}.jpg`;
      toast("📸 Carico la foto…");
      const { error } = await sb().storage.from("photos")
        .upload(path, blob, { upsert: true, contentType: "image/jpeg" });
      if (error) { toast("⚠️ Caricamento fallito: " + error.message); return; }
      delete urlCache[path];
      state.photos = (state.photos || []).filter(p => !(p.date === date && p.angle === angle));
      state.photos.push({ date, angle, path });
      saveState(state);
      toast("📸 Foto salvata nella timeline");
      renderPhotos();
    };
    img.src = URL.createObjectURL(f);
  };

  window.photoDelete = function (date, angle) {
    const p = (state.photos || []).find(x => x.date === date && x.angle === angle);
    if (!p) return;
    if (sb() && me()) sb().storage.from("photos").remove([p.path]).then(() => {}, () => {});
    state.photos = state.photos.filter(x => x !== p);
    saveState(state);
    toastUndo("🗑 Foto eliminata dalla timeline.", () => {
      state.photos.push(p); saveState(state); renderPhotos();
    });
    renderPhotos();
  };

  /* --- confronto prima/dopo: due date affiancate, stessa angolazione --- */
  window.photoCompare = function () {
    const dates = [...new Set((state.photos || []).map(p => p.date))].sort();
    if (dates.length < 2) { toast("Servono foto di almeno due date diverse"); return; }
    const sel = (id, def) => `<select class="chart-select" id="${id}" onchange="photoCompareDraw()">
      ${dates.map(d => `<option value="${d}" ${d === def ? "selected" : ""}>${fmtShort(d)}</option>`).join("")}</select>`;
    $("modal-title").textContent = "Prima / Dopo";
    $("modal-body").innerHTML = `
      <div class="ph-cmp-sel">${sel("ph-a", dates[0])}${sel("ph-b", dates[dates.length - 1])}</div>
      <select class="chart-select" id="ph-angle" onchange="photoCompareDraw()">
        ${PHOTO_ANGLES.map(([k, l]) => `<option value="${k}">${l}</option>`).join("")}
      </select>
      <div class="ph-cmp" id="ph-cmp"></div>`;
    $("modal").classList.add("show");
    photoCompareDraw();
  };

  window.photoCompareDraw = async function () {
    const host = $("ph-cmp");
    if (!host) return;
    const a = $("ph-a").value, b = $("ph-b").value, ang = $("ph-angle").value;
    host.innerHTML = '<div class="empty-mini">Carico…</div>';
    const find = (d) => (state.photos || []).find(p => p.date === d && p.angle === ang);
    const [pa, pb] = [find(a), find(b)];
    const [ua, ub] = await Promise.all([pa ? signedURL(pa.path) : null, pb ? signedURL(pb.path) : null]);
    const cell = (u, d) => `<div class="ph-cell">${u ? `<img src="${u}" alt="">` : '<div class="ph-missing">nessuna foto</div>'}<span>${fmtShort(d)}</span></div>`;
    host.innerHTML = cell(ua, a) + cell(ub, b);
  };

  /* --- la sezione in Profilo --- */
  window.renderPhotos = async function () {
    const host = $("photo-card");
    if (!host) return;
    if (window.DEMO_MODE || !me()) {
      host.innerHTML = `<div class="acct-intro">📸 Con un account puoi costruire la timeline fotografica della tua trasformazione: 3 scatti ogni 2 settimane, privati nel tuo cloud.</div>`;
      return;
    }
    const today = todayStr();
    const due = photoCheckDue();
    const todaySet = (a) => (state.photos || []).find(p => p.date === today && p.angle === a);

    const slots = PHOTO_ANGLES.map(([k, l]) => {
      const p = todaySet(k);
      return `<label class="ph-slot ${p ? "done" : ""}" id="ph-slot-${k}">
        <input type="file" accept="image/*" style="display:none" onchange="photoUpload(this,'${k}')">
        <span class="ph-slot-ico">${p ? "✅" : "📷"}</span><span>${l}</span>
      </label>`;
    }).join("");

    // timeline: date raggruppate (più recente in alto), max 8 righe
    const dates = [...new Set((state.photos || []).map(p => p.date))].sort().reverse().slice(0, 8);
    const rows = dates.map(d => {
      const ph = PHOTO_ANGLES.map(([k]) => (state.photos || []).find(p => p.date === d && p.angle === k));
      return `<div class="ph-row" data-d="${d}">
        <span class="mh-date">${fmtShort(d)}</span>
        <div class="ph-thumbs">${ph.map((p, i) => p
          ? `<span class="ph-thumb" id="pht-${d}-${PHOTO_ANGLES[i][0]}" onclick="photoDelete('${d}','${PHOTO_ANGLES[i][0]}')" title="tocca per eliminare"></span>`
          : `<span class="ph-thumb ph-empty"></span>`).join("")}</div>
      </div>`;
    }).join("");

    host.innerHTML = `
      ${due ? `<div class="ph-due">📸 Check quindicinale: è il momento dei 3 scatti (insieme a peso e misure)</div>` : ""}
      <div class="ph-slots">${slots}</div>
      <details class="steps"><summary>📋 Come scattare foto confrontabili</summary>
        <ol class="steps-list">
          <li>Tre angolazioni: fronte, lato, schiena.</li>
          <li>Sempre la stessa ora: mattina a digiuno.</li>
          <li>Stessa luce (naturale), stesso sfondo neutro, stessa distanza.</li>
          <li>Stesso abbigliamento (o assenza), postura rilassata e naturale.</li>
          <li>Niente pump post-allenamento: falserebbe il confronto.</li>
        </ol>
      </details>
      ${dates.length ? `<div class="section-label" style="margin-top:14px">Timeline</div>${rows}` : ""}
      ${dates.length >= 2 ? `<button class="btn-secondary" style="width:100%;margin-top:10px" onclick="photoCompare()">🆚 Confronto prima / dopo</button>` : ""}`;

    // riempi le miniature con gli URL firmati (best-effort, in parallelo)
    dates.forEach(d => PHOTO_ANGLES.forEach(async ([k]) => {
      const p = (state.photos || []).find(x => x.date === d && x.angle === k);
      if (!p) return;
      const u = await signedURL(p.path);
      const el = document.getElementById(`pht-${d}-${k}`);
      if (el && u) el.style.backgroundImage = `url("${u}")`;
    }));
  };
})();
