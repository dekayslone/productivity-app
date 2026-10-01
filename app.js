const CATS=["Reading","Bible & Prayer","Academics","Courses","Public Speaking","Health","Other"];
const db=window.supabase?.createClient(window.FOCUS_SUPABASE_URL,window.FOCUS_SUPABASE_PUBLISHABLE_KEY);
const K="focus_v1";let S;
try{S=JSON.parse(localStorage.getItem(K))}catch(e){}
S=S||{goals:[],habits:[],reviews:[]};
S.profile=S.profile||{name:"Your Name",email:"you@example.com",role:"Productive builder",theme:"forest",timezone:"UTC",bio:"Build deliberate momentum every day.",notifications:true};
S.meta=S.meta||{lastDay:null};
S.history=S.history||{};
S.weeklyHistory=S.weeklyHistory||{};
let tab="today",gm=null,mem={},analyticsFocus=null,editingGoal=null,editingTask=null,schedulerDate=null,analyticsMonth=null,authUser=null,cloudHydrated=false,authMode="login";
const save=()=>{try{localStorage.setItem(K,JSON.stringify(S))}catch(e){}if(authUser&&cloudHydrated)syncCloud()};
if(!S.meta.lastDay || !S.history || !S.weeklyHistory){S.meta=S.meta||{lastDay:null};S.history=S.history||{};S.weeklyHistory=S.weeklyHistory||{};save();}
const buildDailySummary=(date=td())=>{const tasks=allTasks().filter(x=>x.t.done&&x.t.doneOn===date),habitEntries=S.habits.map(h=>({id:h.id,name:h.name,target:h.target||1,value: h.log[date]||0,done:(h.kind==="weekly"?(h.log[date]||0)>0:(h.log[date]||0)>=((h.target||1)))})).filter(h=>h.done||h.value>0),completedHabits=habitEntries.filter(h=>h.done).length,totalTasks=tasks.length,totalHabits=habitEntries.length,score=totalTasks+totalHabits?Math.round((completedHabits+totalTasks)/(totalTasks+totalHabits||1)*100):0;return {date,tasks:tasks.map(x=>({id:x.t.id,title:x.t.t,goal:x.g.title,project:x.p.title,doneOn:x.t.doneOn,category:x.t.cat||"General"})),habits:habitEntries,completedTasks:totalTasks,completedHabits,score,totalActivities:totalTasks+totalHabits};};
const buildWeeklySummary=(date=td())=>{const day=new Date(date+"T12:00");const start=new Date(day);const offset=(day.getDay()+6)%7;start.setDate(day.getDate()-offset);const end=new Date(start);end.setDate(start.getDate()+6);const weeks=[...Array(7)].map((_,i)=>{const d=new Date(start);d.setDate(start.getDate()+i);return ld(d)});const days=weeks.map(d=>buildDailySummary(d));const totalCompleted=days.reduce((sum,item)=>sum+item.completedTasks+item.completedHabits,0);return {weekStart:ld(start),weekEnd:ld(end),days,totalCompleted,score:days.length?Math.round(days.reduce((sum,item)=>sum+item.score,0)/days.length):0};};
const checkpointDay=(date=td())=>{if(!S.meta.lastDay){S.meta.lastDay=date;save();return}if(S.meta.lastDay===date)return;const previous=S.meta.lastDay;S.history[previous]=buildDailySummary(previous);S.weeklyHistory[previous]=buildWeeklySummary(previous);S.meta.lastDay=date;save();};
async function syncCloud(){if(!db||!authUser)return;try{const{error}=await db.from("focus_state").upsert({user_id:authUser.id,state:S,updated_at:new Date().toISOString()});if(error)toast("Cloud sync failed. Your local data is safe.")}catch(e){toast("Cloud sync unavailable. Your local data is safe.")}}
async function loadCloud(){if(!db||!authUser)return;try{const{data,error}=await db.from("focus_state").select("state").eq("user_id",authUser.id).maybeSingle();if(error){toast("Could not load cloud data. Using local data.");return}if(data?.state){S=data.state;try{localStorage.setItem(K,JSON.stringify(S))}catch(e){}}else{S={goals:[],habits:[],reviews:[],profile:{name:"Your Name",email:authUser.email||"",role:"Productive builder",theme:"forest",timezone:"UTC",bio:"",notifications:true},meta:{lastDay:null},history:{},weeklyHistory:{}};try{localStorage.setItem(K,JSON.stringify(S))}catch(e){}await syncCloud()}S.meta=S.meta||{lastDay:null};S.history=S.history||{};S.weeklyHistory=S.weeklyHistory||{};cloudHydrated=true;document.body.classList.remove("auth-mode");document.getElementById("auth").innerHTML="";render()}catch(e){toast("Could not load cloud data. Using local data.")}}
function showAuth(message=""){document.body.classList.add("auth-mode");const reset=authMode==="reset",update=authMode==="update",login=authMode==="login",root=document.getElementById("auth");root.innerHTML=`<div class="auth-shell"><div class="auth-layout"><form class="auth-card" data-f="auth"><div class="auth-brand"><span class="brand-mark"><i data-lucide="sparkles"></i></span><strong>Focus</strong></div><span class="eyebrow">${update?"SECURE RECOVERY":reset?"PASSWORD RESET":login?"WELCOME BACK":"CREATE YOUR ACCOUNT"}</span><h1>${update?"Choose a new password.":reset?"Reset your password.":login?"Return to your rhythm.":"Start your focus system."}</h1><p>${update?"Create a new password for your Focus account.":reset?"Enter your email and we’ll send you a secure reset link.":login?"Sign in to sync your goals, tasks, habits, and reviews.":"Create an account to keep your progress safe across devices."}</p>${message?`<div class="auth-message">${esc(message)}</div>`:""}${reset?`<label>Email<input type="email" name="email" value="you@example.com" required autocomplete="email"></label>`:""}${update?`<label>New password<input type="password" name="password" required minlength="6" autocomplete="new-password"></label><label>Confirm password<input type="password" name="passwordConfirm" required minlength="6" autocomplete="new-password"></label>`:reset?"":`<label>Email<input type="email" name="email" value="you@example.com" required autocomplete="email"></label><label>Password<input type="password" name="password" required minlength="6" autocomplete="${login?"current-password":"new-password"}"></label>`}<button type="submit">${update?"Save new password":reset?"Send reset link":login?"Sign in":"Create account"}</button>${update?"":reset?`<button type="button" class="ghost auth-switch" data-a="auth-back">Back to sign in</button>`:`${login?`<button type="button" class="auth-forgot" data-a="auth-reset">Forgot your password?</button>`:""}<button type="button" class="ghost auth-switch" data-a="auth-switch">${login?"Create a new account":"I already have an account"}</button>`}</form><aside class="auth-aside"><span class="auth-quote-mark">“</span><blockquote>Start with the task that matters most, and let focused action create momentum.</blockquote><div class="auth-quote-source"><span class="auth-avatar">F</span><span><strong>Focus system</strong><small>Built for deliberate progress</small></span></div></aside></div></div>`;if(window.lucide)lucide.createIcons()}
async function initAuth(){if(!db){toast("Supabase is unavailable. Using local data.");return}try{const{data}=await db.auth.getSession();if(data.session){authUser=data.session.user;if(window.location.hash.includes("type=recovery")){authMode="update";showAuth()}else await loadCloud()}else showAuth();db.auth.onAuthStateChange(async(event,session)=>{if(session){authUser=session.user;if(event==="PASSWORD_RECOVERY"){authMode="update";showAuth()}else if(authMode!=="update")await loadCloud()}else{authUser=null;cloudHydrated=false;document.body.classList.add("auth-mode");showAuth()}})}catch(e){toast("Could not connect to Supabase. Your local data is safe.")}}
const authErrorMessage=(error,mode)=>{const msg=String(error?.message||error||"").trim();if(!msg)return "Authentication is unavailable. Please try again.";const lower=msg.toLowerCase();if(lower.includes("rate limit")||lower.includes("too many requests")||lower.includes("email rate limit exceeded")){return mode==="reset"?"Too many reset emails were sent. Please wait a few minutes before requesting another one.":"Too many attempts were made. Please wait a few minutes and try again."}if(lower.includes("invalid login credentials")||lower.includes("user not found")){return "Incorrect email or password."}if(lower.includes("passwords do not match")){return "The passwords do not match."}if(lower.includes("already registered")||lower.includes("already exists")){return "An account already exists for this email."}return msg;};
const uid=()=>crypto.randomUUID?crypto.randomUUID():Math.random().toString(36).slice(2,9);
const ld=d=>d.toLocaleDateString("en-CA");
const td=()=>ld(new Date());
schedulerDate=td();
const addDays=(s,n)=>{const d=new Date(s+"T12:00");d.setDate(d.getDate()+n);return ld(d)};
const esc=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const mon=()=>td().slice(0,7);
analyticsMonth=mon();
const mname=m=>new Date(m+"-15T12:00").toLocaleDateString(undefined,{month:"long",year:"numeric"});
gm=mon();
function toast(t){const e=document.getElementById("toast");e.textContent=t;e.style.display="block";clearTimeout(toast.t);toast.t=setTimeout(()=>e.style.display="none",3200)}
const tasksOf=g=>g.projects.flatMap(p=>p.tasks);
const prog=g=>{const t=tasksOf(g);return t.length?Math.round(100*t.filter(x=>x.done).length/t.length):0};
const allTasks=()=>S.goals.flatMap(g=>g.projects.flatMap(p=>p.tasks.map(t=>({t,g,p}))));
const ok=(h,d)=>(h.log[d]||0)>=(h.kind==="weekly"?1:(h.target||1));
function streak(h){let d=td();if(!ok(h,d))d=addDays(d,-1);let n=0;while(ok(h,d)){n++;d=addDays(d,-1)}return n}
const wkStart=()=>addDays(td(),-((new Date().getDay()+6)%7));
const sumR=(h,a,b)=>{let n=0,d=a;while(d<=b){n+=h.log[d]||0;d=addDays(d,1)}return n};
const weekCount=h=>sumR(h,wkStart(),addDays(wkStart(),6));
const monthSum=h=>sumR(h,mon()+"-01",td());
const bar=p=>`<div class="bar"><i style="width:${p}%"></i></div>`;
const catSel=`<select name="cat">${CATS.map(c=>`<option>${c}</option>`).join("")}</select>`;

