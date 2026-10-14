"use strict";
// 🎯 의뢰서 마감 트래커 (1단계)
// app-base.js의 API_URL·getApiKey·apiGet·apiPost·esc·todayISO를 그대로 쓴다.
(()=>{
const UI_KEY="subin-tracker-ui-v1";
const CACHE_KEY="subin-tracker-cache-v1";
const PDFJS="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/";
const TABLE={seasons:"tracker_seasons",concepts:"tracker_concepts",groups:"tracker_groups",items:"tracker_items",sessions:"tracker_sessions",days:"tracker_days"};
const KINDS=Object.keys(TABLE);

const TR={
  data:{seasons:[],concepts:[],groups:[],items:[],sessions:[],days:[]},
  thumbs:{},loaded:false,offline:false,pending:0,
  open:false,view:"today",seasonId:"",conceptTab:"all",skip:0,oneOnly:false,detail:null,progress:"",
  zoom:2,collapsed:{},selecting:false,selected:new Set()
};
try{Object.assign(TR,JSON.parse(localStorage.getItem(UI_KEY)||"{}"))}catch(e){}
const saveUI=()=>{try{localStorage.setItem(UI_KEY,JSON.stringify({view:TR.view,seasonId:TR.seasonId,conceptTab:TR.conceptTab,oneOnly:TR.oneOnly,zoom:TR.zoom,collapsed:TR.collapsed}))}catch(e){}};

/* ---------- 날짜 ---------- */
const D={
  add(iso,n){const d=new Date(iso+"T00:00:00Z");d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)},
  dow(iso){return new Date(iso+"T00:00:00Z").getUTCDay()},
  diff(a,b){return Math.round((Date.parse(b+"T00:00:00Z")-Date.parse(a+"T00:00:00Z"))/864e5)}
};
const nowISO=()=>new Date().toISOString();
const dayOf=ts=>ts?new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(ts)):"";
const hm=ts=>ts?new Intl.DateTimeFormat("ko-KR",{timeZone:"Asia/Seoul",hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date(ts)).replace(/^24:/,"00:"):"";
const md=iso=>{if(!iso)return"";const [,m,d]=iso.split("-").map(Number);return `${m}/${d}(${"일월화수목금토"[D.dow(iso)]})`};
const mmss=ms=>{const s=Math.floor(ms/1000),h=Math.floor(s/3600),m=Math.floor(s%3600/60),x=s%60;return (h?h+":"+String(m).padStart(2,"0"):String(m).padStart(2,"0"))+":"+String(x).padStart(2,"0")};

/* ---------- 데이터 접근 ---------- */
const byId=(kind,id)=>TR.data[kind].find(x=>x.id===id);
const season=()=>byId("seasons",TR.seasonId)||TR.data.seasons.filter(s=>s.active!==false).slice(-1)[0]||null;
const conceptsOf=sid=>TR.data.concepts.filter(c=>c.season_id===sid).sort((a,b)=>(a.sort??100)-(b.sort??100)||a.name.localeCompare(b.name));
const itemsOf=sid=>TR.data.items.filter(i=>i.season_id===sid);
const isDone=i=>i?.status==="done";
const activeSession=()=>TR.data.sessions.find(x=>!x.ended_at);
const typeName=(s,t)=>(s?.settings?.type_names||{})[t]||"";

function applyRemote(r){
  for(const k of KINDS)TR.data[k]=r[k]||[];
  // 같은 썸네일이면 기존 서명 URL을 유지해서 새로고침마다 이미지를 다시 받지 않는다 (6시간마다 갱신)
  const fresh=r.thumb_urls||{},old=TR.thumbMeta||{},meta={};
  for(const it of TR.data.items){
    if(!fresh[it.id])continue;
    const o=old[it.id];
    meta[it.id]=o&&o.path===it.thumb_path&&Date.now()-o.at<6*36e5?o:{path:it.thumb_path,url:fresh[it.id],at:Date.now()};
  }
  TR.thumbMeta=meta;TR.thumbs=Object.fromEntries(Object.entries(meta).map(([k,v])=>[k,v.url]));
  TR.loaded=true;TR.offline=false;
  if(!byId("seasons",TR.seasonId))TR.seasonId=season()?.id||"";
  try{localStorage.setItem(CACHE_KEY,JSON.stringify({data:TR.data,at:nowISO()}))}catch(e){}
}
async function load(){
  try{applyRemote(await apiGet("tracker"))}
  catch(e){
    if(e.message==="SETUP_REQUIRED"||e.message==="AUTH")throw e;
    try{const c=JSON.parse(localStorage.getItem(CACHE_KEY)||"null");if(c?.data){TR.data={...TR.data,...c.data};TR.loaded=true}}catch(x){}
    TR.offline=true;
  }
}
async function refresh(){if(TR.pending)return;try{await load();render()}catch(e){render()}}
function guardOnline(){if(TR.offline){toast("지금은 연결이 끊겨서 저장할 수 없어요.");return false}return true}
async function send(body,failMsg){
  TR.pending++;
  try{return await apiPost(body)}
  catch(e){console.warn(e);toast(failMsg||"저장하지 못했어요. 다시 불러올게요.");TR.pending=0;await refresh();throw e}
  finally{if(TR.pending)TR.pending--}
}
function upsertLocal(kind,row){const arr=TR.data[kind],i=arr.findIndex(x=>x.id===row.id);row.updated_at=nowISO();if(i<0){row.created_at=row.created_at||row.updated_at;arr.push(row)}else arr[i]={...arr[i],...row};return arr[i<0?arr.length-1:i]}
// rowsByKind: {items:[...], concepts:[...]} — 화면 먼저 바꾸고 DB에 한 번에 저장
async function put(rowsByKind,failMsg){
  if(!guardOnline())return false;
  const batches=[];
  for(const [kind,rows] of Object.entries(rowsByKind)){if(!rows.length)continue;batches.push({table:TABLE[kind],rows:rows.map(r=>upsertLocal(kind,{...r}))})}
  render();
  try{await send({action:"tracker_upsert",batches},failMsg);return true}catch(e){return false}
}
function removeLocal(kind,id){
  TR.data[kind]=TR.data[kind].filter(x=>x.id!==id);
  // 묶음을 지우면 의뢰서는 남기고 묶음만 풀린다 (DB도 on delete set null)
  if(kind==="groups"){TR.data.items.forEach(i=>{if(i.group_id===id)i.group_id=null});return}
  const field={seasons:"season_id",concepts:"concept_id",items:"item_id"}[kind];
  if(!field)return;
  for(const k of KINDS)if(TR.data[k].some(x=>x[field]===id))TR.data[k].filter(x=>x[field]===id).forEach(x=>removeLocal(k,x.id));
}
async function remove(kind,id){if(!guardOnline())return;removeLocal(kind,id);render();try{await send({action:"tracker_delete",table:TABLE[kind],ids:[id]})}catch(e){}}

/* ---------- 계산 ---------- */
const isWorkday=(s,iso)=>{const w=D.dow(iso);return w>0&&w<6&&!(s.holidays||[]).includes(iso)};
function prodEnd(s){
  if(!s?.deadline)return"";
  let d=D.add(s.deadline,-1),review=Math.max(0,Number(s.review_days)||0);
  for(let guard=0;guard<400;guard++,d=D.add(d,-1)){if(!isWorkday(s,d))continue;if(review<=0)return d;review--}
  return d;
}
function countWorkdays(s,a,b){let n=0;if(!a||!b)return 0;for(let d=a;d<=b;d=D.add(d,1))if(isWorkday(s,d))n++;return n}
function conceptTarget(c,its){return c.target!=null&&c.target!==""?Number(c.target):its.length}
// 작업 단위: 안 묶인 의뢰서 1건 = 1, 묶음 하나 = 1 (같은 자료라 한 번 하면 나머지는 복붙). 묶음은 안의 의뢰서가 전부 끝나야 완료
function unitsOf(items){
  const map=new Map(),out=[];
  for(const it of items){
    const g=it.group_id&&byId("groups",it.group_id),key=g?"g:"+g.id:it.id;
    let u=map.get(key);if(!u){u={key,group:g||null,items:[]};map.set(key,u);out.push(u)}
    u.items.push(it);
  }
  for(const u of out){u.done=u.items.every(isDone);u.completedAt=u.done?u.items.map(i=>i.completed_at||"").sort().pop():null}
  return out;
}
// 파일 기준 목표·완료에서 묶음으로 아낀 만큼 뺀 작업 기준 숫자
function unitCounts(its,target,done){
  const units=unitsOf(its),saved=its.length-units.length,savedDone=units.reduce((a,u)=>a+(u.items.filter(isDone).length-(u.done?1:0)),0);
  const uTarget=Math.max(0,target-saved),uDone=Math.min(uTarget,Math.max(0,done-savedDone));
  return {units,bundles:units.filter(u=>u.group).length,uTarget,uDone,uRemaining:Math.max(0,uTarget-uDone)};
}
// 오늘 시간 예산: 근무 시간(기본 8:00~17:00, 점심 12~13)에서 남은 시간을 남은 건수로 똑같이 나눈다
const hhmm=v=>{const r=/^(\d{1,2}):(\d{2})$/.exec(String(v||"").trim());return r?Number(r[1])*60+Number(r[2]):null};
const clock=m=>`${Math.floor(m/60)}:${String(Math.round(m%60)).padStart(2,"0")}`;
// 근무 시간 + 오늘 야근: 야근은 버튼 누른 시각부터 정한 끝 시각까지. 퇴근~야근 시작 사이는 쉼(점심처럼 계산에서 빠짐)
function workCfg(s){
  const w=s?.settings?.work||{},g=(k,d)=>hhmm(w[k])??d;let c={s:g("start",480),e:g("end",1020),ls:g("lunchStart",720),le:g("lunchEnd",780)};
  if(c.e<=c.s)c.e=c.s+540;if(!(c.ls<c.le))c.ls=c.le=c.e;
  c.end0=c.e;c.breaks=c.ls<c.le?[[c.ls,c.le]]:[];
  const ot=s?.settings?.overtime;
  if(ot&&ot.date===todayISO()){const os=hhmm(ot.start),oe=hhmm(ot.end);if(os!=null&&oe!=null&&oe>Math.max(os,c.end0)){c.ot={s:Math.max(os,c.end0),e:oe};if(c.ot.s>c.end0)c.breaks.push([c.end0,c.ot.s]);c.e=oe}}
  return c;
}
const seoulMin=ts=>{const p=new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Seoul",hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false}).formatToParts(ts?new Date(ts):new Date()),v=t=>+p.find(x=>x.type===t).value;return (v("hour")%24)*60+v("minute")+v("second")/60};
// a~b 사이의 근무 분 (점심 제외)
function workBetween(a,b,c){if(b<=a)return 0;const ov=(x,y)=>Math.max(0,Math.min(b,y)-Math.max(a,x));return ov(c.s,c.e)-c.breaks.reduce((t,[x,y])=>t+ov(Math.max(c.s,x),Math.min(c.e,y)),0)}
// t부터 근무 시간으로 mins분 지난 시각 (점심 건너뜀)
function addWork(t,mins,c){let x=Math.max(t,c.s);for(const [b0,b1] of c.breaks){if(x>=b1)continue;if(x>=b0){x=b1;continue}const room=b0-x;if(mins<=room)return x+mins;mins-=room;x=b1}return x+mins}
function clockSegs(a,b,c){let out=[[a,b]];for(const [b0,b1] of c.breaks)out=out.flatMap(([x,y])=>y<=b0||x>=b1?[[x,y]]:[[x,Math.min(y,b0)],[Math.max(x,b1),y]]);return out.filter(([x,y])=>y>x)}
// 지금 하는 건: 마지막으로 끝낸 시각부터 퇴근까지 ÷ 남은 건수. 빨리 끝내면 다음 칸이 늘고, 늦으면 줄어든다
function timePlan(s,p){
  const c=workCfg(s),now=seoulMin();
  const doneU=[...p.doneTodayU].sort((a,b)=>(a.completedAt||"").localeCompare(b.completedAt||""));
  const ends=doneU.map(u=>Math.min(c.e,Math.max(c.s,seoulMin(u.completedAt))));
  const R=Math.max(0,p.goal-doneU.length);
  let slotStart=Math.max(c.s,ends.length?ends[ends.length-1]:c.s);for(const [b0,b1] of c.breaks)if(slotStart>=b0&&slotStart<b1)slotStart=b1;
  // 야근 중이면 야근 시작부터 새로 나눈다 (낮에 남은 초과를 끌고 오지 않게)
  if(c.ot&&now>=c.end0)slotStart=Math.max(slotStart,c.ot.s);
  const slotLen=R?workBetween(slotStart,c.e,c)/R:0,slotEnd=addWork(slotStart,slotLen,c);
  const used=workBetween(slotStart,Math.min(Math.max(now,slotStart),c.e),c),slotLeft=slotLen-used;
  const nowRem=workBetween(Math.max(now,c.s),c.e,c);
  const inBreak=c.breaks.find(([b0,b1])=>now>=b0&&now<b1);
  const phase=now<c.s?"before":now>=c.e?"after":inBreak?(inBreak[0]===c.ls?"lunch":"gap"):"work";
  // 목표는 정규 근무(아침 기준)로, 야근 중이면 표시만 야근 끝까지
  return {c,now,total:workBetween(c.s,c.end0,c),base:p.goal?workBetween(c.s,c.end0,c)/p.goal:0,R,slotStart,slotLen,slotEnd,used,slotLeft,nowRem,ends,doneU,phase,
    overtime:!!c.ot&&now>=c.ot.s&&now<c.e,extra:Math.max(0,doneU.length-p.goal),nextEach:R>1?nowRem/(R-1):null};
}
const fmtDur=m=>{m=Math.max(0,Math.round(m));const h=Math.floor(m/60),r=m%60;return h?`${h}시간${r?` ${r}분`:""}`:`${r}분`};
function seasonStats(s){
  const today=todayISO(),items=itemsOf(s.id),end=prodEnd(s);
  const totalDays=end?countWorkdays(s,s.start_date||today,end):0;
  const elapsed=end?countWorkdays(s,s.start_date||today,D.add(today<end?today:D.add(end,1),-1)):0;
  const expected=totalDays?Math.min(1,elapsed/totalDays):0;
  const concepts=conceptsOf(s.id).map(c=>{
    const its=items.filter(i=>i.concept_id===c.id),done=its.filter(isDone).length,target=conceptTarget(c,its);
    const ratio=target?Math.min(1,done/target):1;
    const risk=!target?"none":done>=target?"done":ratio>=expected?"ok":ratio>=expected-.15?"warn":"risk";
    return {c,its,done,target,ratio,risk,remaining:Math.max(0,target-done),...unitCounts(its,target,done)};
  });
  const target=concepts.reduce((a,x)=>a+x.target,0),done=concepts.reduce((a,x)=>a+Math.min(x.done,x.target),0);
  const remaining=Math.max(0,target-done),left=end&&today<=end?countWorkdays(s,today,end):0;
  // 시즌 전체 작업 수 (여러 컨셉에 걸친 묶음도 한 번만)
  const u=unitCounts(items,target,done);
  // 내일 남는 제작일: 오늘이 제작일이면 하루 빠진다. 지금 남은 걸 그대로 두면 내일 하루 필요량이 얼마가 되는지
  const leftTomorrow=Math.max(0,left-(left&&isWorkday(s,today)?1:0)),perDay=n=>leftTomorrow?Math.ceil(n/leftTomorrow):n;
  return {today,end,left,target,done,remaining,expected,concepts,
    need:left?Math.ceil(remaining/left):remaining,
    units:u.units,bundles:u.bundles,uTarget:u.uTarget,uDone:u.uDone,uRemaining:u.uRemaining,
    uNeed:left?Math.ceil(u.uRemaining/left):u.uRemaining,
    leftTomorrow,tomorrowNeed:perDay(remaining),uTomorrowNeed:perDay(u.uRemaining),perDay,
    dday:s.deadline?D.diff(today,s.deadline):null,overdue:!!end&&today>end&&remaining>0};
}
function lastType(s){
  const its=itemsOf(s.id),act=activeSession();
  if(act)return byId("items",act.item_id)?.item_type||"";
  const ses=TR.data.sessions.filter(x=>x.season_id===s.id).sort((a,b)=>b.started_at.localeCompare(a.started_at))[0];
  if(ses)return byId("items",ses.item_id)?.item_type||"";
  const last=its.filter(isDone).sort((a,b)=>(b.completed_at||"").localeCompare(a.completed_at||""))[0];
  return last?.item_type||"";
}
// 갤러리 순서: 직접 끌어서 정한 순서(sort_order) → 없으면 품목 코드순
const galleryCmp=(a,b)=>(a.sort_order==null)-(b.sort_order==null)||(a.sort_order??0)-(b.sort_order??0)||(a.item_type||"").localeCompare(b.item_type||"")||a.code.localeCompare(b.code);
// 우선순위: (직접 올림) → 이월 → 가장 뒤처진 컨셉 → 중요 표시 → 갤러리에서 정한 순서(같은 품목·비슷한 것끼리 연달아)
function recommendOrder(s,st,carried){
  const ratio={};st.concepts.forEach(x=>ratio[x.c.id]=x.target?x.done/x.target:1);
  const carriedSet=new Set(carried);
  const conceptRank={};[...st.concepts].sort((a,b)=>(ratio[a.c.id]-ratio[b.c.id])||(b.remaining-a.remaining)).forEach((x,n)=>conceptRank[x.c.id]=n);
  const all=itemsOf(s.id),pos=new Map(all.sort(galleryCmp).map((i,n)=>[i.id,n]));
  // 이미 하나 끝낸 묶음은 나머지가 복붙이라 먼저
  const started=new Set(all.filter(i=>i.group_id&&isDone(i)).map(i=>i.group_id));
  // 우선순위 칸(pinned_at)에 올린 건 그 칸에서 정한 순서대로 맨 먼저
  const key=i=>[i.pinned_at?0:1,i.pinned_at?pos.get(i.id):0,carriedSet.has(i.id)?0:1,started.has(i.group_id)?0:1,conceptRank[i.concept_id]??99,i.important?0:1,pos.get(i.id)];
  const cmp=(a,b)=>{const x=key(a),y=key(b);for(let n=0;n<x.length;n++){if(x[n]<y[n])return-1;if(x[n]>y[n])return 1}return 0};
  const sorted=all.filter(i=>!isDone(i)).sort(cmp),out=[],seen=new Set();
  // 같은 묶음은 연달아 (첫 번째 것 바로 뒤에 나머지를 붙인다)
  for(const i of sorted){
    if(seen.has(i.id))continue;
    out.push(i);seen.add(i.id);
    if(i.group_id)for(const j of sorted)if(j.group_id===i.group_id&&!seen.has(j.id)){out.push(j);seen.add(j.id)}
  }
  return out;
}
function reasonFor(i,s,st,carried){
  if(!i)return"";
  const parts=[],cs=st.concepts.find(x=>x.c.id===i.concept_id),worst=[...st.concepts].filter(x=>x.remaining).sort((a,b)=>a.ratio-b.ratio)[0];
  const g=i.group_id&&byId("groups",i.group_id),mates=g?itemsOf(s.id).filter(x=>x.group_id===g.id):[],gDone=mates.filter(isDone).length;
  if(i.pinned_at)parts.push("⭐ 우선순위 칸에 올린 의뢰서");
  else if(carried.includes(i.id))parts.push("지난 작업일에 못 끝내서 이월된 의뢰서");
  else if(g&&gDone)parts.push(`묶음 «${g.name}» 이어서 · 끝낸 걸 복붙하면 돼요 (남은 ${mates.length-gDone}건)`);
  else if(cs&&worst&&cs.c.id===worst.c.id)parts.push(`진행률이 가장 뒤처진 컨셉 · ${cs.c.name} ${Math.round(cs.ratio*100)}%`);
  else if(cs)parts.push(`${cs.c.name} 컨셉 ${Math.round(cs.ratio*100)}%`);
  if(g&&!gDone&&mates.length>1)parts.push(`같은 자료 묶음 «${g.name}» ${mates.length}건 · 하나 끝내면 나머지는 복붙`);
  const lt=lastType(s);if(!g&&lt&&i.item_type===lt)parts.push(`방금 한 ${lt}와 같은 품목이라 전환이 빨라요`);
  if(i.important)parts.push("⭐ 중요 표시");
  return parts.join(" · ");
}
// 오늘 목표·이월·하루 몫은 작업 단위(묶음 = 1)로 센다. 목록에는 묶음 안 의뢰서가 모두 나온다
function todayPlan(s){
  const st=seasonStats(s),today=st.today,items=itemsOf(s.id),unitOf=new Map();
  st.units.forEach(u=>u.items.forEach(i=>unitOf.set(i.id,u)));
  const doneToday=items.filter(i=>isDone(i)&&dayOf(i.completed_at)===today);
  const doneTodayU=st.units.filter(u=>u.done&&dayOf(u.completedAt)===today);
  const workday=isWorkday(s,today)&&!!st.end&&(today<=st.end||st.overdue);
  const prev=TR.data.days.filter(d=>d.season_id===s.id&&d.date<today).sort((a,b)=>b.date.localeCompare(a.date))[0];
  let carry=0,carriedU=[];
  if(prev){
    const doneOnPrev=st.units.filter(u=>u.done&&dayOf(u.completedAt)===prev.date).length;
    carry=Math.max(0,(prev.goal||0)-doneOnPrev);
    carriedU=[...new Set((prev.picks||[]).map(id=>unitOf.get(id)).filter(u=>u&&!u.done))];
  }
  const carried=carriedU.flatMap(u=>u.items.filter(i=>!isDone(i)).map(i=>i.id));
  const remStart=st.uRemaining+doneTodayU.length;
  carry=Math.min(carry,remStart);
  // 밀린 건 다음 날에 한꺼번에 얹지 않고 남은 제작일에 나눠 담는다 (목표 = 오늘 아침 남은 작업 ÷ 남은 제작일). carry는 안내용
  let share=0;
  if(workday)share=st.left?Math.ceil(remStart/st.left):remStart;
  if(!workday)carry=0;
  const goal=Math.min(remStart,share);
  const order=recommendOrder(s,st,carried);
  const orderU=[],seenU=new Set();for(const it of order){const u=unitOf.get(it.id);if(u&&!seenU.has(u.key)){seenU.add(u.key);orderU.push(u)}}
  // 오늘 목록: 아침에 정한 목록을 유지하고, 목표가 바뀌면 뒤에서 채우거나 덜어낸다
  const snap=TR.data.days.find(d=>d.season_id===s.id&&d.date===today);
  // 우선순위 칸에 올린 건 하루 중에 올려도 바로, 목표를 넘더라도 오늘 목록 맨 앞에. 나머지 자리는 아침 목록 → 추천 순서로 채운다
  const pinnedU=orderU.filter(u=>u.items.some(i=>i.pinned_at&&!isDone(i)));
  const need=Math.max(0,goal-doneTodayU.length),needRest=Math.max(0,need-pinnedU.length);
  let restU=[...new Set((snap?.picks||[]).map(id=>unitOf.get(id)).filter(u=>u&&!u.done&&!pinnedU.includes(u)))];
  for(const u of orderU){if(restU.length>=needRest)break;if(!pinnedU.includes(u)&&!restU.includes(u))restU.push(u)}
  if(restU.length>needRest)restU=restU.slice(0,needRest);
  let todoU=[...pinnedU,...restU];
  const rank=new Map(orderU.map((u,n)=>[u.key,n]));
  todoU.sort((a,b)=>(rank.get(a.key)??999)-(rank.get(b.key)??999));
  const todo=todoU.flatMap(u=>u.items.filter(i=>!isDone(i)).sort(galleryCmp).map(i=>i.id));
  const next=workday?todo:order.map(i=>i.id);
  let nextWorkday="";for(let d=D.add(today,1),g=0;g<30;g++,d=D.add(d,1))if(isWorkday(s,d)){nextWorkday=d;break}
  return {st,today,workday,carry,share,goal,carried,doneToday,doneTodayU,todo,todoU,next,order,nextWorkday,picks:[...doneToday.map(i=>i.id),...todo],snap,
    goalFiles:doneToday.length+todo.length,
    // 오늘 여기서 멈추면 / 오늘 목표를 채우면 내일 목표
    tomorrowIfStop:st.perDay(st.uRemaining),tomorrowIfGoal:st.perDay(Math.max(0,st.uRemaining-Math.max(0,goal-doneTodayU.length)))};
}
// 작업일이면 오늘 목표를 스냅샷으로 남겨서 다음 작업일 이월 계산에 쓴다
let snapPending="";
function saveSnapshot(s,p){
  if(!p.workday||TR.offline)return;
  const row={id:`${s.id}:${p.today}`,season_id:s.id,date:p.today,goal:p.goal,carry:p.carry,share:p.share,picks:p.picks};
  const cur=p.snap,sig=JSON.stringify([row.goal,row.carry,row.share,row.picks]);
  if(cur&&JSON.stringify([cur.goal,cur.carry,cur.share,cur.picks||[]])===sig)return;
  if(snapPending===sig)return;
  snapPending=sig;
  queueMicrotask(async()=>{await put({days:[row]});snapPending=""});
}

/* ---------- 집중 타이머 ---------- */
function elapsedMs(x){const end=x.ended_at?Date.parse(x.ended_at):Date.now();let p=Number(x.paused_ms)||0;if(x.pause_started_at&&!x.ended_at)p+=Date.now()-Date.parse(x.pause_started_at);return Math.max(0,end-Date.parse(x.started_at)-p)}
function closeSession(x){const t=nowISO(),pm=(Number(x.paused_ms)||0)+(x.pause_started_at?Date.now()-Date.parse(x.pause_started_at):0);const done={...x,ended_at:t,paused_ms:pm,pause_started_at:null};done.focus_sec=Math.round(elapsedMs(done)/1000);return done}
async function startFocus(itemId){
  const it=byId("items",itemId);if(!it)return;
  const act=activeSession();if(act?.item_id===itemId)return;
  const rows=[];if(act)rows.push(closeSession(act));
  rows.push({id:crypto.randomUUID(),item_id:itemId,season_id:it.season_id,started_at:nowISO(),ended_at:null,paused_ms:0,pause_started_at:null,focus_sec:0});
  TR.view="today";saveUI();
  await put({sessions:rows});
}
async function pauseFocus(){const x=activeSession();if(!x)return;if(x.pause_started_at)await put({sessions:[{...x,paused_ms:(Number(x.paused_ms)||0)+Date.now()-Date.parse(x.pause_started_at),pause_started_at:null}]});else await put({sessions:[{...x,pause_started_at:nowISO()}]})}
async function stopFocus(){const x=activeSession();if(!x)return;const done=closeSession(x);if(done.focus_sec<10){await remove("sessions",x.id);return}await put({sessions:[done]})}
async function setDone(itemId,done){
  const it=byId("items",itemId);if(!it)return;
  const rows={items:[{...it,status:done?"done":"todo",completed_at:done?nowISO():null,confirmed:true,pinned_at:done?null:it.pinned_at}],sessions:[]};
  const act=activeSession();
  let drop=null;
  if(done&&act?.item_id===itemId){const c=closeSession(act);if(c.focus_sec<10)drop=act.id;else rows.sessions.push(c)}
  if(done)TR.skip=0;
  if(drop)await remove("sessions",drop);
  await put(rows);
  if(done)toast(`✓ ${it.code} 완료${recordLine(byId("items",itemId))?" · "+recordLine(byId("items",itemId)):""}`);
}
// 완료 기록: 14:05 ~ 14:17 · 집중 12분 (+ 여러 날 나눠 했으면 누적)
function recordLine(it){
  if(!it?.completed_at)return"";
  const day=dayOf(it.completed_at),ss=TR.data.sessions.filter(x=>x.item_id===it.id&&x.ended_at).sort((a,b)=>a.started_at.localeCompare(b.started_at));
  const todays=ss.filter(x=>dayOf(x.started_at)===day),total=ss.reduce((a,x)=>a+(x.focus_sec||0),0),dayFocus=todays.reduce((a,x)=>a+(x.focus_sec||0),0);
  if(!todays.length)return total?`${hm(it.completed_at)} 완료 · 누적 ${Math.round(total/60)}분`:`${hm(it.completed_at)} 완료`;
  return `${hm(todays[0].started_at)} ~ ${hm(it.completed_at)} · 집중 ${Math.round(dayFocus/60)}분${total>dayFocus+30?` · 누적 ${Math.round(total/60)}분`:""}`;
}

/* ---------- 파일 → 썸네일 + 자동 분류 ---------- */
let pdfjsP=null;
function loadPdfjs(){return pdfjsP??=new Promise((res,rej)=>{const sc=document.createElement("script");sc.src=PDFJS+"pdf.min.js";sc.onload=()=>{window.pdfjsLib.GlobalWorkerOptions.workerSrc=PDFJS+"pdf.worker.min.js";res(window.pdfjsLib)};sc.onerror=()=>{pdfjsP=null;rej(new Error("pdf.js를 불러오지 못했어요"))};document.head.appendChild(sc)})}
async function renderPdf(file){
  const lib=await loadPdfjs(),doc=await lib.getDocument({data:await file.arrayBuffer()}).promise;
  try{
    const page=await doc.getPage(1),v1=page.getViewport({scale:1}),scale=Math.min(4,1400/Math.max(v1.width,v1.height)),vp=page.getViewport({scale});
    const c=document.createElement("canvas");c.width=Math.round(vp.width);c.height=Math.round(vp.height);
    const ctx=c.getContext("2d");ctx.fillStyle="#fff";ctx.fillRect(0,0,c.width,c.height);
    await page.render({canvasContext:ctx,viewport:vp}).promise;return c;
  }finally{doc.destroy()}
}
function renderImage(blob){return new Promise((res,rej)=>{const img=new Image(),url=URL.createObjectURL(blob);img.onload=()=>{const c=document.createElement("canvas");c.width=img.naturalWidth;c.height=img.naturalHeight;const ctx=c.getContext("2d");ctx.fillStyle="#fff";ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(img,0,0);URL.revokeObjectURL(url);res(c)};img.onerror=()=>{URL.revokeObjectURL(url);rej(new Error("이미지를 읽지 못했어요"))};img.src=url})}
const canvasBlob=(c,q)=>new Promise(r=>c.toBlob(r,"image/jpeg",q));
async function toThumb(src){
  for(const max of [1200,900,700]){
    const k=Math.min(1,max/Math.max(src.width,src.height)),c=document.createElement("canvas");
    c.width=Math.round(src.width*k);c.height=Math.round(src.height*k);c.getContext("2d").drawImage(src,0,0,c.width,c.height);
    for(const q of [.8,.7,.6,.5]){const b=await canvasBlob(c,q);if(b&&b.size<=180*1024)return b}
  }
  return canvasBlob(src,.5);
}
// 미완료 의뢰서 = 왼쪽 위에 노란 헤더 표. 왼쪽 절반 위쪽 40%에서 가로로 길게 이어진 노란 띠(헤더 줄)를 찾는다
function detectForm(src){
  const w=320,h=Math.round(src.height*w/src.width),c=document.createElement("canvas");c.width=w;c.height=h;
  const ctx=c.getContext("2d",{willReadFrequently:true});ctx.drawImage(src,0,0,w,h);
  const px=ctx.getImageData(0,0,w,h).data,x0=Math.round(w*.01),x1=Math.round(w*.5),y1=Math.round(h*.4),minRun=w*.25,maxBand=Math.round(h*.12);
  let band=0,found=false,best=0;
  for(let y=0;y<y1;y++){
    let run=0,longest=0;
    for(let x=x0;x<x1;x++){
      const o=(y*w+x)*4,r=px[o],g=px[o+1],b=px[o+2],mx=Math.max(r,g,b),mn=Math.min(r,g,b),s=mx?(mx-mn)/mx:0;
      let hue=0;if(mx!==mn){if(mx===r)hue=60*((g-b)/(mx-mn));else if(mx===g)hue=60*(2+(b-r)/(mx-mn));else hue=60*(4+(r-g)/(mx-mn));if(hue<0)hue+=360}
      const yellow=mx>=180&&s>=.15&&hue>=38&&hue<=68;
      run=yellow?run+1:0;if(run>longest)longest=run;
    }
    best=Math.max(best,longest/w);
    if(longest>=minRun){band++;continue}
    if(band>=2&&band<=maxBand)found=true;
    band=0;
  }
  if(band>=2&&band<=maxBand)found=true;
  return {hasForm:found,score:Math.round(best*1000)/1000};
}
const nfc=s=>String(s||"").normalize("NFC");
const slug=s=>nfc(s).trim().replace(/\s+/g,"").toUpperCase();
function parseName(name){
  const base=name.replace(/\.[^.]+$/,"").replace(/\s*\(\d+\)$/,"").replace(/\s+copy$/i,"").trim();
  const parts=base.split(/_+/).filter(Boolean);
  if(parts.length>=3&&/^\d{2}[A-Z]{2}$/i.test(parts[0]))return {season:slug(parts[0]),concept:slug(parts[1]),code:slug(parts.slice(2).join("_"))};
  if(parts.length===2)return {season:"",concept:slug(parts[0]),code:slug(parts[1])};
  return {season:"",concept:"미분류",code:slug(base)};
}
const itemTypeOf=code=>(code.match(/^[A-Z]+/)||[""])[0]||code.slice(0,4);
function blobToB64(blob){return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(String(r.result).split(",")[1]);r.onerror=()=>rej(r.error);r.readAsDataURL(blob)})}
async function uploadThumb(itemId,blob){
  const r=await send({action:"tracker_thumb",item_id:itemId,data:await blobToB64(blob)},"썸네일을 저장하지 못했어요.");
  const it=byId("items",itemId);if(it)it.thumb_path=r.thumb_path;
  if(r.url){TR.thumbs[itemId]=r.url;(TR.thumbMeta??={})[itemId]={path:r.thumb_path,url:r.url,at:Date.now()}}
}
const isDesign=f=>/\.(ai|pdf)$/i.test(f.name);
const isImage=f=>/^image\//.test(f.type)||/\.(png|jpe?g|webp|heic)$/i.test(f.name);
// 폴더째 올리면 파일이 들어 있던 폴더 이름(예: "6-1p 클로버 노바")을 컨셉으로 쓴다
const fileDir=new WeakMap();
const folderOf=f=>fileDir.get(f)||(f.webkitRelativePath||"").split("/").slice(0,-1).pop()||"";
const withTimeout=(p,ms,msg)=>Promise.race([p,new Promise((_,rej)=>setTimeout(()=>rej(new Error(msg)),ms))]);
async function fileToCanvas(f){return withTimeout(isDesign(f)?renderPdf(f):renderImage(f),90000,"파일을 그리는 데 너무 오래 걸려요")}
// 다시 저장한 파일을 올리면 새 버전으로 보고 완료 추정을 다시 한다 (확인 표시는 풀림)
function applyEstimate(item,est,file,prev){
  item.auto_done=!est.hasForm;item.auto_score=est.score;item.confirmed=false;
  item.status=est.hasForm?"todo":"done";
  item.completed_at=est.hasForm?null:(prev&&isDone(prev)&&prev.completed_at?prev.completed_at:new Date(file.lastModified||Date.now()).toISOString());
  return item;
}
// 파일명 시즌(27SS) → 같은 이름 시즌 → 그 이름으로 시작하는 시즌(27SS2차) → 없으면 지금 시즌 마감일을 물려받아 새로 만든다
async function seasonForFile(token,cur){
  if(!token)return cur;
  if(cur&&cur.name.toUpperCase()===token)return cur;
  const all=TR.data.seasons;
  let s=all.find(x=>x.name.toUpperCase()===token)||(cur&&cur.name.toUpperCase().startsWith(token)?cur:null)||all.find(x=>x.name.toUpperCase().startsWith(token));
  if(!s){
    s={id:token,name:token,deadline:cur?.deadline||null,review_days:cur?.review_days??1,start_date:todayISO(),holidays:cur?.holidays||[],settings:{},active:true};
    await put({seasons:[s]});s=byId("seasons",s.id);
    toast(`${token} 시즌을 새로 만들었어요. 설정에서 마감일을 확인해 주세요.`,5000);
  }
  return s;
}
async function importFiles(files){
  if(!guardOnline())return;
  files=files.filter(f=>isDesign(f)||isImage(f));
  if(!files.length)return;
  let s=season();
  const report={added:0,updated:0,failed:[],errors:[]},left=new Set();
  for(let n=0;n<files.length;n++){
    const f=files[n];TR.progress=`${n+1}/${files.length} · ${f.name}`;render();
    try{
      const p=parseName(nfc(f.name));
      s=await seasonForFile(p.season,s);
      if(!s){toast("먼저 시즌을 만들어 주세요.");break}
      if(TR.seasonId!==s.id){TR.seasonId=s.id;saveUI()}
      // 같은 시즌에 같은 품목 코드가 있으면 그 카드를 새 버전으로 갱신 (컨셉이 바뀌어도 중복 생성 안 함)
      const prev=byId("items",`${s.id}_${p.concept}_${p.code}`)||itemsOf(s.id).find(i=>nfc(i.code)===p.code);
      // 맥 폴더 이름은 한글이 풀어쓴 형태(NFD)로 와서, 합친 형태(NFC)로 맞춰 비교한다 (예전에 만든 컨셉도 같은 걸로 찾음)
      const dir=nfc(folderOf(f)),cname=dir||p.concept,cid0=`${s.id}:${slug(cname)}`;
      const cid=TR.data.concepts.find(c=>c.season_id===s.id&&nfc(c.id)===cid0)?.id||cid0;
      const conceptId=dir||!prev?cid:prev.concept_id,rows={concepts:[],items:[]};
      if(conceptId===cid&&!byId("concepts",cid))rows.concepts.push({id:cid,season_id:s.id,name:cname,target:null,sort:100});
      if(prev&&prev.concept_id!==conceptId)left.add(prev.concept_id);
      const id=prev?.id||`${s.id}_${p.code}`;
      let canvas=null,est=null;
      try{canvas=await fileToCanvas(f);if(isDesign(f))est=detectForm(canvas)}catch(e){console.warn(e);report.failed.push(f.name)}
      const item={...(prev||{id,season_id:s.id,code:p.code,item_type:itemTypeOf(p.code),difficulty:"M",important:false,pinned_at:null,status:"todo",confirmed:false,completed_at:null,note:null,auto_done:null,auto_score:null,sort_order:null}),concept_id:conceptId,file_name:f.name};
      if(est)applyEstimate(item,est,f,prev);
      rows.items.push(item);
      if(!(await put(rows))){report.errors.push(f.name);break}
      prev?report.updated++:report.added++;
      if(canvas)await uploadThumb(id,await toThumb(canvas));
    }catch(e){console.warn(e);report.errors.push(`${f.name}: ${e.message}`)}
  }
  // 폴더 기준으로 옮기고 나서 비어 버린 자동 컨셉(목표 미지정)은 정리
  for(const cid of left){const c=byId("concepts",cid);if(c&&c.target==null&&!TR.data.items.some(i=>i.concept_id===cid)){if(TR.conceptTab===cid)TR.conceptTab="all";await remove("concepts",cid)}}
  TR.progress="";render();
  const msg=[report.added&&`${report.added}건 등록`,report.updated&&`${report.updated}건 새 버전으로 갱신`].filter(Boolean).join(" · ")||"변경 없음";
  if(report.errors.length)toast(`⚠️ 저장 실패 ${report.errors.length}건 · ${report.errors[0]}`,8000);
  else toast(report.failed.length?`${msg} · 썸네일 실패 ${report.failed.length}건 (PDF 호환이 꺼진 파일이면 스크린샷을 ⌘V로 붙여넣어 주세요)`:msg,report.failed.length?6000:2600);
}
async function replaceThumb(itemId,file){
  if(!guardOnline())return;
  const it=byId("items",itemId);if(!it)return;
  TR.progress=`썸네일 교체 · ${it.code}`;render();
  try{
    const canvas=await fileToCanvas(file);
    if(isDesign(file))await put({items:[applyEstimate({...it,file_name:file.name},detectForm(canvas),file,it)]});
    await uploadThumb(itemId,await toThumb(canvas));toast(`${it.code} 새 버전으로 바꿨어요.`);
  }catch(e){console.warn(e);toast(`⚠️ 이 파일로는 바꾸지 못했어요 · ${e.message}`,6000)}
  TR.progress="";render();
}
async function filesFromDrop(dt){
  const entries=[...(dt.items||[])].map(i=>i.webkitGetAsEntry?.()).filter(Boolean);
  if(!entries.length)return [...dt.files];
  const out=[];
  const walk=async e=>{
    if(e.isFile)await new Promise(r=>e.file(f=>{const dir=e.fullPath.split("/").slice(0,-1).pop();if(dir)fileDir.set(f,dir);out.push(f);r()},()=>r()));
    else if(e.isDirectory){const rd=e.createReader();let batch;do{batch=await new Promise(r=>rd.readEntries(r,()=>r([])));for(const x of batch)await walk(x)}while(batch.length)}
  };
  for(const e of entries)await walk(e);
  return out;
}

