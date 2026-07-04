/* Test headless (JavaScriptCore via osascript) sulle funzioni pure di app.js.
   Esecuzione: osascript -l JavaScript tests/test_core.js
   I sorgenti girano dentro una Function così il loro `$` non collide col
   bridge ObjC di JXA. */
ObjC.import('Foundation');
function read(p){ return ObjC.unwrap($.NSString.stringWithContentsOfFileEncodingError(p, $.NSUTF8StringEncoding, null)); }
var ROOT = "/Users/mike/Desktop/gym";
var out = [], fails = 0;
function ok(n, c){ out.push((c ? "PASS " : "FAIL ") + n); if (!c) fails++; }

/* ---- stub DOM/ambiente ---- */
function fakeEl(){ return { innerHTML:"", textContent:"", value:"", className:"", id:"",
  style:{}, dataset:{}, classList:{add:function(){},remove:function(){},toggle:function(){},contains:function(){return false}},
  appendChild:function(){}, querySelector:function(){return null}, querySelectorAll:function(){return []},
  getContext:function(){return {};}, focus:function(){}, select:function(){} }; }
var elCache = {};
var docStub = {
  getElementById: function(id){ return elCache[id] || (elCache[id] = fakeEl()); },
  querySelector: function(){ return null; },
  querySelectorAll: function(){ return []; },
  createElement: function(){ return fakeEl(); },
  addEventListener: function(){},
  body: { appendChild:function(){}, removeChild:function(){}, style:{} },
  visibilityState: "visible"
};
var winStub = { addEventListener:function(){} };
var lsStub = { _d:{}, getItem:function(k){return this._d[k]||null}, setItem:function(k,v){this._d[k]=String(v)}, removeItem:function(k){delete this._d[k]} };
function ChartStub(){ this.destroy=function(){}; } ChartStub.defaults={font:{}};

var SRC = [read(ROOT + "/js/data.js"), read(ROOT + "/js/storage.js"), read(ROOT + "/js/app.js"), read(ROOT + "/js/wrapped.js"), read(ROOT + "/js/demo.js")].join("\n;\n");
var api = new Function(
  "document","window","localStorage","sessionStorage","navigator","EXERCISE_STEPS","EXERCISE_CUES","Chart",
  SRC + `
  ;return {
    localDate: localDate, todayStr: todayStr, weekStart: weekStart, linReg: linReg,
    suggestion: suggestion, exVerdict: exVerdict, nutritionTargets: nutritionTargets,
    kcalTarget: kcalTarget, proteinTarget: proteinTarget, mealDayStreak: mealDayStreak,
    ALL_WORKOUTS: ALL_WORKOUTS, getWorkout: getWorkout, SCHEDULABLE: SCHEDULABLE,
    defaultState: defaultState,
    fatigueAnalysis: fatigueAnalysis, deloadActive: deloadActive,
    wrappedStats: wrappedStats, wrappedVerdict: wrappedVerdict, volumeComparison: volumeComparison,
    demoState: demoState, muscleCoverage: muscleCoverage, strengthLevel: strengthLevel,
    enterDemoMode: enterDemoMode,
    renderWorkout: renderWorkout, renderProgress: renderProgress, renderGoals: renderGoals,
    renderCalendar: renderCalendar, renderMeals: renderMeals, renderPT: renderPT,
    startGuided: startGuided, guidedCompleteSet: guidedCompleteSet, guidedQuality: guidedQuality,
    finishGuided: finishGuided, wrappedSlides: buildWrappedSlides,
    set: function (s) { state = s; },
    get: function () { return state; }
  };`
)(docStub, winStub, lsStub, lsStub, {}, {}, {}, ChartStub);

/* ---- 1) TIMEZONE: le date devono essere LOCALI ---- */
ok("localDate: mezzanotte e mezza locale resta nel giorno giusto",
   api.localDate(new Date(2026, 6, 4, 0, 30)) === "2026-07-04");
ok("localDate: 23:30 locale resta nel giorno giusto",
   api.localDate(new Date(2026, 6, 4, 23, 30)) === "2026-07-04");
var utcWrong = new Date(2026, 6, 4, 0, 30).toISOString().split("T")[0];
if (new Date(2026, 6, 4).getTimezoneOffset() < 0)
  ok("regressione: toISOString avrebbe dato il giorno PRIMA (bug fixato)", utcWrong === "2026-07-03");