function habitRate(from,to){ // inclusive date strings
  if(!S.habits.length)return null;let n=0,c=0,d=from;
  while(d<=to){S.habits.filter(h=>h.kind!=="weekly").forEach(h=>{n++;if(ok(h,d))c++});d=addDays(d,1)}
  return n?Math.round(100*c/n):null}
function stats(from,to){
  const done=allTasks().filter(x=>x.t.done&&x.t.doneOn>=from&&x.t.doneOn<=to).length;
  return{done,habit:habitRate(from,to)}}
function habitAnalytics(habits=S.habits,month=mon()){
  const days=new Date(+month.slice(0,4),+month.slice(5),0).getDate(),limit=month===mon()?+td().slice(8):days,byDate={};let total=0,done=0;
  for(let day=1;day<=limit;day++){
    const date=month+"-"+String(day).padStart(2,"0");byDate[date]=0;
    habits.forEach(h=>{
      if(h.kind==="weekly"){total+=(h.target||1)/7;byDate[date]+=h.log[date]||0;done+=h.log[date]||0}
      else{total++;if(ok(h,date)){done++;byDate[date]++}}
    });
  }
  return{total:Math.round(total),done:Math.round(done),byDate};
}
function analyticsTotals(goals=S.goals.filter(g=>g.month===mon()),habits=S.habits,month=mon()){
  const tasks=goals.flatMap(tasksOf),habitsData=habitAnalytics(habits,month);return{tasks,habitsData,total:tasks.length+habitsData.total,done:tasks.filter(t=>t.done).length+habitsData.done};
}
function momentum(){
  return [...Array(7)].map((_,i)=>{
    const d=addDays(td(),i-6);
    const tasks=allTasks().filter(x=>x.t.doneOn===d).length;
    const habits=S.habits.filter(h=>h.kind!=="weekly"&&ok(h,d)).length;
    return {label:new Date(d+"T12:00").toLocaleDateString(undefined,{weekday:"short"}).slice(0,2),value:tasks+habits};
  });
}
function momentumChart(){
  const data=momentum(),max=Math.max(1,...data.map(x=>x.value));
  return `<div class="chart-panel"><div class="section-head"><div><span class="eyebrow">ACTIVITY</span><h3>Momentum this week</h3></div><span class="chart-live"><i></i> Live</span></div><div class="chart"><div class="chart-grid"><span></span><span></span><span></span></div><div class="trend-bars">${data.map(x=>`<div class="trend-col"><div class="trend-value">${x.value||0}</div><div class="trend-bar" style="height:${Math.max(8,Math.round(x.value/max*100))}%"></div><span>${x.label}</span></div>`).join("")}</div></div></div>`;
}
function revealOnScroll(){
  const elements=document.querySelectorAll("#app .card, #app .chart-panel, #app h2, #app form.add");
  if(!("IntersectionObserver" in window)){elements.forEach(x=>x.classList.add("is-visible"));return}
  const revealVisible=()=>elements.forEach(element=>{
    const box=element.getBoundingClientRect();
    if(box.top<window.innerHeight*.9&&box.bottom>0)element.classList.add("is-visible");
  });
  const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{
    if(!entry.isIntersecting)return;
    entry.target.classList.add("is-visible");
    observer.unobserve(entry.target);
  }),{threshold:.12,rootMargin:"0px 0px -44px"});
  elements.forEach((element,index)=>{
    element.style.setProperty("--reveal-delay",`${Math.min(index*35,210)}ms`);
    element.classList.add("scroll-reveal");
    observer.observe(element);
  });
  window.addEventListener("scroll",revealVisible,{passive:true});
  revealVisible();
}

function today(){
  const t=td(),all=allTasks().filter(x=>!x.t.done);
  const doneToday=allTasks().filter(x=>x.t.doneOn===t).length;
  const hd=S.habits.filter(h=>h.kind!=="weekly"&&ok(h,t)).length;
  let h=`<h1>${new Date().toLocaleDateString(undefined,{weekday:"long",month:"long",day:"numeric"})}</h1><div class="sub">Set → Plan → Execute → Track → Review → Improve</div>
  <div class="stats"><div class="card kpi"><div class="kpi-icon"><i data-lucide="list-checks"></i></div><div class="big">${all.length}</div><div class="mut">open tasks</div></div>
  <div class="card kpi"><div class="kpi-icon"><i data-lucide="check-circle-2"></i></div><div class="big">${doneToday}</div><div class="mut">done today</div></div>
  <div class="card kpi"><div class="kpi-icon"><i data-lucide="repeat-2"></i></div><div class="big">${hd}/${S.habits.filter(h=>h.kind!=="weekly").length}</div><div class="mut">habits</div></div></div>
  ${momentumChart()}
  ${core(t)}<h2>Tasks</h2>`;
  h+=all.length?all.sort((a,b)=>(a.t.due||"9999").localeCompare(b.t.due||"9999")).map(x=>taskRow(x)).join(""):`<div class="card mut">No open tasks. ${S.goals.length?"Add a task from the Tasks page.":"Start by adding a goal in the Goals tab."}</div>`;
  const cur=S.goals.filter(g=>g.month===mon()).sort((a,b)=>(a.pri||99)-(b.pri||99));
  if(cur.length)h+=`<h2>This month</h2>`+cur.map(g=>`<div class="card"><div class="row"><div class="g">${g.pri?`P${g.pri} · `:""}${esc(g.title)}</div><b>${prog(g)}%</b></div>${bar(prog(g))}</div>`).join("");
  return h}
