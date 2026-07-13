/* ============================================================
   BACKUP / TOAST / INIT
   ============================================================ */
function doExport() { exportJSON(state); }

function doImport(input) {
  const file = input.files[0];
  if (!file) return;
  importJSON(file).then(s => {
    state = s; saveState(state);
    toast("📥 Backup importato!");
    renderWorkoutChips(); renderWorkout();
  }).catch(() => toast("File non valido"));
  input.value = "";
}

/* ---------- SHEET (form nel modal, al posto dei prompt nativi) ---------- */
function sheetForm(title, fieldsHTML, onSaveJs) {
  $("modal-title").textContent = title;
  $("modal-body").innerHTML = `
    ${fieldsHTML}
    <button class="btn-save" style="margin-top:14px" onclick="${onSaveJs}">Salva</button>`;
  $("modal").classList.add("show");
}
const sheetField = (id, label, value, ph) =>
  `<div class="goal-field" style="margin-bottom:10px"><div class="goal-field-lbl">${label}</div>
   <input type="text" inputmode="decimal" id="${id}" value="${value != null ? value : ""}" placeholder="${ph || ""}"></div>`;
function sheetNum(id) {
  const e = $(id); if (!e) return null;
  const v = parseFloat(String(e.value).replace(",", "."));
  return isNaN(v) ? null : v;
}

/* ---------- TOAST CON ANNULLA (undo al posto dei confirm) ---------- */
let undoFn = null;
function toastUndo(msg, fn) {
  undoFn = fn;
  const t = $("toast");
  t.innerHTML = `${msg} <button class="toast-undo" onclick="doUndo()">Annulla</button>`;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.classList.remove("show"); undoFn = null; }, 5000);
}
function doUndo() {
  clearTimeout(toastTimer);
  $("toast").classList.remove("show");
  if (undoFn) { undoFn(); undoFn = null; }
}

let toastTimer = null;
function toast(msg) {
  const t = $("toast");
  t.innerHTML = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2400);
}

function setDate() {
  $("today-date").textContent = new Date().toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short" });
}

// INIT
if (window.Chart) {
  Chart.defaults.color = "rgba(245,240,255,.55)";
  Chart.defaults.font.family = "-apple-system, BlinkMacSystemFont, sans-serif";
}
setDate();
renderWeighBanner();
renderWorkoutChips();
renderWorkout();