ok("todayStr coerente con localDate", api.todayStr() === api.localDate(new Date()));

/* ---- 2) weekStart: lunedì locale, niente slittamenti UTC ---- */
ok("weekStart: mercoledì 8 lug → lunedì 6 lug", api.weekStart("2026-07-08") === "2026-07-06");
ok("weekStart: un lunedì resta se stesso", api.weekStart("2026-07-06") === "2026-07-06");
ok("weekStart: domenica 12 lug → lunedì 6 lug", api.weekStart("2026-07-12") === "2026-07-06");

/* ---- 3) linReg (trend line volume) ---- */
ok("linReg: serie lineare perfetta", JSON.stringify(api.linReg([10,20,30])) === "[10,20,30]");
ok("linReg: serie costante", JSON.stringify(api.linReg([5,5,5])) === "[5,5,5]");
ok("linReg: 1 punto → null", api.linReg([7]) === null);

/* ---- 4) Progressione (suggestion) ---- */
var st = api.defaultState();
st.sessions = [{ id:1, date:"2026-06-25", workoutId:"fullbody",
  exercises:{ chestpress:{ sets:[{w:20,r:15},{w:20,r:15},{w:20,r:15}], quality:"clean" } } }];
api.set(st);
ok("suggestion: pulite al tetto reps → aumenta il peso", api.suggestion("chestpress").targetW === 22.5);
st.sessions[0].exercises.chestpress.quality = "fail";
ok("suggestion: fallite → stesso peso", api.suggestion("chestpress").targetW === 20);

/* ---- 5) exVerdict (semaforo progressione) ---- */
var v1 = api.exVerdict([{v:20,q:"clean"},{v:22.5,q:"hard"}]);
ok("verdict: peso su + tenuto → progresso", v1.indexOf("rogresso") >= 0 || v1.indexOf("salito") >= 0);
var v2 = api.exVerdict([{v:20,q:"fail"},{v:20,q:"clean"}]);
ok("verdict: stesso peso ma pulito → progresso reale", v2.indexOf("fatto meglio") >= 0 || v2.indexOf("salire") >= 0);
ok("verdict: 1 sessione → invito a registrarne altre", api.exVerdict([{v:20,q:"clean"}]).indexOf("altra sessione") >= 0);

/* ---- 6) Coach nutrizione adattivo ---- */
st = api.defaultState();
st.profile = { goal:"massa", daysPerWeek:3, height:179, age:39, sex:"M", onboarded:true };
st.bodyweight = [{date:"2026-06-01", v:60}];
api.set(st);
var n1 = api.nutritionTargets();
ok("coach: BMR Mifflin plausibile (1500-1700)", n1.bmr >= 1500 && n1.bmr <= 1700);
ok("coach: kcal = tdee + surplus massa", n1.kcal > n1.tdee);
ok("coach: proteine 1.9 g/kg", n1.protein === Math.round(60 * 1.9));
st.bodyweight = [{date:"2026-06-20", v:60},{date:"2026-07-01", v:60}];   // peso fermo 11 giorni
var n2 = api.nutritionTargets();
ok("coach adattivo: peso fermo → +150 kcal", n2.kcal >= n1.kcal + 100);
ok("coach adattivo: nota presente", n2.adaptNote.length > 0);

/* ---- 7) Pasti: default = coach, override manuale vince ---- */
st.nutriGoal = { kcal: null, protein: null };
ok("pasti: kcal default dal coach", api.kcalTarget() === n2.kcal);
ok("pasti: proteine default dal coach", api.proteinTarget() === n2.protein);
st.nutriGoal = { kcal: 2800, protein: 150 };
ok("pasti: override manuale vince", api.kcalTarget() === 2800 && api.proteinTarget() === 150);

/* ---- 8) mealDayStreak ---- */
st = api.defaultState();
api.set(st);
var today = api.todayStr();
var y = new Date(); y.setDate(y.getDate() - 1);
st.meals = {}; st.meals[today] = [{id:1,kcal:500,protein:30}]; st.meals[api.localDate(y)] = [{id:2,kcal:600,protein:40}];
ok("mealDayStreak: oggi+ieri = 2", api.mealDayStreak() === 2);