/* ---------- 갤러리 정렬 (끌어서 옮기기 · 묶음 · 비슷한 것끼리) ---------- */
const SORTABLE_JS="https://cdnjs.cloudflare.com/ajax/libs/Sortable/1.15.2/Sortable.min.js";
let sortableP=null,sortables=[];
function loadSortable(){return sortableP??=new Promise((res,rej)=>{const sc=document.createElement("script");sc.src=SORTABLE_JS;sc.onload=()=>res(window.Sortable);sc.onerror=()=>{sortableP=null;rej(new Error("Sortable을 불러오지 못했어요"))};document.head.appendChild(sc)})}
// 칸(쉬움·중간·어려움·완료) 안에서 카드·묶음 줄을 아무 자리로, 카드는 묶음 줄 안팎으로 옮긴다
async function bindSortables(){
  sortables.forEach(x=>x.destroy());sortables=[];
  const lists=[...main.querySelectorAll("[data-list],[data-blist]")];if(!lists.length||TR.selecting)return;
  let Sortable;try{Sortable=await loadSortable()}catch(e){console.warn(e);return}
  if(!lists[0].isConnected)return;
  // forceFallback: 브라우저 기본 드래그 대신 마우스·터치 이벤트로 움직여서 격자 안 자리 이동이 맥·폰에서 똑같이 된다
  const common={animation:150,delay:220,delayOnTouchOnly:true,touchStartThreshold:5,forceFallback:true,fallbackTolerance:4,fallbackOnBody:true,filter:".tr-statebtn,.tr-bundle-head button",preventOnFilter:false,ghostClass:"tr-ghost",chosenClass:"tr-chosen",fallbackClass:"tr-fallback",swapThreshold:.65,emptyInsertThreshold:12,onStart:()=>{TR.dragging=true},onEnd:onGalleryDrop};
  sortables=lists.map(el=>el.dataset.blist!==undefined
    ?Sortable.create(el,{...common,group:{name:"tr-gallery",put:(to,from,drag)=>!drag.classList.contains("tr-bundle")},draggable:".tr-card-item"})
    :Sortable.create(el,{...common,group:"tr-gallery",draggable:".tr-card-item,.tr-bundle"}));
}
// 모든 카드에 서로 다른 sort_order를 매겨 둔다 (처음 끌 때 한 번)
function normalizeOrder(s){
  const all=itemsOf(s.id).sort(galleryCmp),rows=[];
  if(all.every(i=>i.sort_order!=null)&&new Set(all.map(i=>i.sort_order)).size===all.length)return rows;
  all.forEach((i,n)=>{const v=(n+1)*1024;if(i.sort_order!==v){i.sort_order=v;rows.push(i)}});
  return rows;
}
const nodeItems=el=>(el.classList.contains("tr-bundle")?[...el.querySelectorAll("[data-item]")].map(x=>x.dataset.item):[el.dataset.item]).map(id=>byId("items",id)).filter(Boolean);
function edgeOrder(el,side){const v=nodeItems(el).map(i=>i.sort_order);return v.length?(side==="min"?Math.min(...v):Math.max(...v)):null}
function siblingNode(el,dir){let x=el;do{x=dir<0?x.previousElementSibling:x.nextElementSibling}while(x&&!x.matches(".tr-card-item,.tr-bundle"));return x}
// lo와 hi 사이에 n개 값을 고르게 (한쪽이 없으면 1024 간격)
function spread(lo,hi,n){return Array.from({length:n},(_,i)=>lo!=null&&hi!=null?lo+(hi-lo)*(i+1)/(n+1):lo!=null?lo+1024*(i+1):hi!=null?hi-1024*(n-i):1024*(i+1))}
async function onGalleryDrop(evt){
  TR.dragging=false;
  const el=evt.item,s=season(),fromB=evt.from.dataset.blist,toB=evt.to.dataset.blist,isBundle=el.classList.contains("tr-bundle");
  if(!s||(evt.from===evt.to&&evt.oldIndex===evt.newIndex)){render();return}
  const changed=new Map(normalizeOrder(s).map(r=>[r.id,r])),moved=nodeItems(el);
  const section=evt.to.closest("[data-list]")?.dataset.list;
  // 완료 칸으로 옮기면 (카드든 묶음 줄이든) 완료 처리. 완료 칸은 완료 시각 순이라 위치는 저장하지 않는다
  if(section==="done"){if(changed.size)await put({items:[...changed.values()]});for(const it of moved)if(!isDone(it))await setDone(it.id,true);render();return}
  // 새 자리의 앞뒤 이웃 사이로. 묶음 줄 안의 맨 앞/맨 뒤면 묶음 줄 바깥 이웃을 기준으로
  const prev=siblingNode(el,-1),next=siblingNode(el,1);
  let lo=prev?edgeOrder(prev,"max"):null,hi=next?edgeOrder(next,"min"):null;
  if(toB){const b=evt.to.closest(".tr-bundle");if(!prev){const x=siblingNode(b,-1);lo=x?edgeOrder(x,"max"):null}if(!next){const x=siblingNode(b,1);hi=x?edgeOrder(x,"min"):null}}
  const vals=spread(lo,hi,moved.length);
  moved.forEach((it,n)=>{
    // 우선순위 칸이면 난이도는 그대로 두고 표시만, 난이도 칸이면 우선순위에서 내린다
    const row={...(changed.get(it.id)||it),sort_order:vals[n]};
    if(section==="P")row.pinned_at=it.pinned_at||nowISO();else{row.difficulty=section;row.pinned_at=null}
    if(!isBundle)row.group_id=toB||null;
    if(isDone(it)){row.status="todo";row.completed_at=null;row.confirmed=true}
    changed.set(it.id,row);
  });
  await put({items:[...changed.values()]});
  if(fromB&&fromB!==toB)await dissolveSmallGroups([fromB]);
}
function nextGroupName(s){const names=new Set(TR.data.groups.filter(g=>g.season_id===s.id).map(g=>g.name));let n=names.size+1;while(names.has(`묶음 ${n}`))n++;return `묶음 ${n}`}
// 선택한 카드를 한 묶음으로: 첫 카드 자리·난이도로 모아서 한 줄에
async function makeGroup(s,ids){
  const changed=new Map(normalizeOrder(s).map(r=>[r.id,r]));
  const all=itemsOf(s.id).sort(galleryCmp),picked=all.filter(i=>ids.includes(i.id));if(picked.length<2)return;
  const first=picked[0],after=all.slice(all.indexOf(first)+1).find(i=>!ids.includes(i.id));
  const vals=[first.sort_order,...spread(first.sort_order,after?.sort_order??null,picked.length-1)];
  const now=TR.data.groups.filter(g=>g.season_id===s.id),g={id:crypto.randomUUID(),season_id:s.id,name:nextGroupName(s),sort:Math.max(0,...now.map(x=>x.sort||0))+1};
  const old=new Set(picked.map(i=>i.group_id).filter(Boolean));
  picked.forEach((it,n)=>changed.set(it.id,{...(changed.get(it.id)||it),group_id:g.id,sort_order:vals[n],difficulty:isDone(it)?it.difficulty:(first.difficulty||"M")}));
  await put({groups:[g],items:[...changed.values()]});
  await dissolveSmallGroups(old);
  toast(`🔗 ${g.name} · ${picked.length}건을 한 줄로 묶었어요. 이름은 눌러서 바꿀 수 있어요.`,3500);
}
// 1건 이하로 줄어든 묶음은 풀어 버린다
async function dissolveSmallGroups(gids){
  for(const gid of gids){
    const g=byId("groups",gid);if(!g)continue;
    const left=TR.data.items.filter(i=>i.group_id===gid);
    if(left.length>=2)continue;
    if(left.length)await put({items:left.map(i=>({...i,group_id:null}))});
    await remove("groups",gid);
  }
}

