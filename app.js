const CATS=["Reading","Bible & Prayer","Academics","Courses","Public Speaking","Health","Other"];
const REFERRAL_SOURCES=["Search engine","Social media","Friend or family","App store","Other"];
const db=window.supabase?.createClient(window.FOCUS_SUPABASE_URL,window.FOCUS_SUPABASE_PUBLISHABLE_KEY);
let emailCampaigns=[],emailCampaignsLoading=false,emailCampaignsLoaded=false;
async function loadEmailCampaigns(){if(!db||emailCampaignsLoading||emailCampaignsLoaded)return;emailCampaignsLoading=true;const{data,error}=await db.from("email_campaigns").select("id,campaign_type,title,subject,publish_at").order("publish_at",{ascending:false}).limit(12);emailCampaignsLoading=false;if(error){toast("Could not load email campaigns. Check admin access.");return}emailCampaigns=data||[];emailCampaignsLoaded=true;if(tab==="profile")render()}
const K="focus_v1";let S,localStorageReadError=false;
try{const storedState=localStorage.getItem(K);if(storedState)S=JSON.parse(storedState)}catch(e){localStorageReadError=true;try{const recoverableState=localStorage.getItem(K);if(recoverableState)localStorage.setItem(`${K}_recovery`,recoverableState)}catch(e){}}
S=S||{goals:[],habits:[],reviews:[]};
S.tasks=S.tasks||[];
S.profile=S.profile||{name:"Your Name",email:"you@example.com",role:"Productive builder",theme:"forest",timezone:"UTC",bio:"Build deliberate momentum every day.",notifications:true};
S.meta=S.meta||{lastDay:null};
S.history=S.history||{};
S.weeklyHistory=S.weeklyHistory||{};
function emptyState(user=authUser){return{goals:[],habits:[],reviews:[],tasks:[],profile:{name:"Your Name",email:user?.email||"",role:"Productive builder",theme:"forest",timezone:"UTC",bio:"",notifications:true},meta:{lastDay:null},history:{},weeklyHistory:{}}}
function normalizeState(state,user){const normalized=state&&typeof state==="object"&&!Array.isArray(state)?state:emptyState(user);normalized.goals=Array.isArray(normalized.goals)?normalized.goals:[];normalized.habits=Array.isArray(normalized.habits)?normalized.habits:[];normalized.reviews=Array.isArray(normalized.reviews)?normalized.reviews:[];normalized.tasks=Array.isArray(normalized.tasks)?normalized.tasks:[];normalized.profile={...emptyState(user).profile,...(normalized.profile&&typeof normalized.profile==="object"?normalized.profile:{})};normalized.meta=normalized.meta&&typeof normalized.meta==="object"?normalized.meta:{lastDay:null};normalized.history=normalized.history&&typeof normalized.history==="object"?normalized.history:{};normalized.weeklyHistory=normalized.weeklyHistory&&typeof normalized.weeklyHistory==="object"?normalized.weeklyHistory:{};return normalized}
let tab="today",gm=null,mem={},analyticsFocus=null,editingGoal=null,editingTask=null,schedulerDate=null,analyticsMonth=null,authUser=null,cloudHydrated=false,authMode="login",weeklyPreviewOpen=false,mobileMoreOpen=false,notificationOpen=false,reviewRecap=null,reviewRecapPage=0,storagePersistenceRequested=false,cloudWriteQueue=Promise.resolve(),pendingCloudSnapshot=null,pendingCloudLocalSaved=true;
const save=()=>{if(authUser){S.meta=S.meta||{};S.meta.cloudUserId=authUser.id;S.meta.updatedAt=new Date().toISOString()}let snapshot;try{snapshot=JSON.stringify(S)}catch(e){toast("Could not prepare this change for saving. Keep this page open and try again.");return false}let localSaved=true;try{localStorage.setItem(authUser?`${K}_${authUser.id}`:K,snapshot)}catch(e){localSaved=false;toast("Device storage is unavailable. Cloud sync will be attempted.")}if(authUser&&cloudHydrated)syncCloud(snapshot,localSaved);return localSaved};
function requestStoragePersistence(){if(storagePersistenceRequested)return;storagePersistenceRequested=true;try{navigator.storage?.persist?.().catch(()=>{})}catch(e){}}
document.addEventListener("pointerdown",requestStoragePersistence,{once:true});
document.addEventListener("keydown",requestStoragePersistence,{once:true});
if(!S.meta.lastDay || !S.history || !S.weeklyHistory){S.meta=S.meta||{lastDay:null};S.history=S.history||{};S.weeklyHistory=S.weeklyHistory||{};save();}
const buildDailySummary=(date=td())=>{const tasks=allTasks().filter(x=>x.t.done&&x.t.doneOn===date),habitEntries=S.habits.map(h=>({id:h.id,name:h.name,target:h.target||1,value: h.log[date]||0,done:(h.kind==="weekly"?(h.log[date]||0)>0:(h.log[date]||0)>=((h.target||1)))})).filter(h=>h.done||h.value>0),completedHabits=habitEntries.filter(h=>h.done).length,totalTasks=tasks.length,totalHabits=habitEntries.length,score=totalTasks+totalHabits?Math.round((completedHabits+totalTasks)/(totalTasks+totalHabits||1)*100):0;return {date,tasks:tasks.map(x=>({id:x.t.id,title:x.t.t,goal:x.g?.title||"Independent",project:x.p?.title||"",doneOn:x.t.doneOn,category:x.t.cat||"General"})),habits:habitEntries,completedTasks:totalTasks,completedHabits,score,totalActivities:totalTasks+totalHabits};};
const buildWeeklySummary=(date=td())=>{const day=new Date(date+"T12:00");const start=new Date(day);const offset=(day.getDay()+6)%7;start.setDate(day.getDate()-offset);const end=new Date(start);end.setDate(start.getDate()+6);const weeks=[...Array(7)].map((_,i)=>{const d=new Date(start);d.setDate(start.getDate()+i);return ld(d)});const days=weeks.map(d=>buildDailySummary(d));const totalCompleted=days.reduce((sum,item)=>sum+item.completedTasks+item.completedHabits,0);return {weekStart:ld(start),weekEnd:ld(end),days,totalCompleted,score:days.length?Math.round(days.reduce((sum,item)=>sum+item.score,0)/days.length):0};};
const checkpointDay=(date=td())=>{if(!S.meta.lastDay){S.meta.lastDay=date;save();return}if(S.meta.lastDay===date)return;const previous=S.meta.lastDay;S.history[previous]=buildDailySummary(previous);S.weeklyHistory[previous]=buildWeeklySummary(previous);S.meta.lastDay=date;save();};
async function syncCloud(snapshot=JSON.stringify(S),localSaved=true){if(!db||!authUser)return false;const userId=authUser.id;let state;try{state=JSON.parse(snapshot)}catch(e){toast("Cloud sync skipped because the saved state could not be prepared.");return false}pendingCloudSnapshot=snapshot;pendingCloudLocalSaved=localSaved;const write=cloudWriteQueue.catch(()=>{}).then(async()=>{if(!authUser||authUser.id!==userId)return false;const{error}=await db.from("focus_state").upsert({user_id:userId,state,updated_at:new Date().toISOString()});if(error)throw error;return true});cloudWriteQueue=write;try{const synced=await write;if(synced&&pendingCloudSnapshot===snapshot)pendingCloudSnapshot=null;return synced}catch(e){toast(localSaved?"Cloud sync failed. Changes remain saved on this device.":"Cloud sync failed and device storage is unavailable. It will retry when online or after your next change.");return false}}
window.addEventListener("online",()=>{if(authUser&&cloudHydrated&&pendingCloudSnapshot)syncCloud(pendingCloudSnapshot,pendingCloudLocalSaved)});
async function loadCloud(){
  if(!db||!authUser)return;
  const user=authUser,storageKey=`${K}_${user.id}`;
  let localState=null,onboardingPending=false;
  cloudHydrated=false;pendingCloudSnapshot=null;
  try{
    const saved=localStorage.getItem(storageKey);
    if(saved)localState=JSON.parse(saved);
    else{
      const legacy=localStorage.getItem(K);
      if(legacy){const parsed=JSON.parse(legacy);if(parsed?.meta?.cloudUserId===user.id)localState=parsed}
    }
  }catch(e){toast("Could not read this account's saved data from this device.")}
  S=normalizeState(localState,user);
  onboardingPending=user.user_metadata?.onboarding_required===true&&S.profile.onboardingCompletedFor!==user.id;
  try{
    const{data,error}=await db.from("focus_state").select("state,updated_at").eq("user_id",user.id).maybeSingle();
    if(error)throw error;
    if(!authUser||authUser.id!==user.id)return;
    if(data?.state){const localUpdated=Date.parse(S.meta?.updatedAt||"")||0,cloudUpdated=Date.parse(data.updated_at||data.state.meta?.updatedAt||"")||0,localIsNewer=!!localState&&localUpdated>cloudUpdated;if(!localIsNewer)S=normalizeState(data.state,user)}
    S=normalizeState(S,user);
    onboardingPending=user.user_metadata?.onboarding_required===true&&S.profile.onboardingCompletedFor!==user.id;
    if(onboardingPending)S=emptyState(user);
    S.profile.email=S.profile.email||user.email||"";
    S.meta.cloudUserId=user.id;S.meta.updatedAt=S.meta.updatedAt||data?.updated_at||new Date().toISOString();
    updateRewards();
    let localSaved=true;try{localStorage.setItem(storageKey,JSON.stringify(S))}catch(e){localSaved=false;toast("Cloud data loaded but could not be saved on this device.")}
    cloudHydrated=true;await syncCloud(JSON.stringify(S),localSaved);
    if(onboardingPending){showOnboarding();return}
    document.body.classList.remove("auth-mode");document.getElementById("auth").innerHTML="";render();
  }catch(e){
    if(!authUser||authUser.id!==user.id)return;
    toast("Could not load cloud data. Using this account's saved data.");
    S=normalizeState(onboardingPending?emptyState(user):S,user);S.profile.email=S.profile.email||user.email||"";S.meta.cloudUserId=user.id;S.meta.updatedAt=S.meta.updatedAt||new Date().toISOString();
    try{localStorage.setItem(storageKey,JSON.stringify(S))}catch(storageError){toast("This account's data could not be saved on this device.")}
    if(onboardingPending){showOnboarding();return}
    document.body.classList.remove("auth-mode");document.getElementById("auth").innerHTML="";render();
  }
}
function showOnboarding(message=""){document.body.classList.add("auth-mode");const root=document.getElementById("auth");root.innerHTML=`<div class="auth-shell"><form class="auth-card onboarding-card" data-f="onboarding"><div class="auth-brand"><span class="brand-mark"><i data-lucide="sparkles"></i></span><strong>Hoptasks</strong></div><span class="eyebrow">YOUR PROFILE</span><h1>Let’s make this yours.</h1><p>Tell us a little about yourself before you get started.</p>${message?`<div class="auth-message">${esc(message)}</div>`:""}<div class="onboarding-name-fields"><label>First name<input type="text" name="firstName" required autocomplete="given-name"></label><label>Last name<input type="text" name="lastName" required autocomplete="family-name"></label></div><label>How did you hear about us?<select name="referralSource" required><option value="" disabled selected>Choose an option</option>${REFERRAL_SOURCES.map(source=>`<option value="${esc(source)}">${esc(source)}</option>`).join("")}</select></label><label>One goal you’d like to work toward (optional)<input type="text" name="firstGoal" autocomplete="off"></label><button type="submit">Save and get started</button></form></div>`;if(window.lucide)lucide.createIcons()}
function showAuth(message=""){document.body.classList.add("auth-mode");const reset=authMode==="reset",update=authMode==="update",login=authMode==="login",root=document.getElementById("auth");root.innerHTML=`<div class="auth-shell"><div class="auth-layout"><form class="auth-card" data-f="auth"><div class="auth-brand"><span class="brand-mark"><i data-lucide="sparkles"></i></span><strong>Hoptasks</strong></div><span class="eyebrow">${update?"SECURE RECOVERY":reset?"PASSWORD RESET":login?"WELCOME BACK":"CREATE YOUR ACCOUNT"}</span><h1>${update?"Choose a new password.":reset?"Reset your password.":login?"Return to your rhythm.":"Start your focus system."}</h1><p>${update?"Create a new password for your Focus account.":reset?"Enter your email and we’ll send you a secure reset link.":login?"Sign in to sync your goals, tasks, habits, and reviews.":"Create an account to keep your progress safe across devices."}</p>${message?`<div class="auth-message">${esc(message)}</div>`:""}${reset?`<label>Email<input type="email" name="email" value="you@example.com" required autocomplete="email"></label>`:""}${update?`<label>New password<input type="password" name="password" required minlength="6" autocomplete="new-password"></label><label>Confirm password<input type="password" name="passwordConfirm" required minlength="6" autocomplete="new-password"></label>`:reset?"":`<label>Email<input type="email" name="email" value="you@example.com" required autocomplete="email"></label><label>Password<input type="password" name="password" required minlength="6" autocomplete="${login?"current-password":"new-password"}"></label>`}<button type="submit">${update?"Save new password":reset?"Send reset link":login?"Sign in":"Create account"}</button>${update?"":reset?`<button type="button" class="ghost auth-switch" data-a="auth-back">Back to sign in</button>`:`${login?`<button type="button" class="auth-forgot" data-a="auth-reset">Forgot your password?</button>`:""}<button type="button" class="ghost auth-switch" data-a="auth-switch">${login?"Create a new account":"I already have an account"}</button>`}</form><aside class="auth-aside"><span class="auth-quote-mark">“</span><blockquote>Start with the task that matters most, and let focused action create momentum.</blockquote><div class="auth-quote-source"><span class="auth-avatar">F</span><span><strong>Hoptasks system</strong><small>Built for deliberate progress</small></span></div></aside></div></div>`;if(window.lucide)lucide.createIcons()}
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
const tasksOf=g=>[...g.projects.flatMap(p=>p.tasks),...(S.tasks||[]).filter(t=>t.goalId===g.id)];
const prog=g=>{const t=tasksOf(g);return t.length?Math.round(100*t.filter(x=>x.done).length/t.length):0};
const allTasks=()=>[...S.goals.flatMap(g=>g.projects.flatMap(p=>p.tasks.map(t=>({t,g,p})))),...(S.tasks||[]).map(t=>({t,g:S.goals.find(goal=>goal.id===t.goalId)||null,p:null}))];
function getNotifications(){
  const today=td(),tasks=allTasks().filter(({t})=>!t.done&&t.due&&t.due<=today).sort((a,b)=>a.t.due.localeCompare(b.t.due));
  const taskItems=tasks.map(({t})=>({id:`task-${t.id}`,icon:t.due<today?"triangle-alert":"calendar-clock",title:t.due<today?"Overdue task":"Due today",detail:`${t.t} · ${new Date(`${t.due}T12:00`).toLocaleDateString(undefined,{month:"short",day:"numeric"})}`,tab:"tasks"}));
  const habitItems=S.habits.filter(habit=>habit.kind!=="weekly"&&!ok(habit,today)).map(habit=>({id:`habit-${habit.id}`,icon:"repeat-2",title:"Daily habit still open",detail:habit.name,tab:"habits"}));
  const badgeItems=(S.gamification?.badges||[]).filter(badge=>badge.earnedOn===today).map(badge=>({id:`badge-${badge.id}`,icon:"award",title:"Badge earned",detail:badge.title,tab:"profile"}));
  return[...taskItems,...habitItems,...badgeItems];
}
function notificationCenter(){
  const items=getNotifications(),count=items.length,label=count>9?"9+":String(count);
  return `<div class="notification-center"><button type="button" class="notification-button" data-a="notifications" aria-label="Notifications, ${count} active" aria-haspopup="dialog" aria-expanded="${notificationOpen}"><i data-lucide="bell"></i>${count?`<span class="notification-count">${label}</span>`:""}</button>${notificationOpen?`<section class="notification-panel" role="dialog" aria-label="Notifications"><header><strong>Notifications</strong><span>${count?`${count} active`:"All caught up"}</span></header><div class="notification-list">${items.map(item=>`<button type="button" class="notification-item" data-tab="${item.tab}" data-notice="${esc(item.id)}"><span class="notification-icon"><i data-lucide="${item.icon}"></i></span><span><strong>${esc(item.title)}</strong><small>${esc(item.detail)}</small></span></button>`).join("")||`<p class="notifications-empty">No tasks due and no habits waiting today.</p>`}</div></section>`:""}</div>`;
}
const ok=(h,d)=>(h.log[d]||0)>=(h.kind==="weekly"?1:(h.target||1));
const STREAK_FREEZE_DAYS=3;
function streak(h){
 const today=td(),endDate=ok(h,today)?today:addDays(today,-1);
 const oldestSuccess=Object.keys(h.log||{}).filter(date=>date<=endDate&&ok(h,date)).sort()[0];
 if(!oldestSuccess)return{days:0,freezeDaysRemaining:STREAK_FREEZE_DAYS,frozenDates:new Set()};
 let days=0,d=endDate;const monthlyMisses=new Map(),pendingMisses=new Map(),pendingDates=[],frozenDates=new Set();
 while(d>=oldestSuccess){
  if(ok(h,d)){
   days++;
   for(const[month,count]of pendingMisses)monthlyMisses.set(month,(monthlyMisses.get(month)||0)+count);
   days+=pendingDates.length;pendingDates.forEach(date=>frozenDates.add(date));pendingMisses.clear();pendingDates.length=0;
  }else{
   const month=d.slice(0,7),used=(monthlyMisses.get(month)||0)+(pendingMisses.get(month)||0);
   if(used>=STREAK_FREEZE_DAYS)break;
   pendingMisses.set(month,(pendingMisses.get(month)||0)+1);pendingDates.push(d);
  }
  d=addDays(d,-1);
 }
 return{days,freezeDaysRemaining:STREAK_FREEZE_DAYS-(monthlyMisses.get(today.slice(0,7))||0),frozenDates};
}
async function profilePhotoData(file){
 if(!["image/jpeg","image/png","image/webp"].includes(file.type))throw new Error("Choose a JPEG, PNG, or WebP image.");
 if(file.size>10*1024*1024)throw new Error("Choose an image smaller than 10 MB.");
 const bitmap=await createImageBitmap(file);
 try{
  const scale=Math.min(1,512/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement("canvas");
  canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
  const context=canvas.getContext("2d");if(!context)throw new Error("This browser cannot process the selected image.");
  context.fillStyle="#fff";context.fillRect(0,0,canvas.width,canvas.height);
  context.drawImage(bitmap,0,0,canvas.width,canvas.height);
  let blob=null;
  for(const quality of [.82,.68,.54]){
   blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/jpeg",quality));
   if(!blob)throw new Error("The selected image could not be processed.");
   if(blob.size<=220*1024)break;
  }
  if(blob.size>220*1024)throw new Error("That image could not be compressed enough. Choose a smaller image.");
  const reader=new FileReader(),data=await new Promise((resolve,reject)=>{reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error||new Error("The selected image could not be read."));reader.readAsDataURL(blob)});
  if(typeof data!=="string")throw new Error("The selected image could not be read.");
  return data;
 }finally{bitmap.close()}
}
const wkStart=()=>addDays(td(),-((new Date().getDay()+6)%7));
const sumR=(h,a,b)=>{let n=0,d=a;while(d<=b){n+=h.log[d]||0;d=addDays(d,1)}return n};
const weekCount=h=>sumR(h,wkStart(),addDays(wkStart(),6));
const emptyRewards=()=>({badges:[],personalBestTasks:0});
function initRewards(){
  if(!S.gamification||typeof S.gamification!=="object")S.gamification=emptyRewards();
  const game=S.gamification;game.badges=Array.isArray(game.badges)?game.badges:[];delete game.weeklyChallenge;delete game.completedChallengeWeeks;
  game.personalBestTasks=Math.max(0,Number(game.personalBestTasks)||0);return game;
}
function updateRewards(){
  const game=initRewards(),earned=[];
  const award=(id,title,description,earnedOn=td())=>{if(game.badges.some(badge=>badge.id===id))return;game.badges.push({id,title,description,earnedOn});earned.push(title)};
  for(const goal of S.goals){
    const tasks=[...(goal.projects||[]).flatMap(project=>project.tasks||[]),...(S.tasks||[]).filter(task=>task.goalId===goal.id)];
    if(tasks.length&&tasks.every(task=>task.done))award("first-goal-completed","First Goal Completed",`Completed ${goal.title}.`,tasks.map(task=>task.doneOn).filter(Boolean).sort().at(-1)||td());
    for(const project of goal.projects||[])if(project.tasks?.length&&project.tasks.every(task=>task.done))award("first-project-finished","Finished a Project",`Finished ${project.title}.`,project.tasks.map(task=>task.doneOn).filter(Boolean).sort().at(-1)||td());
  }
  for(const habit of S.habits){
    const starts=new Set(Object.keys(habit.log||{}).filter(date=>/^\d{4}-\d{2}-\d{2}$/.test(date)).map(date=>addDays(date,-((new Date(`${date}T12:00`).getDay()+6)%7))));
    for(const start of starts){const days=[...Array(7)].map((_,index)=>addDays(start,index)),met=days.filter(day=>(habit.log?.[day]||0)>=(habit.target||1)).length;if(met>=4)award(`habit-four-days-${habit.id}-${start}`,`${habit.name}: 4 Days This Week`,`Met this habit on ${met} days during the week of ${start}.`,addDays(start,6))}
  }
  const start=wkStart(),today=td(),completedThisWeek=allTasks().filter(({t})=>t.done&&t.doneOn>=start&&t.doneOn<=today).length,newPersonalBest=completedThisWeek>game.personalBestTasks;
  if(newPersonalBest)game.personalBestTasks=completedThisWeek;
  return{earned,newPersonalBest};
}
function rewardToast(rewards){if(rewards?.earned.length)toast(`Badge earned: ${rewards.earned[0]}`);else if(rewards?.newPersonalBest)toast(`New personal best: ${S.gamification.personalBestTasks} tasks this week!`)}
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