/* ---- 9) Anti-regressione schede ---- */
st = api.defaultState();
api.set(st);
ok("ALL_WORKOUTS: default = 3 schede", api.ALL_WORKOUTS().length === 3);
st.myWorkouts = [{id:"x", name:"Mia", emoji:"x", color:"#fff", exercises:["chestpress"]}];
ok("ALL_WORKOUTS: schede utente vincono", api.ALL_WORKOUTS().length === 1);
ok("getWorkout: trova PT", api.getWorkout("pt") && api.getWorkout("pt").pt === true);
ok("SCHEDULABLE: schede utente + PT", api.SCHEDULABLE().length === 2);

/* ---- 10) DELOAD: analisi fatica + suggerimento -20% ---- */
st = api.defaultState();
api.set(st);
function mkSess(daysAgo, quality, w) {
  var d = new Date(); d.setDate(d.getDate() - daysAgo);
  return { id: Math.random(), date: api.localDate(d), workoutId: "fullbody",
    exercises: { chestpress: { sets: [{w: w||20, r: 12},{w: w||20, r: 12},{w: w||20, r: 12}], quality: quality } } };
}
// 2 settimane pesanti: 6 valutazioni quasi tutte dure/fallite → propone scarico
st.sessions = [mkSess(2,"fail"), mkSess(4,"hard"), mkSess(6,"fail"), mkSess(8,"hard"), mkSess(10,"fail"), mkSess(12,"hard")];
var fa = api.fatigueAnalysis();
ok("deload: fatica alta → proposto", fa.propose === true && fa.reason.length > 0);
// tutte pulite → NON proposto
st.sessions = [mkSess(2,"clean"), mkSess(4,"clean"), mkSess(6,"clean"), mkSess(8,"clean"), mkSess(10,"clean"), mkSess(12,"clean")];
ok("deload: tutto pulito → non proposto", api.fatigueAnalysis().propose === false);
// scarico attivo → suggestion al -20% arrotondato
var u = new Date(); u.setDate(u.getDate() + 3);
st.deload = { start: api.todayStr(), until: api.localDate(u) };
st.sessions = [mkSess(2, "clean", 30)];
ok("deload attivo: deloadActive true", api.deloadActive() === true);
var sd = api.suggestion("chestpress");
ok("deload attivo: target -20% (30→22.5 arrotondato 2.5)", sd.targetW === 22.5 && sd.color === "deload");
st.deload = null;
ok("deload spento: suggestion normale torna", api.suggestion("chestpress").color !== "deload");
// le sessioni di scarico non fanno da baseline
var dl = mkSess(1, "clean", 24); dl.deload = true;
st.sessions = [mkSess(5, "clean", 30), dl];
ok("deload: baseline ignora la sessione di scarico", api.suggestion("chestpress").lastW === 30);

/* ---- 11) WRAPPED: statistiche, paragoni, pagella ---- */
st = api.defaultState();
st.profile = { goal: "massa", daysPerWeek: 3, onboarded: true };
api.set(st);
var MK = "2026-06";
st.sessions = [
  { id:1, date:"2026-06-05", workoutId:"fullbody", exercises:{ chestpress:{ sets:[{w:20,r:12},{w:20,r:12},{w:20,r:12}], quality:"clean" } } },
  { id:2, date:"2026-06-12", workoutId:"fullbody", exercises:{ chestpress:{ sets:[{w:22.5,r:12},{w:22.5,r:12},{w:22.5,r:12}], quality:"clean" } } },
  { id:3, date:"2026-06-19", workoutId:"fullbody", exercises:{ chestpress:{ sets:[{w:25,r:12},{w:25,r:12},{w:25,r:12}], quality:"hard" } } }
];
st.bodyweight = [{date:"2026-06-01", v:60},{date:"2026-06-29", v:61}];
st.meals = { "2026-06-10": [{id:1,kcal:2600,protein:140}] };
var ws = api.wrappedStats(MK);
ok("wrapped: 3 sessioni", ws.sessions === 3);
ok("wrapped: volume = somma kg×rip", ws.volume === (20*36 + 22.5*36 + 25*36));
ok("wrapped: top exercise 20→25", ws.topEx && ws.topEx.gain === 5 && ws.topEx.to === 25);
ok("wrapped: qualità 2 pulite 1 dura", ws.clean === 2 && ws.hard === 1 && ws.fail === 0);
ok("wrapped: delta peso +1", ws.wDelta === 1);
var wv = api.wrappedVerdict(ws);
ok("wrapped: pagella ha celebrazioni", wv.cel.length >= 1);
ok("wrapped: pagella ha una sfida", wv.chal.length === 1);
ok("wrapped: voto 0-100", wv.score >= 0 && wv.score <= 100);
ok("wrapped: mese vuoto → critica presente", api.wrappedVerdict(api.wrappedStats("2025-01")).crit.length >= 1);
ok("volumeComparison: 2400 kg ≈ 2 Fiat Panda", String(api.volumeComparison(2400)).indexOf("2 volte") === 0);
ok("volumeComparison: sotto soglia → null", api.volumeComparison(30) === null);