/* ---------- 비슷한 것끼리: 같은 참고 그림 찾기 ---------- */
// 의뢰서 표 아래쪽 "FG 참고자료" 칸에서 그림 덩어리를 하나씩 잘라 비교한다.
// 실제 썸네일로 맞춘 기준: 같은 그림 ≤0.034, 다른 그림 ≥0.052
const REF={x0:.045,x1:.465,y0:.615,y1:.965,w:220};
const FEATS=new Map();
function sampleRect(im,sx,sy,sw,sh,size){
  const c=document.createElement("canvas");c.width=size;c.height=size;
  const ctx=c.getContext("2d",{willReadFrequently:true});ctx.imageSmoothingQuality="high";ctx.drawImage(im,sx,sy,sw,sh,0,0,size,size);
  return ctx.getImageData(0,0,size,size).data;
}
function refBlobsOf(im){
    const W=REF.w,cx=im.width*REF.x0,cy=im.height*REF.y0,cw=im.width*(REF.x1-REF.x0),ch=im.height*(REF.y1-REF.y0),H=Math.max(1,Math.round(ch*W/cw));
    const c=document.createElement("canvas");c.width=W;c.height=H;
    const ctx=c.getContext("2d",{willReadFrequently:true});ctx.imageSmoothingQuality="high";ctx.drawImage(im,cx,cy,cw,ch,0,0,W,H);
    const px=ctx.getImageData(0,0,W,H).data,N=W*H,I=new Int32Array((W+1)*(H+1));
    // 흰 바탕이 아닌 칸 → 5x5 안에 15칸 이상일 때만 (표 테두리·화살표 같은 얇은 선 제거)
    for(let y=0;y<H;y++){let row=0;for(let x=0;x<W;x++){const o=(y*W+x)*4,r=px[o],g=px[o+1],b=px[o+2],mx=Math.max(r,g,b),mn=Math.min(r,g,b);row+=(mn<225||(mx&&(mx-mn)/mx>.1))?1:0;I[(y+1)*(W+1)+x+1]=I[y*(W+1)+x+1]+row}}
    const cnt=(x0,y0,x1,y1)=>{x0=Math.max(0,x0);y0=Math.max(0,y0);x1=Math.min(W,x1);y1=Math.min(H,y1);return I[y1*(W+1)+x1]-I[y0*(W+1)+x1]-I[y1*(W+1)+x0]+I[y0*(W+1)+x0]};
    const mask=new Uint8Array(N);for(let y=0;y<H;y++)for(let x=0;x<W;x++)mask[y*W+x]=cnt(x-2,y-2,x+3,y+3)>=15?1:0;
    const seen=new Uint8Array(N),q=new Int32Array(N),out=[];
    for(let s0=0;s0<N;s0++){
      if(!mask[s0]||seen[s0])continue;
      let h=0,t=0,n=0,bx0=W,bx1=0,by0=H,by1=0;q[t++]=s0;seen[s0]=1;
      while(h<t){const p=q[h++],x=p%W,y=(p-x)/W;n++;if(x<bx0)bx0=x;if(x>bx1)bx1=x;if(y<by0)by0=y;if(y>by1)by1=y;
        for(const np of [y+1<H?p+W:-1,y>0?p-W:-1,x+1<W?p+1:-1,x>0?p-1:-1])if(np>=0&&mask[np]&&!seen[np]){seen[np]=1;q[t++]=np}}
      const bw=bx1-bx0+1,bh=by1-by0+1;if(n<.02*N||bw<.1*W||bh<.1*H)continue;
      const f=cw/W,sx=cx+bx0*f,sy=cy+by0*f,sw=bw*f,sh=bh*f;
      const g=sampleRect(im,sx,sy,sw,sh,12),grid=new Float32Array(432);for(let i=0,k=0;i<g.length;i+=4){grid[k++]=g[i]/255;grid[k++]=g[i+1]/255;grid[k++]=g[i+2]/255}
      const hp=sampleRect(im,sx,sy,sw,sh,48),hist=new Float32Array(64);let keep=0;
      for(let i=0;i<hp.length;i+=4)if(!(hp[i]>235&&hp[i+1]>235&&hp[i+2]>235))keep++;
      for(let i=0;i<hp.length;i+=4){if(keep>20&&hp[i]>235&&hp[i+1]>235&&hp[i+2]>235)continue;hist[(hp[i]>>6)*16+(hp[i+1]>>6)*4+(hp[i+2]>>6)]++}
      const tot=hist.reduce((a,v)=>a+v,0)||1;for(let i=0;i<64;i++)hist[i]/=tot;
      out.push({grid,hist,ar:bw/bh});
    }
    return out;
}
function refDist(a,b){
  let g=0,h=0;for(let i=0;i<432;i++)g+=Math.abs(a.grid[i]-b.grid[i]);for(let i=0;i<64;i++)h+=Math.abs(a.hist[i]-b.hist[i]);
  return (g/432+.15*Math.abs(Math.log(a.ar/b.ar)))*.6+h/2*.2;
}
// 참고 그림이 없으면(완성본 썸네일 등) 전체 색 분포 + 왼쪽 칸 밝기 배치로 비교
function wholeFeatures(im){
  const w=64,h=Math.max(1,Math.round(im.height*w/im.width)),c=document.createElement("canvas");c.width=w;c.height=h;
  const ctx=c.getContext("2d",{willReadFrequently:true});ctx.drawImage(im,0,0,w,h);
  const px=ctx.getImageData(0,0,w,h).data,hist=new Float32Array(64);let n=0;
  for(let o=0;o<px.length;o+=4){const r=px[o],g=px[o+1],b=px[o+2];if(r>235&&g>235&&b>235)continue;hist[(r>>6)*16+(g>>6)*4+(b>>6)]++;n++}
  if(n)for(let i=0;i<64;i++)hist[i]/=n;
  const gw=12,gh=10,g2=document.createElement("canvas");g2.width=gw;g2.height=gh;
  const x2=g2.getContext("2d",{willReadFrequently:true});x2.drawImage(im,0,0,im.width/2,im.height,0,0,gw,gh);
  const p2=x2.getImageData(0,0,gw,gh).data,lay=new Float32Array(gw*gh);let mean=0,norm=0;
  for(let i=0;i<lay.length;i++){lay[i]=(p2[i*4]+p2[i*4+1]+p2[i*4+2])/765;mean+=lay[i]}mean/=lay.length;
  for(let i=0;i<lay.length;i++){lay[i]-=mean;norm+=lay[i]*lay[i]}norm=Math.sqrt(norm)||1;for(let i=0;i<lay.length;i++)lay[i]/=norm;
  return {hist,lay};
}
async function itemFeatures(it){
  if(FEATS.has(it.thumb_path))return FEATS.get(it.thumb_path);
  const im=await createImageBitmap(await (await fetch(TR.thumbs[it.id],{mode:"cors"})).blob());
  try{const f={refs:it.auto_done===true?[]:refBlobsOf(im),whole:wholeFeatures(im)};FEATS.set(it.thumb_path,f);return f}finally{im.close?.()}
}
function itemDist(a,b){
  if(a.refs.length&&b.refs.length){let m=Infinity;for(const x of a.refs)for(const y of b.refs)m=Math.min(m,refDist(x,y));return m}
  let h=0,dot=0;for(let i=0;i<64;i++)h+=Math.abs(a.whole.hist[i]-b.whole.hist[i]);for(let i=0;i<a.whole.lay.length;i++)dot+=a.whole.lay[i]*b.whole.lay[i];
  return .3+(h/2+(1-dot)/2)/2;
}
// 난이도 칸마다 같은 참고 그림을 쓰는 의뢰서가 옆에 오도록 순서를 다시 매긴다 (가까운 것부터 이어 붙이기)
async function arrangeSimilar(){
  if(!guardOnline())return;
  const s=season();if(!s)return;
  const tab=TR.conceptTab,changed=new Map(normalizeOrder(s).map(r=>[r.id,r]));
  let moved=0;TR.progress="비슷한 것끼리 정리 중";render();
  try{
    for(const [k] of DIFF){
      const list=itemsOf(s.id).filter(i=>!isDone(i)&&(i.difficulty||"M")===k&&(tab==="all"||i.concept_id===tab)).sort(galleryCmp);
      const feats=new Map();
      for(const it of list)if(TR.thumbs[it.id]&&it.thumb_path){try{feats.set(it.id,await itemFeatures(it))}catch(e){console.warn(e)}}
      const pool=list.filter(i=>feats.has(i.id));if(pool.length<3)continue;
      const chain=[pool[0]],rest=new Set(pool.slice(1));
      while(rest.size){const last=feats.get(chain[chain.length-1].id);let best=null,bd=Infinity;for(const c of rest){const dd=itemDist(last,feats.get(c.id));if(dd<bd){bd=dd;best=c}}chain.push(best);rest.delete(best)}
      const seq=[...chain,...list.filter(i=>!feats.has(i.id))],slots=list.map(i=>i.sort_order).sort((a,b)=>a-b);
      seq.forEach((it,n)=>{if(it.sort_order!==slots[n]){changed.set(it.id,{...(changed.get(it.id)||it),sort_order:slots[n]});moved++}});
    }
  }finally{TR.progress=""}
  if(changed.size)await put({items:[...changed.values()]});else render();
  toast(moved?"같은 참고 그림을 쓰는 것끼리 옆에 붙였어요. 묶으려면 ☑︎ 선택 → 🔗 묶기.":"바꿀 게 없었어요. 같은 난이도 칸에 썸네일 있는 카드가 3개 이상일 때 정리돼요.",4500);
}

