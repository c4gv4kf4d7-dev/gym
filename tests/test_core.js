/* Test headless (JavaScriptCore via osascript) sulle funzioni pure di app.js.
   Esecuzione: osascript -l JavaScript tests/test_core.js
   I sorgenti girano dentro una Function così il loro `$` non collide col
   bridge ObjC di JXA. */
ObjC.import('Foundation');
function read(p){ var a=Application.currentApplication(); a.includeStandardAdditions=true; return a.read(Path(p)); }
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
  body: { appendChild:function(){}, removeChild:function(){} },
  visibilityState: "visible"
};
var winStub = { addEventListener:function(){} };
var lsStub = { _d:{}, getItem:function(k){return this._d[k]||null}, setItem:function(k,v){this._d[k]=String(v)}, removeItem:function(k){delete this._d[k]} };
function ChartStub(){ this.destroy=function(){}; } ChartStub.defaults={font:{}};

var SRC = [read(ROOT + "/js/data.js"), read(ROOT + "/js/storage.js"), read(ROOT + "/js/app.js")].join("\n;\n");
var api = new Function(
  "document","window","localStorage","sessionStorage","navigator","EXERCISE_STEPS","EXERCISE_CUES","Chart",
  SRC + `
  ;return {
    localDate: localDate, todayStr: todayStr, weekStart: weekStart, linReg: linReg,
    suggestion: suggestion, exVerdict: exVerdict, nutritionTargets: nutritionTargets,
    kcalTarget: kcalTarget, proteinTarget: proteinTarget, mealDayStreak: mealDayStreak,
    ALL_WORKOUTS: ALL_WORKOUTS, getWorkout: getWorkout, SCHEDULABLE: SCHEDULABLE,
    defaultState: defaultState,
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

out.push(fails === 0 ? "\nTUTTI I TEST PASSANO (" + (out.length) + ")" : "\n⚠️ " + fails + " TEST FALLITI");
out.join("\n");