function taskRow(x,hideGroup=false){const t=x.t,late=t.due&&t.due<td()&&!t.done;
  if(editingTask===t.id)return `<form class="card task-editor" data-f="edittask" data-id="${t.id}"><div class="task-editor-grid"><input type="text" name="t" value="${esc(t.t)}" required><input type="date" name="due" value="${t.due||""}" required><input type="text" name="cat" value="${esc(t.cat||"")}" placeholder="Category (optional)"><input type="text" name="group" value="${esc(t.group||"")}" placeholder="Group (optional)"><label class="task-editor-check"><input type="checkbox" name="ms" ${t.ms?"checked":""}> Milestone</label></div><label class="subtask-editor-label">Subtasks<textarea name="subtasks" rows="3" placeholder="One subtask per line">${(t.subtasks||[]).map(s=>esc(s.t)).join("\n")}</textarea></label><div class="task-editor-actions"><button type="submit"><i data-lucide="check"></i> Save</button><button type="button" class="ghost" data-a="canceltask">Cancel</button></div></form>`;
  const subtasks=t.subtasks||[],subtaskMarkup=subtasks.length?`<div class="task-subtasks">${subtasks.map(s=>`<div class="subtask-row"><input type="checkbox" data-a="subtask" data-id="${t.id}" data-subid="${s.id}" ${s.done?"checked":""}><span class="${s.done?"done":""}">${esc(s.t)}</span><button class="ghost" data-a="delsubtask" data-id="${t.id}" data-subid="${s.id}" aria-label="Delete subtask"><i data-lucide="x"></i></button></div>`).join("")}</div>`:"";
  return `<div class="card task-row"><div class="row"><input type="checkbox" data-a="task" data-id="${t.id}" ${t.done?"checked":""}><div class="g"><span class="${t.done?"done":""}">${t.ms?'<i data-lucide="diamond" class="inline-icon"></i> ':""}${esc(t.t)}</span><div class="mut">${t.cat?`<span class="task-category">${esc(t.cat)}</span> · `:""}${!hideGroup&&t.group?`<span class="task-group-label">${esc(t.group)}</span> · `:""}${esc(x.g.title)} › ${esc(x.p.title)}${t.due?` · <span class="${late?"warn":""}">${late?"overdue ":""}${t.due}</span>`:` · <span class="warn">No deadline</span>`}</div></div><button class="ghost" data-a="edittask" data-id="${t.id}" aria-label="Edit task"><i data-lucide="pencil"></i></button><button class="ghost task-delete" data-a="deltask" data-id="${t.id}" aria-label="Delete task"><i data-lucide="trash-2"></i></button></div>${subtaskMarkup}</div>`}
function projectTasksView(g,p){
  const grouped=new Map(),singles=[];p.tasks.forEach(t=>{if(t.group){if(!grouped.has(t.group))grouped.set(t.group,[]);grouped.get(t.group).push(t)}else singles.push(t)});
  const groupRows=[...grouped].map(([name,tasks])=>`<div class="task-group"><div class="task-group-head"><i data-lucide="layers-2"></i><strong>${esc(name)}</strong><span>${tasks.filter(t=>t.done).length}/${tasks.length}</span></div>${tasks.map(t=>taskRow({t,g,p},true).replace('class="card task-row"','class="task-row task-line"')).join("")}</div>`).join("");
    return groupRows+singles.map(t=>taskRow({t,g,p}).replace('class="card task-row"','class="task-row task-line"')).join("");
}