const focusThoughts=["Start with one action that moves something important forward.","A clear next step makes a large goal easier to approach.","Protect a little time for the work you most want to finish.","Progress grows when you return to what matters.","Choose the next task with intention, then begin.","A short, focused effort is still meaningful progress."];
let focusThoughtIndex=Math.floor(Date.now()/30000)%focusThoughts.length;
function rotateFocusThought(){focusThoughtIndex=(focusThoughtIndex+1)%focusThoughts.length;const text=document.getElementById("focus-thought-text");if(text)text.textContent=focusThoughts[focusThoughtIndex]}
function focusThoughtCard(){return `<section class="focus-thought-card"><div class="focus-thought-label"><i data-lucide="quote"></i><span>A thought for now</span></div><blockquote id="focus-thought-text" aria-live="polite">${esc(focusThoughts[focusThoughtIndex])}</blockquote><button type="button" class="ghost" data-a="next-thought" aria-label="Show another thought"><span>Another thought</span><i data-lucide="arrow-right"></i></button></section>`}
function today(){
  const t=td(),all=allTasks().filter(x=>!x.t.done);
  const doneToday=allTasks().filter(x=>x.t.doneOn===t).length;
  const hd=S.habits.filter(h=>h.kind!=="weekly"&&ok(h,t)).length;
  let h=`<h1>${new Date().toLocaleDateString(undefined,{weekday:"long",month:"long",day:"numeric"})}</h1><div class="sub">Set → Plan → Execute → Track → Review → Improve</div>
  <div class="stats"><div class="card kpi"><div class="kpi-icon"><i data-lucide="list-checks"></i></div><div class="big">${all.length}</div><div class="mut">open tasks</div></div>
  <div class="card kpi"><div class="kpi-icon"><i data-lucide="check-circle-2"></i></div><div class="big">${doneToday}</div><div class="mut">done today</div></div>
  <div class="card kpi"><div class="kpi-icon"><i data-lucide="repeat-2"></i></div><div class="big">${hd}/${S.habits.filter(h=>h.kind!=="weekly").length}</div><div class="mut">habits</div></div></div>
  ${momentumChart()}
  ${focusThoughtCard()}
  ${core(t)}<h2>Tasks</h2>`;
  h+=all.length?all.sort((a,b)=>(a.t.due||"9999").localeCompare(b.t.due||"9999")).map(x=>taskRow(x)).join(""):`<div class="card mut">No open tasks. ${S.goals.length?"Add a task from the Tasks page.":"Start by adding a goal in the Goals tab."}</div>`;
  const cur=S.goals.filter(g=>g.month===mon()).sort((a,b)=>(a.pri||99)-(b.pri||99));
  if(cur.length)h+=`<h2>This month</h2>`+cur.map(g=>`<div class="card"><div class="row"><div class="g">${g.pri?`P${g.pri} · `:""}${esc(g.title)}</div><b>${prog(g)}%</b></div>${bar(prog(g))}</div>`).join("");
  return h}