/* ---------- 화면 ---------- */
let root,main,sheet,toastTimer,tick;
function toast(msg,ms=2600){const t=root?.querySelector(".tr-toast");if(!t)return;t.textContent=msg;t.classList.add("on");clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove("on"),ms)}
const thumbHTML=(it,cls="")=>TR.thumbs[it.id]?`<img class="tr-thumb ${cls}" src="${esc(TR.thumbs[it.id])}" alt="${esc(it.code)}" loading="lazy">`:`<div class="tr-thumb tr-thumb-empty ${cls}"><span>${esc(it.item_type||"")}</span></div>`;
const conceptName=id=>byId("concepts",id)?.name||"";
// 컨셉 색: 설정에서 고른 색 → 이름 키워드(클로버=초록, 런드리=주황, 장미·러블리=분홍…) → 안 쓴 색 순서대로
const PALETTE={green:["초록","#5c9a58","#eaf4e5"],orange:["주황","#d27f36","#fcefe0"],pink:["분홍","#cc5c84","#fbe9f0"],blue:["하늘","#4a8cc0","#e6f0f9"],purple:["보라","#8767bd","#f1ebf9"],yellow:["노랑","#b8921c","#faf3d6"],teal:["청록","#37968f","#e1f3f1"],brown:["갈색","#986a49","#f3ebe3"],red:["빨강","#c64e48","#f9e5e3"],gray:["회색","#6f6a65","#ecebe8"],white:["흰색","#8a8178","#ffffff"]};
// 회색·흰색은 직접 고를 때만 (자동 배정에서는 빼서 컨셉끼리 구분이 잘 되게)
const AUTO_COLORS=Object.keys(PALETTE).filter(k=>k!=="gray"&&k!=="white");
const COLOR_WORDS=[[/클로버|clover|그린|green|민트|mint|올리브/i,"green"],[/런드리|laundry|오렌지|orange|피치|peach|귤|살구/i,"orange"],[/장미|로즈|rose|러블리|lovely|핑크|pink|체리|cherry|딸기|하트/i,"pink"],[/블루|blue|오션|바다|스카이|sky|마린|데님/i,"blue"],[/라벤더|퍼플|purple|바이올렛|포도/i,"purple"],[/레몬|lemon|옐로|yellow|선샤인|써니|sunny|바나나/i,"yellow"],[/티얼|teal|에메랄드|아쿠아/i,"teal"],[/곰|베어|브라운|brown|커피|코코아|초코/i,"brown"],[/레드|red|토마토/i,"red"],[/그레이|회색|gray|grey|차콜|charcoal/i,"gray"],[/화이트|흰|white|아이보리|ivory/i,"white"]];
function conceptColor(cid){
  const c=byId("concepts",cid);if(!c)return PALETTE.brown;
  const s=byId("seasons",c.season_id),pick=s?.settings?.concept_colors?.[cid];
  if(PALETTE[pick])return PALETTE[pick];
  const word=k=>COLOR_WORDS.find(([re])=>re.test(nfc(byId("concepts",k)?.name)))?.[1];
  const own=word(cid);if(own)return PALETTE[own];
  const list=conceptsOf(c.season_id),used=new Set(list.map(x=>s?.settings?.concept_colors?.[x.id]||word(x.id)).filter(Boolean));
  const free=AUTO_COLORS.filter(k=>!used.has(k)),rest=list.filter(x=>!PALETTE[s?.settings?.concept_colors?.[x.id]]&&!word(x.id));
  return PALETTE[free[rest.findIndex(x=>x.id===cid)%Math.max(1,free.length)]||"brown"];
}
const cvars=cid=>{const [,base,bg]=conceptColor(cid);return `--cc:${base};--cc-bg:${bg}`};
const RISK={none:["–",""],done:["완료","done"],ok:["정상","ok"],warn:["주의","warn"],risk:["위험","risk"]};

