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
  querySelector: function(sel){ return elCache[sel] || (elCache[sel] = fakeEl()); },
  querySelectorAll: function(){ return []; },
  createElement: function(){ return fakeEl(); },
  addEventListener: function(){},
  body: { appendChild:function(){}, removeChild:function(){}, style:{} },
  visibilityState: "visible"
};
var winStub = { addEventListener:function(){} };
var lsStub = { _d:{}, getItem:function(k){return this._d[k]||null}, setItem:function(k,v){this._d[k]=String(v)}, removeItem:function(k){delete this._d[k]} };
function ChartStub(){ this.destroy=function(){}; } ChartStub.defaults={font:{}};

var SRC = [read(ROOT + "/js/data.js"), read(ROOT + "/js/storage.js"), read(ROOT + "/js/app.js"), read(ROOT + "/js/wrapped.js"), read(ROOT + "/js/demo.js"), read(ROOT + "/js/crew.js")].join("\n;\n");
var api = new Function(
  "document","window","localStorage","sessionStorage","navigator","EXERCISE_STEPS","EXERCISE_CUES","Chart",
  SRC + `
  ;return {
    localDate: localDate, todayStr: todayStr, weekStart: weekStart, linReg: linReg,
    suggestion: suggestion, exVerdict: exVerdict, nutritionTargets: nutritionTargets,
    kcalTarget: kcalTarget, proteinTarget: proteinTarget, mealDayStreak: mealDayStreak,
    ALL_WORKOUTS: ALL_WORKOUTS, getWorkout: getWorkout, SCHEDULABLE: SCHEDULABLE,
    chipOrder: chipOrder, ptNextIndex: ptNextIndex, selectWorkout: selectWorkout,
    nightCloseMessage: nightCloseMessage, computeCrewStats: computeCrewStats, icsContent: icsContent,
    defaultState: defaultState, applyMigrations: applyMigrations,
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

/* ---- 16b) TAB ALLENA: ordine chips = ordine calendario, PT compresa ---- */
st = api.defaultState();
st.myWorkouts = [
  { id:"s1", name:"Scheda 1", emoji:"1", color:"#f00", exercises:["chestpress"] },
  { id:"s2", name:"Scheda 2", emoji:"2", color:"#0f0", exercises:["curl"] }
];
api.set(st);
function dPlus(n){ var d=new Date(); d.setDate(d.getDate()+n); return api.localDate(d); }
st.schedule = {};
st.schedule[dPlus(1)] = { workoutId:"pt", done:false, pt:true };
st.schedule[dPlus(3)] = { workoutId:"s2", done:false };
st.schedule[dPlus(5)] = { workoutId:"s1", done:false };
st.schedule[dPlus(8)] = { workoutId:"s2", done:false };   // ripetizione: non duplica
var ord = api.chipOrder().map(function(w){ return w.id; });
ok("chips: ordine = calendario (PT, s2, s1) senza duplicati", JSON.stringify(ord) === '["pt","s2","s1"]');
st.schedule[dPlus(1)].done = true;                         // PT fatta → slitta in coda
ord = api.chipOrder().map(function(w){ return w.id; });
ok("chips: PT completata → s2 davanti, PT dietro", ord[0] === "s2" && ord.indexOf("pt") === 2);
st.schedule = {};
ord = api.chipOrder().map(function(w){ return w.id; });
ok("chips: senza calendario → ordine originale + PT in coda", JSON.stringify(ord) === '["s1","s2","pt"]');

/* ---- 16c) VISTA PT: rotazione super esercizio + render ---- */
st.ptLifts = [{ date: dPlus(-3), panca: 65, squat: null, stacco: null }];
ok("PT: dopo la panca tocca allo stacco", api.ptNextIndex() === 1);
api.selectWorkout("pt");
var ptOk = true;
try { api.renderWorkout(); } catch (e) { ptOk = false; }
ok("PT: la tab PT renderizza senza errori", ptOk);

/* ---- 16d) PROMEMORIA NOTTURNO (22–01): chiudi kcal/proteine ---- */
st = api.defaultState();
st.nutriGoal = { kcal: 2100, protein: 120 };
api.set(st);
var T2 = api.todayStr();
st.meals = {}; st.meals[T2] = [{ id: 1, kcal: 1500, protein: 90 }];
function at(h){ var d = new Date(); d.setHours(h, 30, 0, 0); return d; }
ok("notte: alle 20 niente promemoria", api.nightCloseMessage(at(20)) === null);
var nm = api.nightCloseMessage(at(22));
ok("notte: alle 22 dice cosa manca (600 kcal, 30 g)", nm && nm.txt.indexOf("600 kcal") >= 0 && nm.txt.indexOf("30 g") >= 0 && nm.day === T2);
ok("notte: suggerisce cosa mangiare", nm.txt.indexOf("shake") >= 0);
var mid = at(0); mid.setDate(mid.getDate() + 1);          // 00:30 di domani → giorno appena chiuso
var nm2 = api.nightCloseMessage(mid);
ok("notte: dopo mezzanotte guarda ancora il giorno prima", nm2 && nm2.day === T2);
st.meals[T2] = [{ id: 1, kcal: 2200, protein: 130 }];
ok("notte: obiettivi chiusi → complimenti", api.nightCloseMessage(at(23)).txt.indexOf("✅") >= 0);
st.meals = {};
ok("notte: nessun pasto tracciato → silenzio", api.nightCloseMessage(at(23)) === null);

/* ---- 16e) CREW: la vetrinetta contiene solo aggregati giusti ---- */
st = api.defaultState();
st.profile = { nick: "Mike", daysPerWeek: 3, goal: "massa" };
st.sessions = [{ id: 1, date: api.todayStr(), workoutId: "fullbody",
  exercises: { chestpress: { sets: [{w:30,r:12},{w:30,r:12}], quality: "clean" } } }];
st.ptLifts = [{ date: api.todayStr(), panca: 30, squat: null, stacco: null }];
api.set(st);
var cs = api.computeCrewStats();
ok("crew: settimana = sessioni + sedute PT", cs.weekDone === 2);
ok("crew: piano dal profilo", cs.planned === 3);
ok("crew: il giorno di oggi è un pallino pieno", cs.days.indexOf(2) >= 0 && cs.days.length === 7);
ok("crew: duello del mese conteggiato", cs.monthDone === 2 && cs.monthPct > 0 && cs.monthPct <= 100);
ok("crew: volume = sessioni (30×12×2) + seduta PT (30 kg × 15)", cs.volWeek === 720 + 450);
ok("crew: nick presente", cs.nick === "Mike");
ok("crew: ultimo allenamento = oggi", cs.last && cs.last.date === api.todayStr());
ok("crew: senza storico niente delta (serve la SUA media)", cs.volDelta === null);
// due settimane precedenti da 360 kg/sett. → questa settimana (720) = +100%
function wAgo(n) { var d = new Date(api.weekStart(api.todayStr()) + "T00:00:00"); d.setDate(d.getDate() - n * 7); return api.localDate(d); }
st.sessions.push(
  { id: 2, date: wAgo(1), workoutId: "fullbody", exercises: { chestpress: { sets: [{w:30,r:12}], quality: "clean" } } },
  { id: 3, date: wAgo(2), workoutId: "fullbody", exercises: { chestpress: { sets: [{w:30,r:12}], quality: "clean" } } });
cs = api.computeCrewStats();
ok("crew: volume vs la PROPRIA media ((720+450)/360 → +225%)", cs.volDelta === 225);
var keys = Object.keys(cs).join(",");
ok("crew: NIENTE dati sensibili (pasti/peso/misure)", keys.indexOf("meal") < 0 && keys.indexOf("weight") < 0 && keys.indexOf("composition") < 0);

/* ---- 16f) MIGRAZIONE: pulldown ai cavi → schiena ---- */
var stM = api.defaultState();
stM.customExercises = {
  pt_pulldown: { name: "Pulldown cavi corda", muscle: "Tricipiti", bodyPart: "arms", type: "cable" },
  pt_curl: { name: "Curl manubri", muscle: "Bicipiti", bodyPart: "arms", type: "dumbbell" }
};
stM = api.applyMigrations(stM);
ok("migrazione: pulldown → back/Dorsali", stM.customExercises.pt_pulldown.bodyPart === "back" && stM.customExercises.pt_pulldown.muscle === "Dorsali");
ok("migrazione: gli altri esercizi braccia restano intatti", stM.customExercises.pt_curl.bodyPart === "arms");
ok("migrazione: marcata come applicata (non si ripete)", stM.migrations.indexOf("pulldown-back") >= 0);

/* ---- 16g) EXPORT ICS ---- */
st = api.defaultState();
api.set(st);
st.schedule = {};
st.schedule[dPlus(2)] = { workoutId: "fullbody", done: false };
st.schedule[dPlus(4)] = { workoutId: "pt", done: false, pt: true };
st.schedule[dPlus(1)] = { workoutId: "fullbody", done: true };   // fatta: non si esporta
var ics = api.icsContent();
ok("ICS: contiene i 2 eventi futuri non fatti", (ics.match(/BEGIN:VEVENT/g) || []).length === 2);
ok("ICS: la seduta PT ha il super esercizio", ics.indexOf("PT — Panca") >= 0 || ics.indexOf("PT — Stacco") >= 0 || ics.indexOf("PT — Squat") >= 0);
ok("ICS: eventi giornata intera", ics.indexOf("DTSTART;VALUE=DATE:") >= 0);
st.schedule = {};
ok("ICS: senza piano → null", api.icsContent() === null);

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