function taskRow(x,hideGroup=false){const t=x.t,late=t.due&&t.due<td()&&!t.done,context=x.g?`${esc(x.g.title)}${x.p?` › ${esc(x.p.title)}`:""}`:"Independent";
  if(editingTask===t.id)return `<form class="card task-editor" data-f="edittask" data-id="${t.id}"><div class="task-editor-grid"><input type="text" name="t" value="${esc(t.t)}" required><input type="date" name="due" value="${t.due||""}" required><input type="text" name="cat" value="${esc(t.cat||"")}" placeholder="Category (optional)"><input type="text" name="group" value="${esc(t.group||"")}" placeholder="Group (optional)"><label class="task-editor-check"><input type="checkbox" name="ms" ${t.ms?"checked":""}> Milestone</label></div><label class="subtask-editor-label">Subtasks<textarea name="subtasks" rows="3" placeholder="One subtask per line">${(t.subtasks||[]).map(s=>esc(s.t)).join("\n")}</textarea></label><div class="task-editor-actions"><button type="submit"><i data-lucide="check"></i> Save</button><button type="button" class="ghost" data-a="canceltask">Cancel</button></div></form>`;
  const subtasks=t.subtasks||[],subtaskMarkup=subtasks.length?`<div class="task-subtasks">${subtasks.map(s=>`<div class="subtask-row"><input type="checkbox" data-a="subtask" data-id="${t.id}" data-subid="${s.id}" ${s.done?"checked":""}><span class="${s.done?"done":""}">${esc(s.t)}</span><button class="ghost" data-a="delsubtask" data-id="${t.id}" data-subid="${s.id}" aria-label="Delete subtask"><i data-lucide="x"></i></button></div>`).join("")}</div>`:"";
  return `<div class="card task-row"><div class="row"><input type="checkbox" data-a="task" data-id="${t.id}" ${t.done?"checked":""}><div class="g"><span class="${t.done?"done":""}">${t.ms?'<i data-lucide="diamond" class="inline-icon"></i> ':""}${esc(t.t)}</span><div class="mut">${t.cat?`<span class="task-category">${esc(t.cat)}</span> · `:""}${!hideGroup&&t.group?`<span class="task-group-label">${esc(t.group)}</span> · `:""}${context}${t.due?` · <span class="${late?"warn":""}">${late?"overdue ":""}${t.due}</span>`:` · <span class="warn">No deadline</span>`}</div></div><button class="ghost" data-a="edittask" data-id="${t.id}" aria-label="Edit task"><i data-lucide="pencil"></i></button><button class="ghost task-delete" data-a="deltask" data-id="${t.id}" aria-label="Delete task"><i data-lucide="trash-2"></i></button></div>${subtaskMarkup}</div>`}
function projectTasksView(g,p){
  const grouped=new Map(),singles=[];p.tasks.forEach(t=>{if(t.group){if(!grouped.has(t.group))grouped.set(t.group,[]);grouped.get(t.group).push(t)}else singles.push(t)});
  const groupRows=[...grouped].map(([name,tasks])=>`<div class="task-group"><div class="task-group-head"><i data-lucide="layers-2"></i><strong>${esc(name)}</strong><span>${tasks.filter(t=>t.done).length}/${tasks.length}</span></div>${tasks.map(t=>taskRow({t,g,p},true).replace('class="card task-row"','class="task-row task-line"')).join("")}</div>`).join("");
    return groupRows+singles.map(t=>taskRow({t,g,p}).replace('class="card task-row"','class="task-row task-line"')).join("");
}