function build(){
  root=document.createElement("div");root.id="tracker";root.className="tr";root.hidden=true;
  root.innerHTML=`<div class="tr-wrap"><header class="tr-top"><div class="tr-head"><button class="tr-back" data-act="close" aria-label="비서로 돌아가기">‹ 비서</button><h2>🎯 마감 트래커</h2><span class="tr-state" id="tr-state"></span></div><nav class="tr-tabs">${[["today","오늘"],["season","시즌"],["log","기록"],["settings","설정"]].map(([k,l])=>`<button data-view="${k}">${l}</button>`).join("")}</nav></header><main id="tr-main"></main></div><div class="tr-dropzone" aria-hidden="true"><div>여기에 놓으면 등록돼요<small>.ai · .pdf · 폴더</small></div></div><dialog id="tr-sheet" class="tr-sheet"></dialog><input type="file" id="tr-file" multiple accept=".ai,.pdf,image/*" hidden><input type="file" id="tr-folder" webkitdirectory multiple hidden><input type="file" id="tr-thumb-file" accept=".ai,.pdf,image/*" hidden><div class="tr-toast" role="status"></div>`;
  document.body.appendChild(root);
  main=root.querySelector("#tr-main");sheet=root.querySelector("#tr-sheet");
  root.addEventListener("click",onClick);
  root.addEventListener("change",onChange);
  root.querySelector("#tr-file").onchange=e=>{importFiles([...e.target.files]);e.target.value=""};
  root.querySelector("#tr-folder").onchange=e=>{importFiles([...e.target.files]);e.target.value=""};
  root.addEventListener("keydown",e=>{if(e.key==="Enter"&&e.target.matches?.("[data-open][role=button]"))openSheet(e.target.dataset.open)});
  root.querySelector("#tr-thumb-file").onchange=e=>{const f=e.target.files[0];if(f&&TR.detail)replaceThumb(TR.detail,f);e.target.value=""};
  sheet.addEventListener("close",()=>{TR.detail=null});
  sheet.addEventListener("click",e=>{if(e.target===sheet)sheet.close()});
  // 드래그: 전체 화면에 놓으면 일괄 등록, 카드 위에 놓으면 그 카드 썸네일 교체
  let depth=0;
  root.addEventListener("dragenter",e=>{if(![...(e.dataTransfer?.types||[])].includes("Files"))return;depth++;root.classList.add("dragging")});
  root.addEventListener("dragleave",()=>{depth=Math.max(0,depth-1);if(!depth)root.classList.remove("dragging")});
  root.addEventListener("dragover",e=>{if(![...(e.dataTransfer?.types||[])].includes("Files"))return;e.preventDefault();const card=e.target.closest?.("[data-item]");root.querySelectorAll(".drop-target").forEach(x=>x!==card&&x.classList.remove("drop-target"));card?.classList.add("drop-target")});
  root.addEventListener("drop",async e=>{
    e.preventDefault();depth=0;root.classList.remove("dragging");
    root.querySelectorAll(".drop-target").forEach(x=>x.classList.remove("drop-target"));
    // 카드 끌어서 옮기기(SortableJS)도 drop 이벤트가 나서, 진짜 파일을 놓았을 때만 등록한다
    if(![...(e.dataTransfer?.types||[])].includes("Files"))return;
    const card=e.target.closest?.("[data-item]");
    const files=await filesFromDrop(e.dataTransfer);
    if(card&&files.length===1)replaceThumb(card.dataset.item,files[0]);else importFiles(files);
  });
  document.addEventListener("paste",e=>{
    if(!TR.open)return;
    const f=[...(e.clipboardData?.items||[])].find(i=>i.type.startsWith("image/"))?.getAsFile();if(!f)return;
    e.preventDefault();
    if(TR.detail)replaceThumb(TR.detail,f);else toast("썸네일을 바꿀 카드를 먼저 열고 붙여넣어 주세요.");
  });
}
function openTracker(){
  if(!root)build();
  TR.open=true;root.hidden=false;document.body.classList.add("tr-on");
  if(location.hash!=="#tracker")history.replaceState(null,"",location.pathname+location.search+"#tracker");
  render();
  if(!getApiKey()){return}
  refresh();
  // 1초마다 타이머, 30초마다 오늘 화면을 다시 그려서 시간표(남은 분·지금 위치)가 흐르게
  let sec=0;clearInterval(tick);tick=setInterval(()=>{if(!TR.open)return;updateTimers();if(++sec%30===0&&TR.view==="today"&&!sheet.open&&!TR.dragging&&!TR.selecting)render()},1000);
}
function closeTracker(){TR.open=false;if(root)root.hidden=true;document.body.classList.remove("tr-on");clearInterval(tick);if(location.hash==="#tracker")history.replaceState(null,"",location.pathname+location.search)}
function updateTimers(){const x=activeSession();root.querySelectorAll("[data-tick]").forEach(el=>{el.textContent=x?mmss(elapsedMs(x)):"00:00"})}