/* ---- 12) PIANO KCAL: +inc ogni lunedì ---- */
st = api.defaultState();
st.profile = { goal:"massa", daysPerWeek:3, height:179, age:39, sex:"M", onboarded:true };
api.set(st);
var thisMon = api.weekStart(api.todayStr());
st.nutriGoal = { kcal:null, protein:null, plan: { week0: thisMon, kcal0: 2100, inc: 100 } };
ok("piano kcal: settimana di ancoraggio → 2100", api.kcalTarget() === 2100);
var lastMon = new Date(thisMon + "T00:00:00"); lastMon.setDate(lastMon.getDate() - 7);
st.nutriGoal.plan.week0 = api.localDate(lastMon);
ok("piano kcal: dopo 1 lunedì → 2200", api.kcalTarget() === 2200);
var threeMon = new Date(thisMon + "T00:00:00"); threeMon.setDate(threeMon.getDate() - 21);
st.nutriGoal.plan.week0 = api.localDate(threeMon);
ok("piano kcal: dopo 3 lunedì → 2400", api.kcalTarget() === 2400);
st.nutriGoal.plan.inc = 0;
ok("piano kcal: inc 0 → fisso", api.kcalTarget() === 2100);

/* ---- 13) PROFILO DEMO: realistico e coerente ---- */
var demo = api.demoState();
ok("demo: profilo Alex completo", demo.profile.name === "Alex" && demo.profile.onboarded === true);
ok("demo: almeno 20 sessioni nel passato", demo.sessions.length >= 20 && demo.sessions.every(function(x){ return x.date <= api.todayStr(); }));
var badKeys = [];
demo.sessions.forEach(function(x){ Object.keys(x.exercises).forEach(function(k){ if (!EXERCISES_ok(k)) badKeys.push(k); }); });
function EXERCISES_ok(k){ return true; }  // verificato sotto con le chiavi reali
var allKeys = {};
demo.sessions.forEach(function(x){ Object.keys(x.exercises).forEach(function(k){ allKeys[k] = 1; }); });
var invalid = Object.keys(allKeys).filter(function(k){
  api.set(demo); return false;
});
api.set(demo);
ok("demo: tutte le chiavi esercizio esistono", Object.keys(allKeys).every(function(k){ return api.suggestion(k) != null; }));
ok("demo: pasti su almeno 9 giorni", Object.keys(demo.meals).length >= 9);
ok("demo: peso in crescita coerente", demo.bodyweight.length >= 6 && demo.bodyweight[demo.bodyweight.length-1].v > demo.bodyweight[0].v);
ok("demo: seduta PT futura in calendario", Object.entries(demo.schedule).some(function(e){ return e[0] > api.todayStr() && e[1].pt; }));
ok("demo: sedute PT registrate", demo.ptLifts.length >= 3);
ok("demo: composizione presente", demo.composition.length >= 4);
ok("demo: nessun riferimento a Mike", JSON.stringify(demo).indexOf("Mike") < 0 && JSON.stringify(demo).indexOf("Denis") < 0);

/* ---- 14) RADAR MUSCOLARE ---- */
st = api.defaultState();
api.set(st);
ok("radar: senza dati → null", api.muscleCoverage(30) === null);
var rd = new Date(); rd.setDate(rd.getDate() - 3);
st.sessions = [{ id: 1, date: api.localDate(rd), workoutId: "fullbody", exercises: {
  legpress:   { sets: [{w:80,r:12},{w:80,r:12}], quality: "clean" },     // 2 serie gambe
  chestpress: { sets: [{w:40,r:12},{w:40,r:12}], quality: "clean" },     // 2 serie petto
  latmachine: { sets: [{w:45,r:12},{w:45,r:12},{w:45,r:12},{w:45,r:12}], quality: "clean" }  // 4 serie schiena
}}];
var cov = api.muscleCoverage(30);
ok("radar: percentuali corrette (25/25/50)", cov.pct.legs === 25 && cov.pct.chest === 25 && cov.pct.back === 50);
ok("radar: gruppi non allenati a 0", cov.pct.arms === 0 && cov.pct.core === 0);
ok("radar: coverage nel wrapped", (function(){
  st.sessions = st.sessions.concat([1,2,3].map(function(i){ var d=new Date(); d.setDate(d.getDate()-i-4);
    return { id: 10+i, date: api.localDate(d), workoutId: "fullbody", exercises: { chestpress: { sets: [{w:40,r:12}], quality: "clean" } } }; }));
  var mk = api.todayStr().slice(0,7);
  var ws2 = api.wrappedStats(mk);
  return ws2.coverage && typeof ws2.coverage.chest === "number";
})());