function goals(){
  const list=S.goals.filter(g=>g.month===gm).sort((a,b)=>(a.pri||99)-(b.pri||99));
  let h=`<h1>Goals</h1><div class="row sub"><input type="month" id="gm" value="${gm}"><span>Keep the month focused. Open a project when you need the details.</span></div>
  <form class="add" data-f="goal"><input type="text" name="t" placeholder="New goal for ${mname(gm)}" required>${catSel}<button>Add goal</button></form>`;
  h+=list.map(g=>{const goalTasks=(S.tasks||[]).filter(t=>t.goalId===g.id),total=tasksOf(g).length,editing=editingGoal===g.id,goalTaskMarkup=goalTasks.length?`<div class="task-group"><div class="task-group-head"><i data-lucide="target"></i><strong>Goal tasks</strong><span>${goalTasks.filter(t=>t.done).length}/${goalTasks.length}</span></div>${goalTasks.map(t=>taskRow({t,g,p:null},true).replace('class="card task-row"','class="task-row task-line"')).join("")}</div>`:"";return `<div class="card goal-card">${editing?`<form class="goal-editor" data-f="editgoal" data-id="${g.id}"><div class="editor-heading"><span class="eyebrow">EDIT GOAL</span><button type="button" class="ghost" data-a="cancelgoal" aria-label="Cancel editing"><i data-lucide="x"></i></button></div><div class="editor-grid"><label>Goal name<input type="text" name="title" value="${esc(g.title)}" required></label><label>Category<select name="cat">${CATS.map(c=>`<option ${c===g.cat?"selected":""}>${c}</option>`).join("")}</select></label><label>Priority<input type="number" name="pri" min="1" max="99" value="${g.pri||""}></label></div><div class="editor-actions"><button type="submit"><i data-lucide="check"></i> Save changes</button><button type="button" class="ghost" data-a="cancelgoal">Cancel</button></div></form>`:`<div class="goal-head"><div class="g"><div class="goal-title"><span class="priority">${g.pri?`P${g.pri}`:""}</span><b>${esc(g.title)}</b></div><div class="goal-meta"><span class="tag">${esc(g.cat)}</span><span>${g.projects.length} projects · ${total} tasks</span></div></div><strong class="goal-percent">${prog(g)}%</strong><button class="ghost" data-a="editgoal" data-id="${g.id}" aria-label="Edit goal"><i data-lucide="pencil"></i></button><button class="ghost" data-a="delgoal" data-id="${g.id}" aria-label="Delete goal"><i data-lucide="trash-2"></i></button></div>`}${bar(prog(g))}
  <div class="project-list">${goalTaskMarkup}${g.projects.map(p=>{const done=p.tasks.filter(t=>t.done).length;return `<details class="project-block"><summary><span class="project-name"><i data-lucide="folder-kanban" class="inline-icon"></i>${esc(p.title)}</span><span class="project-count">${done}/${p.tasks.length}</span><button class="ghost" data-a="delproj" data-id="${p.id}" aria-label="Delete project"><i data-lucide="x"></i></button></summary>
  <div class="project-content">${projectTasksView(g,p)||`<div class="mut empty-project">No tasks yet.</div>`}
  <form class="add" data-f="task" data-id="${p.id}"><input type="text" name="t" placeholder="Add a task" required><input type="date" name="due" required><input type="text" name="cat" placeholder="Category (optional)"><label class="mut"><input type="checkbox" name="ms"> <i data-lucide="diamond" class="inline-icon"></i></label><button aria-label="Add task"><i data-lucide="plus"></i></button></form><form class="task-group-form" data-f="taskgroup" data-id="${p.id}"><div class="group-form-title"><i data-lucide="layers-2"></i><strong>Add a task group</strong><span>One task per line</span></div><input type="text" name="group" placeholder="e.g. Design 6 flyers" required><input type="text" name="cat" placeholder="Category for this group (optional)"><textarea name="items" rows="4" placeholder="Flyer 1\nFlyer 2\nFlyer 3" required></textarea><div class="group-form-row"><input type="date" name="due" required><button type="submit"><i data-lucide="list-plus"></i> Add group</button></div></form></div></details>`}).join("")||`<div class="mut empty-project">Add a project to start breaking this goal down.</div>`}</div>
  <form class="add project-add" data-f="proj" data-id="${g.id}"><input type="text" name="t" placeholder="Add a project" required><button class="ghost"><i data-lucide="plus"></i> Project</button></form></div>`}).join("")||`<div class="card mut">No goals for this month yet.</div>`;
  return h}

function tasks(){
  const today=td(),items=allTasks().slice().sort((a,b)=>(a.t.done-b.t.done)||(a.t.due||"9999").localeCompare(b.t.due||"9999")),open=items.filter(x=>!x.t.done),done=items.filter(x=>x.t.done),due=open.filter(x=>x.t.due===today).length,overdue=open.filter(x=>x.t.due&&x.t.due<today).length;
  const goalOptions=S.goals.slice().sort((a,b)=>a.title.localeCompare(b.title)).map(g=>`<option value="${esc(g.id)}">Goal: ${esc(g.title)} · ${esc(g.month)}</option>`).join("");
  const section=(label,list,empty)=>`<section class="task-section"><div class="section-heading"><div><span class="eyebrow">${label.toUpperCase()}</span><h2>${label}</h2></div><span class="section-count">${list.length}</span></div>${list.map(x=>taskRow(x)).join("")||`<div class="empty-analytics">${empty}</div>`}</section>`;
  return `<div class="tasks-page"><div class="analytics-kicker">DAILY OPERATIONS</div><div class="analytics-title-row"><div><h1>Tasks</h1><div class="analytics-subtitle">Turn your monthly goals into clear next actions.</div></div><div class="task-header-actions"><span class="analytics-live"><i></i> ${due} due today</span><button class="danger-button" data-a="delalltasks"><i data-lucide="trash-2"></i> Delete all</button></div></div>
    <div class="task-summary"><div><strong data-count="${open.length}">0</strong><span>open tasks</span></div><div><strong data-count="${due}">0</strong><span>due today</span></div><div><strong data-count="${overdue}">0</strong><span>overdue</span></div><div><strong data-count="${done.length}">0</strong><span>completed</span></div></div>
  <form class="task-compose" data-f="taskPage"><div class="compose-title"><i data-lucide="plus-circle"></i><strong>Add a task</strong><span>Keep it independent or link it to a goal.</span></div><div class="compose-grid"><input type="text" name="t" placeholder="What needs to get done?" required><input type="date" name="due" value="${today}" required><input type="text" name="cat" placeholder="Category (optional)"><select name="goalId" aria-label="Goal association"><option value="">Independent task</option>${goalOptions}</select><input type="text" name="group" placeholder="Group (optional)"><button type="submit"><i data-lucide="plus"></i> Add task</button></div></form>
  ${section("Overdue",open.filter(x=>x.t.due&&x.t.due<today),"Nothing overdue. Keep the pace.")}${section("Today",open.filter(x=>x.t.due===today),"No tasks due today.")}${section("Upcoming",open.filter(x=>!x.t.due||x.t.due>today),"Your upcoming list is clear.")}${section("Completed",done.slice().sort((a,b)=>(b.t.doneOn||"").localeCompare(a.t.doneOn||"")),"Complete a task and it will appear here.")}</div>`;
}

function scheduler(){
  const date=schedulerDate||td(),scheduled=allTasks().filter(x=>x.t.due===date),done=scheduled.filter(x=>x.t.done).length,open=scheduled.filter(x=>!x.t.done),groups=new Map();open.forEach(x=>{const key=x.t.group||"Ungrouped";if(!groups.has(key))groups.set(key,[]);groups.get(key).push(x)});
  const rows=[...groups].map(([name,list])=>`<section class="schedule-group"><div class="schedule-group-head"><i data-lucide="layers-2"></i><strong>${esc(name)}</strong><span>${list.length} ${list.length===1?"task":"tasks"}</span></div>${list.map(x=>taskRow(x)).join("")}</section>`).join("");
  return `<div class="scheduler-page"><div class="analytics-kicker">DAILY SCHEDULER</div><div class="analytics-title-row"><div><h1>${new Date(date+"T12:00").toLocaleDateString(undefined,{weekday:"long",month:"long",day:"numeric"})}</h1><div class="analytics-subtitle">A focused plan for the day, connected to your goals.</div></div><label class="schedule-date"><span>Schedule date</span><input type="date" id="scheduleDate" value="${date}"></label></div><section class="schedule-summary"><div class="schedule-progress"><div class="schedule-progress-label"><strong>${done}/${scheduled.length}</strong><span>complete</span></div><div class="schedule-progress-bar"><i style="width:${scheduled.length?Math.round(done/scheduled.length*100):0}%"></i></div></div><div><strong>${open.length}</strong><span>open tasks</span></div><div><strong>${scheduled.filter(x=>x.t.group).length}</strong><span>grouped tasks</span></div></section><div class="schedule-actions"><button class="ghost" data-a="scheduler-prev"><i data-lucide="chevron-left"></i> Previous</button><button class="ghost" data-a="scheduler-today">Today</button><button class="ghost" data-a="scheduler-next">Next <i data-lucide="chevron-right"></i></button></div>${rows||`<div class="empty-analytics">No tasks scheduled for this day. Add a deadline from the Tasks page.</div>`}</div>`;
}

function habits(){
  const dailyHabits=S.habits.filter(habit=>habit.kind!=="weekly");
  let h=`<h1>Habits</h1><div class="sub">Daily practices that build streaks. Each habit gets 3 automatic freeze days per calendar month; the allowance renews at the start of each month.</div>`;
  if(dailyHabits.length)h+=`<section class="card streak-freeze-summary" aria-label="Monthly streak freeze balances"><div class="streak-freeze-summary-head"><i data-lucide="snowflake"></i><div><strong>Monthly streak freezes</strong><span>Unused days renew at the start of each month. Completed days count normally; freezes cover missed days only.</span></div></div><div class="streak-freeze-balances">${dailyHabits.map(habit=>{const balance=streak(habit);return `<div class="streak-freeze-balance"><span>${esc(habit.name)}</span><strong>${balance.freezeDaysRemaining} of ${STREAK_FREEZE_DAYS} left</strong></div>`}).join("")}</div></section>`;
  h+=`
  <form class="add" data-f="habit"><input type="text" name="t" placeholder="e.g. Prayer, Bible reading, Book" required><input type="number" name="tg" min="1" placeholder="Daily target" style="width:110px"><select name="u" aria-label="Habit unit"><option value="">Count</option><option value="minutes">Minutes</option><option value="chapters">Chapters</option><option value="pages">Pages</option><option value="sessions">Sessions</option><option value="repetitions">Repetitions</option></select>${catSel}<button>Add</button></form>`;
  const t=td(),days=[...Array(14)].map((_,i)=>addDays(t,i-13));
  h+=S.habits.map(x=>{
   const currentStreak=x.kind==="weekly"?null:streak(x);
   return `<div class="card"><div class="row"><div class="g"><b>${esc(x.name)}</b> <span class="tag">${esc(x.cat)}</span></div>${currentStreak?`<span class="tag"><i data-lucide="flame" class="tag-icon"></i> ${currentStreak.days}</span>`:`<span class="tag">${weekCount(x)}/${x.target} this week</span>`}<button class="ghost" data-a="delhab" data-id="${x.id}"><i data-lucide="x"></i></button></div>
  <div class="row" style="gap:3px;margin-top:8px">${days.map(d=>{const frozen=currentStreak?.frozenDates.has(d);return `<span title="${d}${frozen?" · streak frozen":""}" style="flex:1;height:18px;border-radius:4px;background:${ok(x,d)?"var(--ac)":frozen?"color-mix(in srgb, var(--ac) 42%, var(--ac2))":"var(--ac2)"}"></span>`}).join("")}</div><div class="mut">Last 14 days</div></div>`;
  }).join("");
  return h}

function review(){
  const t=td(),wk=[addDays(t,-6),t],mf=mon()+"-01";
  const ws=stats(...wk),ms=stats(mf,t),cur=S.goals.filter(g=>g.month===mon());
  const avg=cur.length?Math.round(cur.reduce((a,g)=>a+prog(g),0)/cur.length):0;
  const sum=(label,s)=>`${s.done} tasks completed${s.habit!=null?`, habits ${s.habit}% consistent`:""}`;
  const form=(type,s)=>`<div class="card"><b>${type==="week"?"Weekly review":"Monthly review"}</b><div class="mut" style="margin:4px 0 8px">Auto summary: ${sum(type,s)}${type==="month"?`, goals ${avg}% complete`:""}.</div>
  <form data-f="review" data-type="${type}"><textarea name="w" placeholder="Wins" required></textarea><textarea name="c" placeholder="What got in the way?"></textarea><textarea name="n" placeholder="Focus for next ${type}"></textarea><button>Save review</button></form></div>`;
  let h=`<h1>Reviews</h1><div class="sub">A few minutes of reflection keeps you honest.</div>`+form("week",ws)+form("month",ms);
  h+=`<h2>Past reviews</h2>`+(S.reviews.slice().reverse().map((r,index)=>`<div class="card"><div class="mut">${r.type==="week"?"Week":"Month"} · ${r.date}</div><div class="mut">${esc(r.auto)}</div><p><b>Wins:</b> ${esc(r.w)}</p>${r.c?`<p><b>Obstacles:</b> ${esc(r.c)}</p>`:""}${r.n?`<p><b>Next:</b> ${esc(r.n)}</p>`:""}${r.type==="week"&&r.weeklySummary?`<button type="button" class="ghost review-recap-open" data-a="recap-open" data-review-index="${S.reviews.length-1-index}"><i data-lucide="book-open-check"></i> View weekly recap</button>`:""}</div>`).join("")||`<div class="card mut">No reviews saved yet.</div>`);
  if(reviewRecap)h+=weeklyReviewPopup(reviewRecap,reviewRecapPage);
  return h}

function buildWeeklyReviewSummary(start,end){
  const days=[...Array(7)].map((_,index)=>addDays(start,index));
  const goals=S.goals.map(goal=>{
    const tasks=tasksOf(goal),active=tasks.filter(task=>(task.due>=start&&task.due<=end)||(task.doneOn>=start&&task.doneOn<=end)),completed=tasks.filter(task=>task.done&&task.doneOn>=start&&task.doneOn<=end);
    return{title:goal.title,category:goal.cat||"Other",done:completed.length,active:active.length,progress:prog(goal),completedTasks:completed.map(task=>task.t)};
  });
  const habits=S.habits.map(habit=>{
    const values=days.map(date=>Number(habit.log?.[date])||0),total=values.reduce((sum,value)=>sum+value,0),met=habit.kind==="weekly"?(total>=(habit.target||1)?1:0):values.filter(value=>value>=(habit.target||1)).length;
    return{name:habit.name,category:habit.cat||"Other",unit:habit.unit||"",target:habit.target||1,kind:habit.kind||"daily",total,daysLogged:values.filter(value=>value>0).length,met,values};
  });
  return{start,end,goals,habits};
}
function weeklyReviewPopup(summary,page){
  const habits=summary.habits.filter(habit=>habit.total>0),goalDone=summary.goals.reduce((sum,goal)=>sum+goal.done,0),goalActive=summary.goals.reduce((sum,goal)=>sum+goal.active,0);
  const unitTotal=unit=>habits.filter(habit=>habit.unit.toLowerCase()===unit).reduce((sum,habit)=>sum+habit.total,0);
  const prayerMinutes=habits.filter(habit=>["minutes","minute","mins","min"].includes(habit.unit.toLowerCase())&&(`${habit.name} ${habit.category}`).toLowerCase().includes("prayer")).reduce((sum,habit)=>sum+habit.total,0);
  const bibleChapters=habits.filter(habit=>["chapters","chapter"].includes(habit.unit.toLowerCase())&&(`${habit.name} ${habit.category}`).toLowerCase().match(/bible|scripture/)).reduce((sum,habit)=>sum+habit.total,0);
  const pagesRead=unitTotal("pages")+habits.filter(habit=>habit.unit.toLowerCase()==="page").reduce((sum,habit)=>sum+habit.total,0);
  const pages=[
    `<div class="recap-hero"><span class="eyebrow">YOUR WEEK, IN REVIEW</span><h2>A week of showing up.</h2><p>${summary.start} – ${summary.end}</p></div><div class="recap-metrics"><div><strong>${goalDone}</strong><span>goal tasks completed</span></div><div><strong>${habits.reduce((sum,habit)=>sum+habit.met,0)}</strong><span>habit targets met</span></div><div><strong>${prayerMinutes}</strong><span>minutes in prayer</span></div><div><strong>${bibleChapters}</strong><span>Bible chapters read</span></div><div><strong>${pagesRead}</strong><span>pages read</span></div></div><p class="recap-note">${goalActive?`${goalDone} of ${goalActive} goal tasks in this week’s plan were completed.`:"Your goals are captured here as you start adding tasks."} Your recap is saved with this review.</p>`,
    `<div class="recap-heading"><span class="eyebrow">GOAL REVIEW · 02</span><h2>What moved forward</h2><p>Percentages show overall goal progress at submission; task counts are for this week.</p></div><div class="recap-list">${summary.goals.map(goal=>`<article class="recap-row"><div class="recap-row-heading"><span><strong>${esc(goal.title)}</strong><small>${esc(goal.category)}</small></span><b>${goal.progress}%</b></div><div class="recap-progress"><i style="width:${goal.progress}%"></i></div><p>${goal.done} completed this week${goal.active?` · ${goal.active} tasks planned or completed`:` · No tasks planned this week`}</p>${goal.completedTasks.length?`<small class="recap-detail">${goal.completedTasks.map(esc).join(" · ")}</small>`:""}</article>`).join("")||`<p class="recap-empty">No goals yet. Add a goal and its task progress will appear here next week.</p>`}</div>`,
    `<div class="recap-heading"><span class="eyebrow">HABIT REVIEW · 03</span><h2>Your effort, counted</h2><p>Quantities come directly from your daily habit entries.</p></div><div class="recap-list">${habits.map(habit=>{const unit=habit.unit.replace(/s$/i,habit.target===1?"":"s");return `<article class="recap-row"><div class="recap-row-heading"><span><strong>${esc(habit.name)}</strong><small>${esc(habit.category)}${habit.unit?` · ${esc(habit.unit)}`:""}</small></span><b>${habit.total}${habit.unit?` ${esc(habit.unit)}`:""}</b></div><p>${habit.kind==="weekly"?`${habit.met?"Weekly target met":"Weekly target not met"} · target ${habit.target}`:`${habit.daysLogged} days logged · ${habit.met}/7 daily targets met · target ${habit.target}${unit?` ${esc(unit)}`:""}`}</p></article>`}).join("")||`<p class="recap-empty">No habit quantities were logged this week. Your next check-in will show them here.</p>`}</div>`
  ];
  const labels=["Overview","Goals","Habits"];
  return `<div class="review-recap-backdrop" data-a="recap-backdrop"><section class="review-recap-dialog" role="dialog" aria-modal="true" aria-label="Weekly review recap"><header class="review-recap-top"><span class="recap-brand"><i data-lucide="sparkles"></i> WEEKLY REFLECTION</span><button type="button" class="ghost" data-a="recap-close" aria-label="Close weekly recap"><i data-lucide="x"></i></button></header><div class="review-recap-content">${pages[page]}</div><nav class="recap-pages" aria-label="Recap pages">${labels.map((label,index)=>`<button type="button" data-a="recap-page" data-page="${index}" class="${index===page?"active":""}" aria-label="${label}, page ${index+1}" aria-current="${index===page?"step":"false"}"><span>${String(index+1).padStart(2,"0")}</span><small>${label}</small></button>`).join("")}</nav><footer class="review-recap-footer"><span>Page ${page+1} of ${pages.length}</span><div>${page?`<button type="button" class="ghost" data-a="recap-prev"><i data-lucide="arrow-left"></i> Back</button>`:""}${page<pages.length-1?`<button type="button" data-a="recap-next">Continue <i data-lucide="arrow-right"></i></button>`:`<button type="button" data-a="recap-close">Done <i data-lucide="check"></i></button>`}</div></footer></section></div>`;
}

function weeklyEmailPreview(){
  const timezone=({"GMT+1":"Africa/Lagos","GMT+2":"Europe/Paris","GMT+5:30":"Asia/Kolkata"})[S.profile?.timezone||""]||S.profile?.timezone||"UTC";
  let parts;
  try{parts=new Intl.DateTimeFormat("en-US",{timeZone:timezone,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date())}
  catch{parts=new Intl.DateTimeFormat("en-US",{timeZone:"UTC",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date())}
  const part=type=>parts.find(value=>value.type===type)?.value||"",today=`${part("year")}-${part("month")}-${part("day")}`;
  const offset=(new Date(`${today}T12:00:00`).getDay()+6)%7,start=addDays(addDays(today,-offset),-7),end=addDays(start,6),days=[...Array(7)].map((_,index)=>addDays(start,index));
  const weekTasks=allTasks().filter(({t})=>t.due&&t.due>=start&&t.due<=end);
  const completed=weekTasks.filter(({t})=>t.done&&(!t.doneOn||t.doneOn<=end));
  const completionRate=weekTasks.length?Math.round(completed.length/weekTasks.length*100):0;
  const deadlinesMet=weekTasks.filter(({t})=>t.done&&t.doneOn&&t.doneOn<=t.due).length;
  const weekGoals=new Set(weekTasks.map(({g})=>g.id||g.title));
  const progressedGoals=new Set(completed.map(({g})=>g.id||g.title)).size;
  const habits=S.habits.map(habit=>habit.kind==="weekly"
    ?`<li>${esc(habit.name)}: ${days.reduce((sum,day)=>sum+(habit.log?.[day]||0),0)}/${habit.target||1} sessions</li>`
    :`<li>${esc(habit.name)}: ${days.filter(day=>(habit.log?.[day]||0)>=(habit.target||1)).length}/7 days</li>`);
  const sections=[["Tasks completed",`<strong>${completed.length}/${weekTasks.length}</strong>`],["Completion rate",`<strong>${completionRate}%</strong>`],["Goals progressed",`<strong>${progressedGoals}/${weekGoals.size}</strong>`],["Deadlines met",`<strong>${deadlinesMet}/${weekTasks.length}</strong>`],["Consistency",habits.length?`<ul>${habits.join("")}</ul>`:"<p>No habits tracked this week.</p>"]];
  const dateFormat={month:"long",day:"numeric",year:"numeric",timeZone:"UTC"},formatDate=date=>new Date(`${date}T12:00:00.000Z`).toLocaleDateString("en",dateFormat);
  return{subject:`Your weekly Hoptasks progress · ${formatDate(start)}`,html:`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#f3f7f4;color:#20312b;font:16px/1.6 Arial,sans-serif}main{max-width:600px;margin:24px auto;padding:32px;background:#fff;border:1px solid #dce8e2;border-radius:12px}.brand{color:#267b65;font-weight:bold;font-size:12px;letter-spacing:2px}h1{margin:12px 0 4px;font-size:27px}p{color:#687b72}section{padding:16px 0;border-top:1px solid #e5eee8}h2{margin:0 0 8px;font-size:17px}ul{margin:0;padding-left:20px}@media(max-width:640px){main{margin:8px;padding:24px 18px;border-radius:8px}}</style></head><body><main><div class="brand">HOPTASKS</div><h1>Your week in Hoptasks</h1><p>${formatDate(start)} – ${formatDate(end)}</p>${sections.map(([heading,content])=>`<section><h2>${heading}</h2>${content}</section>`).join("")}</main></body></html>`};
}

function accountabilityPartnerMarkup(partner={},index=0){
  const goals=S.goals||[],goalIds=Array.isArray(partner.goalIds)?partner.goalIds:[];
  return `<div class="accountability-partner" data-partner-row data-partner-id="${esc(partner.id||uid())}"><div class="accountability-partner-head"><strong>Partner ${index+1}</strong><button type="button" class="ghost" data-a="remove-accountability-partner" aria-label="Remove partner"><i data-lucide="x"></i></button></div><label>Email address<input type="email" data-partner-email value="${esc(partner.email||"")}" placeholder="partner@example.com" autocomplete="email"></label><fieldset class="accountability-goals"><legend>Goals they’ll support</legend>${goals.length?goals.map(goal=>`<label><input type="checkbox" data-partner-goal value="${esc(goal.id)}" ${goalIds.includes(goal.id)?"checked":""}><span>${esc(goal.title)}</span></label>`).join(""):'<p>Add a goal before assigning an accountability partner.</p>'}</fieldset></div>`;
}

function profilePage(){
  const p=S.profile||{name:"Your Name",email:"you@example.com",role:"Productive builder",theme:"forest",timezone:"UTC",bio:"Build deliberate momentum every day.",notifications:true};
  const onboardingResponses=p.onboardingResponses;
  const email={dailyReminder:p.notifications!==false,dailyTime:"08:00",weeklyMetrics:false,weeklyDay:1,monthlyWins:false,monthlyDay:1,weeklyQuote:false,weeklyQuoteDay:1,weeklyQuoteTime:"08:00",whatsNew:true,newsletter:true,...p.emailPreferences};
  const game=initRewards(),badges=game.badges.slice().sort((a,b)=>b.earnedOn.localeCompare(a.earnedOn));
  const timezone=({"GMT+1":"Africa/Lagos","GMT+2":"Europe/Paris","GMT+5:30":"Asia/Kolkata"})[p.timezone]||p.timezone||"UTC";
  const initials=(p.name||"YN").split(/\s+/).filter(Boolean).slice(0,2).map(word=>word[0]).join("").toUpperCase()||"YN";
  const activeStreaks=S.habits.filter(habit=>habit.kind!=="weekly"&&streak(habit).days>0).length;
  const themes=[{id:"forest",label:"Forest",color:"#267b65"},{id:"ocean",label:"Ocean",color:"#3578a8"},{id:"berry",label:"Berry",color:"#a84b70"},{id:"sunset",label:"Sunset",color:"#c36535"},{id:"slate",label:"Slate",color:"#60747d"}];
  const timezones=[['UTC','UTC'],['Africa/Lagos','Lagos (UTC+1)'],['Europe/Paris','Paris (UTC+1/+2)'],['Europe/London','London (UTC/+1)'],['America/New_York','New York'],['America/Chicago','Chicago'],['America/Los_Angeles','Los Angeles'],['Asia/Kolkata','India (UTC+5:30)'],['Asia/Tokyo','Tokyo'],['Australia/Sydney','Sydney']];
  let h=`<div class="profile-page"><header class="profile-header card"><div class="profile-cover"></div><div class="profile-identity"><div class="profile-photo-wrap"><div class="profile-avatar" aria-hidden="true">${p.photo?`<img src="${esc(p.photo)}" alt="">`:esc(initials)}</div><label class="profile-photo-upload"><i data-lucide="camera"></i><span>${p.photo?"Change photo":"Add photo"}</span><input class="profile-photo-input" type="file" accept="image/jpeg,image/png,image/webp" aria-label="${p.photo?"Change profile photo":"Add profile photo"}"></label>${p.photo?`<button type="button" class="profile-photo-remove" data-a="remove-profile-photo"><i data-lucide="x"></i> Remove</button>`:""}</div><div class="profile-heading"><span class="eyebrow">YOUR PROFILE</span><h1>${esc(p.name)}</h1><div class="profile-subtitle">${esc(p.role||"Build your momentum, one day at a time.")}</div><div class="profile-email">${esc(authUser?.email||p.email||"")}</div></div><button type="submit" class="profile-save-button" form="profile-settings-form"><i data-lucide="check"></i> Save changes</button></div><div class="profile-stats"><div><strong>${S.habits.length}</strong><span>habits</span></div><div><strong>${activeStreaks}</strong><span>active streaks</span></div><div><strong>${badges.length}</strong><span>badges earned</span></div></div></header>
  <div class="profile-shortcuts" role="navigation" aria-label="Profile sections"><a href="#profile-details"><i data-lucide="user-round"></i> Personal details</a><a href="#email-preferences"><i data-lucide="bell"></i> Email preferences</a><a href="#workspace-settings"><i data-lucide="sliders-horizontal"></i> Workspace</a><a href="#profile-badges"><i data-lucide="award"></i> Badges</a></div>
  <div class="settings-grid"><div class="profile-main-column"><div class="card profile-details" id="profile-details"><div class="section-heading"><div><span class="eyebrow">YOUR ACCOUNT</span><h2>Personal details</h2></div></div><form class="settings-form" id="profile-settings-form" data-f="profile">
  <div class="two-col"><label>Full name<input type="text" name="name" value="${esc(p.name)}" required></label><label>Contact email<input type="email" name="email" value="${esc(p.email)}" required></label></div>
  <label>How did you hear about us?<select name="referralSource"><option value="">Not specified</option>${REFERRAL_SOURCES.map(source=>`<option value="${esc(source)}" ${p.referralSource===source?"selected":""}>${esc(source)}</option>`).join("")}</select></label>
  <div class="two-col"><label>Role<input type="text" name="role" value="${esc(p.role)}" placeholder="Productive builder"></label><label>Timezone<select name="timezone">${timezones.map(([value,label])=>`<option value="${value}" ${timezone===value?"selected":""}>${label}</option>`).join("")}</select></label></div>
  <label>Bio<textarea name="bio" rows="3" placeholder="Tell us about your focus style">${esc(p.bio||"")}</textarea></label>
  <section class="accountability-settings" id="accountability-settings"><div class="section-heading"><div><span class="eyebrow">ACCOUNTABILITY</span><h2>Accountability partners</h2></div></div><p>Share task reminders and progress for selected goals with people who have agreed to receive updates.</p><div id="accountability-partner-list" class="accountability-partner-list">${(Array.isArray(p.accountabilityPartners)&&p.accountabilityPartners.length?p.accountabilityPartners:[{}]).map((partner,index)=>accountabilityPartnerMarkup(partner,index)).join("")}</div><button type="button" class="ghost" data-a="add-accountability-partner"><i data-lucide="plus"></i> Add partner</button></section>
  <div class="profile-form-actions"><button type="submit"><i data-lucide="check"></i> Save profile</button></div></form></div>
  <div class="card email-card" id="email-preferences"><form class="settings-form" data-f="profile-emails"><section class="email-preferences"><div class="section-heading"><div><span class="eyebrow">YOUR INBOX</span><h2>Email preferences</h2></div></div><p class="email-recipient">Account emails go to <strong>${esc(authUser?.email||"Sign in to enable email delivery")}</strong>. Scheduled updates also go to your selected partners.</p>
  <div class="email-setting"><label class="toggle-row"><input type="checkbox" name="dailyReminder" ${email.dailyReminder?"checked":""}> Daily task reminder</label><label class="email-select">Send at<input type="time" name="dailyTime" value="${esc(email.dailyTime||"08:00")}"></label><p>Includes tasks due today or overdue and habits still to complete.</p></div>
  <div class="email-setting"><label class="toggle-row"><input type="checkbox" name="weeklyMetrics" ${email.weeklyMetrics?"checked":""}> Weekly progress metrics</label><label class="email-select">Send each<select name="weeklyDay">${[[1,"Monday"],[2,"Tuesday"],[3,"Wednesday"],[4,"Thursday"],[5,"Friday"],[6,"Saturday"],[7,"Sunday"]].map(([value,label])=>`<option value="${value}" ${Number(email.weeklyDay||1)===value?"selected":""}>${label}</option>`).join("")}</select></label><p>Reports tasks completed, goals progressed, deadlines met, and habit consistency for the previous full week.</p></div>
  <button type="button" class="ghost weekly-preview-trigger" data-a="weekly-preview"><i data-lucide="mail-open"></i> Preview weekly email</button>
  <div class="email-setting"><label class="toggle-row"><input type="checkbox" name="weeklyQuote" ${email.weeklyQuote?"checked":""}> Weekly quote</label><label class="email-select">Send each<select name="weeklyQuoteDay">${[[1,"Monday"],[2,"Tuesday"],[3,"Wednesday"],[4,"Thursday"],[5,"Friday"],[6,"Saturday"],[7,"Sunday"]].map(([value,label])=>`<option value="${value}" ${Number(email.weeklyQuoteDay||1)===value?"selected":""}>${label}</option>`).join("")}</select></label><label class="email-select">Send at<input type="time" name="weeklyQuoteTime" value="${esc(email.weeklyQuoteTime||"08:00")}"></label><p>A separate weekly email with a short Hoptasks encouragement.</p></div>
  <div class="email-setting"><label class="toggle-row"><input type="checkbox" name="monthlyWins" ${email.monthlyWins?"checked":""}> Monthly wins recap</label><label class="email-select">Send on day<select name="monthlyDay">${[1,5,10,15,20,25].map(day=>`<option value="${day}" ${Number(email.monthlyDay||1)===day?"selected":""}>${day===1?"1st":`${day}th`} of the month</option>`).join("")}</select></label><p>Celebrates last month’s completed tasks, finished goals, habits, and review wins.</p></div>
  <div class="email-setting"><label class="toggle-row"><input type="checkbox" name="whatsNew" ${email.whatsNew?"checked":""}> Product announcements / what’s new</label><p>Enabled by default. Turn this off here or use an email’s unsubscribe link.</p></div>
  <div class="email-setting"><label class="toggle-row"><input type="checkbox" name="newsletter" ${email.newsletter?"checked":""}> Hoptasks newsletter</label><p>Enabled by default and managed separately from account reminders and metrics.</p></div>
  <button type="submit"><i data-lucide="check"></i> Save email preferences</button></section></form></div></div><aside class="profile-side-column">${onboardingResponses?`<section class="card onboarding-responses"><div class="section-heading"><div><span class="eyebrow">WELCOME QUESTIONS</span><h2>Your onboarding responses</h2></div></div><div class="mini-stat-list"><div class="mini-stat"><span>First name</span><strong>${esc(onboardingResponses.firstName||"Not provided")}</strong></div><div class="mini-stat"><span>Last name</span><strong>${esc(onboardingResponses.lastName||"Not provided")}</strong></div><div class="mini-stat"><span>How you heard about us</span><strong>${esc(onboardingResponses.referralSource||"Not provided")}</strong></div><div class="mini-stat"><span>Your first goal</span><strong>${esc(onboardingResponses.firstGoal||"Not provided")}</strong></div><div class="mini-stat"><span>Completed</span><strong>${onboardingResponses.completedAt?new Date(onboardingResponses.completedAt).toLocaleDateString():""}</strong></div></div></section>`:""}
  <div class="card workspace-card" id="workspace-settings"><div class="section-heading"><div><span class="eyebrow">PREFERENCES</span><h2>Workspace</h2></div></div><div class="mini-stat-list"><div class="mini-stat"><span>Last sign-in</span><strong>${authUser?authUser.email||"Signed in":"Local only"}</strong></div><div class="mini-stat"><span>Data mode</span><strong>${authUser&&cloudHydrated?"Synced":"Local safe"}</strong></div></div><form class="settings-form" data-f="profile-theme"><fieldset class="theme-picker"><legend>Theme color</legend><div class="theme-options">${themes.map(theme=>`<label class="theme-choice"><input type="radio" name="theme" value="${theme.id}" ${p.theme===theme.id?"checked":""}><span class="theme-swatch" style="--swatch:${theme.color}"></span><span>${theme.label}</span></label>`).join("")}</div><button type="submit" class="ghost">Apply theme</button></fieldset></form></div></aside></div></div>`;
  if(authUser?.app_metadata?.email_admin===true)h+=`<section class="card email-campaign-admin"><div class="section-heading"><div><span class="eyebrow">ADMIN</span><h2>What's new and newsletters</h2></div></div><p>Write a product update or newsletter and schedule when opted-in users receive it.</p><form class="settings-form" data-f="email-campaign"><label>Campaign type<select name="campaignType"><option value="whats_new">What's new / product announcement</option><option value="newsletter">Newsletter</option></select></label><label>Internal title<input name="title" required maxlength="100" placeholder="October product update"></label><label>Email subject<input name="subject" required maxlength="150"></label><label>Message<textarea name="content" rows="6" required maxlength="10000" placeholder="Write the email text. Each new line becomes a paragraph."></textarea></label><label>Publish at<input type="datetime-local" name="publishAt" required></label><button type="submit">Schedule email</button></form><h3>Recent scheduled campaigns</h3><button type="button" class="ghost" data-a="refresh-email-campaigns">Refresh campaigns</button><div class="email-campaign-list">${emailCampaigns.map(campaign=>`<div class="email-campaign-row"><strong>${esc(campaign.title)}</strong><span>${campaign.campaign_type==="newsletter"?"Newsletter":"What's new"} · ${new Date(campaign.publish_at).toLocaleString()}</span></div>`).join("")||"<p>No campaigns found.</p>"}</div></section>`;
  if(weeklyPreviewOpen)h+=`<div class="weekly-preview-backdrop" data-a="weekly-preview-backdrop"><section class="weekly-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="weekly-preview-title"><header class="weekly-preview-header"><div><h2 id="weekly-preview-title">Weekly email preview</h2><p>Previous full week · uses your saved data · does not send</p><strong id="weekly-preview-subject"></strong></div><button type="button" class="ghost" data-a="weekly-preview-close" aria-label="Close preview"><i data-lucide="x"></i></button></header><iframe id="weekly-email-preview" title="Weekly email content" sandbox></iframe></div>`;
  h+=`<section class="card badges-card" id="profile-badges"><div class="section-heading"><div><span class="eyebrow">YOUR MILESTONES</span><h2>Badges</h2></div><span class="badge-total">${badges.length}</span></div><div class="badge-list">${badges.map(badge=>`<article class="badge-item"><span class="badge-mark"><i data-lucide="award"></i></span><div><strong>${esc(badge.title)}</strong><p>${esc(badge.description)}</p><time datetime="${esc(badge.earnedOn)}">Earned ${new Date(`${badge.earnedOn}T12:00`).toLocaleDateString()}</time></div></article>`).join("")||`<div class="badges-empty"><i data-lucide="sparkles"></i><strong>Your first badge is waiting.</strong><span>Finish a project or goal to earn one.</span></div>`}</div><div class="personal-best"><i data-lucide="trophy"></i><span>Personal best</span><strong>${game.personalBestTasks} tasks in one week</strong></div></section>`;
  return h}

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
  const previewFrame=document.getElementById("weekly-email-preview");if(previewFrame){const preview=weeklyEmailPreview();document.getElementById("weekly-preview-subject").textContent=preview.subject;previewFrame.srcdoc=preview.html}
  if(tab==="profile"&&authUser?.app_metadata?.email_admin===true)loadEmailCampaigns();
  const titles={today:"Today",goals:"Goals",tasks:"Tasks",scheduler:"Scheduler",habits:"Habits",review:"Reviews",history:"Growth",profile:"Profile"};
  const initials=(S.profile?.name||"Your Name").split(/\s+/).filter(Boolean).slice(0,2).map(word=>word[0]).join("").toUpperCase()||"YN";
  document.getElementById("topbar").innerHTML=`<div class="crumb"><span>Workspace</span><b>/</b><strong>${titles[tab]}</strong></div><div class="top-actions"><span class="top-date">${new Date().toLocaleDateString(undefined,{weekday:"short",month:"short",day:"numeric"})}</span>${notificationCenter()}<button class="top-logout" data-a="logout" aria-label="Log out"><i data-lucide="log-out"></i><span>Log out</span></button><span class="avatar">${S.profile?.photo?`<img src="${esc(S.profile.photo)}" alt="">`:initials}</span></div>`;
  const items=[["today","Today","layout-dashboard","Now"],["goals","Goals","target","Goals"],["tasks","Tasks","list-checks","Tasks"],["scheduler","Schedule","calendar-clock","Plan"],["habits","Habits","flame","Habits"],["review","Review","notebook-pen","Rev"],["history","Growth","chart-no-axes-combined","Stats"]],mobileNav=window.matchMedia("(max-width: 900px)").matches,mainItems=mobileNav?items.filter(item=>["today","goals","tasks","habits"].includes(item[0])):items,navButton=item=>`<button data-tab="${item[0]}" aria-label="${item[1]}" title="${item[1]}" class="${tab===item[0]?"on":""}"><i data-lucide="${item[2]}" class="nav-icon"></i><span data-short="${item[3]}">${item[1]}</span></button>`,moreTabs=[["scheduler","Schedule","calendar-clock"],["review","Reviews","notebook-pen"],["history","Growth","chart-no-axes-combined"],["profile","Profile","user-round"]],moreActive=moreTabs.some(item=>item[0]===tab);
  document.body.dataset.theme=["forest","ocean","berry","sunset","slate"].includes(S.profile?.theme)?S.profile.theme:"forest";
  document.getElementById("nav").innerHTML=`<div class="brand"><span class="brand-mark"><i data-lucide="sparkles"></i></span><span>Hoptasks</span></div><div class="nav-label">Workspace</div>${mainItems.map(navButton).join("")}${mobileNav?`<button data-a="mobile-more" aria-label="More navigation" aria-controls="mobile-more-panel" aria-expanded="${mobileMoreOpen}" class="${moreActive?"on":""}"><i data-lucide="ellipsis" class="nav-icon"></i><span data-short="More">More</span></button>${mobileMoreOpen?`<div id="mobile-more-panel" class="mobile-more-panel" role="menu"><div class="mobile-more-heading">More</div>${moreTabs.map(item=>`<button type="button" role="menuitem" data-tab="${item[0]}" class="${tab===item[0]?"current":""}"><i data-lucide="${item[2]}" class="nav-icon"></i><span>${item[1]}</span></button>`).join("")}</div>`:""}`:`<div class="sidebar-foot"><button data-tab="profile" aria-label="Profile" title="Profile" class="${tab==="profile"?"on":""}"><i data-lucide="user-round" class="nav-icon"></i><span data-short="Me">Profile</span></button></div>`}`;
  if(window.lucide)lucide.createIcons();
  revealOnScroll();
  if(tab==="history"||tab==="tasks"){animateAnalyticsNumbers();if(tab==="history")bindAnalyticsChart()}
  const m=document.getElementById("gm");if(m)m.onchange=e=>{gm=e.target.value||mon();render()};const am=document.getElementById("analyticsMonth");if(am)am.onchange=e=>{analyticsMonth=e.target.value||mon();analyticsFocus=null;render()};const sd=document.getElementById("scheduleDate");if(sd)sd.onchange=e=>{schedulerDate=e.target.value||td();render()}}

document.addEventListener("click",e=>{
  if(e.target.closest("[data-a=auth-switch]")){authMode=authMode==="login"?"signup":"login";showAuth();return}
  if(e.target.closest("[data-a=auth-reset]")){authMode="reset";showAuth();return}
  if(e.target.closest("[data-a=auth-back]")){authMode="login";showAuth();return}
  const n=e.target.closest("[data-tab]");if(n){tab=n.dataset.tab;mobileMoreOpen=false;notificationOpen=false;analyticsFocus=null;editingGoal=null;editingTask=null;render();return}
  const control=e.target.closest("[data-a]"),a=control?.dataset.a,id=control?.dataset.id;if(!a)return;
  if(a==="mobile-more"){mobileMoreOpen=!mobileMoreOpen;render();return}
  if(a==="notifications"){notificationOpen=!notificationOpen;render();return}
  if(a==="next-thought"){rotateFocusThought();return}
  if(a==="add-accountability-partner"){const list=document.getElementById("accountability-partner-list");if(list){list.insertAdjacentHTML("beforeend",accountabilityPartnerMarkup({},list.querySelectorAll("[data-partner-row]").length));if(window.lucide)lucide.createIcons()}return}
  if(a==="remove-accountability-partner"){const list=document.getElementById("accountability-partner-list");control.closest("[data-partner-row]")?.remove();if(list&&!list.querySelector("[data-partner-row]"))list.insertAdjacentHTML("beforeend",accountabilityPartnerMarkup({},0));if(window.lucide)lucide.createIcons();return}
  if(a==="refresh-email-campaigns"){emailCampaignsLoaded=false;loadEmailCampaigns();return}
  if(a==="weekly-preview"){weeklyPreviewOpen=true;render();return}
  if(a==="weekly-preview-close"||(a==="weekly-preview-backdrop"&&e.target===control)){weeklyPreviewOpen=false;render();return}
  if(a==="recap-close"||(a==="recap-backdrop"&&e.target===control)){reviewRecap=null;render();return}
  if(a==="recap-open"){const saved=S.reviews[Number(control.dataset.reviewIndex)];if(saved?.weeklySummary){reviewRecap=saved.weeklySummary;reviewRecapPage=0;render()}return}
  if(a==="recap-next"){reviewRecapPage=Math.min(2,reviewRecapPage+1);render();return}
  if(a==="recap-prev"){reviewRecapPage=Math.max(0,reviewRecapPage-1);render();return}
  if(a==="recap-page"){reviewRecapPage=Math.max(0,Math.min(2,Number(control.dataset.page)||0));render();return}
  if(a==="focus"){analyticsFocus=id;render();return}
  if(a==="analytics-back"){analyticsFocus=null;render();return}
  if(a==="logout"){db?.auth.signOut();return}
  if(a==="remove-profile-photo"){S.profile=S.profile||{};delete S.profile.photo;const saved=save();render();if(saved)toast("Profile photo removed.");return}
  if(a==="delalltasks"&&confirm("Delete all tasks? This cannot be undone.")){S.goals.forEach(g=>g.projects.forEach(p=>p.tasks=[]));S.tasks=[];save();render();return}
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
    const rewards=x.t.done?updateRewards():null;save();if(rewards&&(rewards.earned.length||rewards.newPersonalBest))rewardToast(rewards);else if(x.t.done){if(x.g&&prog(x.g)===100)toast("Goal complete: "+x.g.title+". Well done.");else if(x.t.ms)toast("Milestone reached.")}render()}
  if(a==="deltask"&&confirm("Delete this task?")){S.goals.forEach(g=>g.projects.forEach(p=>p.tasks=p.tasks.filter(t=>t.id!==id)));S.tasks=(S.tasks||[]).filter(t=>t.id!==id);save();render()}
  if(a==="hab"){const h=S.habits.find(y=>y.id===id);if(e.target.checked)h.log[td()]=1;else delete h.log[td()];const rewards=e.target.checked?updateRewards():null;save();if(rewards&&(rewards.earned.length||rewards.newPersonalBest))rewardToast(rewards);render()}
  if(a==="sess"){const h=S.habits.find(y=>y.id===id);h.log[td()]=(h.log[td()]||0)+1;const rewards=updateRewards();save();if(rewards.earned.length||rewards.newPersonalBest)rewardToast(rewards);else toast(weekCount(h)>=h.target?"Weekly target hit!":"Session logged.");render()}
  if(a==="desess"){const h=S.habits.find(y=>y.id===id),count=h?.log[td()]||0;if(h&&count>0){if(count===1)delete h.log[td()];else h.log[td()]=count-1;save();toast("Today's session removed.");render()}}
  if(a==="delgoal"&&confirm("Delete this goal?")){S.goals=S.goals.filter(g=>g.id!==id);save();render()}
  if(a==="delproj"&&confirm("Delete this project?")){S.goals.forEach(g=>g.projects=g.projects.filter(p=>p.id!==id));save();render()}
  if(a==="delhab"&&confirm("Delete this habit?")){S.habits=S.habits.filter(h=>h.id!==id);save();render()}
});
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&reviewRecap){reviewRecap=null;render()}else if(e.key==="Escape"&&weeklyPreviewOpen){weeklyPreviewOpen=false;render()}else if(e.key==="Escape"&&mobileMoreOpen){mobileMoreOpen=false;render()}else if(e.key==="Escape"&&notificationOpen){notificationOpen=false;render()}});
document.addEventListener("submit",e=>{
  const form=e.target;
  if(form.dataset.f!=="auth"||authMode!=="signup")return;
  e.preventDefault();e.stopImmediatePropagation();
  if(!db){showAuth("Supabase is unavailable. Check your connection.");return}
  const data=new FormData(form),submitButton=form.querySelector('button[type="submit"]');
  if(submitButton)submitButton.disabled=true;
  db.auth.signUp({email:String(data.get("email")||""),password:String(data.get("password")||""),options:{emailRedirectTo:window.location.origin+window.location.pathname,data:{onboarding_required:true}}}).then(result=>{
    if(result.error)showAuth(authErrorMessage(result.error,authMode));
    else if(!result.data.session)showAuth("Check your email to confirm your account, then sign in.");
  }).catch(()=>showAuth("Authentication is unavailable. Please try again.")).finally(()=>{
    if(submitButton?.isConnected)submitButton.disabled=false;
  });
},true);
document.addEventListener("submit",e=>{
  const form=e.target;
  if(form.dataset.f!=="onboarding")return;
  const data=new FormData(form);
  S.profile=S.profile||{};
  S.profile.onboardingResponses={
    firstName:String(data.get("firstName")||"").trim(),
    lastName:String(data.get("lastName")||"").trim(),
    referralSource:String(data.get("referralSource")||""),
    firstGoal:String(data.get("firstGoal")||"").trim(),
    completedAt:new Date().toISOString()
  };
},true);
document.addEventListener("submit",async e=>{
  e.preventDefault();const f=e.target,k=f.dataset.f,id=f.dataset.id,d=new FormData(f),t=(d.get("t")||"").trim();
  if(k==="email-campaign"){if(authUser?.app_metadata?.email_admin!==true||!db){toast("Only an authorized email admin can schedule campaigns.");return}const title=String(d.get("title")||"").trim(),subject=String(d.get("subject")||"").trim(),content=String(d.get("content")||"").trim(),publishAt=new Date(String(d.get("publishAt")||""));if(!title||!subject||!content||!Number.isFinite(publishAt.getTime())||publishAt.getTime()<=Date.now()){toast("Enter a title, subject, message, and a future publish time.");return}const submitButton=f.querySelector('button[type="submit"]');if(submitButton)submitButton.disabled=true;(async()=>{try{const{error}=await db.from("email_campaigns").insert({campaign_type:String(d.get("campaignType")||"whats_new"),title,subject,content,publish_at:publishAt.toISOString(),created_by:authUser.id});if(error){toast("Could not schedule campaign: "+error.message);return}toast("Email campaign scheduled.");emailCampaignsLoaded=false;await loadEmailCampaigns();render()}catch(error){toast("Could not schedule campaign: "+String(error))}finally{if(submitButton)submitButton.disabled=false}})();return}
  if(k==="onboarding"){const firstName=String(d.get("firstName")||"").trim(),lastName=String(d.get("lastName")||"").trim(),firstGoal=String(d.get("firstGoal")||"").trim();S.profile=S.profile||{};S.profile.name=[firstName,lastName].filter(Boolean).join(" ");S.profile.email=authUser?.email||S.profile.email||"";S.profile.referralSource=String(d.get("referralSource")||"");S.profile.onboardingCompletedFor=authUser.id;if(firstGoal)S.goals.push({id:uid(),title:firstGoal,cat:"Other",month:mon(),pri:S.goals.filter(goal=>goal.month===mon()).length+1,projects:[]});save();authMode="login";document.body.classList.remove("auth-mode");document.getElementById("auth").innerHTML="";render();return}
  if(k==="auth"){if(!db){showAuth("Supabase is unavailable. Check your connection.");return}(async()=>{const email=String(d.get("email")||""),password=String(d.get("password")||""),submitButton=f.querySelector('button[type="submit"]');if(submitButton)submitButton.disabled=true;try{if(authMode==="update"){const confirmation=String(d.get("passwordConfirm")||"");if(password!==confirmation){showAuth("The passwords do not match.");return}const result=await db.auth.updateUser({password});if(result.error){showAuth(authErrorMessage(result.error,authMode));return}window.history.replaceState({},document.title,window.location.pathname);authMode="login";await loadCloud();return}const firstName=String(d.get("firstName")||"").trim(),lastName=String(d.get("lastName")||"").trim(),referralSource=String(d.get("referralSource")||""),firstGoal=String(d.get("firstGoal")||"").trim(),result=authMode==="reset"?await db.auth.resetPasswordForEmail(email,{redirectTo:window.location.href}):authMode==="login"?await db.auth.signInWithPassword({email,password}):await db.auth.signUp({email,password,options:{emailRedirectTo:window.location.origin+window.location.pathname,data:{first_name:firstName,last_name:lastName,full_name:[firstName,lastName].filter(Boolean).join(" "),referral_source:referralSource,first_goal:firstGoal}}});if(result.error){showAuth(authErrorMessage(result.error,authMode));return}else if(authMode==="reset")showAuth("Check your email for a secure password reset link.");else if(authMode==="signup"&&!result.data.session)showAuth("Check your email to confirm your account, then sign in.")}catch(error){showAuth("Authentication is unavailable. Please try again.")}finally{if(submitButton)submitButton.disabled=false}})();return}
  if(k==="profile-theme"){S.profile=S.profile||{};S.profile.theme=String(d.get("theme")||S.profile.theme||"forest");save();render();return}
  if(k==="profile-emails"){S.profile=S.profile||{};if(authUser&&db){try{for(const preference of ["whatsNew","newsletter"]){const{error}=await db.rpc("set_email_marketing_preference",{p_preference:preference,p_enabled:!!d.get(preference)});if(error){toast(`Could not update ${preference==="whatsNew"?"product announcement":"newsletter"} subscription: ${error.message}`);return}}}catch(error){toast(`Could not update campaign email preferences: ${String(error)}`);return}}S.profile.emailPreferences={dailyReminder:!!d.get("dailyReminder"),dailyTime:String(d.get("dailyTime")||"08:00"),weeklyMetrics:!!d.get("weeklyMetrics"),weeklyDay:Math.min(7,Math.max(1,Number(d.get("weeklyDay"))||1)),monthlyWins:!!d.get("monthlyWins"),monthlyDay:Math.min(28,Math.max(1,Number(d.get("monthlyDay"))||1)),weeklyQuote:!!d.get("weeklyQuote"),weeklyQuoteDay:Math.min(7,Math.max(1,Number(d.get("weeklyQuoteDay"))||1)),weeklyQuoteTime:String(d.get("weeklyQuoteTime")||"08:00"),whatsNew:!!d.get("whatsNew"),newsletter:!!d.get("newsletter")};S.profile.notifications=S.profile.emailPreferences.dailyReminder;save();render();return}
  if(k==="profile"){S.profile=S.profile||{};const partnerRows=[...f.querySelectorAll("[data-partner-row]")],partners=[],seenPartners=new Map();for(const row of partnerRows){const email=String(row.querySelector("[data-partner-email]")?.value||"").trim(),goalIds=[...row.querySelectorAll("[data-partner-goal]:checked")].map(input=>input.value);if(!email)continue;if(!goalIds.length){toast("Assign at least one goal to each accountability partner.");return}const emailKey=email.toLowerCase(),existing=seenPartners.get(emailKey);if(existing){existing.goalIds=[...new Set([...existing.goalIds,...goalIds])];continue}const partner={id:row.dataset.partnerId||uid(),email,goalIds};seenPartners.set(emailKey,partner);partners.push(partner)}S.profile.name=String(d.get("name")||S.profile.name||"Your Name").trim();S.profile.email=String(d.get("email")||S.profile.email||"").trim();S.profile.role=String(d.get("role")||S.profile.role||"Productive builder").trim();S.profile.referralSource=String(d.get("referralSource")||"");S.profile.accountabilityPartners=partners;S.profile.theme=String(d.get("theme")||S.profile.theme||"forest");S.profile.timezone=String(d.get("timezone")||S.profile.timezone||"UTC");S.profile.bio=String(d.get("bio")||S.profile.bio||"").trim();save();render();return}
  if(k==="goal")S.goals.push({id:uid(),title:t,cat:d.get("cat"),month:gm,pri:S.goals.filter(x=>x.month===gm).length+1,projects:[]});
  if(k==="editgoal"){const goal=S.goals.find(g=>g.id===id);if(goal){goal.title=(d.get("title")||goal.title).trim();goal.cat=d.get("cat")||goal.cat;goal.pri=Math.max(1,+d.get("pri")||goal.pri||1)}editingGoal=null}
  if(k==="proj")S.goals.find(g=>g.id===id).projects.push({id:uid(),title:t,tasks:[]});
  if(k==="task")S.goals.flatMap(g=>g.projects).find(p=>p.id===id).tasks.push({id:uid(),t,due:d.get("due")||"",cat:(d.get("cat")||"").trim()||null,ms:!!d.get("ms"),done:false});
  if(k==="taskPage"){const goal=S.goals.find(g=>g.id===d.get("goalId"));S.tasks.push({id:uid(),t,due:d.get("due")||"",cat:(d.get("cat")||"").trim()||null,ms:false,done:false,group:(d.get("group")||"").trim()||null,goalId:goal?.id||null})}
  if(k==="edittask"){const task=allTasks().find(x=>x.t.id===id)?.t;if(task){task.t=(d.get("t")||task.t).trim();task.due=d.get("due")||task.due;task.cat=(d.get("cat")||"").trim()||null;task.group=(d.get("group")||"").trim()||null;task.ms=!!d.get("ms");task.subtasks=String(d.get("subtasks")||"").split(/\r?\n/).map(x=>x.trim()).filter(Boolean).map((text,index)=>({id:task.subtasks?.[index]?.id||uid(),t:text,done:task.subtasks?.[index]?.done||false}))}editingTask=null}
  if(k==="taskgroup"){const project=S.goals.flatMap(g=>g.projects).find(p=>p.id===id),group=(d.get("group")||"").trim(),cat=(d.get("cat")||"").trim()||null,due=d.get("due")||"";const items=String(d.get("items")||"").split(/\r?\n/).map(x=>x.trim()).filter(Boolean);if(project&&group)items.forEach(item=>project.tasks.push({id:uid(),t:item,due,cat,ms:false,done:false,group}));}
  if(k==="qtask")S.goals.flatMap(g=>g.projects).find(p=>p.id===d.get("pid")).tasks.push({id:uid(),t,due:td(),ms:false,done:false});
  if(k==="habit")S.habits.push({id:uid(),name:t,cat:d.get("cat"),target:+d.get("tg")||1,unit:String(d.get("u")||""),log:{}});
  if(k==="review"){const w=f.dataset.type==="week",tt=td(),s=w?stats(addDays(tt,-6),tt):stats(mon()+"-01",tt),record={type:f.dataset.type,date:tt,w:d.get("w"),c:d.get("c"),n:d.get("n"),auto:`${s.done} tasks done${s.habit!=null?`, habits ${s.habit}%`:""}`};
    if(w){record.weeklySummary=buildWeeklyReviewSummary(addDays(tt,-6),tt);reviewRecap=record.weeklySummary;reviewRecapPage=0}
    S.reviews.push(record);toast(w?"Review saved. Your weekly recap is ready.":"Review saved.")}
  save();render()});