function render(){
  if(!root||!TR.open||TR.dragging)return;
  root.querySelectorAll("[data-view]").forEach(b=>b.classList.toggle("on",b.dataset.view===TR.view));
  const state=root.querySelector("#tr-state");
  state.textContent=TR.progress?`⏳ ${TR.progress}`:TR.offline?"오프라인 · 마지막 내용":TR.loaded?"":"불러오는 중";
  state.className="tr-state"+(TR.offline?" err":"");
  if(!getApiKey()){main.innerHTML=`<section class="card tr-card"><h3>🔐 먼저 비서 연결이 필요해요</h3><p class="tr-sub">‹ 비서로 돌아가서 연결 키를 넣어 주세요.</p></section>`;return}
  if(!TR.loaded){main.innerHTML=`<div class="empty">불러오는 중…</div>`;return}
  const s=season();
  if(!s&&TR.view!=="settings"){main.innerHTML=seasonSetup();return}
  main.innerHTML=TR.view==="season"?viewSeason(s):TR.view==="log"?viewLog(s):TR.view==="settings"?viewSettings(s):viewToday(s);
  root.style.setProperty("--tr-top-h",root.querySelector(".tr-top").offsetHeight+"px");
  if(TR.view==="season")bindSortables();else if(sortables.length){sortables.forEach(x=>x.destroy());sortables=[]}
  updateTimers();
  if(TR.detail&&sheet.open)renderSheet();
}
function seasonSetup(){
  return `<section class="card tr-card"><h3>시즌부터 만들어요</h3><p class="tr-sub">마감일과 검수 여유일로 하루 필요량을 계산해요.</p><form class="tr-form" data-form="season-new"><label>시즌<input name="name" value="27SS" required></label><label>마감일<input type="date" name="deadline" value="2026-11-03" required></label><label>검수 여유일 <small>영업일</small><input type="number" name="review_days" min="0" max="10" value="1"></label><button class="tr-btn primary" type="submit">시즌 만들기</button></form></section>`;
}
// 오늘 목표는 작업 수(묶음 = 1)로, 파일 개수는 괄호로
function goalBar(p){
  const done=p.doneTodayU.length,files=p.doneToday.length,pct=p.goal?Math.min(100,Math.round(done/p.goal*100)):100,st=p.st;
  const left=st.bundles?`남은 작업 <b class="tr-em">${st.uRemaining}</b>건 (파일 ${st.remaining}개)`:`남은 <b class="tr-em">${st.remaining}</b>건`;
  if(!p.workday)return `<section class="card tr-card tr-goal"><div class="tr-goal-head"><div><div class="tr-eyebrow">오늘</div><h3>오늘은 쉬는 날이에요</h3></div></div><p class="tr-goal-info">${st.end?`다음 작업일 ${md(p.nextWorkday)} · ${left} · 하루 <b>${st.uNeed}</b>건씩`:"설정에서 마감일을 정하면 하루 목표가 나와요."}${files?` · 오늘 파일 ${files}개 완료`:""}</p></section>`;
  const met=p.goal&&done>=p.goal;
  // 오늘 여기서 멈추면 내일 목표가 몇 건이 되는지 (완료할 때마다 바로 다시 계산)
  const tomorrow=!st.leftTomorrow?`<span class="tr-goal-tomorrow">⚠️ 오늘이 마지막 제작일이에요</span>`:met?`<span class="tr-goal-tomorrow ok">오늘 목표 채웠어요 → 내일 목표 <b>${p.tomorrowIfStop}</b>건</span>`:`<span class="tr-goal-tomorrow">오늘 더 못 하면 → 내일 목표 <b class="tr-em">${p.tomorrowIfStop}</b>건 · 오늘 목표 채우면 → <b>${p.tomorrowIfGoal}</b>건</span>`;
  return `<section class="card tr-card tr-goal"><div class="tr-goal-head"><div><div class="tr-eyebrow">오늘 목표</div><h3><b>${done}</b> / ${p.goal}건${p.goalFiles!==p.goal?` <small class="tr-goal-files">파일 ${files} / ${p.goalFiles}개</small>`:""}</h3></div></div><div class="tr-bar"><i style="width:${pct}%"></i></div><p class="tr-goal-info">${st.overdue?"⚠️ 제작 마감이 지났어요. 남은 걸 오늘 몫으로 잡았어요.":`제작 마감 ${md(st.end)}까지 <b>${st.left}</b>일 · ${left}`}${met?" · 🎉 오늘 목표 달성!":""}${tomorrow}${p.carry?`<span class="tr-goal-note">지난 작업일에 밀린 ${p.carry}건은 한꺼번에 얹지 않고 남은 날에 나눠 담았어요</span>`:""}${st.bundles?`<span class="tr-goal-note">묶음은 1건으로 세요 · 묶음 안 의뢰서가 다 끝나야 완료</span>`:""}</p></section>`;
}
// 오늘 시간표: 지금 하는 건에 남은 시간(크게) + 출근~퇴근(야근) 타임라인 (끝낸 칸 · 지금 칸 · 남은 칸 · 점심·쉼)
function timeCard(s,p){
  if(!p.workday||!p.goal)return"";
  const t=timePlan(s,p),c=t.c,span=c.e-c.s,pos=m=>Math.max(0,Math.min(100,(m-c.s)/span*100));
  const m=v=>fmtDur(v),over=t.R&&t.slotLeft<0;
  const otBtns=(label)=>`<div class="tr-ot"><span>${label}</span>${[60,120,180].map(x=>`<button class="tr-btn sm" data-ot="${x}">${x/60}시간</button>`).join("")}<button class="tr-btn sm ghost" data-ot="pick">직접</button></div>`;
  let big,sub,extraUI="";
  if(t.phase==="before"){big=`${clock(c.s)} 시작`;sub=`오늘 ${t.R}건 · 건당 약 <b>${m(t.base)}</b>`}
  else if(t.phase==="after"){
    if(t.R){big="퇴근 시간이 지났어요";sub=`남은 ${t.R}건은 내일 목표에 나눠 담겨요 (지금이면 내일 <b>${p.tomorrowIfStop}</b>건)`;extraUI=otBtns("🌙 더 할래요")}
    else{big="오늘 몫 끝! 🎉";sub=t.extra?`목표보다 <b class="tr-ok">+${t.extra}건</b> 더 했어요 · 내일 목표 <b>${p.tomorrowIfStop}</b>건`:`푹 쉬어요 · 더 하면 내일이 가벼워져요 (내일 목표 <b>${p.tomorrowIfStop}</b>건)`;extraUI=otBtns("🌙 조금 더 할래요")}
  }
  else if(!t.R){
    big=t.overtime?"🌙 보너스 타임":"오늘 몫 끝! 🎉";
    sub=`${t.overtime?`야근 끝(${clock(c.e)})까지`:"퇴근까지"} <b>${m(t.nowRem)}</b>${t.extra?` · 목표보다 <b class="tr-ok">+${t.extra}건</b>`:""} · 하나 더 할 때마다 내일 목표가 줄어요 (지금 내일 <b>${p.tomorrowIfStop}</b>건)`;
  }
  else{
    big=over?`<span class="tr-over">+${m(-t.slotLeft)} 초과</span>`:`남은 <b data-budget>${m(t.slotLeft)}</b>`;
    const diff=Math.round(t.slotLen-t.base);
    sub=`이 건에 쓸 시간 <b>${m(t.slotLen)}</b>${!t.overtime&&Math.abs(diff)>=1?` <span class="${diff>0?"tr-ok":"tr-em"}">(아침보다 ${diff>0?"+":""}${diff}분)</span>`:""}${t.nextEach?` · 지금 끝내면 남은 ${t.R-1}건에 <b>${m(t.nextEach)}</b>씩`:" · 이게 오늘 마지막이에요"}`;
    if(t.phase==="lunch")sub=`🍚 점심시간 · ${clock(c.le)}부터 다시 · `+sub;
    if(t.phase==="gap")sub=`☕ 쉬는 중 · ${clock(c.ot.s)}부터 야근 · `+sub;
  }
  // 타임라인 (야근이면 끝까지 늘어나고 야근 구간은 남색 바탕)
  const seg=(a,b2,cls,title="")=>clockSegs(a,b2,c).map(([x,y])=>`<i class="tr-tl-seg ${cls}" style="left:${pos(x)}%;width:${Math.max(.4,pos(y)-pos(x))}%" title="${esc(title)}"></i>`).join("");
  let bars=c.breaks.map(([x,y])=>`<i class="tr-tl-lunch ${x===c.ls?"":"gap"}" style="left:${pos(x)}%;width:${pos(y)-pos(x)}%"></i>`).join("");
  if(c.ot)bars=`<i class="tr-tl-ot" style="left:${pos(c.ot.s)}%;width:${pos(c.ot.e)-pos(c.ot.s)}%"></i>`+bars;
  t.ends.forEach((e,i)=>{const st=i?t.ends[i-1]:c.s,u=t.doneU[i];bars+=seg(st,e,i>=p.goal?"done bonus":"done",`${clock(e)} 완료 · ${u.group?u.group.name:u.items[0].code}`)});
  if(t.R&&t.phase!=="after"){
    const curEnd=Math.min(c.e,t.slotEnd);
    bars+=seg(t.slotStart,curEnd,"cur","지금 하는 건");
    if(over&&t.now>curEnd)bars+=seg(curEnd,Math.min(t.now,c.e),"overrun","초과");
    const fs=Math.max(curEnd,over?t.now:curEnd),each=t.R>1?workBetween(fs,c.e,c)/(t.R-1):0;
    for(let k=0;k<t.R-1;k++)bars+=seg(addWork(fs,each*k,c),Math.min(c.e,addWork(fs,each*(k+1),c)),"next");
  }
  const ticks=[],step=span>720?2:1;for(let h=Math.ceil(c.s/60);h*60<=c.e;h+=step)ticks.push(`<span style="left:${pos(h*60)}%">${h}</span>`);
  const nowMark=t.now>=c.s&&t.now<=c.e?`<b class="tr-tl-now" style="left:${pos(t.now)}%"><em>${clock(Math.floor(t.now))}</em></b>`:"";
  const otInfo=c.ot?` · 🌙 야근 ${clock(c.ot.s)}–${clock(c.ot.e)}`:"";
  const otCtl=t.overtime||t.phase==="gap"?`<div class="tr-ot"><span>🌙 야근 중 · ${clock(c.ot.e)}까지</span><button class="tr-btn sm" data-ot="ext">+1시간</button><button class="tr-btn sm ghost" data-ot="end">야근 끝</button></div>`:"";
  return `<section class="card tr-card tr-timecard ${over&&t.phase==="work"?"over":""} ${t.overtime?"ot":""}"><div class="tr-time-head"><div><div class="tr-eyebrow">${t.overtime?"🌙 야근 중 · ":"⏱ "}지금 하는 건</div><div class="tr-time-big">${big}</div></div><span class="tr-time-hours">${clock(c.s)}–${clock(c.end0)} · 점심 ${clock(c.ls)}–${clock(c.le)}${otInfo}</span></div><p class="tr-time-sub">${sub}</p>${extraUI}${otCtl}<div class="tr-tl"><div class="tr-tl-track">${bars}${nowMark}</div><div class="tr-tl-ticks">${ticks.join("")}</div></div><div class="tr-tl-legend"><span><i class="done"></i>끝낸 것</span><span><i class="cur"></i>지금</span><span><i class="next"></i>남은 칸</span><span><i class="lunch"></i>점심·쉼</span>${c.ot?`<span><i class="ot"></i>야근</span>`:""}</div></section>`;
}
// 야근 시작·연장·끝 (오늘 날짜로 시즌 설정에 저장 → 맥·폰 같이)
async function setOvertime(kind){
  const s=season();if(!s)return;
  const c=workCfg(s),now=Math.floor(seoulMin()),cur=s.settings?.overtime?.date===todayISO()?s.settings.overtime:null;
  const fmt=v=>`${String(Math.floor(v/60)).padStart(2,"0")}:${String(v%60).padStart(2,"0")}`,cap=v=>Math.min(1439,v);
  let ot=null;
  if(kind==="end"){if(!cur)return;ot={...cur,end:fmt(Math.max(now,hhmm(cur.start)+1))}}
  else if(kind==="ext"){if(!cur)return;ot={...cur,end:fmt(cap(hhmm(cur.end)+60))}}
  else{
    let end;
    if(kind==="pick"){const v=prompt("야근 끝 시간 (예: 22:30)",fmt(cap(Math.max(now,c.end0)+120)));if(v===null)return;end=hhmm(v);if(end==null||end<=now){toast("지금보다 늦은 시간으로 적어 주세요. 예: 22:30");return}}
    else end=cap(Math.max(now,c.end0)+Number(kind));
    ot={date:todayISO(),start:fmt(Math.max(now,c.end0)),end:fmt(end)};
  }
  await put({seasons:[{...s,settings:{...(s.settings||{}),overtime:ot}}]});
  toast(kind==="end"?"야근 끝! 수고했어요 🌙":`🌙 ${ot.end}까지 야근으로 다시 나눴어요`);
}
function timerCard(){
  const x=activeSession();if(!x)return"";const it=byId("items",x.item_id);if(!it)return"";
  return `<section class="card tr-card tr-timer ${x.pause_started_at?"paused":""}"><div class="tr-timer-body"><button class="tr-thumb-btn" data-open="${esc(it.id)}">${thumbHTML(it,"sm")}</button><div><div class="tr-eyebrow">${x.pause_started_at?"⏸ 일시정지":"● 집중 중"} · ${hm(x.started_at)} 시작</div><h3>${esc(it.code)}</h3><div class="tr-sub">${esc(conceptName(it.concept_id))}</div></div><div class="tr-clock" data-tick>00:00</div></div><div class="tr-actions"><button class="tr-btn" data-act="pause">${x.pause_started_at?"▶ 재개":"⏸ 일시정지"}</button><button class="tr-btn" data-act="stop">■ 종료</button><button class="tr-btn primary" data-tdone="${esc(it.id)}">✓ 완료</button></div></section>`;
}
function heroCard(s,p){
  const act=activeSession();
  // 오늘 몫을 다 했으면 다음 작업일 것 중에서 "하나 더"를 보여준다
  const extra=!p.next.filter(id=>id!==act?.item_id).length&&p.st.uRemaining>0;
  const pool=(extra?p.order.map(i=>i.id):p.next).filter(id=>id!==act?.item_id);
  if(!pool.length&&act)return"";
  if(!pool.length)return p.st.target?`<section class="card tr-card tr-hero"><div class="tr-eyebrow">지금 이거부터</div><h3>${p.st.uRemaining?"오늘 몫은 다 끝냈어요 🎉":"시즌 의뢰서를 전부 끝냈어요 🎉"}</h3><p class="tr-sub">${p.st.uRemaining?`남은 ${p.st.uRemaining}건은 다음 작업일 몫이에요.`:"수고했어요!"}</p></section>`:`<section class="card tr-card tr-hero"><div class="tr-eyebrow">시작하기</div><h3>의뢰서를 등록해 주세요</h3><p class="tr-sub">시즌 탭에서 .ai 파일이나 폴더를 끌어다 놓으면 썸네일과 컨셉이 자동으로 정리돼요.</p><button class="tr-btn primary" data-view="season">시즌으로 가기</button></section>`;
  const it=byId("items",pool[TR.skip%pool.length]);
  return `<section class="card tr-card tr-hero"><button class="tr-hero-thumb" data-open="${esc(it.id)}">${thumbHTML(it,"lg")}</button><div class="tr-hero-body"><div class="tr-eyebrow">${extra?"🎉 오늘 몫 끝 · 여유 있으면 하나 더":"지금 이거부터"}${pool.length>1?` · ${TR.skip%pool.length+1}/${pool.length}`:""}</div><h3>${esc(it.code)}</h3><div class="tr-meta"><span class="tr-chip">${esc(conceptName(it.concept_id))}</span>${it.item_type?`<span class="tr-chip">${esc(typeName(s,it.item_type)||it.item_type)}</span>`:""}${p.carried.includes(it.id)?`<span class="tr-chip carry">이월</span>`:""}${it.important?`<span class="tr-chip">⭐</span>`:""}</div><p class="tr-reason">→ ${esc(reasonFor(it,s,p.st,p.carried))}</p><div class="tr-actions"><button class="tr-btn primary" data-focus="${esc(it.id)}">▶ 집중 시작</button>${pool.length>1?`<button class="tr-btn" data-act="skip">다른 거 ›</button>`:""}<button class="tr-btn ghost" data-tdone="${esc(it.id)}">✓ 완료</button></div></div></section>`;
}
function itemRow(it,p,s){
  const act=activeSession();
  return `<div class="tr-row ${isDone(it)?"done":""}" data-item="${esc(it.id)}"><button class="bigcheck ${isDone(it)?"on":""}" data-tdone="${esc(it.id)}" data-tundo="${isDone(it)?1:""}" title="${isDone(it)?"완료 취소":"완료"}">✓</button><button class="tr-thumb-btn" data-open="${esc(it.id)}">${thumbHTML(it,"xs")}</button><div class="tr-row-main"><div class="tr-row-title">${esc(it.code)}${p.carried.includes(it.id)&&!isDone(it)?` <span class="tr-chip carry">이월</span>`:""}${act?.item_id===it.id?` <span class="tr-chip live">집중 중</span>`:""}${it.group_id&&byId("groups",it.group_id)?` <span class="tr-chip">🔗 ${esc(byId("groups",it.group_id).name)}</span>`:""}</div><div class="tr-sub">${esc(conceptName(it.concept_id))}${it.item_type?" · "+esc(typeName(s,it.item_type)||it.item_type):""}${isDone(it)?" · "+esc(recordLine(it)):""}</div></div>${isDone(it)||act?.item_id===it.id?"":`<button class="tr-btn sm" data-focus="${esc(it.id)}">▶</button>`}</div>`;
}
function viewToday(s){
  const p=todayPlan(s);saveSnapshot(s,p);
  const todoItems=(p.workday?p.todo:p.next.slice(0,5)).map(id=>byId("items",id)).filter(Boolean);
  const shown=TR.oneOnly?todoItems.slice(0,1):todoItems;
  const unconfirmed=itemsOf(s.id).filter(i=>i.auto_done!=null&&!i.confirmed).length;
  return `${timerCard()}${goalBar(p)}${timeCard(s,p)}${heroCard(s,p)}
  ${unconfirmed?`<button class="tr-notice" data-view="season">🤖 자동 추정 확인이 필요한 의뢰서 ${unconfirmed}건 →</button>`:""}
  <section class="section"><div class="section-title"><h3>${p.workday?"오늘 할 의뢰서":"다음에 할 의뢰서"}</h3><span><button class="tr-link" data-act="one-only">${TR.oneOnly?"전체 보기":"다음 하나만"}</button></span></div><div class="tr-list">${shown.length?shown.map(it=>itemRow(it,p,s)).join(""):`<div class="empty">${p.st.target?"남은 의뢰서가 없어요.":"아직 등록된 의뢰서가 없어요."}</div>`}${TR.oneOnly&&todoItems.length>1?`<div class="tr-more">+ ${todoItems.length-1}건은 숨겨 뒀어요</div>`:""}</div></section>
  <section class="section"><div class="section-title"><h3>오늘 완료 기록</h3><span>${p.doneToday.length}건</span></div><div class="tr-list">${p.doneToday.length?[...p.doneToday].sort((a,b)=>(b.completed_at||"").localeCompare(a.completed_at||"")).map(it=>itemRow(it,p,s)).join(""):`<div class="empty">아직 완료한 의뢰서가 없어요.</div>`}</div></section>`;
}
const DIFF=[["S","쉬움"],["M","중간"],["L","어려움"]];
const DIFF_LABEL=Object.fromEntries(DIFF);
const ZOOMS=[120,160,220,300,420];
function galleryCard(it,s){
  const guess=it.auto_done!=null&&!it.confirmed,sel=TR.selecting&&TR.selected.has(it.id);
  return `<div class="tr-card-item ${isDone(it)?"done":""} ${sel?"selected":""}" style="${cvars(it.concept_id)}" data-item="${esc(it.id)}" data-open="${esc(it.id)}" role="button" tabindex="0"><div class="tr-card-thumb">${thumbHTML(it)}${TR.selecting?`<span class="tr-check" aria-hidden="true">${sel?"✓":""}</span>`:""}${it.important?`<span class="tr-badge star">⭐</span>`:""}<button class="tr-statebtn ${isDone(it)?"is-done":""}" data-tdone="${esc(it.id)}" data-tundo="${isDone(it)?1:""}" title="${isDone(it)?"누르면 미완료로":"누르면 완료로"}${guess?" (자동 추정)":""}">${isDone(it)?"✓ 완료":"미완료"}</button></div><span class="tr-card-label"><i class="tr-cdot"></i>${esc(it.code)}${it.item_type&&typeName(s,it.item_type)?` <small>${esc(typeName(s,it.item_type))}</small>`:""}</span></div>`;
}
// 묶음 줄: 묶은 카드만 무조건 한 줄 (많으면 카드가 작아진다)
function bundleRow(g,list,s){
  const all=itemsOf(s.id).filter(i=>i.group_id===g.id),done=all.filter(isDone).length;
  return `<div class="tr-bundle" data-bundle="${esc(g.id)}" style="--n:${list.length}"><div class="tr-bundle-head" title="끌어서 묶음째 옮기기"><span class="tr-grip" aria-hidden="true">⠿</span><button class="tr-gname" data-grename="${esc(g.id)}" title="이름 바꾸기">🔗 ${esc(g.name)}</button><span class="tr-gcount"><b>${all.length}</b>건${done?` · 완료 <b>${done}</b>`:""} · 하나 끝내면 나머지는 복붙</span><button class="tr-btn sm ghost" data-gundo="${esc(g.id)}">묶음 풀기</button></div><div class="tr-bundle-list" data-blist="${esc(g.id)}">${list.map(it=>galleryCard(it,s)).join("")}</div></div>`;
}
// 칸 안의 순서대로 카드를 놓되, 묶인 카드는 그 묶음의 첫 카드 자리에 묶음 줄로 모은다
function sectionBody(list,s){
  const out=[],seen=new Set();
  for(const it of list){
    const g=it.group_id&&byId("groups",it.group_id);
    if(!g){out.push(galleryCard(it,s));continue}
    if(seen.has(g.id))continue;seen.add(g.id);
    out.push(bundleRow(g,list.filter(x=>x.group_id===g.id),s));
  }
  return out.join("");
}
// 칸마다 아이콘 + 왼쪽 색 줄로 한눈에 구분
const SEC_ICON={P:"⭐",S:"🟢",M:"🟡",L:"🔴",done:"✅"};
function gallerySection(key,label,list,s,hint){
  const closed=!!TR.collapsed[key];
  return `<section class="tr-dsec ${closed?"closed":""}" data-sec="${key}"><button class="tr-dsec-head" data-collapse="${key}" aria-expanded="${!closed}" aria-label="${label} ${closed?"펼치기":"접기"}"><span class="tr-caret" aria-hidden="true"><svg viewBox="0 0 12 12" width="16" height="16"><path d="M1.5 3.5h9L6 9z" fill="currentColor"/></svg></span><b>${SEC_ICON[key]?SEC_ICON[key]+" ":""}${label}</b><span>${list.length}건</span>${hint?`<em>${hint}</em>`:""}</button><div class="tr-grid" data-list="${key}">${key==="done"?list.map(it=>galleryCard(it,s)).join(""):sectionBody(list,s)}${list.length?"":`<div class="tr-grid-empty">여기로 끌어다 놓기</div>`}</div></section>`;
}
function conceptTabs(s,items){
  const tab=TR.conceptTab;
  return `<div class="tr-ctabs"><button data-ctab="all" class="${tab==="all"?"on":""}">전체 ${items.length}</button>${conceptsOf(s.id).map(c=>`<button data-ctab="${esc(c.id)}" class="tr-ctab-c ${tab===c.id?"on":""}" style="${cvars(c.id)}">${esc(c.name)} <b>${items.filter(i=>i.concept_id===c.id).length}</b></button>`).join("")}</div>`;
}
function viewGallery(s,items){
  const tab=TR.conceptTab,shown=items.filter(i=>tab==="all"||i.concept_id===tab).sort(galleryCmp);
  const pending=shown.filter(i=>!isDone(i)),done=shown.filter(isDone).sort((a,b)=>(b.completed_at||"").localeCompare(a.completed_at||""));
  // 맨 위 우선순위 칸(먼저 할 것) → 쉬움·중간·어려움 → 완료
  const body=!shown.length?`<div class="empty">아직 의뢰서가 없어요.</div>`:`${gallerySection("P","우선순위",pending.filter(i=>i.pinned_at),s,"먼저 할 걸 여기로 끌어 올려요 · 이 순서대로 추천")}${DIFF.map(([k,l])=>gallerySection(k,l,pending.filter(i=>!i.pinned_at&&(i.difficulty||"M")===k),s)).join("")}${gallerySection("done","완료",done,s,"카드를 여기로 끌어도 완료돼요")}`;
  return `<section class="section tr-gallery" data-zoom="${TR.zoom}" style="--tr-card:${ZOOMS[TR.zoom-1]||160}px">
  <div class="tr-menubar">${conceptTabs(s,items)}
  <div class="tr-tools"><button class="tr-btn sm ${TR.selecting?"on":""}" data-act="select">${TR.selecting?"선택 끝":"☑︎ 선택"}</button><button class="tr-btn sm tr-icon-btn" data-act="similar" title="같은 참고 그림끼리 옆에 붙이기" aria-label="같은 참고 그림끼리 옆에 붙이기">🧩</button><div class="tr-zoom" role="group" aria-label="썸네일 크기"><button data-zoom="-1" ${TR.zoom<=1?"disabled":""} aria-label="작게" title="작게">−</button><button data-zoom="1" ${TR.zoom>=ZOOMS.length?"disabled":""} aria-label="크게" title="크게">＋</button></div></div></div>
  ${body}
  <p class="tr-sub tr-gallery-tip">카드나 묶음 줄을 끌어서 원하는 자리·난이도로 옮겨요 (폰은 길게 누른 뒤 끌기). ☑︎ 선택 → 🔗 묶기로 한 줄 묶음, 카드를 묶음 줄 안팎으로 끌면 넣고 빼요.</p></section>
  ${TR.selecting?`<div class="tr-selbar" role="toolbar"><span><b>${TR.selected.size}</b>개 선택</span><button class="tr-btn primary" data-act="group-make" ${TR.selected.size<2?"disabled":""}>🔗 묶기</button>${[...TR.selected].some(id=>byId("items",id)?.group_id)?`<button class="tr-btn" data-act="group-out">묶음에서 빼기</button>`:""}<button class="tr-btn ghost" data-act="select">취소</button></div>`:""}`;
}
// 하루 필요량 칸: 오늘 아침 기준 오늘 몫(오늘 목표와 같은 숫자). 다 채우면 초록 줄 + "✓ 오늘 완료", 아래 줄은 내일 몫
function needCell(label,need,doneToday,tomorrow,st,workday){
  if(!st.end)return `<div class="tr-stat"><small>${label}</small><b>–</b><span>마감일 미정</span></div>`;
  const met=workday&&need>0&&doneToday>=need;
  const sub=!workday?`오늘은 쉬는 날 · 다음 작업일 <em class="tr-em">${tomorrow}</em>건`:met?`<span class="tr-today-done">✓ 오늘 완료</span> 내일 <b class="tr-ok">${tomorrow}</b>건`:!st.leftTomorrow?"오늘이 마지막 제작일":`오늘 ${doneToday}/${need} · 못 하면 내일 <em class="tr-em">${tomorrow}</em>건`;
  return `<div class="tr-stat ${met?"met":""}"><small>${label}</small><b class="${met?"tr-strike":""}">${need}건</b><span>${sub}</span></div>`;
}
function viewSeason(s){
  const st=seasonStats(s),items=itemsOf(s.id),p=todayPlan(s);
  // 파일 기준 오늘 몫 = 오늘 아침 남은 파일 ÷ 남은 제작일
  const fileNeed=st.left?Math.ceil((st.remaining+p.doneToday.length)/st.left):st.remaining+p.doneToday.length;
  const unconfirmed=items.filter(i=>i.auto_done!=null&&!i.confirmed);
  return `<section class="card tr-card tr-stats"><div class="tr-stat"><small>마감</small><b>${st.dday==null?"미정":st.dday>0?"D-"+st.dday:st.dday===0?"D-DAY":"D+"+(-st.dday)}</b><span>${s.deadline?md(s.deadline):"설정에서 지정"}</span></div><div class="tr-stat"><small>남은 제작일</small><b>${st.left}일</b><span>${st.end?"제작 마감 "+md(st.end):"–"}</span></div><div class="tr-stat"><small>완료 / 전체</small><b><span class="tr-ok">${st.done}</span> / ${st.target}</b><span>남음 <em class="tr-em">${st.remaining}</em></span></div>${needCell("하루 필요량",fileNeed,p.doneToday.length,st.tomorrowNeed,st,p.workday)}
  ${st.bundles?`<div class="tr-ustats ${TR.collapsed.units?"closed":""}"><button class="tr-ustats-head" data-collapse="units" aria-expanded="${!TR.collapsed.units}"><span class="tr-caret" aria-hidden="true"><svg viewBox="0 0 12 12" width="16" height="16"><path d="M1.5 3.5h9L6 9z" fill="currentColor"/></svg></span><b>🔗 묶음 반영하면</b><span>묶음 ${st.bundles}개는 1건으로 · 오늘 목표는 이 기준</span>${TR.collapsed.units?`<span class="tr-ustats-sum">남은 작업 <em class="tr-em">${st.uRemaining}</em> · 오늘 ${p.doneTodayU.length}/${p.goal}건${p.workday&&p.goal&&p.doneTodayU.length>=p.goal?` <span class="tr-today-done">✓ 오늘 완료</span> 내일 ${st.uTomorrowNeed}건`:st.leftTomorrow?` · 못 하면 내일 ${st.uTomorrowNeed}건`:""}</span>`:""}</button>
  <div class="tr-ustats-row"><div class="tr-stat"><small>작업 완료 / 전체</small><b><span class="tr-ok">${st.uDone}</span> / ${st.uTarget}</b><span>남음 <em class="tr-em">${st.uRemaining}</em></span></div><div class="tr-stat"><small>아낀 작업</small><b>${st.target-st.uTarget}건</b><span>복붙으로 끝나는 파일</span></div>${needCell("하루 필요량",p.workday?p.goal:st.uNeed,p.doneTodayU.length,st.uTomorrowNeed,st,p.workday)}</div></div>`:""}</section>
  <section class="section"><div class="section-title"><h3>컨셉별 진행</h3><span>기대 진행률 ${Math.round(st.expected*100)}%</span></div><div class="tr-gauges">${st.concepts.length?st.concepts.map(x=>`<button class="card tr-gauge ${RISK[x.risk][1]}" style="${cvars(x.c.id)}" data-target="${esc(x.c.id)}" title="목표 개수 바꾸기"><div class="tr-gauge-head"><b>${esc(x.c.name)}</b><em>${RISK[x.risk][0]}</em></div><div class="tr-gauge-nums"><span class="tr-gauge-count"><b>${x.done}</b> / ${x.target}</span><span class="tr-gauge-pct">${Math.round(x.ratio*100)}<small>%</small></span></div>${x.bundles?`<div class="tr-gauge-units">묶으면 <b>${x.uDone} / ${x.uTarget}</b> · 묶음 ${x.bundles}개</div>`:""}<div class="tr-bar"><i style="width:${Math.round(x.ratio*100)}%"></i><s style="left:${Math.round(st.expected*100)}%"></s></div></button>`).join(""):`<div class="empty">파일을 등록하면 파일명에서 컨셉을 자동으로 만들어요.</div>`}</div></section>
  <section class="tr-drop-card"><div><b>의뢰서 등록</b><span>폴더째 끌어다 놓으면 폴더 이름이 컨셉이 돼요 · 다시 저장한 파일을 올리면 새 버전으로 바뀌어요</span></div><div class="tr-drop-btns"><button class="tr-btn" data-act="pick-folder">폴더 선택</button><button class="tr-btn primary" data-act="pick">파일 선택</button></div></section>
  ${unconfirmed.length?`<section class="card tr-card tr-confirm"><div><b>🤖 자동 추정 확인 ${unconfirmed.length}건</b><span class="tr-sub">썸네일 왼쪽 위 노란 의뢰서 표가 있으면 미완료로 봤어요. 틀린 건 카드 오른쪽 아래 버튼으로 바꿔 주세요.</span></div><button class="tr-btn" data-act="confirm-all">모두 맞음</button></section>`:""}
  ${viewGallery(s,items)}`;
}
function viewLog(s){
  const items=itemsOf(s.id).filter(isDone).sort((a,b)=>(b.completed_at||"").localeCompare(a.completed_at||""));
  const byDay={};items.forEach(i=>(byDay[dayOf(i.completed_at)]??=[]).push(i));
  const focusByDay={};TR.data.sessions.filter(x=>x.season_id===s.id&&x.ended_at).forEach(x=>{const d=dayOf(x.started_at);focusByDay[d]=(focusByDay[d]||0)+(x.focus_sec||0)});
  const days=[...new Set([...Object.keys(byDay),...Object.keys(focusByDay)])].sort().reverse();
  const p={carried:[]};
  return days.length?days.map(d=>`<section class="section"><div class="section-title"><h3>${md(d)}${d===todayISO()?" · 오늘":""}</h3><span>완료 ${(byDay[d]||[]).length}건 · 집중 ${Math.round((focusByDay[d]||0)/60)}분</span></div><div class="tr-list">${(byDay[d]||[]).map(it=>itemRow(it,p,s)).join("")||`<div class="empty">완료 없이 집중만 했어요.</div>`}</div></section>`).join(""):`<div class="empty">아직 기록이 없어요.</div>`;
}
function viewSettings(s){
  if(!s)return seasonSetup();
  const types=[...new Set(itemsOf(s.id).map(i=>i.item_type).filter(Boolean))].sort();
  return `<section class="card tr-card"><h3>시즌</h3>${TR.data.seasons.length>1?`<label class="tr-inline">보는 시즌<select data-change="season">${TR.data.seasons.map(x=>`<option value="${esc(x.id)}" ${x.id===s.id?"selected":""}>${esc(x.name)}</option>`).join("")}</select></label>`:""}
  <form class="tr-form" data-form="season-edit"><label>이름<input name="name" value="${esc(s.name)}" required></label><label>마감일<input type="date" name="deadline" value="${esc(s.deadline||"")}"></label><label>검수 여유일 <small>영업일 · 마감일 당일은 작업일 아님</small><input type="number" name="review_days" min="0" max="10" value="${Number(s.review_days)||0}"></label><label>계획 시작일 <small>기대 진행률 기준</small><input type="date" name="start_date" value="${esc(s.start_date||"")}"></label><label>휴무일 <small>쉼표로 구분 · 예: 2026-10-09</small><input name="holidays" value="${esc((s.holidays||[]).join(", "))}"></label><button class="tr-btn primary" type="submit">저장</button></form>
  <p class="tr-sub">제작 마감 ${prodEnd(s)?md(prodEnd(s)):"–"} · 오늘부터 제작일 ${seasonStats(s).left}일</p></section>
  <section class="card tr-card"><h3>컨셉</h3><p class="tr-sub">목표를 비워 두면 등록된 파일 수가 목표예요.</p><div class="tr-concepts">${conceptsOf(s.id).map((c,n,arr)=>`<form class="tr-concept-row" data-form="concept" data-id="${esc(c.id)}"><span class="tr-corder"><button type="button" class="tr-cmove" data-cmove="${esc(c.id)}" data-dir="-1" ${n?"":"disabled"} aria-label="위로">▲</button><button type="button" class="tr-cmove" data-cmove="${esc(c.id)}" data-dir="1" ${n<arr.length-1?"":"disabled"} aria-label="아래로">▼</button></span><input name="name" value="${esc(c.name)}" aria-label="컨셉 이름"><input name="target" type="number" min="0" value="${c.target??""}" placeholder="${itemsOf(s.id).filter(i=>i.concept_id===c.id).length}" aria-label="목표 개수"><select name="color" aria-label="컨셉 색" style="${cvars(c.id)}" class="tr-color-pick"><option value="">자동</option>${Object.entries(PALETTE).map(([k,[l]])=>`<option value="${k}" ${s.settings?.concept_colors?.[c.id]===k?"selected":""}>${l}</option>`).join("")}</select><button class="tr-btn sm" type="submit">저장</button><button class="tr-btn sm ghost" type="button" data-del-concept="${esc(c.id)}">삭제</button></form>`).join("")||`<div class="empty">아직 컨셉이 없어요.</div>`}</div>
  <form class="tr-concept-row" data-form="concept-new"><input name="name" placeholder="새 컨셉 이름" required><input name="target" type="number" min="0" placeholder="목표"><button class="tr-btn sm" type="submit">추가</button></form></section>
  <section class="card tr-card"><h3>근무 시간</h3><p class="tr-sub">오늘 시간표에 써요. 점심을 뺀 시간을 오늘 남은 건수로 똑같이 나눠요.</p><form class="tr-form tr-work" data-form="work">${(()=>{const c=workCfg(s);return [["start","출근",c.s],["end","퇴근",c.e],["lunchStart","점심 시작",c.ls],["lunchEnd","점심 끝",c.le]].map(([k,l,v])=>`<label class="tr-inline">${l}<input type="time" name="${k}" value="${String(Math.floor(v/60)).padStart(2,"0")}:${String(v%60).padStart(2,"0")}"></label>`).join("")})()}<button class="tr-btn primary" type="submit">저장</button></form></section>
  ${types.length?`<section class="card tr-card"><h3>품목 코드 이름</h3><form class="tr-form" data-form="types">${types.map(t=>`<label class="tr-inline">${esc(t)}<input name="${esc(t)}" value="${esc(typeName(s,t))}" placeholder="예: 반팔 티셔츠"></label>`).join("")}<button class="tr-btn primary" type="submit">저장</button></form></section>`:""}
  <section class="card tr-card"><h3>새 시즌</h3><form class="tr-form" data-form="season-new"><label>시즌<input name="name" placeholder="예: 27FW" required></label><label>마감일<input type="date" name="deadline" required></label><label>검수 여유일<input type="number" name="review_days" min="0" max="10" value="1"></label><button class="tr-btn" type="submit">만들기</button></form></section>
  <section class="card tr-card"><h3>백업</h3><p class="tr-sub">의뢰서·세션·하루 기록을 JSON으로 내려받아요 (썸네일 제외).</p><button class="tr-btn" data-act="backup">JSON 내려받기</button></section>`;
}
function renderSheet(){
  const it=byId("items",TR.detail);if(!it){sheet.close();return}
  const s=byId("seasons",it.season_id),act=activeSession();
  const ss=TR.data.sessions.filter(x=>x.item_id===it.id).sort((a,b)=>b.started_at.localeCompare(a.started_at));
  const total=ss.reduce((a,x)=>a+(x.ended_at?x.focus_sec||0:Math.round(elapsedMs(x)/1000)),0);
  sheet.innerHTML=`<div class="tr-sheet-body"><button class="tr-sheet-close" data-act="sheet-close" aria-label="닫기">✕</button>${thumbHTML(it,"full")}<h3>${esc(it.code)}</h3><p class="tr-sub">${it.item_type?esc(typeName(s,it.item_type)||it.item_type):""}${it.file_name?" · "+esc(it.file_name):""}</p><label class="tr-inline tr-concept-pick">컨셉<select data-change="concept" data-id="${esc(it.id)}">${conceptsOf(it.season_id).map(c=>`<option value="${esc(c.id)}" ${c.id===it.concept_id?"selected":""}>${esc(c.name)}</option>`).join("")}</select></label>
  ${it.auto_done!=null&&!it.confirmed?`<div class="tr-autoline">🤖 자동 추정: <b>${it.auto_done?"완료":"미완료"}</b> <button class="tr-btn sm" data-confirm="${esc(it.id)}">맞아요</button><button class="tr-btn sm ghost" data-flip="${esc(it.id)}">아니에요</button></div>`:""}
  <div class="tr-actions">${isDone(it)?`<button class="tr-btn" data-tdone="${esc(it.id)}" data-tundo="1">↩ 완료 취소</button>`:`<button class="tr-btn primary" data-focus="${esc(it.id)}" ${act?.item_id===it.id?"disabled":""}>${act?.item_id===it.id?"집중 중":"▶ 집중 시작"}</button><button class="tr-btn" data-tdone="${esc(it.id)}">✓ 완료</button>`}</div>
  ${isDone(it)?`<p class="tr-sub">✓ ${md(dayOf(it.completed_at))} ${esc(recordLine(it))}</p>`:""}
  <div class="tr-opts"><button class="tr-chip-btn ${it.important?"on":""}" data-important="${esc(it.id)}">⭐ 중요</button>${isDone(it)?"":`<button class="tr-chip-btn ${it.pinned_at?"on":""}" data-pin="${esc(it.id)}">${it.pinned_at?"⭐ 우선순위 해제":"⭐ 우선순위로"}</button>`}<span class="tr-diff">${["S","M","L"].map(d=>`<button class="tr-chip-btn ${it.difficulty===d?"on":""}" data-diff="${d}" data-id="${esc(it.id)}">${DIFF_LABEL[d]}</button>`).join("")}</span></div>
  <div class="tr-sessions"><b>집중 기록</b> <span class="tr-sub">누적 ${Math.round(total/60)}분 · ${ss.length}회</span>${ss.slice(0,8).map(x=>`<div class="tr-sub">${md(dayOf(x.started_at))} ${hm(x.started_at)} ~ ${x.ended_at?hm(x.ended_at)+" · "+Math.round((x.focus_sec||0)/60)+"분":"진행 중"}</div>`).join("")}</div>
  <div class="tr-actions tr-sheet-foot"><button class="tr-btn sm" data-act="thumb-pick">썸네일 교체</button><span class="tr-sub">최종본을 카드에 끌어다 놓거나 ⌘V로 붙여넣어도 돼요</span><button class="tr-btn sm ghost danger" data-del-item="${esc(it.id)}">삭제</button></div></div>`;
}
function openSheet(id){TR.detail=id;renderSheet();if(!sheet.open)sheet.showModal()}