/* ---- 15) STANDARD DI FORZA ---- */
var sl1 = api.strengthLevel("panca", 30, 60, "M");        // ratio 0.5 → Novizio
ok("forza: panca 30@60kg = Novizio", sl1.levelName === "Novizio");
ok("forza: prossimo = Principiante a 45 kg", sl1.next.name === "Principiante" && sl1.next.kg === 45);
var sl2 = api.strengthLevel("panca", 62.5, 60, "M");      // ratio ~1.04 → Intermedio
ok("forza: panca 62.5@60kg = Intermedio", sl2.levelName === "Intermedio");
var sl3 = api.strengthLevel("stacco", 170, 60, "M");      // ratio 2.83 → Élite, vetta
ok("forza: stacco 170@60kg = Élite (vetta)", sl3.levelName === "Élite" && sl3.next === null);
var sl4 = api.strengthLevel("panca", 25, 60, "M");        // ratio 0.42 → Prime armi
ok("forza: sotto la prima soglia = Prime armi", sl4.levelName === "Prime armi");
ok("forza: soglie femminili diverse", api.strengthLevel("panca", 30, 60, "F").levelName === "Principiante");

/* ---- 16) MISURE A NASTRO ---- */
var demo2 = api.demoState();
var lastC = demo2.composition[demo2.composition.length - 1];
ok("misure: presenti nella demo", lastC.arm > 35 && lastC.chest > 100 && lastC.waist < 81 && lastC.thigh > 56);
ok("misure: braccio in crescita", demo2.composition[0].arm < lastC.arm);
ok("misure: vita in calo", demo2.composition[0].waist > lastC.waist);

/* ---- 17) SMOKE: ogni vista renderizza senza eccezioni (dati demo realistici) ---- */
function smoke(name, fn) {
  try { fn(); ok("smoke: " + name, true); }
  catch (e) { ok("smoke: " + name + " → " + e.message, false); }
}
api.enterDemoMode();                     // stato realistico completo (Alex)
smoke("Allena (renderWorkout)", function(){ api.renderWorkout(); });
smoke("Progressi (grafici+radar+PT+storico)", function(){ api.renderProgress(); });
smoke("Profilo (composizione+trend+coach)", function(){ api.renderGoals(); });
smoke("Calendario", function(){ api.renderCalendar(); });
smoke("Pasti (barre+settimana)", function(){ api.renderMeals(); });
smoke("Wrapped (slide del mese scorso)", function(){
  var d = new Date(); d.setDate(0);
  var slides = api.wrappedSlides(api.localDate(d).slice(0,7));
  if (!slides.length) throw new Error("nessuna slide");
});
smoke("Guided: flusso completo primo esercizio", function(){
  api.startGuided();
  // completa 3 serie del primo esercizio
  elCache["g-w"] = elCache["g-w"] || {}; // gli input sono creati via innerHTML: stub li fornisce
  var st2 = api.get();
  // simula: compila input e completa 3 serie + qualità
  for (var i = 0; i < 3; i++) {
    docStub.getElementById("g-w").value = "40";
    docStub.getElementById("g-r").value = "12";
    api.guidedCompleteSet();
  }
  api.guidedQuality("clean");
  api.finishGuided();   // con dati → fase finish (nessun commit, solo render)
});
smoke("Deload: banner + suggestion con scarico attivo", function(){
  var st3 = api.get();
  var u = new Date(); u.setDate(u.getDate() + 3);
  st3.deload = { start: api.todayStr(), until: api.localDate(u) };
  api.renderWorkout();
  st3.deload = null;
});

out.push(fails === 0 ? "\nTUTTI I TEST PASSANO (" + (out.length) + ")" : "\n⚠️ " + fails + " TEST FALLITI");
out.join("\n");
