const $ = (q, el=document) => el.querySelector(q);
const $$ = (q, el=document) => Array.from(el.querySelectorAll(q));

const fmtDate = (d) => new Intl.DateTimeFormat("fr-FR", { weekday:"short", day:"2-digit", month:"short" }).format(d);
const isoDay = (d) => d.toISOString().slice(0,10);
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

const STORAGE_KEY = "powerplan.v1";

const defaultData = () => ({
  settings: {
    goalWeight: 90.0,
    goalProtein: 190
  },
  daily: {
    // keyed by YYYY-MM-DD
    // [day]: { protein, creatine, steps, water, sleep, notes }
  },
  weightEntries: [
    // { day:"YYYY-MM-DD", kg: 96.0 }
  ],
  training: {
    sessions: [
      // { id, day, templateKey, exercises, createdAt, finishedAt }
    ]
  }
});

function load(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return defaultData();
    const parsed = JSON.parse(raw);
    return { ...defaultData(), ...parsed };
  }catch{
    return defaultData();
  }
}
function save(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
function ensureDaily(day){
  if(!state.daily[day]){
    state.daily[day] = { protein:0, creatine:false, steps:false, water:false, sleep:false, notes:"" };
  }
  return state.daily[day];
}

let state = load();

const templates = {
  hautA: {
    title: "Haut A",
    meta: "Développé couché + tractions. Progression: haut de fourchette → +charge.",
    exercises: [
      ex("Développé couché", "4×5–8", 4),
      ex("Tractions / Tirage vertical", "4×6–10", 4),
      ex("Développé incliné haltères", "3×8–12", 3),
      ex("Rowing (barre/machine)", "3×8–12", 3),
      ex("Élévations latérales", "3×12–20", 3),
      ex("Triceps poulie", "3×10–15", 3),
      ex("Gainage", "3×45–60s", 3, { time:true })
    ]
  },
  basA: {
    title: "Bas A",
    meta: "Squat/presse + RDL. Reste propre, RIR 1–2.",
    exercises: [
      ex("Squat / Presse", "4×6–10", 4),
      ex("Soulevé de terre roumain", "3×6–10", 3),
      ex("Fentes marchées", "3×10–12/jambe", 3),
      ex("Leg extension", "3×12–15", 3),
      ex("Mollets debout", "4×10–20", 4),
      ex("Crunch câble", "3×10–15", 3)
    ]
  },
  hautB: {
    title: "Haut B",
    meta: "Dos dominant + épaules arrière. Qualité > ego.",
    exercises: [
      ex("Développé militaire", "4×5–8", 4),
      ex("Rowing poulie assis", "4×8–12", 4),
      ex("Dips (assistés si besoin)", "3×6–12", 3),
      ex("Tirage vertical neutre", "3×8–12", 3),
      ex("Oiseau (rear delts)", "3×12–20", 3),
      ex("Curl biceps", "3×10–15", 3),
      ex("Face pull", "2–3×12–20", 3)
    ]
  },
  basB: {
    title: "Bas B",
    meta: "Ischios/fessiers + finisher cardio 10–15 min.",
    exercises: [
      ex("Hip thrust", "4×6–10", 4),
      ex("Leg curl", "4×8–12", 4),
      ex("Goblet squat / front squat léger", "3×10–15", 3),
      ex("Presse (pieds haut)", "3×10–15", 3),
      ex("Mollets assis", "4×12–20", 4),
      ex("Relevés de jambes", "3×8–15", 3)
    ]
  }
};

function ex(name, repRange, sets, opts={}){
  return {
    name, repRange, sets,
    opts,
    setData: Array.from({length: sets}).map(()=>({
      done:false,
      kg: "",
      reps: "",
      note: ""
    }))
  };
}

/* ---------- UI: tabs ---------- */
const tabs = $$(".tab");
tabs.forEach(btn => btn.addEventListener("click", () => {
  tabs.forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  const tab = btn.dataset.tab;
  $$(".panel").forEach(p => p.classList.remove("active"));
  $("#tab-"+tab).classList.add("active");
  renderAll();
}));

/* ---------- Settings modal ---------- */
const settingsModal = $("#settingsModal");
$("#btnSettings").addEventListener("click", () => {
  $("#goalWeight").value = state.settings.goalWeight;
  $("#goalProtein").value = state.settings.goalProtein;
  settingsModal.showModal();
});
$("#saveSettings").addEventListener("click", (e) => {
  e.preventDefault();
  state.settings.goalWeight = parseFloat($("#goalWeight").value || "90");
  state.settings.goalProtein = parseInt($("#goalProtein").value || "190", 10);
  save();
  settingsModal.close();
  renderAll();
});

$("#wipeData").addEventListener("click", (e) => {
  e.preventDefault();
  if(confirm("Tout effacer ? (Poids, training, nutrition, réglages)")){
    state = defaultData();
    save();
    settingsModal.close();
    renderAll();
  }
});

$("#exportData").addEventListener("click", async (e) => {
  e.preventDefault();
  const blob = new Blob([JSON.stringify(state, null, 2)], {type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `powerplan-export-${isoDay(new Date())}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});

$("#importData").addEventListener("click", async (e) => {
  e.preventDefault();
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "application/json";
  input.onchange = async () => {
    const file = input.files?.[0];
    if(!file) return;
    const text = await file.text();
    try{
      const parsed = JSON.parse(text);
      state = { ...defaultData(), ...parsed };
      save();
      settingsModal.close();
      renderAll();
      alert("Import OK.");
    }catch{
      alert("Import impossible: JSON invalide.");
    }
  };
  input.click();
});

/* ---------- Prompt modal helper ---------- */
const promptModal = $("#promptModal");
function showPrompt({title, sub, fields}) {
  $("#promptTitle").textContent = title;
  $("#promptSub").textContent = sub || "";
  const wrap = $("#promptFields");
  wrap.innerHTML = "";
  fields.forEach(f => {
    const lab = document.createElement("label");
    lab.className = "field";
    const span = document.createElement("span");
    span.textContent = f.label;
    const input = document.createElement("input");
    input.type = f.type || "text";
    if(f.inputmode) input.inputMode = f.inputmode;
    input.id = f.id;
    input.value = f.value ?? "";
    if(f.step) input.step = f.step;
    if(f.min!=null) input.min = f.min;
    if(f.max!=null) input.max = f.max;
    lab.append(span, input);
    wrap.appendChild(lab);
  });
  return new Promise((resolve) => {
    const ok = $("#promptOk");
    const onOk = (e) => {
      e.preventDefault();
      const out = {};
      fields.forEach(f => out[f.id] = $("#"+f.id).value);
      promptModal.close();
      ok.removeEventListener("click", onOk);
      resolve(out);
    };
    ok.addEventListener("click", onOk);
    promptModal.showModal();
    setTimeout(()=> $("#"+fields[0].id)?.focus(), 50);
  });
}

/* ---------- Daily quick actions ---------- */
const today = () => isoDay(new Date());
$("#todayDate").textContent = fmtDate(new Date());

$("#quickAddWeight").addEventListener("click", () => $("#btnAddWeight").click());
$("#quickAddProtein").addEventListener("click", () => $("#btnAddProtein").click());

$("#toggleCreatine").addEventListener("click", () => {
  const d = ensureDaily(today());
  d.creatine = !d.creatine;
  save();
  renderAll();
});

$("#resetDaily").addEventListener("click", () => {
  const d = ensureDaily(today());
  d.steps = false; d.water = false; d.sleep = false;
  save(); renderAll();
});

$("#chkSteps").addEventListener("change", (e)=>{
  ensureDaily(today()).steps = e.target.checked; save();
});
$("#chkWater").addEventListener("change", (e)=>{
  ensureDaily(today()).water = e.target.checked; save();
});
$("#chkSleep").addEventListener("change", (e)=>{
  ensureDaily(today()).sleep = e.target.checked; save();
});

/* ---------- Nutrition ---------- */
$("#btnAddProtein").addEventListener("click", async () => {
  const d = ensureDaily(today());
  const out = await showPrompt({
    title: "Ajouter protéines",
    sub: "Entre une valeur (g). Ex: 30 pour un shaker.",
    fields: [{ id:"grams", label:"Protéines (g)", type:"number", inputmode:"numeric", value:"30", step:"1", min:0, max:300 }]
  });
  const g = parseInt(out.grams || "0", 10);
  d.protein = clamp((d.protein || 0) + g, 0, 999);
  save(); renderAll();
});
$$('#tab-nutrition .btn.ghost').forEach(b => {
  if(!b.dataset.add) return;
  b.addEventListener("click", () => {
    const d = ensureDaily(today());
    d.protein = clamp((d.protein || 0) + parseInt(b.dataset.add,10), 0, 999);
    save(); renderAll();
  });
});
$("#resetProtein").addEventListener("click", () => {
  const d = ensureDaily(today());
  d.protein = 0; save(); renderAll();
});
$("#btnCreatineToggle").addEventListener("click", () => {
  const d = ensureDaily(today());
  d.creatine = !d.creatine; save(); renderAll();
});
$("#btnCreatineReset").addEventListener("click", () => {
  const d = ensureDaily(today());
  d.creatine = false; save(); renderAll();
});

/* ---------- Notes ---------- */
$("#saveNotes").addEventListener("click", () => {
  const d = ensureDaily(today());
  d.notes = $("#notes").value || "";
  save(); renderAll();
});
$("#clearNotes").addEventListener("click", () => {
  $("#notes").value = "";
  ensureDaily(today()).notes = "";
  save(); renderAll();
});

/* ---------- Weight ---------- */
$("#btnAddWeight").addEventListener("click", async () => {
  const last = getLastWeight();
  const out = await showPrompt({
    title: "Ajouter poids",
    sub: "Idéalement le matin, à jeun.",
    fields: [
      { id:"day", label:"Date (YYYY-MM-DD)", type:"date", value: today() },
      { id:"kg", label:"Poids (kg)", type:"number", inputmode:"decimal", value: (last?.kg ?? 96).toString(), step:"0.1", min:40, max:200 }
    ]
  });
  const day = out.day || today();
  const kg = parseFloat(out.kg || "0");
  upsertWeight(day, kg);
  save(); renderAll();
});

function upsertWeight(day, kg){
  const idx = state.weightEntries.findIndex(e => e.day === day);
  const entry = { day, kg: Math.round(kg*10)/10 };
  if(idx >= 0) state.weightEntries[idx] = entry;
  else state.weightEntries.push(entry);
  state.weightEntries.sort((a,b)=> a.day.localeCompare(b.day));
}
function deleteWeight(day){
  state.weightEntries = state.weightEntries.filter(e => e.day !== day);
}
function getLastWeight(){
  if(state.weightEntries.length===0) return null;
  return state.weightEntries[state.weightEntries.length-1];
}

/* ---------- Training ---------- */
let currentTemplateKey = "hautA";
let currentSession = makeSessionFromTemplate(currentTemplateKey);

function makeSessionFromTemplate(key){
  const t = templates[key];
  return {
    id: crypto.randomUUID(),
    templateKey: key,
    day: today(),
    createdAt: new Date().toISOString(),
    finishedAt: null,
    exercises: structuredClone(t.exercises)
  };
}

const dayPicker = $("#dayPicker");
dayPicker.addEventListener("click", (e)=>{
  const btn = e.target.closest(".seg");
  if(!btn) return;
  $$(".seg").forEach(s=>s.classList.remove("active"));
  btn.classList.add("active");
  currentTemplateKey = btn.dataset.day;
  currentSession = makeSessionFromTemplate(currentTemplateKey);
  renderTraining();
});

$("#btnNewSession").addEventListener("click", ()=>{
  currentSession = makeSessionFromTemplate(currentTemplateKey);
  renderTraining();
});

$("#saveSession").addEventListener("click", ()=>{
  // Save draft-like session (if not existing, store; else replace)
  const idx = state.training.sessions.findIndex(s => s.id === currentSession.id);
  if(idx >= 0) state.training.sessions[idx] = currentSession;
  else state.training.sessions.push(currentSession);
  save();
  alert("Séance sauvegardée.");
  renderAll();
});

$("#finishSession").addEventListener("click", ()=>{
  currentSession.finishedAt = new Date().toISOString();
  const idx = state.training.sessions.findIndex(s => s.id === currentSession.id);
  if(idx >= 0) state.training.sessions[idx] = currentSession;
  else state.training.sessions.push(currentSession);
  save();
  alert("Séance terminée. Bien joué.");
  renderAll();
});

function renderTraining(){
  const t = templates[currentTemplateKey];
  $("#sessionTitle").textContent = t.title;
  $("#sessionMeta").textContent = t.meta;

  const list = $("#workoutList");
  list.innerHTML = "";

  let doneSets = 0, totalSets = 0;

  currentSession.exercises.forEach((ex, exi)=>{
    totalSets += ex.setData.length;

    const wrap = document.createElement("div");
    wrap.className = "exercise";

    const head = document.createElement("div");
    head.className = "exhead";
    const left = document.createElement("div");
    const nm = document.createElement("div");
    nm.className = "exname";
    nm.textContent = ex.name;
    const meta = document.createElement("div");
    meta.className = "exmeta";
    meta.textContent = ex.repRange;
    left.append(nm, meta);
    head.append(left);
    wrap.append(head);

    const sets = document.createElement("div");
    sets.className = "sets";

    ex.setData.forEach((s, si)=>{
      if(s.done) doneSets++;

      const card = document.createElement("div");
      card.className = "set";

      const top = document.createElement("div");
      top.className = "settop";
      top.innerHTML = `<div style="font-weight:950">Série ${si+1}</div>`;
      card.append(top);

      card.append(mkField("kg", "Charge (kg)", s.kg, (v)=>{
        currentSession.exercises[exi].setData[si].kg = v;
      }, "decimal"));

      card.append(mkField("reps", "Reps", s.reps, (v)=>{
        currentSession.exercises[exi].setData[si].reps = v;
      }, "numeric"));

      card.append(mkField("note", "Note (RIR, etc.)", s.note, (v)=>{
        currentSession.exercises[exi].setData[si].note = v;
      }, "text"));

      const done = document.createElement("label");
      done.className = "setdone";
      const chk = document.createElement("input");
      chk.type="checkbox";
      chk.checked = !!s.done;
      chk.addEventListener("change", ()=>{
        currentSession.exercises[exi].setData[si].done = chk.checked;
        renderTraining();
      });
      done.append(chk, document.createTextNode("Fait"));
      card.append(done);

      sets.append(card);
    });

    wrap.append(sets);
    list.append(wrap);
  });

  const pct = totalSets ? Math.round((doneSets/totalSets)*100) : 0;
  $("#sessionProgress").textContent = `${pct}%`;
}

function mkField(id, label, value, onChange, inputmode){
  const frag = document.createElement("div");
  const lab = document.createElement("label");
  lab.textContent = label;
  const input = document.createElement("input");
  input.value = value ?? "";
  input.inputMode = inputmode || "text";
  input.placeholder = label;
  input.addEventListener("input", ()=> onChange(input.value));
  frag.append(lab, input);
  return frag;
}

function last7Sessions(){
  const sessions = state.training.sessions
    .filter(s => s.finishedAt)
    .sort((a,b)=> b.finishedAt.localeCompare(a.finishedAt))
    .slice(0,7);
  return sessions;
}

function renderTrainingHistory(){
  const wrap = $("#trainingHistory");
  wrap.innerHTML = "";
  const items = last7Sessions();

  if(items.length===0){
    const div = document.createElement("div");
    div.className = "hint";
    div.textContent = "Aucune séance terminée. Termine une séance pour remplir l’historique.";
    wrap.append(div);
    return;
  }

  items.forEach(s=>{
    const t = templates[s.templateKey];
    const div = document.createElement("div");
    div.className = "hitem";
    const done = countDoneSets(s);
    const total = countTotalSets(s);
    div.innerHTML = `
      <div class="hrow">
        <div>
          <div class="htitle">${t.title}</div>
          <div class="hsub">${new Date(s.finishedAt).toLocaleString("fr-FR", { dateStyle:"medium", timeStyle:"short" })}</div>
        </div>
        <span class="pill">${Math.round((done/total)*100)}%</span>
      </div>
    `;
    wrap.append(div);
  });
}

function countDoneSets(session){
  return session.exercises.reduce((acc, ex)=> acc + ex.setData.filter(s=>s.done).length, 0);
}
function countTotalSets(session){
  return session.exercises.reduce((acc, ex)=> acc + ex.setData.length, 0);
}

/* ---------- Charts (canvas simple, sans lib) ---------- */
function getWeightsLastNDays(n){
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - (n-1));
  const map = new Map(state.weightEntries.map(e => [e.day, e.kg]));
  const points = [];
  for(let i=0;i<n;i++){
    const d = new Date(start);
    d.setDate(start.getDate()+i);
    const day = isoDay(d);
    points.push({ day, kg: map.get(day) ?? null });
  }
  return points;
}

function movingAvg(points, window=7){
  const out = points.map((p, i)=>{
    let sum=0, c=0;
    for(let j=Math.max(0, i-window+1); j<=i; j++){
      const v = points[j].kg;
      if(v!=null){ sum+=v; c++; }
    }
    return { ...p, avg: c? sum/c : null };
  });
  return out;
}

function drawLineChart(canvas, points, {valueKey="kg", avgKey=null}={}){
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.height;
  canvas.width = Math.floor(w*dpr);
  canvas.height = Math.floor(h*dpr);
  ctx.scale(dpr,dpr);
  ctx.clearRect(0,0,w,h);

  const vals = points.map(p => p[valueKey]).filter(v=>v!=null);
  const vals2 = avgKey ? points.map(p=>p[avgKey]).filter(v=>v!=null) : [];
  const all = vals.concat(vals2);
  if(all.length===0){
    ctx.fillStyle = "rgba(255,255,255,.55)";
    ctx.font = "12px system-ui";
    ctx.fillText("Ajoute des entrées de poids pour afficher la courbe.", 10, 24);
    return;
  }

  const min = Math.min(...all) - 0.6;
  const max = Math.max(...all) + 0.6;

  const padX = 10, padY = 14;
  const x = (i)=> padX + (i*(w-2*padX)/(points.length-1));
  const y = (v)=> padY + (max - v)*(h-2*padY)/(max-min);

  // grid
  ctx.strokeStyle = "rgba(255,255,255,.06)";
  ctx.lineWidth = 1;
  for(let i=0;i<4;i++){
    const yy = padY + i*(h-2*padY)/3;
    ctx.beginPath(); ctx.moveTo(padX, yy); ctx.lineTo(w-padX, yy); ctx.stroke();
  }

  function plot(key, stroke, width=2){
    ctx.strokeStyle = stroke;
    ctx.lineWidth = width;
    ctx.beginPath();
    let started = false;
    points.forEach((p,i)=>{
      const v = p[key];
      if(v==null) return;
      const xx = x(i), yy = y(v);
      if(!started){ ctx.moveTo(xx,yy); started=true; }
      else ctx.lineTo(xx,yy);
    });
    ctx.stroke();
  }

  // avg line first
  if(avgKey) plot(avgKey, "rgba(46,233,166,.9)", 2);

  // main line
  plot(valueKey, "rgba(124,92,255,.95)", 2.5);

  // dots (last value)
  const lastIdx = [...points].reverse().findIndex(p=>p[valueKey]!=null);
  if(lastIdx >= 0){
    const i = points.length - 1 - lastIdx;
    const v = points[i][valueKey];
    ctx.fillStyle = "rgba(124,92,255,.95)";
    ctx.beginPath(); ctx.arc(x(i), y(v), 3.5, 0, Math.PI*2); ctx.fill();
  }
}

/* ---------- Render dashboard ---------- */
function avgLastDays(n){
  const pts = getWeightsLastNDays(n).map(p=>p.kg).filter(v=>v!=null);
  if(pts.length===0) return null;
  const sum = pts.reduce((a,b)=>a+b,0);
  return sum/pts.length;
}
function pace7(){
  const pts = getWeightsLastNDays(8).filter(p=>p.kg!=null);
  if(pts.length < 2) return null;
  const first = pts[0].kg;
  const last = pts[pts.length-1].kg;
  const diff = last - first; // negative = losing
  return diff * 7; // approx per week based on 7-day span
}

function renderDashboard(){
  const d = ensureDaily(today());

  // KPIs
  const last = getLastWeight();
  $("#kpiWeight").textContent = last ? last.kg.toFixed(1) : "—";
  $("#kpiWeightFoot").textContent = last ? `Le ${new Date(last.day).toLocaleDateString("fr-FR")}` : "Ajoute ton poids (matin).";

  $("#kpiProtein").textContent = (d.protein ?? 0).toString();
  $("#kpiProteinGoal").textContent = state.settings.goalProtein.toString();
  $("#kpiCreatine").textContent = d.creatine ? "✔ pris" : "—";

  // checklist
  $("#chkSteps").checked = !!d.steps;
  $("#chkWater").checked = !!d.water;
  $("#chkSleep").checked = !!d.sleep;

  // Streak pill
  $("#pillStreak").textContent = streakText();

  // week grid
  const week = $("#weekGrid");
  week.innerHTML = "";
  const days = [
    { key:"hautA", label:"Lun", title:"Haut A" },
    { key:"basA", label:"Mar", title:"Bas A" },
    { key:"hautB", label:"Jeu", title:"Haut B" },
    { key:"basB", label:"Sam", title:"Bas B" },
  ];
  const doneKeys = finishedThisWeekTemplateKeys();
  days.forEach(dy=>{
    const card = document.createElement("div");
    card.className = "daycard";
    card.innerHTML = `
      <div class="dayname">${dy.label}</div>
      <div class="daymeta">${dy.title}</div>
      <div class="daydot ${doneKeys.has(dy.key) ? "done" : ""}"></div>
    `;
    week.append(card);
  });
  $("#weekStatus").textContent = `${doneKeys.size}/4`;

  // charts + stats
  const pts14 = getWeightsLastNDays(14);
  const avg = movingAvg(pts14, 7);
  drawLineChart($("#weightChart"), avg, { valueKey:"kg", avgKey:"avg" });

  const avg7 = avgLastDays(7);
  $("#avg7").textContent = avg7 ? avg7.toFixed(1) : "—";

  const goal = state.settings.goalWeight;
  $("#deltaGoal").textContent = avg7 ? (avg7 - goal).toFixed(1) : "—";

  const p = pace7();
  $("#pace7").textContent = p!=null ? (p).toFixed(2) : "—";
}

/* ---------- Render weight tab ---------- */
function renderWeight(){
  const pts30 = getWeightsLastNDays(30);
  drawLineChart($("#weightChart30"), movingAvg(pts30,7), { valueKey:"kg", avgKey:"avg" });

  const list = $("#weightList");
  list.innerHTML = "";

  const entries = [...state.weightEntries].slice().sort((a,b)=> b.day.localeCompare(a.day));
  if(entries.length===0){
    const div = document.createElement("div");
    div.className = "hint";
    div.textContent = "Aucune entrée. Ajoute ton poids (idéalement le matin).";
    list.append(div);
    return;
  }

  entries.forEach(e=>{
    const row = document.createElement("div");
    row.className = "row";
    row.innerHTML = `
      <div class="rowmain">
        <div class="rowtitle">${e.kg.toFixed(1)} kg</div>
        <div class="rowsub">${new Date(e.day).toLocaleDateString("fr-FR", { weekday:"long", year:"numeric", month:"short", day:"2-digit" })}</div>
      </div>
      <div class="rowbtns">
        <button class="mini" data-edit="${e.day}">Modifier</button>
        <button class="mini" data-del="${e.day}">Suppr</button>
      </div>
    `;
    list.append(row);
  });

  list.addEventListener("click", async (ev)=>{
    const b = ev.target.closest("button");
    if(!b) return;
    const editDay = b.dataset.edit;
    const delDay = b.dataset.del;

    if(editDay){
      const found = state.weightEntries.find(x=>x.day===editDay);
      const out = await showPrompt({
        title:"Modifier poids",
        sub:"Mets à jour la valeur (kg).",
        fields:[
          { id:"kg", label:"Poids (kg)", type:"number", inputmode:"decimal", value: (found?.kg ?? 0).toString(), step:"0.1", min:40, max:200 }
        ]
      });
      upsertWeight(editDay, parseFloat(out.kg||"0"));
      save(); renderAll();
    }
    if(delDay){
      if(confirm("Supprimer cette entrée ?")){
        deleteWeight(delDay);
        save(); renderAll();
      }
    }
  }, { once:true });
}

/* ---------- Render nutrition tab ---------- */
function renderNutrition(){
  const d = ensureDaily(today());
  const goal = state.settings.goalProtein;

  $("#proteinGoalLabel").textContent = goal;
  $("#proteinGoalRight").textContent = goal;
  $("#kpiProteinGoal").textContent = goal;

  const val = d.protein ?? 0;
  $("#proteinPill").textContent = `${val}/${goal} g`;
  const pct = clamp(Math.round((val/goal)*100), 0, 100);
  $("#proteinFill").style.width = `${pct}%`;

  $("#creatinePill").textContent = d.creatine ? "✔ pris" : "—";
  $("#kpiCreatine").textContent = d.creatine ? "✔ pris" : "—";

  $("#notes").value = d.notes || "";

  // meal chips (quick protein add)
  const chips = [
    { name:"Whey iso (1 scoop)", g:30 },
    { name:"Skyr 300g", g:30 },
    { name:"Poulet 200g", g:45 },
    { name:"Saumon 180g", g:40 },
    { name:"Oeufs x3", g:18 },
    { name:"Thon 1 boîte", g:30 },
  ];
  const wrap = $("#mealChips");
  wrap.innerHTML = "";
  chips.forEach(c=>{
    const btn = document.createElement("button");
    btn.className = "chip";
    btn.type = "button";
    btn.textContent = `+${c.g}g • ${c.name}`;
    btn.addEventListener("click", ()=>{
      const dd = ensureDaily(today());
      dd.protein = clamp((dd.protein||0) + c.g, 0, 999);
      save(); renderAll();
    });
    wrap.append(btn);
  });
}

/* ---------- Weekly status ---------- */
function startOfWeekISO(d=new Date()){
  // ISO-ish: Monday as start
  const date = new Date(d);
  const day = date.getDay(); // 0 Sun ... 6 Sat
  const diff = (day === 0 ? -6 : 1 - day);
  date.setDate(date.getDate() + diff);
  date.setHours(0,0,0,0);
  return date;
}
function finishedThisWeekTemplateKeys(){
  const sow = startOfWeekISO(new Date());
  const keys = new Set();
  state.training.sessions
    .filter(s => s.finishedAt)
    .forEach(s=>{
      const t = new Date(s.finishedAt);
      if(t >= sow) keys.add(s.templateKey);
    });
  return keys;
}
function streakText(){
  // streak based on weight entries consecutive days (simple)
  const days = new Set(state.weightEntries.map(e=>e.day));
  let streak = 0;
  const d = new Date();
  for(;;){
    const id = isoDay(d);
    if(!days.has(id)) break;
    streak++;
    d.setDate(d.getDate()-1);
  }
  return streak ? `${streak}j poids` : "—";
}

/* ---------- Render all ---------- */
function renderAll(){
  // training
  renderTraining();
  renderTrainingHistory();

  // other tabs
  renderDashboard();
  renderWeight();
  renderNutrition();

  // subtitle dynamic
  $("#subtitle").textContent = `Objectif ${state.settings.goalWeight.toFixed(0)} kg • Protéines ${state.settings.goalProtein} g`;
}

renderAll();

/* ---------- Service worker ---------- */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try { await navigator.serviceWorker.register("./sw.js"); } catch {}
  });
}
