"use strict";
const API_URL="https://ctthdtsbjjqovtmhrzzj.supabase.co/functions/v1/assistant-api";
const API_KEY_STORE="subin-assistant-api-key-v1";
const storeKey="subin-cells-state-v1";
let TASKS={updatedAt:"",tasks:[]};
let CAL={syncedAt:"",events:[]};
let remoteReady=false;
const CAT={work:{label:"업무",emoji:"💼",cls:"work"},dev:{label:"개발",emoji:"⚙️",cls:"dev"},personal:{label:"개인",emoji:"🌿",cls:"personal"}};
let local={selectedDay:""};
try{const saved=JSON.parse(localStorage.getItem(storeKey)||"{}");local={...local,...saved}}catch(e){}
const save=()=>{try{localStorage.setItem(storeKey,JSON.stringify(local));return true}catch(e){return false}};
const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
const todayISO=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const fmtDate=d=>d?new Intl.DateTimeFormat("ko-KR",{timeZone:'Asia/Seoul',month:"numeric",day:"numeric",weekday:"short"}).format(new Date(d+"T12:00:00+09:00")):"날짜 미정";
const toSeoulDate=v=>v?new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(v)):"";
const toSeoulTime=v=>v?new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(v)).replace('24:','00:'):"";
const seoulHour=()=>Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Seoul',hour:'2-digit',hour12:false}).format(new Date()))%24;
const isDone=t=>t?.status==="done";
const isDemo=()=>/[?#&]demo\b/.test(location.search+location.hash);
function consumeKeyFromHash(){const raw=location.hash.replace(/^#/,"");if(!raw)return;const params=new URLSearchParams(raw);const key=params.get('assistant-key')||params.get('key');if(key){localStorage.setItem(API_KEY_STORE,key);history.replaceState(null,"",location.pathname+location.search)}}
consumeKeyFromHash();
const getApiKey=()=>localStorage.getItem(API_KEY_STORE)||"";
function setStatus(text="",cls=""){const el=document.getElementById("sync");if(!el)return;el.textContent=text;el.className="sync"+(cls?" "+cls:"")}
function showError(msg){const el=document.getElementById('storage-status');if(el)el.textContent=msg||"";setStatus("연결 확인 필요","error")}
function clearError(){const el=document.getElementById('storage-status');if(el)el.textContent=""}
async function apiGet(resource){const key=getApiKey();if(!key)throw new Error('SETUP_REQUIRED');const r=await fetch(`${API_URL}?resource=${encodeURIComponent(resource)}`,{headers:{'x-assistant-key':key},cache:'no-store'});if(!r.ok){if(r.status===401)throw new Error('AUTH');throw new Error(`HTTP ${r.status}`)}return r.json()}
async function apiPost(body){const key=getApiKey();if(!key)throw new Error('SETUP_REQUIRED');const r=await fetch(API_URL,{method:'POST',headers:{'content-type':'application/json','x-assistant-key':key},body:JSON.stringify(body)});const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.error||`HTTP ${r.status}`);return data}
function mapTask(r){return {id:r.external_id||r.id,dbId:r.id,title:r.title,category:r.category,due:r.due_date||"",endDate:r.end_date||"",priority:Number(r.priority)||100,urgent:!!r.urgent,status:r.status||'todo',estimateMin:r.estimate_min??null,note:r.note||"",nextAction:r.next_action||"",emoji:r.emoji||"",later:r.status==='later',completedAt:r.completed_at||"",createdAt:r.created_at||"",updatedAt:r.updated_at||""}}
function mapCalendar(r){return {id:r.external_id||r.id,title:r.title,date:toSeoulDate(r.start_at),endDate:toSeoulDate(r.end_at||r.start_at),time:r.all_day?"":toSeoulTime(r.start_at),source:'google',allDay:!!r.all_day}}
function cacheRemote(){try{localStorage.setItem('subin-assistant-remote-cache-v1',JSON.stringify({TASKS,CAL}))}catch(e){}}
function restoreCache(){try{const x=JSON.parse(localStorage.getItem('subin-assistant-remote-cache-v1')||'null');if(x?.TASKS?.tasks){TASKS=x.TASKS;CAL=x.CAL||CAL;return true}}catch(e){}return false}
function demoData(){const t=todayISO(),d=n=>{const x=new Date(t+'T12:00:00+09:00');x.setDate(x.getDate()+n);return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(x)};TASKS={updatedAt:new Date().toISOString(),tasks:[
{id:'w1',title:'주간 보고서 작성',category:'work',due:t,priority:1,urgent:true,status:'doing',estimateMin:60,nextAction:'초안 먼저 쓰기',emoji:'📝'},
{id:'w2',title:'거래처 견적 검토',category:'work',due:d(-1),priority:2,urgent:false,status:'todo',estimateMin:30,nextAction:'',emoji:'📊'},
{id:'w3',title:'팀 회의 준비',category:'work',due:d(2),priority:3,urgent:false,status:'todo',estimateMin:20,nextAction:'안건 정리',emoji:'🗂'},
{id:'w4',title:'메일 답장 정리',category:'work',due:'',priority:4,urgent:false,status:'later',estimateMin:15,nextAction:'',emoji:'📮'},
{id:'d1',title:'세포 대시보드 캐릭터 애니메이션',category:'dev',due:t,priority:1,urgent:false,status:'doing',estimateMin:90,nextAction:'걷기 프레임 추가',emoji:'🕹'},
{id:'d2',title:'게임 사운드 믹싱',category:'dev',due:'',priority:2,urgent:false,status:'todo',estimateMin:45,nextAction:'',emoji:'🎧'},
{id:'d3',title:'배포 스크립트 정리',category:'dev',due:d(4),priority:3,urgent:false,status:'waiting',estimateMin:30,nextAction:'Vercel 확인',emoji:'🚀'},
{id:'p1',title:'병원 예약',category:'personal',due:t,priority:1,urgent:true,status:'todo',estimateMin:10,nextAction:'전화하기',emoji:'🏥'},
{id:'p2',title:'운동 30분',category:'personal',due:'',priority:2,urgent:false,status:'todo',estimateMin:30,nextAction:'',emoji:'🏃'},
{id:'p3',title:'장보기',category:'personal',due:'',priority:3,urgent:false,status:'done',estimateMin:40,nextAction:'',emoji:'🛒',completedAt:new Date().toISOString()}
]};CAL={syncedAt:new Date().toISOString(),events:[{id:'e1',title:'팀 주간회의',date:t,time:'10:00'},{id:'e2',title:'저녁 약속',date:t,time:'19:30'}]}}
async function refreshRemoteData(showBusy=false){if(isDemo()){demoData();remoteReady=true;clearError();setStatus("데모 데이터","ok");render();return true}if(!getApiKey()){renderSetup();return false}if(showBusy)setStatus("업데이트 중","busy");try{const [td,cd]=await Promise.all([apiGet('tasks'),apiGet('calendar')]);TASKS={updatedAt:new Date().toISOString(),tasks:(td.tasks||[]).map(mapTask)};CAL={syncedAt:new Date().toISOString(),events:(cd.events||[]).map(mapCalendar)};remoteReady=true;cacheRemote();clearError();setStatus("최신 상태","ok");render();return true}catch(e){console.warn(e);if(e.message==='AUTH'){localStorage.removeItem(API_KEY_STORE);showError('연결 키를 다시 설정해 주세요.');renderSetup('연결 키가 맞지 않아요.');return false}if(!restoreCache()){showError('데이터를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.');renderSetup('연결을 확인해 주세요.');return false}showError('지금은 저장소 연결이 불안정해서 마지막으로 불러온 내용을 보여주고 있어요.');render();return false}}
function renderSetup(message="이 기기에서 처음 한 번만 연결하면 돼요. (미리보기: 주소 끝에 ?demo)"){const app=document.getElementById('app');app.innerHTML=`<section class="card setup-card"><h2>🔐 개인 비서 연결</h2><p>${esc(message)}</p><div class="setup-row"><input id="setup-key" type="password" autocomplete="off" placeholder="연결 키"><button id="setup-save">연결</button></div></section>`;document.getElementById('setup-save').onclick=async()=>{const v=document.getElementById('setup-key').value.trim();if(!v)return;localStorage.setItem(API_KEY_STORE,v);await refreshRemoteData(true)};setStatus("연결 필요","error")}
function orderedTasks(cat,includeDone=false){return TASKS.tasks.filter(t=>t.category===cat&&(includeDone||!isDone(t))).sort((a,b)=>(a.priority||100)-(b.priority||100)||(a.createdAt||'').localeCompare(b.createdAt||'')||a.id.localeCompare(b.id))}
async function toggleDone(id){const t=TASKS.tasks.find(x=>x.id===id);if(!t)return;const done=!isDone(t),prev={status:t.status,completedAt:t.completedAt};t.status=done?'done':'todo';t.completedAt=done?new Date().toISOString():'';render();if(isDemo()){setStatus("데모","ok");return}try{await apiPost({action:'complete_task',external_id:id,done});cacheRemote();setStatus("저장됨","ok");setTimeout(()=>setStatus("최신 상태","ok"),900)}catch(e){Object.assign(t,prev);showError('완료 상태를 저장하지 못했어요.');render()}}
function dueState(t){if(!t.due)return'none';if(t.due<todayISO())return'overdue';if(t.due===todayISO())return'today';const d=new Date(todayISO()+'T12:00:00+09:00');d.setDate(d.getDate()+1);const ti=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);if(t.due===ti)return'tomorrow';return'future'}
function urgencyText(t){const s=dueState(t);if(s==='overdue')return'🔥 지연';if(s==='today')return'🔥 오늘 꼭';if(s==='tomorrow')return'내일';if(t.urgent)return'🔥 급함';return''}
function addDays(iso,n){const d=new Date(iso+'T12:00:00+09:00');d.setDate(d.getDate()+n);return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(d)}
async function updateDates(id,due,endDate=''){const t=TASKS.tasks.find(x=>x.id===id);if(!t)return;const prev=[t.due,t.endDate];t.due=due;t.endDate=endDate;render();if(isDemo()){setStatus("데모","ok");return}try{await apiPost({action:'update_task',external_id:id,patch:{due_date:due||null,end_date:endDate||null}});cacheRemote();setStatus('저장됨','ok');setTimeout(()=>setStatus('최신 상태','ok'),900)}catch(e){[t.due,t.endDate]=prev;showError('날짜를 저장하지 못했어요.');render()}}
async function setToday(id){const t=TASKS.tasks.find(x=>x.id===id);if(!t)return;const span=t.due&&t.endDate?Math.max(0,Math.round((new Date(t.endDate+'T12:00:00+09:00')-new Date(t.due+'T12:00:00+09:00'))/86400000)):0;await updateDates(id,todayISO(),span?addDays(todayISO(),span):'')}