function goals(){
  const list=S.goals.filter(g=>g.month===gm).sort((a,b)=>(a.pri||99)-(b.pri||99));
  let h=`<h1>Goals</h1><div class="row sub"><input type="month" id="gm" value="${gm}"><span>Keep the month focused. Open a project when you need the details.</span></div>
  <form class="add" data-f="goal"><input type="text" name="t" placeholder="New goal for ${mname(gm)}" required>${catSel}<button>Add goal</button></form>`;
  h+=list.map(g=>{const total=g.projects.reduce((n,p)=>n+p.tasks.length,0),editing=editingGoal===g.id;return `<div class="card goal-card">${editing?`<form class="goal-editor" data-f="editgoal" data-id="${g.id}"><div class="editor-heading"><span class="eyebrow">EDIT GOAL</span><button type="button" class="ghost" data-a="cancelgoal" aria-label="Cancel editing"><i data-lucide="x"></i></button></div><div class="editor-grid"><label>Goal name<input type="text" name="title" value="${esc(g.title)}" required></label><label>Category<select name="cat">${CATS.map(c=>`<option ${c===g.cat?"selected":""}>${c}</option>`).join("")}</select></label><label>Priority<input type="number" name="pri" min="1" max="99" value="${g.pri||""}></label></div><div class="editor-actions"><button type="submit"><i data-lucide="check"></i> Save changes</button><button type="button" class="ghost" data-a="cancelgoal">Cancel</button></div></form>`:`<div class="goal-head"><div class="g"><div class="goal-title"><span class="priority">${g.pri?`P${g.pri}`:""}</span><b>${esc(g.title)}</b></div><div class="goal-meta"><span class="tag">${esc(g.cat)}</span><span>${g.projects.length} projects · ${total} tasks</span></div></div><strong class="goal-percent">${prog(g)}%</strong><button class="ghost" data-a="editgoal" data-id="${g.id}" aria-label="Edit goal"><i data-lucide="pencil"></i></button><button class="ghost" data-a="delgoal" data-id="${g.id}" aria-label="Delete goal"><i data-lucide="trash-2"></i></button></div>`}${bar(prog(g))}
  <div class="project-list">${g.projects.map(p=>{const done=p.tasks.filter(t=>t.done).length;return `<details class="project-block"><summary><span class="project-name"><i data-lucide="folder-kanban" class="inline-icon"></i>${esc(p.title)}</span><span class="project-count">${done}/${p.tasks.length}</span><button class="ghost" data-a="delproj" data-id="${p.id}" aria-label="Delete project"><i data-lucide="x"></i></button></summary>
  <div class="project-content">${projectTasksView(g,p)||`<div class="mut empty-project">No tasks yet.</div>`}
  <form class="add" data-f="task" data-id="${p.id}"><input type="text" name="t" placeholder="Add a task" required><input type="date" name="due" required><input type="text" name="cat" placeholder="Category (optional)"><label class="mut"><input type="checkbox" name="ms"> <i data-lucide="diamond" class="inline-icon"></i></label><button aria-label="Add task"><i data-lucide="plus"></i></button></form><form class="task-group-form" data-f="taskgroup" data-id="${p.id}"><div class="group-form-title"><i data-lucide="layers-2"></i><strong>Add a task group</strong><span>One task per line</span></div><input type="text" name="group" placeholder="e.g. Design 6 flyers" required><input type="text" name="cat" placeholder="Category for this group (optional)"><textarea name="items" rows="4" placeholder="Flyer 1\nFlyer 2\nFlyer 3" required></textarea><div class="group-form-row"><input type="date" name="due" required><button type="submit"><i data-lucide="list-plus"></i> Add group</button></div></form></div></details>`}).join("")||`<div class="mut empty-project">Add a project to start breaking this goal down.</div>`}</div>
  <form class="add project-add" data-f="proj" data-id="${g.id}"><input type="text" name="t" placeholder="Add a project" required><button class="ghost"><i data-lucide="plus"></i> Project</button></form></div>`}).join("")||`<div class="card mut">No goals for this month yet.</div>`;
  return h}

function tasks(){
  const today=td(),items=allTasks().slice().sort((a,b)=>(a.t.done-b.t.done)||(a.t.due||"9999").localeCompare(b.t.due||"9999")),open=items.filter(x=>!x.t.done),done=items.filter(x=>x.t.done),due=open.filter(x=>x.t.due===today).length,overdue=open.filter(x=>x.t.due&&x.t.due<today).length;
  const defaultProject=S.goals.find(g=>g.month===mon())?.projects[0];
  const section=(label,list,empty)=>`<section class="task-section"><div class="section-heading"><div><span class="eyebrow">${label.toUpperCase()}</span><h2>${label}</h2></div><span class="section-count">${list.length}</span></div>${list.map(x=>taskRow(x)).join("")||`<div class="empty-analytics">${empty}</div>`}</section>`;
  return `<div class="tasks-page"><div class="analytics-kicker">DAILY OPERATIONS</div><div class="analytics-title-row"><div><h1>Tasks</h1><div class="analytics-subtitle">Turn your monthly goals into clear next actions.</div></div><div class="task-header-actions"><span class="analytics-live"><i></i> ${due} due today</span><button class="danger-button" data-a="delalltasks"><i data-lucide="trash-2"></i> Delete all</button></div></div>
    <div class="task-summary"><div><strong data-count="${open.length}">0</strong><span>open tasks</span></div><div><strong data-count="${due}">0</strong><span>due today</span></div><div><strong data-count="${overdue}">0</strong><span>overdue</span></div><div><strong data-count="${done.length}">0</strong><span>completed</span></div></div>
  <form class="task-compose" data-f="taskPage"><div class="compose-title"><i data-lucide="plus-circle"></i><strong>Add a task</strong><span>It will be added to your active workspace.</span></div><div class="compose-grid"><input type="hidden" name="pid" value="${defaultProject?.id||""}"><input type="text" name="t" placeholder="What needs to get done?" required><input type="date" name="due" value="${today}" required><input type="text" name="cat" placeholder="Category (optional)"><input type="text" name="group" placeholder="Group (optional)"><button type="submit" ${defaultProject?"":"disabled"}><i data-lucide="plus"></i> Add task</button></div></form>
  ${section("Overdue",open.filter(x=>x.t.due&&x.t.due<today),"Nothing overdue. Keep the pace.")}${section("Today",open.filter(x=>x.t.due===today),"No tasks due today.")}${section("Upcoming",open.filter(x=>!x.t.due||x.t.due>today),"Your upcoming list is clear.")}${section("Completed",done.slice().sort((a,b)=>(b.t.doneOn||"").localeCompare(a.t.doneOn||"")),"Complete a task and it will appear here.")}</div>`;
}

function scheduler(){
  const date=schedulerDate||td(),scheduled=allTasks().filter(x=>x.t.due===date),done=scheduled.filter(x=>x.t.done).length,open=scheduled.filter(x=>!x.t.done),groups=new Map();open.forEach(x=>{const key=x.t.group||"Ungrouped";if(!groups.has(key))groups.set(key,[]);groups.get(key).push(x)});
  const rows=[...groups].map(([name,list])=>`<section class="schedule-group"><div class="schedule-group-head"><i data-lucide="layers-2"></i><strong>${esc(name)}</strong><span>${list.length} ${list.length===1?"task":"tasks"}</span></div>${list.map(x=>taskRow(x)).join("")}</section>`).join("");
  return `<div class="scheduler-page"><div class="analytics-kicker">DAILY SCHEDULER</div><div class="analytics-title-row"><div><h1>${new Date(date+"T12:00").toLocaleDateString(undefined,{weekday:"long",month:"long",day:"numeric"})}</h1><div class="analytics-subtitle">A focused plan for the day, connected to your goals.</div></div><label class="schedule-date"><span>Schedule date</span><input type="date" id="scheduleDate" value="${date}"></label></div><section class="schedule-summary"><div class="schedule-progress"><div class="schedule-progress-label"><strong>${done}/${scheduled.length}</strong><span>complete</span></div><div class="schedule-progress-bar"><i style="width:${scheduled.length?Math.round(done/scheduled.length*100):0}%"></i></div></div><div><strong>${open.length}</strong><span>open tasks</span></div><div><strong>${scheduled.filter(x=>x.t.group).length}</strong><span>grouped tasks</span></div></section><div class="schedule-actions"><button class="ghost" data-a="scheduler-prev"><i data-lucide="chevron-left"></i> Previous</button><button class="ghost" data-a="scheduler-today">Today</button><button class="ghost" data-a="scheduler-next">Next <i data-lucide="chevron-right"></i></button></div>${rows||`<div class="empty-analytics">No tasks scheduled for this day. Add a deadline from the Tasks page.</div>`}</div>`;
}

function habits(){
  let h=`<h1>Habits</h1><div class="sub">Daily practices that build streaks.</div>
  <form class="add" data-f="habit"><input type="text" name="t" placeholder="e.g. Read 20 pages, Prayer" required><input type="number" name="tg" min="1" placeholder="Daily target" style="width:110px">${catSel}<button>Add</button></form>`;
  const t=td(),days=[...Array(14)].map((_,i)=>addDays(t,i-13));
  h+=S.habits.map(x=>`<div class="card"><div class="row"><div class="g"><b>${esc(x.name)}</b> <span class="tag">${esc(x.cat)}</span></div>${x.kind==="weekly"?`<span class="tag">${weekCount(x)}/${x.target} this week</span>`:`<span class="tag"><i data-lucide="flame" class="tag-icon"></i> ${streak(x)}</span>`}<button class="ghost" data-a="delhab" data-id="${x.id}"><i data-lucide="x"></i></button></div>
  <div class="row" style="gap:3px;margin-top:8px">${days.map(d=>`<span title="${d}" style="flex:1;height:18px;border-radius:4px;background:${ok(x,d)?"var(--ac)":"var(--ac2)"}"></span>`).join("")}</div><div class="mut">Last 14 days</div></div>`).join("");
  return h}

function review(){
  const t=td(),wk=[addDays(t,-6),t],mf=mon()+"-01";
  const ws=stats(...wk),ms=stats(mf,t),cur=S.goals.filter(g=>g.month===mon());
  const avg=cur.length?Math.round(cur.reduce((a,g)=>a+prog(g),0)/cur.length):0;
  const sum=(label,s)=>`${s.done} tasks completed${s.habit!=null?`, habits ${s.habit}% consistent`:""}`;
  const form=(type,s)=>`<div class="card"><b>${type==="week"?"Weekly review":"Monthly review"}</b><div class="mut" style="margin:4px 0 8px">Auto summary: ${sum(type,s)}${type==="month"?`, goals ${avg}% complete`:""}.</div>
  <form data-f="review" data-type="${type}"><textarea name="w" placeholder="Wins" required></textarea><textarea name="c" placeholder="What got in the way?"></textarea><textarea name="n" placeholder="Focus for next ${type}"></textarea><button>Save review</button></form></div>`;
  let h=`<h1>Reviews</h1><div class="sub">A few minutes of reflection keeps you honest.</div>`+form("week",ws)+form("month",ms);
  h+=`<h2>Past reviews</h2>`+(S.reviews.slice().reverse().map(r=>`<div class="card"><div class="mut">${r.type==="week"?"Week":"Month"} · ${r.date}</div><div class="mut">${esc(r.auto)}</div><p><b>Wins:</b> ${esc(r.w)}</p>${r.c?`<p><b>Obstacles:</b> ${esc(r.c)}</p>`:""}${r.n?`<p><b>Next:</b> ${esc(r.n)}</p>`:""}</div>`).join("")||`<div class="card mut">No reviews saved yet.</div>`);
  return h}

function profilePage(){
  const p=S.profile||{name:"Your Name",email:"you@example.com",role:"Productive builder",theme:"forest",timezone:"UTC",bio:"Build deliberate momentum every day.",notifications:true};
  const email=p.emailPreferences||{dailyReminder:p.notifications!==false,dailyTime:"08:00",weeklyMetrics:false,weeklyDay:1,monthlyWins:false,monthlyDay:1};
  const timezone=({"GMT+1":"Africa/Lagos","GMT+2":"Europe/Paris","GMT+5:30":"Asia/Kolkata"})[p.timezone]||p.timezone||"UTC";
  const initials=(p.name||"YN").split(/\s+/).filter(Boolean).slice(0,2).map(word=>word[0]).join("").toUpperCase()||"YN";
  const themes=[{id:"forest",label:"Forest",color:"#267b65"},{id:"ocean",label:"Ocean",color:"#3578a8"},{id:"berry",label:"Berry",color:"#a84b70"},{id:"sunset",label:"Sunset",color:"#c36535"},{id:"slate",label:"Slate",color:"#60747d"}];
  const timezones=[['UTC','UTC'],['Africa/Lagos','Lagos (UTC+1)'],['Europe/Paris','Paris (UTC+1/+2)'],['Europe/London','London (UTC/+1)'],['America/New_York','New York'],['America/Chicago','Chicago'],['America/Los_Angeles','Los Angeles'],['Asia/Kolkata','India (UTC+5:30)'],['Asia/Tokyo','Tokyo'],['Australia/Sydney','Sydney']];
  return `<div class="profile-page"><div class="profile-header card"><div class="profile-avatar">${esc(initials)}</div><div class="profile-heading"><span class="eyebrow">PROFILE</span><h1>${esc(p.name)}</h1><div class="mut">${esc(p.role)}</div></div></div>
  <div class="settings-grid"><div class="card"><div class="section-heading"><div><span class="eyebrow">PERSONAL</span><h2>Profile</h2></div></div><form class="settings-form" data-f="profile">
  <div class="two-col"><label>Full name<input type="text" name="name" value="${esc(p.name)}" required></label><label>Contact email<input type="email" name="email" value="${esc(p.email)}" required></label></div>
  <div class="two-col"><label>Role<input type="text" name="role" value="${esc(p.role)}" placeholder="Productive builder"></label><label>Timezone<select name="timezone">${timezones.map(([value,label])=>`<option value="${value}" ${timezone===value?"selected":""}>${label}</option>`).join("")}</select></label></div>
  <label>Bio<textarea name="bio" rows="3" placeholder="Tell us about your focus style">${esc(p.bio||"")}</textarea></label>
  <section class="email-preferences"><div class="section-heading"><div><span class="eyebrow">EMAIL UPDATES</span><h2>Scheduled emails</h2></div></div><p class="email-recipient">Sent to your sign-in address: <strong>${esc(authUser?.email||"Sign in to enable email delivery")}</strong></p>
  <div class="email-setting"><label class="toggle-row"><input type="checkbox" name="dailyReminder" ${email.dailyReminder?"checked":""}> Daily task reminder</label><label class="email-select">Send at<input type="time" name="dailyTime" value="${esc(email.dailyTime||"08:00")}"></label><p>Includes tasks due today or overdue and habits still to complete.</p></div>
  <div class="email-setting"><label class="toggle-row"><input type="checkbox" name="weeklyMetrics" ${email.weeklyMetrics?"checked":""}> Weekly progress metrics</label><label class="email-select">Send each<select name="weeklyDay">${[[1,"Monday"],[2,"Tuesday"],[3,"Wednesday"],[4,"Thursday"],[5,"Friday"],[6,"Saturday"],[7,"Sunday"]].map(([value,label])=>`<option value="${value}" ${Number(email.weeklyDay||1)===value?"selected":""}>${label}</option>`).join("")}</select></label><p>Reports task completions and habit consistency for the previous full week.</p></div>
  <div class="email-setting"><label class="toggle-row"><input type="checkbox" name="monthlyWins" ${email.monthlyWins?"checked":""}> Monthly wins recap</label><label class="email-select">Send on day<select name="monthlyDay">${[1,5,10,15,20,25].map(day=>`<option value="${day}" ${Number(email.monthlyDay||1)===day?"selected":""}>${day===1?"1st":`${day}th`} of the month</option>`).join("")}</select></label><p>Celebrates last month’s completed tasks, finished goals, habits, and review wins.</p></div>
  <button type="submit">Save profile and email schedule</button></section></form></div>
  <div class="card"><div class="section-heading"><div><span class="eyebrow">SETTINGS</span><h2>Workspace</h2></div></div><div class="mini-stat-list"><div class="mini-stat"><span>Last sign-in</span><strong>${authUser?authUser.email||"Signed in":"Local only"}</strong></div><div class="mini-stat"><span>Data mode</span><strong>${authUser&&cloudHydrated?"Synced":"Local safe"}</strong></div></div><form class="settings-form" data-f="profile-theme"><fieldset class="theme-picker"><legend>Theme color</legend><div class="theme-options">${themes.map(theme=>`<label class="theme-choice"><input type="radio" name="theme" value="${theme.id}" ${p.theme===theme.id?"checked":""}><span class="theme-swatch" style="--swatch:${theme.color}"></span><span>${theme.label}</span></label>`).join("")}</div><button type="submit" class="ghost">Apply theme</button></fieldset></form></div></div></div>`;
}

function history(){
  const month=analyticsMonth||mon(),goals=S.goals.filter(g=>g.month===month),totals=analyticsTotals(goals,S.habits,month),tasks=totals.tasks,total=totals.total,done=totals.done;
  if(analyticsFocus){const goal=goals.find(g=>g.id===analyticsFocus);if(goal)return analyticsCategory(goal)}
  const score=monthlyScore(month,goals,totals.habitsData),overall=score.score,data=monthData(goals,S.habits,month),monthly=monthlyAnalytics(tasks,totals.habitsData,month,total),areas=goals.map((g,i)=>areaCard(g,i,month));
  const months=[...new Set([...S.goals.map(g=>g.month),mon()])].sort().reverse();
  return `<div class="analytics-page"><div class="analytics-kicker">MONTHLY TOTAL</div><div class="analytics-title-row"><div><h1>${mname(month)}</h1><div class="analytics-subtitle">Your progress across the areas that matter.</div></div><div class="analytics-controls"><label>Review month<select id="analyticsMonth">${months.map(m=>`<option value="${m}" ${m===month?"selected":""}>${mname(m)}</option>`).join("")}</select></label><span class="analytics-live"><i></i> Live data</span></div></div>
  <section class="overview-panel"><div class="overview-ring"><svg viewBox="0 0 120 120" aria-label="${overall}% monthly score"><circle class="ring-track" pathLength="100" cx="60" cy="60" r="50"></circle><circle class="ring-progress" pathLength="100" cx="60" cy="60" r="50" style="--progress:${overall}"></circle></svg><div class="ring-label"><strong data-count="${overall}" data-suffix="%">0%</strong><span>monthly score</span></div></div><div class="overview-copy"><span class="eyebrow">MONTHLY REVIEW</span><h2>Keep the momentum visible.</h2><p>${done} of ${total} activities completed across ${goals.length} focus areas. Score blends tasks, goals, and streak.</p><div class="overview-metrics"><div><strong data-count="${score.taskRate}" data-suffix="%">0%</strong><span>task rate</span></div><div><strong data-count="${score.goalRate}" data-suffix="%">0%</strong><span>goal progress</span></div><div><strong data-count="${score.longest}">0</strong><span>best streak</span></div><div><strong data-count="${monthly.activeDays}">0</strong><span>active days</span></div></div></div></section>
  ${analyticsChart(data,"Monthly completion")}
  <section class="analytics-section"><div class="section-heading"><div><span class="eyebrow">AREAS OF FOCUS</span><h2>Where your energy is going</h2></div><span class="section-count">${goals.length} areas</span></div><div class="areas-grid">${areas.join("")||`<div class="empty-analytics">Add a goal to start tracking your month.</div>`}</div></section>
  <section class="weekly-panel"><div class="section-heading"><div><span class="eyebrow">MONTHLY REVIEW</span><h2>Monthly activity rhythm</h2></div><span class="analytics-live"><i></i> ${mname(month)}</span></div><div class="weekly-grid"><div class="weekly-metrics"><div><strong data-count="${monthly.done}">0</strong><span>activities completed</span></div><div><strong data-count="${monthly.rate}" data-suffix="%">0%</strong><span>monthly completion</span></div><div><strong data-count="${monthly.activeDays}">0</strong><span>active days</span></div><div><strong data-count="${monthly.longest}">0</strong><span>best streak</span></div></div>${monthlyBars(monthly.bars)}</div></section></div>`;
}

function monthData(goals,habits=S.habits,month=mon()){
  const days=new Date(+month.slice(0,4),+month.slice(5),0).getDate(),tasks=goals.flatMap(tasksOf),habitsData=habitAnalytics(habits,month),total=tasks.length+habitsData.total;
  return [...Array(days)].map((_,i)=>{const date=month+"-"+String(i+1).padStart(2,"0"),taskDone=tasks.filter(t=>t.done&&t.doneOn&&t.doneOn<=date).length,habitDone=Object.entries(habitsData.byDate).filter(([d])=>d<=date).reduce((n,[,v])=>n+v,0),daily=tasks.filter(t=>t.done&&t.doneOn===date).length+(habitsData.byDate[date]||0),done=taskDone+habitDone;return{date,day:i+1,daily,done,value:total?Math.round(done/total*100):0}});
}
function taskStreak(){
  const dates=new Set(allTasks().filter(x=>x.t.done&&x.t.doneOn).map(x=>x.t.doneOn));let d=td();if(!dates.has(d))d=addDays(d,-1);let n=0;while(dates.has(d)){n++;d=addDays(d,-1)}return n;
}
function monthlyScore(month,goals,habitsData){
  const tasks=goals.flatMap(tasksOf),taskRate=tasks.length?Math.round(tasks.filter(t=>t.done).length/tasks.length*100):0,goalRate=goals.length?Math.round(goals.reduce((sum,g)=>sum+prog(g),0)/goals.length):0,days=new Date(+month.slice(0,4),+month.slice(5),0).getDate(),limit=month===mon()?+td().slice(8):days,active=new Set(tasks.filter(t=>t.done&&t.doneOn).map(t=>t.doneOn));
  Object.entries(habitsData.byDate).forEach(([date,count])=>{if(count)active.add(date)});
  let longest=0,current=0;for(let day=1;day<=limit;day++){const date=month+"-"+String(day).padStart(2,"0");if(active.has(date)){current++;longest=Math.max(longest,current)}else current=0}
  const streakRate=Math.min(100,Math.round(longest/7*100)),score=Math.round(taskRate*.5+goalRate*.35+streakRate*.15);return{score,taskRate,goalRate,longest};
}
function monthlyAnalytics(tasks,habitsData,month,total){
  const days=new Date(+month.slice(0,4),+month.slice(5),0).getDate(),limit=month===mon()?+td().slice(8):days,daily=[...Array(limit)].map((_,i)=>{const date=month+"-"+String(i+1).padStart(2,"0");return tasks.filter(t=>t.done&&t.doneOn===date).length+(habitsData.byDate[date]||0)}),activeDays=daily.filter(n=>n>0).length,done=daily.reduce((n,v)=>n+v,0);let longest=0,current=0;daily.forEach(value=>{if(value){current++;longest=Math.max(longest,current)}else current=0});return{done,rate:total?Math.round(done/total*100):0,activeDays,longest,bars:[...Array(Math.ceil(limit/7))].map((_,i)=>({label:`W${i+1}`,done:daily.slice(i*7,i*7+7).reduce((n,v)=>n+v,0)}))};
}
function monthlyBars(bars){const max=Math.max(1,...bars.map(x=>x.done));return`<div class="weekly-chart">${bars.map(x=>`<div class="weekly-bar-col"><span>${x.done}</span><i style="height:${Math.max(8,Math.round(x.done/max*100))}%"></i><small>${x.label}</small></div>`).join("")}</div>`}
function weeklyAnalytics(tasks,habits=S.habits){const start=wkStart(),today=td(),days=[...Array(7)].map((_,i)=>addDays(start,i)),doneFor=d=>tasks.filter(t=>t.done&&t.doneOn===d).length+habits.reduce((n,h)=>n+(h.log[d]||0),0);
  const done=days.reduce((n,d)=>n+doneFor(d),0),weekTasks=tasks.filter(t=>(t.due>=start&&t.due<=today)||(t.doneOn>=start&&t.doneOn<=today)),habitTotal=habits.reduce((n,h)=>n+(h.kind==="weekly"?(h.target||1):1),0),rate=(weekTasks.length+habitTotal)?Math.round(done/(weekTasks.length+habitTotal)*100):0;
  const previousStart=addDays(start,-7),previousEnd=addDays(start,-1),previous=tasks.filter(t=>t.done&&t.doneOn>=previousStart&&t.doneOn<=previousEnd).length;
  return{done,rate,streak:days.filter(d=>doneFor(d)>0).length,change:previous?Math.round((done-previous)/previous*100):(done?100:0),days:days.map(d=>({date:d,done:doneFor(d),label:new Date(d+"T12:00").toLocaleDateString(undefined,{weekday:"short"}).slice(0,2)}))};
}
function smoothPath(points){return points.map((p,i)=>{if(!i)return`M ${p.x} ${p.y}`;const prev=points[i-1],mid=(prev.x+p.x)/2;return`C ${mid} ${prev.y}, ${mid} ${p.y}, ${p.x} ${p.y}`}).join(" ")}
function analyticsChart(data,title){
  const width=820,height=270,left=42,right=18,top=20,bottom=38,xStep=(width-left-right)/Math.max(1,data.length-1),points=data.map((p,i)=>({x:left+i*xStep,y:top+(100-p.value)*(height-top-bottom)/100})),line=smoothPath(points),area=`${line} L ${points.at(-1).x} ${height-bottom} L ${points[0].x} ${height-bottom} Z`,labels=data.filter((_,i)=>i===0||i===data.length-1||i===Math.floor(data.length/2));
  return `<section class="analytics-chart"><div class="section-heading"><div><span class="eyebrow">PROGRESS TREND</span><h2>${title}</h2></div><span class="chart-axis-label">Completion %</span></div><div class="analytics-chart-wrap"><svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="${title} chart"><g class="chart-y-labels"><text x="0" y="25">100%</text><text x="0" y="${height/2+4}">50%</text><text x="0" y="${height-bottom}">0%</text></g><g class="chart-lines"><line x1="${left}" x2="${width-right}" y1="${top}" y2="${top}"></line><line x1="${left}" x2="${width-right}" y1="${height/2}" y2="${height/2}"></line><line x1="${left}" x2="${width-right}" y1="${height-bottom}" y2="${height-bottom}"></line></g><path class="chart-area" d="${area}"></path><path class="chart-line" d="${line}"></path>${points.map((p,i)=>`<circle class="chart-point" cx="${p.x}" cy="${p.y}" r="3.5" data-tip="${data[i].date}: ${data[i].value}% complete · ${data[i].done} activities"></circle>`).join("")}${labels.map(p=>{const x=left+(p.day-1)*xStep;return`<text class="chart-x-label" x="${x}" y="${height-10}" text-anchor="middle">${p.day}</text>`}).join("")}</svg><div class="chart-tooltip"></div></div></section>`;
}
function weeklyBars(days){const max=Math.max(1,...days.map(x=>x.done));return`<div class="weekly-chart">${days.map(x=>`<div class="weekly-bar-col"><span>${x.done}</span><i style="height:${Math.max(8,Math.round(x.done/max*100))}%"></i><small>${x.label}</small></div>`).join("")}</div>`}
function areaCard(g,index,month=mon()){const tasks=tasksOf(g),habits=S.habits.filter(h=>h.cat===g.cat),habitsData=habitAnalytics(habits,month),total=tasks.length+habitsData.total,done=tasks.filter(t=>t.done).length+habitsData.done,p=total?Math.round(done/total*100):0,icons=["sparkles","book-open","graduation-cap","layers-3","mic-2","heart-pulse","circle-dot"];return`<button class="area-card" data-a="focus" data-id="${g.id}" style="--area-delay:${Math.min(index*55,275)}ms"><div class="area-top"><span class="area-number">${String(index+1).padStart(2,"0")}</span><i data-lucide="${icons[index%icons.length]}" class="area-icon"></i><strong>${esc(g.title)}</strong><b>${p}%</b></div><div class="area-meta"><span>${done} / ${total} activities completed</span><span>${esc(g.cat)}</span></div><div class="area-progress"><i style="width:${p}%"></i></div></button>`}
function analyticsCategory(g){
  const month=analyticsMonth||mon(),tasks=tasksOf(g),done=tasks.filter(t=>t.done),habitsData=habitAnalytics(S.habits.filter(h=>h.cat===g.cat),month),total=tasks.length+habitsData.total,completed=done.length+habitsData.done,monthly=monthlyAnalytics(tasks,habitsData,month,total),upcoming=tasks.filter(t=>!t.done).sort((a,b)=>(a.due||"9999").localeCompare(b.due||"9999")),p=total?Math.round(completed/total*100):0,data=monthData([g],S.habits.filter(h=>h.cat===g.cat),month),recent=done.slice().sort((a,b)=>(b.doneOn||"").localeCompare(a.doneOn||"")).slice(0,5);
  return`<div class="analytics-page category-detail"><button class="back-button" data-a="analytics-back"><i data-lucide="arrow-left"></i> All areas</button><div class="analytics-kicker">AREA DETAIL · MONTHLY REVIEW</div><div class="analytics-title-row"><div><h1>${esc(g.title)}</h1><div class="analytics-subtitle">${esc(g.cat)} · ${mname(month)}</div></div><span class="category-score">${p}%</span></div><section class="detail-summary"><div><strong data-count="${p}" data-suffix="%">0%</strong><span>complete</span></div><div><strong data-count="${completed}">0</strong><span>activities done</span></div><div><strong data-count="${total-completed}">0</strong><span>remaining</span></div><div><strong data-count="${monthly.longest}">0</strong><span>best streak</span></div></section>${analyticsChart(data,"Monthly progress")}<div class="detail-columns"><section class="detail-list"><div class="eyebrow">RECENTLY COMPLETED</div>${recent.map(t=>`<div class="detail-task"><i data-lucide="check-circle-2"></i><span>${esc(t.t)}</span><small>${t.doneOn||""}</small></div>`).join("")||`<div class="mut empty-project">No completed tasks yet.</div>`}</section><section class="detail-list"><div class="eyebrow">UPCOMING TASKS</div>${upcoming.slice(0,5).map(t=>`<div class="detail-task"><i data-lucide="circle"></i><span>${esc(t.t)}</span><small>${t.due||"No date"}</small></div>`).join("")||`<div class="mut empty-project">Everything is complete.</div>`}</section></div></div>`;
}
function animateAnalyticsNumbers(){
  document.querySelectorAll("[data-count]").forEach(element=>{
    const target=Number(element.dataset.count)||0,suffix=element.dataset.suffix||"",start=performance.now(),duration=650;
    const tick=now=>{const progress=Math.min(1,(now-start)/duration),ease=1-Math.pow(1-progress,3);element.textContent=`${Math.round(target*ease)}${suffix}`;if(progress<1)requestAnimationFrame(tick)};
    requestAnimationFrame(tick);
  });
}
function bindAnalyticsChart(){
  const wrap=document.querySelector(".analytics-chart-wrap"),tip=wrap?.querySelector(".chart-tooltip");if(!wrap||!tip)return;
  wrap.querySelectorAll(".chart-point").forEach(point=>point.addEventListener("mouseenter",()=>{tip.textContent=point.dataset.tip;tip.classList.add("show");const r=point.getBoundingClientRect(),parent=wrap.getBoundingClientRect();tip.style.left=`${r.left-parent.left}px`;tip.style.top=`${r.top-parent.top-42}px`}));
  wrap.querySelectorAll(".chart-point").forEach(point=>point.addEventListener("mouseleave",()=>tip.classList.remove("show")));
}

function render(){
  checkpointDay();
  const v={today,goals,tasks,scheduler,habits,review,history,profile:profilePage}[tab]();
  document.getElementById("app").innerHTML=v;
  const titles={today:"Today",goals:"Goals",tasks:"Tasks",scheduler:"Scheduler",habits:"Habits",review:"Reviews",history:"Growth",profile:"Profile"};
  const initials=(S.profile?.name||"Your Name").split(/\s+/).filter(Boolean).slice(0,2).map(word=>word[0]).join("").toUpperCase()||"YN";
  document.getElementById("topbar").innerHTML=`<div class="crumb"><span>Workspace</span><b>/</b><strong>${titles[tab]}</strong></div><div class="top-actions"><span class="top-date">${new Date().toLocaleDateString(undefined,{weekday:"short",month:"short",day:"numeric"})}</span><button class="top-logout" data-a="logout" aria-label="Log out"><i data-lucide="log-out"></i><span>Log out</span></button><span class="avatar">${initials}</span></div>`;
  const items=[["today","Today","layout-dashboard","Now"],["goals","Goals","target","Goals"],["tasks","Tasks","list-checks","Tasks"],["scheduler","Schedule","calendar-clock","Plan"],["habits","Habits","flame","Habits"],["review","Review","notebook-pen","Rev"],["history","Growth","chart-no-axes-combined","Stats"]];
  document.body.dataset.theme=["forest","ocean","berry","sunset","slate"].includes(S.profile?.theme)?S.profile.theme:"forest";
  document.getElementById("nav").innerHTML=`<div class="brand"><span class="brand-mark"><i data-lucide="sparkles"></i></span><span>Focus</span></div><div class="nav-label">Workspace</div>${items.map(i=>`<button data-tab="${i[0]}" aria-label="${i[1]}" title="${i[1]}" class="${tab===i[0]?"on":""}"><i data-lucide="${i[2]}" class="nav-icon"></i><span data-short="${i[3]}">${i[1]}</span></button>`).join("")}<div class="sidebar-foot"><button data-tab="profile" aria-label="Profile" title="Profile" class="${tab==="profile"?"on":""}"><i data-lucide="user-round" class="nav-icon"></i><span data-short="Me">Profile</span></button></div>`;
  if(window.lucide)lucide.createIcons();
  revealOnScroll();
  if(tab==="history"||tab==="tasks"){animateAnalyticsNumbers();if(tab==="history")bindAnalyticsChart()}
  const m=document.getElementById("gm");if(m)m.onchange=e=>{gm=e.target.value||mon();render()};const am=document.getElementById("analyticsMonth");if(am)am.onchange=e=>{analyticsMonth=e.target.value||mon();analyticsFocus=null;render()};const sd=document.getElementById("scheduleDate");if(sd)sd.onchange=e=>{schedulerDate=e.target.value||td();render()}}

document.addEventListener("click",e=>{
  if(e.target.closest("[data-a=auth-switch]")){authMode=authMode==="login"?"signup":"login";showAuth();return}
  if(e.target.closest("[data-a=auth-reset]")){authMode="reset";showAuth();return}
  if(e.target.closest("[data-a=auth-back]")){authMode="login";showAuth();return}
  const n=e.target.closest("[data-tab]");if(n){tab=n.dataset.tab;analyticsFocus=null;editingGoal=null;editingTask=null;render();return}
  const control=e.target.closest("[data-a]"),a=control?.dataset.a,id=control?.dataset.id;if(!a)return;
  if(a==="focus"){analyticsFocus=id;render();return}
  if(a==="analytics-back"){analyticsFocus=null;render();return}
  if(a==="logout"){db?.auth.signOut();return}
  if(a==="delalltasks"&&confirm("Delete all tasks? This cannot be undone.")){S.goals.forEach(g=>g.projects.forEach(p=>p.tasks=[]));save();render();return}
  if(a==="scheduler-prev"){schedulerDate=addDays(schedulerDate||td(),-1);render();return}
  if(a==="scheduler-next"){schedulerDate=addDays(schedulerDate||td(),1);render();return}
  if(a==="scheduler-today"){schedulerDate=td();render();return}
  if(a==="editgoal"){editingGoal=id;render();return}
  if(a==="cancelgoal"){editingGoal=null;render();return}
  if(a==="edittask"){editingTask=id;render();return}
  if(a==="canceltask"){editingTask=null;render();return}
  if(a==="subtask"){const task=allTasks().find(x=>x.t.id===id)?.t,sub=task?.subtasks?.find(s=>s.id===control.dataset.subid);if(sub){sub.done=control.checked;save();render()}return}
  if(a==="delsubtask"&&confirm("Delete this subtask?")){const task=allTasks().find(x=>x.t.id===id)?.t;if(task)task.subtasks=(task.subtasks||[]).filter(s=>s.id!==control.dataset.subid);save();render();return}
  if(a==="task"){const x=allTasks().find(y=>y.t.id===id);x.t.done=e.target.checked;x.t.doneOn=x.t.done?td():null;
    save();if(x.t.done){if(prog(x.g)===100)toast("Goal complete: "+x.g.title+". Well done.");else if(x.t.ms)toast("Milestone reached.")}render()}
  if(a==="deltask"&&confirm("Delete this task?")){S.goals.forEach(g=>g.projects.forEach(p=>p.tasks=p.tasks.filter(t=>t.id!==id)));save();render()}
  if(a==="hab"){const h=S.habits.find(y=>y.id===id);if(e.target.checked)h.log[td()]=1;else delete h.log[td()];save();render()}
  if(a==="sess"){const h=S.habits.find(y=>y.id===id);h.log[td()]=(h.log[td()]||0)+1;save();toast(weekCount(h)>=h.target?"Weekly target hit!":"Session logged.");render()}
  if(a==="desess"){const h=S.habits.find(y=>y.id===id),count=h?.log[td()]||0;if(h&&count>0){if(count===1)delete h.log[td()];else h.log[td()]=count-1;save();toast("Today's session removed.");render()}}
  if(a==="delgoal"&&confirm("Delete this goal?")){S.goals=S.goals.filter(g=>g.id!==id);save();render()}
  if(a==="delproj"&&confirm("Delete this project?")){S.goals.forEach(g=>g.projects=g.projects.filter(p=>p.id!==id));save();render()}
  if(a==="delhab"&&confirm("Delete this habit?")){S.habits=S.habits.filter(h=>h.id!==id);save();render()}
});
document.addEventListener("submit",e=>{
  e.preventDefault();const f=e.target,k=f.dataset.f,id=f.dataset.id,d=new FormData(f),t=(d.get("t")||"").trim();
  if(k==="auth"){if(!db){showAuth("Supabase is unavailable. Check your connection.");return}(async()=>{const email=String(d.get("email")||""),password=String(d.get("password")||""),submitButton=f.querySelector('button[type="submit"]');if(submitButton)submitButton.disabled=true;try{if(authMode==="update"){const confirmation=String(d.get("passwordConfirm")||"");if(password!==confirmation){showAuth("The passwords do not match.");return}const result=await db.auth.updateUser({password});if(result.error){showAuth(authErrorMessage(result.error,authMode));return}window.history.replaceState({},document.title,window.location.pathname);authMode="login";await loadCloud();return}const result=authMode==="reset"?await db.auth.resetPasswordForEmail(email,{redirectTo:window.location.href}):authMode==="login"?await db.auth.signInWithPassword({email,password}):await db.auth.signUp({email,password,options:{emailRedirectTo:window.location.origin+window.location.pathname}});if(result.error){showAuth(authErrorMessage(result.error,authMode));return}else if(authMode==="reset")showAuth("Check your email for a secure password reset link.");else if(authMode==="signup"&&!result.data.session)showAuth("Check your email to confirm your account, then sign in.")}catch(error){showAuth("Authentication is unavailable. Please try again.")}finally{if(submitButton)submitButton.disabled=false}})();return}
  if(k==="profile-theme"){S.profile=S.profile||{};S.profile.theme=String(d.get("theme")||S.profile.theme||"forest");save();render();return}
  if(k==="profile"){S.profile=S.profile||{};S.profile.name=String(d.get("name")||S.profile.name||"Your Name").trim();S.profile.email=String(d.get("email")||S.profile.email||"").trim();S.profile.role=String(d.get("role")||S.profile.role||"Productive builder").trim();S.profile.theme=String(d.get("theme")||S.profile.theme||"forest");S.profile.timezone=String(d.get("timezone")||S.profile.timezone||"UTC");S.profile.bio=String(d.get("bio")||S.profile.bio||"").trim();S.profile.emailPreferences={dailyReminder:!!d.get("dailyReminder"),dailyTime:String(d.get("dailyTime")||"08:00"),weeklyMetrics:!!d.get("weeklyMetrics"),weeklyDay:Math.min(7,Math.max(1,Number(d.get("weeklyDay"))||1)),monthlyWins:!!d.get("monthlyWins"),monthlyDay:Math.min(28,Math.max(1,Number(d.get("monthlyDay"))||1))};S.profile.notifications=S.profile.emailPreferences.dailyReminder;save();render();return}
  if(k==="goal")S.goals.push({id:uid(),title:t,cat:d.get("cat"),month:gm,pri:S.goals.filter(x=>x.month===gm).length+1,projects:[]});
  if(k==="editgoal"){const goal=S.goals.find(g=>g.id===id);if(goal){goal.title=(d.get("title")||goal.title).trim();goal.cat=d.get("cat")||goal.cat;goal.pri=Math.max(1,+d.get("pri")||goal.pri||1)}editingGoal=null}
  if(k==="proj")S.goals.find(g=>g.id===id).projects.push({id:uid(),title:t,tasks:[]});
  if(k==="task")S.goals.flatMap(g=>g.projects).find(p=>p.id===id).tasks.push({id:uid(),t,due:d.get("due")||"",cat:(d.get("cat")||"").trim()||null,ms:!!d.get("ms"),done:false});
  if(k==="taskPage"){const project=S.goals.flatMap(g=>g.projects).find(p=>p.id===d.get("pid"));if(project)project.tasks.push({id:uid(),t,due:d.get("due")||"",cat:(d.get("cat")||"").trim()||null,ms:false,done:false,group:(d.get("group")||"").trim()||null})}
  if(k==="edittask"){const task=allTasks().find(x=>x.t.id===id)?.t;if(task){task.t=(d.get("t")||task.t).trim();task.due=d.get("due")||task.due;task.cat=(d.get("cat")||"").trim()||null;task.group=(d.get("group")||"").trim()||null;task.ms=!!d.get("ms");task.subtasks=String(d.get("subtasks")||"").split(/\r?\n/).map(x=>x.trim()).filter(Boolean).map((text,index)=>({id:task.subtasks?.[index]?.id||uid(),t:text,done:task.subtasks?.[index]?.done||false}))}editingTask=null}
  if(k==="taskgroup"){const project=S.goals.flatMap(g=>g.projects).find(p=>p.id===id),group=(d.get("group")||"").trim(),cat=(d.get("cat")||"").trim()||null,due=d.get("due")||"";const items=String(d.get("items")||"").split(/\r?\n/).map(x=>x.trim()).filter(Boolean);if(project&&group)items.forEach(item=>project.tasks.push({id:uid(),t:item,due,cat,ms:false,done:false,group}));}
  if(k==="qtask")S.goals.flatMap(g=>g.projects).find(p=>p.id===d.get("pid")).tasks.push({id:uid(),t,due:td(),ms:false,done:false});
  if(k==="habit")S.habits.push({id:uid(),name:t,cat:d.get("cat"),target:+d.get("tg")||1,log:{}});
  if(k==="review"){const w=f.dataset.type==="week",tt=td(),s=w?stats(addDays(tt,-6),tt):stats(mon()+"-01",tt);
    S.reviews.push({type:f.dataset.type,date:tt,w:d.get("w"),c:d.get("c"),n:d.get("n"),auto:`${s.done} tasks done${s.habit!=null?`, habits ${s.habit}%`:""}`});toast("Review saved.")}
  save();render()});

const hrow=(x,t)=>{const v=x.log[t]||0,tg=x.target||1,p=Math.min(100,Math.round(100*v/tg));
 const inp=tg===1&&!x.unit?`<input type="checkbox" data-a="hab" data-id="${x.id}" ${v?"checked":""}>`:`<input class="num" type="number" min="0" value="${v||""}" placeholder="0" data-a="habval" data-id="${x.id}">`;
 return `<div class="card daily-habit-card"><div class="row">${inp}<div class="g"><span class="${ok(x,t)?"done":""}">${esc(x.name)}</span><div class="mut">${tg>1||x.unit?`today: ${v} / ${tg} ${x.unit||""}`:"Daily target"}${x.pri?` · Priority ${x.pri}`:""}</div></div><span class="daily-percent">${p}%</span><span class="tag"><i data-lucide="flame" class="tag-icon"></i> ${streak(x)}</span></div>${bar(p)}<div class="daily-progress-meta"><span>Today</span><strong>${p}% complete</strong></div></div>`};
function core(t){
 const dow=new Date().getDay(),dly=S.habits.filter(h=>h.kind!=="weekly").sort((a,b)=>(a.pri||9)-(b.pri||9)),wk=S.habits.filter(h=>h.kind==="weekly");
 let h="";
 if(dow===0)h+=`<div class="ban"><i data-lucide="calendar-days"></i> <b>Sunday: plan the week.</b> Set tasks and due dates. <button data-tab="goals">Open Goals</button></div>`;
 if(dow===6)h+=`<div class="ban"><i data-lucide="notebook-pen"></i> <b>Saturday: review the week.</b> <button data-tab="review">Start review</button></div>`;
 h+=`<h2>Daily core system</h2>`+(dly.map(x=>hrow(x,t)).join("")||'<div class="card mut">No daily habits yet.</div>');
 wk.forEach(x=>{const c=weekCount(x),todaySessions=x.log[td()]||0,p=Math.min(100,Math.round(100*c/x.target));h+=`<div class="card"><div class="row"><div class="g">${esc(x.name)}<div class="mut">${c}/${x.target} this week${todaySessions?` · ${todaySessions} today`:""}</div></div><div class="session-actions"><button data-a="sess" data-id="${x.id}"><i data-lucide="plus"></i> Session</button>${todaySessions?`<button class="ghost" data-a="desess" data-id="${x.id}" aria-label="Remove today's session"><i data-lucide="minus"></i></button>`:""}</div></div>${bar(p)}</div>`});
 return h}
document.addEventListener("change",e=>{if(e.target.dataset.a!=="habval")return;
 const h=S.habits.find(y=>y.id===e.target.dataset.id),v=Math.max(0,+e.target.value||0);
 if(v)h.log[td()]=v;else delete h.log[td()];save();if(ok(h,td()))toast(h.name.split(":")[0]+" done.");render()});

checkpointDay();
render();
setInterval(()=>{const current=td();if(S.meta?.lastDay&&S.meta.lastDay!==current){checkpointDay(current);render();}},60000);
initAuth();