/* ---------- 이벤트 ---------- */
async function onClick(e){
  const b=e.target.closest("button,[data-open]");if(!b||!root.contains(b))return;
  const d=b.dataset;
  if(d.view){TR.view=d.view;TR.selecting=false;TR.selected.clear();saveUI();if(sheet.open)sheet.close();render();main.scrollTo?.(0,0);return}
  if(d.ctab){TR.conceptTab=d.ctab;saveUI();render();return}
  if(d.ot){await setOvertime(d.ot);return}
  if(d.zoom){TR.zoom=Math.min(ZOOMS.length,Math.max(1,TR.zoom+Number(d.zoom)));saveUI();render();return}
  if(d.collapse){TR.collapsed[d.collapse]=!TR.collapsed[d.collapse];saveUI();render();return}
  // 선택 모드에서는 카드를 누르면 열지 않고 체크만
  if(d.open&&TR.selecting&&!e.target.closest("[data-tdone]")){TR.selected.has(d.open)?TR.selected.delete(d.open):TR.selected.add(d.open);render();return}
  if(d.grename){const g=byId("groups",d.grename);if(!g)return;const v=prompt("묶음 이름",g.name);if(v===null||!v.trim())return;await put({groups:[{...g,name:v.trim().slice(0,30)}]});return}
  // 설정: 컨셉 순서 (컨셉 탭·컨셉 카드·폴더 목록 순서)
  if(d.cmove){const s=season();if(!s)return;const list=conceptsOf(s.id),i=list.findIndex(c=>c.id===d.cmove),j=i+Number(d.dir);if(i<0||j<0||j>=list.length)return;[list[i],list[j]]=[list[j],list[i]];await put({concepts:list.map((c,n)=>({...c,sort:n+1}))});return}
  if(d.gundo){const g=byId("groups",d.gundo);if(!g)return;await remove("groups",g.id);toast(`${g.name} 묶음을 풀었어요. 의뢰서는 그대로예요.`);return}
  if(d.open&&!e.target.closest("[data-tdone],[data-focus]")){openSheet(d.open);return}
  if(d.focus){if(sheet.open)sheet.close();await startFocus(d.focus);return}
  if(d.tdone){e.stopPropagation();await setDone(d.tdone,!d.tundo);return}
  if(d.target){
    const c=byId("concepts",d.target);if(!c)return;
    const v=prompt(`${c.name} 목표 개수 (비우면 등록된 파일 수)`,c.target??"");if(v===null)return;
    await put({concepts:[{...c,target:v.trim()===""?null:Math.max(0,parseInt(v,10)||0)}]});return;
  }
  if(d.confirm){const it=byId("items",d.confirm);await put({items:[{...it,confirmed:true}]});return}
  if(d.flip){const it=byId("items",d.flip),done=!isDone(it);await put({items:[{...it,confirmed:true,status:done?"done":"todo",completed_at:done?(it.completed_at||nowISO()):null}]});return}
  if(d.important){const it=byId("items",d.important);await put({items:[{...it,important:!it.important}]});return}
  // 우선순위로 / 해제 (묶음이면 묶음 전체를 같이)
  if(d.pin){const it=byId("items",d.pin),v=it.pinned_at?null:nowISO(),mates=it.group_id?TR.data.items.filter(i=>i.group_id===it.group_id&&!isDone(i)):[it];TR.skip=0;await put({items:mates.map(i=>({...i,pinned_at:v}))});toast(v?"⭐ 우선순위 칸으로 올렸어요. 오늘 목록 맨 앞에 들어가요.":"우선순위에서 내렸어요.");return}
  if(d.diff){const it=byId("items",d.id);await put({items:[{...it,difficulty:d.diff}]});return}
  if(d.delItem){const it=byId("items",d.delItem);if(!confirm(`${it.code}을(를) 지울까요? 집중 기록과 썸네일도 함께 지워져요.`))return;sheet.close();await remove("items",it.id);return}
  if(d.delConcept){const c=byId("concepts",d.delConcept),n=TR.data.items.filter(i=>i.concept_id===c.id).length;if(!confirm(`${c.name} 컨셉을 지울까요?${n?` 의뢰서 ${n}건도 함께 지워져요.`:""}`))return;if(TR.conceptTab===c.id)TR.conceptTab="all";await remove("concepts",c.id);return}
  switch(d.act){
    case"close":closeTracker();break;
    case"pause":await pauseFocus();break;
    case"stop":await stopFocus();break;
    case"skip":TR.skip++;render();break;
    case"one-only":TR.oneOnly=!TR.oneOnly;saveUI();render();break;
    case"pick":root.querySelector("#tr-file").click();break;
    case"pick-folder":root.querySelector("#tr-folder").click();break;
    case"thumb-pick":root.querySelector("#tr-thumb-file").click();break;
    case"sheet-close":sheet.close();break;
    case"similar":await arrangeSimilar();break;
    default:break;
    case"select":TR.selecting=!TR.selecting;TR.selected.clear();render();break;
    case"group-make":{const s=season(),ids=[...TR.selected];if(!s||ids.length<2)break;TR.selecting=false;TR.selected.clear();await makeGroup(s,ids);break}
    case"group-out":{const ids=[...TR.selected],old=new Set(ids.map(id=>byId("items",id)?.group_id).filter(Boolean));TR.selecting=false;TR.selected.clear();await put({items:ids.map(id=>byId("items",id)).filter(i=>i?.group_id).map(i=>({...i,group_id:null}))});await dissolveSmallGroups(old);toast("묶음에서 뺐어요.");break}
    case"confirm-all":{const s=season();await put({items:itemsOf(s.id).filter(i=>i.auto_done!=null&&!i.confirmed).map(i=>({...i,confirmed:true}))});break}
    case"backup":{const blob=new Blob([JSON.stringify({exported_at:nowISO(),...TR.data},null,2)],{type:"application/json"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`tracker-backup-${todayISO()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);break}
  }
}
async function onChange(e){
  const d=e.target.dataset;
  if(d.change==="season"){TR.seasonId=e.target.value;TR.conceptTab="all";saveUI();render()}
  if(d.change==="concept"){const it=byId("items",d.id);if(it&&it.concept_id!==e.target.value){await put({items:[{...it,concept_id:e.target.value}]});toast(`${it.code} → ${conceptName(e.target.value)}`)}}
}
document.addEventListener("submit",async e=>{
  const f=e.target.closest?.("form[data-form]");if(!f||!root?.contains(f))return;
  e.preventDefault();
  const v=Object.fromEntries(new FormData(f)),s=season(),kind=f.dataset.form;
  if(kind==="season-new"){
    const name=slug(v.name);if(!name)return;
    if(TR.data.seasons.some(x=>x.id===name)){toast("이미 있는 시즌이에요.");return}
    TR.seasonId=name;TR.conceptTab="all";saveUI();
    await put({seasons:[{id:name,name,deadline:v.deadline||null,review_days:Math.max(0,parseInt(v.review_days,10)||0),start_date:todayISO(),holidays:[],settings:{},active:true}]});
    TR.view="season";saveUI();render();toast(`${name} 시즌을 만들었어요. 의뢰서를 등록해 주세요.`);
  }else if(kind==="season-edit"){
    const holidays=String(v.holidays||"").split(/[\s,]+/).filter(x=>/^\d{4}-\d{2}-\d{2}$/.test(x)).sort();
    await put({seasons:[{...s,name:v.name.trim()||s.name,deadline:v.deadline||null,review_days:Math.max(0,parseInt(v.review_days,10)||0),start_date:v.start_date||s.start_date,holidays}]});toast("저장했어요.");
  }else if(kind==="concept"){
    const c=byId("concepts",f.dataset.id),colors={...(s.settings?.concept_colors||{})};
    if(PALETTE[v.color])colors[c.id]=v.color;else delete colors[c.id];
    await put({concepts:[{...c,name:nfc(v.name).trim()||c.name,target:v.target===""?null:Math.max(0,parseInt(v.target,10)||0)}],seasons:[{...s,settings:{...(s.settings||{}),concept_colors:colors}}]});toast("저장했어요.");
  }else if(kind==="concept-new"){
    const name=slug(v.name);if(!name)return;const id=`${s.id}:${name}`;
    if(byId("concepts",id)){toast("이미 있는 컨셉이에요.");return}
    await put({concepts:[{id,season_id:s.id,name,target:v.target===""?null:Math.max(0,parseInt(v.target,10)||0),sort:100}]});
  }else if(kind==="work"){
    const w={};for(const k of ["start","end","lunchStart","lunchEnd"])if(/^\d{2}:\d{2}$/.test(v[k]||""))w[k]=v[k];
    if(hhmm(w.end)<=hhmm(w.start)){toast("퇴근이 출근보다 늦어야 해요.");return}
    await put({seasons:[{...s,settings:{...(s.settings||{}),work:w}}]});toast("저장했어요. 오늘 시간표에 바로 반영돼요.");
  }else if(kind==="types"){
    const names={...(s.settings?.type_names||{})};for(const [k,x] of Object.entries(v)){if(String(x).trim())names[k]=String(x).trim();else delete names[k]}
    await put({seasons:[{...s,settings:{...(s.settings||{}),type_names:names}}]});toast("저장했어요.");
  }
});

/* ---------- 시작 ---------- */
document.getElementById("tracker-open")?.addEventListener("click",openTracker);
window.addEventListener("hashchange",()=>{if(location.hash==="#tracker")openTracker()});
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible"&&TR.open&&getApiKey())refresh()});
setInterval(()=>{if(TR.open&&document.visibilityState==="visible"&&getApiKey())refresh()},45000);
if(location.hash==="#tracker")openTracker();
})();