const hrow=(x,t)=>{const v=x.log[t]||0,tg=x.target||1,p=Math.min(100,Math.round(100*v/tg)),currentStreak=streak(x);
 const inp=tg===1&&!x.unit?`<input type="checkbox" data-a="hab" data-id="${x.id}" ${v?"checked":""}>`:`<input class="num" type="number" min="0" value="${v||""}" placeholder="0" data-a="habval" data-id="${x.id}">`;
 return `<div class="card daily-habit-card"><div class="row">${inp}<div class="g"><span class="${ok(x,t)?"done":""}">${esc(x.name)}</span><div class="mut">${tg>1||x.unit?`today: ${v} / ${tg} ${x.unit||""}`:"Daily target"}${x.pri?` · Priority ${x.pri}`:""}</div></div><span class="daily-percent">${p}%</span><span class="tag"><i data-lucide="flame" class="tag-icon"></i> ${currentStreak.days}</span></div>${bar(p)}<div class="daily-progress-meta"><span>Today</span><strong>${p}% complete</strong></div></div>`};
function core(t){
 const dow=new Date().getDay(),dly=S.habits.filter(h=>h.kind!=="weekly").sort((a,b)=>(a.pri||9)-(b.pri||9)),wk=S.habits.filter(h=>h.kind==="weekly");
 let h="";
 if(dow===0)h+=`<div class="ban"><i data-lucide="calendar-days"></i> <b>Sunday: plan the week.</b> Set tasks and due dates. <button data-tab="goals">Open Goals</button></div>`;
 if(dow===6)h+=`<div class="ban"><i data-lucide="notebook-pen"></i> <b>Saturday: review the week.</b> <button data-tab="review">Start review</button></div>`;
 h+=`<h2>Daily core system</h2>`+(dly.map(x=>hrow(x,t)).join("")||'<div class="card mut">No daily habits yet.</div>');
 wk.forEach(x=>{const c=weekCount(x),todaySessions=x.log[td()]||0,p=Math.min(100,Math.round(100*c/x.target));h+=`<div class="card"><div class="row"><div class="g">${esc(x.name)}<div class="mut">${c}/${x.target} this week${todaySessions?` · ${todaySessions} today`:""}</div></div><div class="session-actions"><button data-a="sess" data-id="${x.id}"><i data-lucide="plus"></i> Session</button>${todaySessions?`<button class="ghost" data-a="desess" data-id="${x.id}" aria-label="Remove today's session"><i data-lucide="minus"></i></button>`:""}</div></div>${bar(p)}</div>`});
 return h}
document.addEventListener("change",async e=>{
 if(e.target.matches(".profile-photo-input")){
  const input=e.target,file=input.files?.[0];if(!file)return;
  try{S.profile=S.profile||{};S.profile.photo=await profilePhotoData(file);const saved=save();render();if(saved)toast("Profile photo updated.")}
  catch(error){toast(error instanceof Error?error.message:"The profile photo could not be saved.")}
  finally{if(input.isConnected)input.value=""}
  return;
 }
 if(e.target.dataset.a!=="habval")return;
 const h=S.habits.find(y=>y.id===e.target.dataset.id),v=Math.max(0,+e.target.value||0);
 if(v)h.log[td()]=v;else delete h.log[td()];const complete=ok(h,td()),rewards=complete?updateRewards():null;save();if(rewards&&(rewards.earned.length||rewards.newPersonalBest))rewardToast(rewards);else if(complete)toast(h.name.split(":")[0]+" done.");render()});

checkpointDay();
render();
if(localStorageReadError)toast("Saved data could not be read. A recovery copy was kept if storage allowed.");
setInterval(()=>{const current=td();if(S.meta?.lastDay&&S.meta.lastDay!==current){checkpointDay(current);render();}},60000);
setInterval(()=>{if(document.getElementById("focus-thought-text"))rotateFocusThought()},30000);
initAuth();
