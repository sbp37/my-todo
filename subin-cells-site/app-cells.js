"use strict";
/* ===== 픽셀 룸 엔진 ===== */
const RW=120,RH=88;
const px=(c,x,y,w,h,col)=>{c.fillStyle=col;c.fillRect(x|0,y|0,w,h)};
const hash=s=>{let h=0;for(const ch of String(s))h=(h*31+ch.charCodeAt(0))|0;return Math.abs(h)};
const SKIN='#f0c8a0',OUTLINE='#1b1726';
const THEME={
  work:{wall:'#2c4a5c',wallLit:'#3d6378',floor:'#223845',desk:'#6b4f3a',glow:'#7fd4ff',shirt:'#3e6f8f',accent:'#9fd8ef'},
  dev:{wall:'#3d3358',wallLit:'#544873',floor:'#2e2745',desk:'#5d4a38',glow:'#c9a7ff',shirt:'#6b5390',accent:'#cbb3f2'},
  personal:{wall:'#583c3a',wallLit:'#75504c',floor:'#402d2b',desk:'#6b4f3a',glow:'#ffcf9e',shirt:'#a0665c',accent:'#f0b7a8'},
  lobby:{wall:'#33304a',wallLit:'#454168',floor:'#262338',desk:'#5d4a38',glow:'#ffe9a8',shirt:'#7a7390',accent:'#d8d2f0'}
};
const HAIRS=['#3b2d24','#1d1b20','#6b4a2f','#584040','#2e3b52'];
const skyOf=h=>h<6?'#141433':h<9?'#e8967a':h<17?'#79c4e8':h<20?'#e88a6e':'#141433';
function drawWindow(c,x,y,theme,frame){px(c,x,y,26,26,'#1b1726');px(c,x+2,y+2,22,22,skyOf(seoulHour()));const h=seoulHour();if(h>=6&&h<20){px(c,x+5,y+5,6,6,'#ffe9a8');px(c,x+6,y+4,4,8,'#ffe9a8');px(c,x+4,y+6,8,4,'#ffe9a8')}else{px(c,x+5,y+5,6,6,'#e8e4c9');px(c,x+7,y+5,4,2,skyOf(h))}px(c,x+2+((frame*3)%18),y+16,3,2,'rgba(255,255,255,.55)');px(c,x+12,y+2,1,22,'#1b1726');px(c,x+2,y+12,22,1,'#1b1726')}
function drawDesk(c,x,y,theme,state,frame){px(c,x,y,44,3,'#8a6a4d');px(c,x,y+3,44,17,theme.desk);px(c,x+3,y+20,4,8,'#4a382a');px(c,x+37,y+20,4,8,'#4a382a');const on=state==='type'||state==='panic';px(c,x+6,y-12,16,12,OUTLINE);px(c,x+8,y-10,12,8,on?(frame?'#bfe9ff':'#8fd4f5'):'#3a3448');if(on&&frame)px(c,x+10+((frame*2)%6),y-8,2,2,'#fff')}
function drawPlant(c,x,y){px(c,x+2,y+6,8,6,'#a05543');px(c,x,y+2,4,4,'#4f8a4f');px(c,x+8,y,4,5,'#5f9e5f');px(c,x+4,y-3,4,5,'#4f8a4f')}
function drawShelf(c,x,y,theme){px(c,x,y,20,2,'#6b4f3a');px(c,x+2,y-6,3,6,'#c96a5a');px(c,x+6,y-6,3,6,'#5a8ab0');px(c,x+10,y-6,3,6,'#c9a35a');px(c,x+15,y-4,4,4,theme.accent)}
function drawPoster(c,x,y,theme){px(c,x,y,14,16,'#d8cdb8');px(c,x+2,y+2,10,8,theme.accent);px(c,x+2,y+12,10,2,'#8a8070')}
function drawLamp(c,x,y,on,glow){px(c,x+4,0,1,y,'#2a2436');px(c,x,y,9,4,'#3a3448');px(c,x+2,y+4,5,2,on?'#ffe9a8':'#5a5468');if(on){c.fillStyle=glow;c.globalAlpha=.16;c.beginPath();c.moveTo(x+2,y+6);c.lineTo(x+7,y+6);c.lineTo(x+16,y+58);c.lineTo(x-8,y+58);c.closePath();c.fill();c.globalAlpha=1}}
function drawChar(c,x,y,o){const {hair,shirt,pose,frame,blink}=o,bob=frame&&(pose==='type'||pose==='panic')?-1:0,yy=y+bob;
  if(pose==='stand'){px(c,x+2,yy,8,2,hair);px(c,x+1,yy+2,10,1,hair);px(c,x+2,yy+3,8,4,SKIN);if(!blink){px(c,x+4,yy+4,1,1,OUTLINE);px(c,x+7,yy+4,1,1,OUTLINE)}else{px(c,x+4,yy+4,2,1,OUTLINE);px(c,x+7,yy+4,2,1,OUTLINE)}px(c,x+2,yy+7,8,7,shirt);px(c,x+1,yy+8,1,5,SKIN);px(c,x+10,yy+8,1,5,SKIN);px(c,x+3,yy+14,3,6,'#3a3448');px(c,x+7,yy+14,3,6,'#3a3448');return}
  px(c,x+2,yy,8,2,hair);px(c,x+1,yy+2,10,1,hair);px(c,x+2,yy+3,8,4,SKIN);
  if(pose==='sleep'){px(c,x+3,yy+4,2,1,OUTLINE);px(c,x+7,yy+4,2,1,OUTLINE)}else if(!blink){px(c,x+5,yy+4,1,1,OUTLINE);px(c,x+8,yy+4,1,1,OUTLINE)}else{px(c,x+5,yy+4,2,1,OUTLINE);px(c,x+8,yy+4,2,1,OUTLINE)}
  px(c,x+2,yy+7,8,6,shirt);
  if(pose==='panic'){px(c,x-1,yy+4,2,4,SKIN);px(c,x+11,yy+4,2,4,SKIN)}
  else if(pose==='sip'){px(c,x+10,yy+7,3,3,SKIN);px(c,x+11,yy+5,3,3,'#e8e4d8');if(frame)px(c,x+12,yy+2,1,2,'rgba(255,255,255,.7)')}
  else if(pose==='sleep'){px(c,x+10,yy+8,3,2,SKIN)}
  else{px(c,x+10,yy+8+ (frame?1:0),4,2,SKIN);px(c,x+10,yy+10-(frame?1:0),4,2,SKIN)}
  px(c,x+3,yy+13,3,3,'#3a3448');px(c,x+7,yy+13,3,3,'#3a3448')}
function drawBubble(c,x,y,kind,frame){px(c,x,y,9,9,'#f5f2ea');px(c,x+4,y+9,2,3,'#f5f2ea');if(kind==='panic'){px(c,x+4,y+2,2,4,'#d05050');px(c,x+4,y+7,2,1,'#d05050')}if(kind==='sleep'){c.fillStyle='#8a93c9';c.font='7px monospace';c.fillText('z',x+3,y+7);if(frame){c.fillText('z',x+9,y-2)}}if(kind==='wait'){px(c,x+2,y+4,2,2,'#8a93c9');px(c,x+5,y+4,2,2,'#8a93c9');px(c,x+8,y+4,2,2,'#8a93c9')}}
function drawRoom(cv,task){const c=cv.getContext('2d'),state=roomState(task),th=THEME[task.category]||THEME.lobby,h=hash(task.id),t=animFrame(),frame=t%2===0,blink=t%11===0,lit=state!=='sleep';
  px(c,0,0,RW,RH,lit?th.wallLit:th.wall);px(c,0,RH-14,RW,14,th.floor);px(c,0,RH-14,RW,1,'#16121f');
  drawWindow(c,6,10,th,frame);
  if(h%3===0)drawShelf(c,40,20,th);else if(h%3===1)drawPoster(c,42,12,th);else{drawPlant(c,44,60)}
  if(h%5===4)drawPlant(c,36,60);
  drawLamp(c,96,4,lit&&state!=='coffee',th.glow);
  drawDesk(c,68,52,th,state,frame);
  const hair=HAIRS[h%HAIRS.length];
  const poses={type:'type',panic:'panic',coffee:'sip',wait:'stand',sleep:'sleep'};
  const pose=poses[state];
  if(pose!=='stand'){px(c,54,56,12,3,'#4a382a');px(c,56,59,3,13,'#3a2d22');px(c,62,59,3,13,'#3a2d22')}
  drawChar(c,pose==='wait'?14:56,pose==='wait'?52:38,{hair,shirt:th.shirt,pose,frame,blink});
  if(state==='panic'){drawBubble(c,50,16,'panic',frame);if(frame)px(c,0,0,RW,3,'rgba(208,80,80,.5)')}
  if(state==='sleep')drawBubble(c,50,14,'sleep',frame);
  if(state==='wait')drawBubble(c,22,10,'wait',frame);
  if(state==='type'&&frame)px(c,86,36,1,1,'rgba(255,255,255,.8)');
  if(!lit){c.fillStyle='rgba(10,8,20,.45)';c.fillRect(0,0,RW,RH)}
}
/* ===== 상태 매핑 ===== */
function roomState(t){if(isDone(t))return'sleep';if(t.status==='waiting'||t.status==='later')return'wait';const s=dueState(t);if(s==='overdue'||t.urgent)return'panic';if(s==='today'||t.status==='doing')return'type';return'coffee'}
/* ===== 렌더 ===== */
let animTick=0;const animFrame=()=>animTick;
const FLOORS=[['work','3F · 업무층'],['dev','2F · 개발층'],['personal','1F · 개인층']];
function roomCard(t){const st=roomState(t),badge=st==='panic'?'🚨':st==='type'?'💡':st==='sleep'?'💤':st==='wait'?'⏳':'☕';return `<div class="room ${t.category} s-${st}" data-task="${esc(t.id)}" role="button" tabindex="0"><canvas width="${RW}" height="${RH}"></canvas><div class="plate"><span class="badge">${badge}</span><span class="plate-title">${esc(t.emoji||'')} ${esc(t.title)}</span></div></div>`}
function renderStats(){const all=TASKS.tasks,act=all.filter(t=>!isDone(t)),today=act.filter(t=>dueState(t)==='today'||t.status==='doing'),over=act.filter(t=>dueState(t)==='overdue'||t.urgent),nodate=act.filter(t=>!t.due),doneToday=all.filter(t=>isDone(t)&&toSeoulDate(t.completedAt)===todayISO());document.getElementById('stats').innerHTML=`<span class="stat"><b>${today.length}</b>오늘</span><span class="stat ${over.length?'alert':''}"><b>${over.length}</b>지연·급함</span><span class="stat"><b>${nodate.length}</b>미정</span><span class="stat"><b>${doneToday.length}</b>오늘 완료</span>`}
function lobbyHtml(){const today=todayISO(),evts=(CAL.events||[]).filter(e=>e.date<=today&&(e.endDate||e.date)>=today),plus=(CAL.events||[]).filter(e=>e.date>today).slice(0,3);return `<div class="floor lobby-floor"><div class="floor-label">B1 · 로비</div><div class="rooms"><div class="room lobby"><canvas width="${RW}" height="${RH}" id="lobby-cv"></canvas><div class="plate"><span class="badge">🛎</span><span class="plate-title">안내데스크</span></div></div><div class="board"><div class="board-title">📋 오늘 일정</div>${evts.length?evts.map(e=>`<div class="board-row"><span class="board-time">${e.time||'종일'}</span><span>${esc(e.title)}</span></div>`).join(''):'<div class="board-empty">오늘 일정 없음</div>'}${plus.length?`<div class="board-sub">다가오는 일정</div>${plus.map(e=>`<div class="board-row dim"><span class="board-time">${fmtDate(e.date)}</span><span>${esc(e.title)}</span></div>`).join('')}`:''}</div></div></div>`}
function render(){renderStats();const app=document.getElementById('app');const floorsHtml=FLOORS.map(([cat,label])=>{const tasks=orderedTasks(cat);const doneToday=TASKS.tasks.filter(t=>t.category===cat&&isDone(t)&&toSeoulDate(t.completedAt)===todayISO());return `<div class="floor"><div class="floor-label">${label}</div><div class="rooms">${tasks.length||doneToday.length?[...tasks,...doneToday].map(roomCard).join(''):'<div class="room empty-room"><div class="plate"><span class="plate-title">비어 있음</span></div></div>'}</div></div>`}).join('');
  app.innerHTML=`<div class="building"><div class="roof"><div class="antenna"></div><div class="sign">SUBIN HQ</div><div class="sky-ico">${seoulHour()>=6&&seoulHour()<20?'☀️':'🌙'}</div></div>${floorsHtml}${lobbyHtml()}</div>`;
  app.querySelectorAll('.room[data-task]').forEach(r=>{const open=()=>openCell(r.dataset.task);r.onclick=open;r.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open()}}});
  const lc=document.getElementById('lobby-cv');if(lc)drawLobby(lc)}
function drawLobby(cv){const c=cv.getContext('2d'),th=THEME.lobby,t=animFrame(),frame=t%2===0,blink=t%11===0;px(c,0,0,RW,RH,th.wallLit);px(c,0,RH-14,RW,14,th.floor);px(c,0,RH-14,RW,1,'#16121f');px(c,8,14,40,20,'#d8cdb8');px(c,10,16,36,4,th.accent);px(c,10,22,24,2,'#8a8070');px(c,10,26,30,2,'#8a8070');drawDesk(c,62,54,th,'coffee',frame);px(c,48,58,12,3,'#4a382a');px(c,50,61,3,13,'#3a2d22');px(c,56,61,3,13,'#3a2d22');drawChar(c,50,40,{hair:'#3b2d24',shirt:th.shirt,pose:'sip',frame,blink});drawLamp(c,96,4,true,th.glow)}
/* ===== 애니메이션 루프 ===== */
setInterval(()=>{animTick++;document.querySelectorAll('.room[data-task] canvas').forEach(cv=>{const t=TASKS.tasks.find(x=>x.id===cv.closest('.room').dataset.task);if(t)drawRoom(cv,t)});const lc=document.getElementById('lobby-cv');if(lc)drawLobby(lc)},450);
/* ===== 방 상세 다이얼로그 ===== */
let cellId=null;
function openCell(id){const t=TASKS.tasks.find(x=>x.id===id);if(!t)return;cellId=id;const cat=CAT[t.category];document.getElementById('cell-cat').textContent=`${cat.emoji} ${cat.label}`;document.getElementById('cell-cat').className='pill '+t.category;document.getElementById('cell-title').textContent=`${t.emoji||''} ${t.title}`;document.getElementById('cell-meta').textContent=[fmtDate(t.due)+(t.endDate&&t.endDate!==t.due?' ~ '+fmtDate(t.endDate):''),t.estimateMin?`약 ${t.estimateMin}분`:'',urgencyText(t),{todo:'대기',doing:'진행 중',waiting:'보류',later:'나중에',done:'완료'}[t.status]||''].filter(Boolean).join(' · ');document.getElementById('cell-next').textContent=t.nextAction?'→ '+t.nextAction:'';document.getElementById('cell-done').textContent=isDone(t)?'완료 취소':'✓ 완료';document.getElementById('cell-dialog').showModal()}
document.getElementById('cell-done').onclick=async()=>{document.getElementById('cell-dialog').close();await toggleDone(cellId)};
document.getElementById('cell-today').onclick=async()=>{document.getElementById('cell-dialog').close();await setToday(cellId)};
document.getElementById('cell-date').onclick=()=>{document.getElementById('cell-dialog').close();openDateEditor(cellId)};
document.getElementById('cell-close').onclick=()=>document.getElementById('cell-dialog').close();
/* 날짜 편집 (원본과 동일 동작) */
let editingId=null;
function openDateEditor(id){editingId=id;const t=TASKS.tasks.find(x=>x.id===id);if(!t)return;document.getElementById('date-task-title').textContent=t.title;document.getElementById('date-start').value=t.due||'';document.getElementById('date-end').value=t.endDate||'';document.getElementById('date-error').textContent='';document.getElementById('date-editor').showModal()}
document.getElementById('date-form').onsubmit=async e=>{e.preventDefault();const a=document.getElementById('date-start').value,b=document.getElementById('date-end').value;if(!a||b&&b<a){document.getElementById('date-error').textContent='종료일은 시작일 이후로 지정해 주세요.';return}document.getElementById('date-editor').close();await updateDates(editingId,a,b)};
document.getElementById('date-cancel').onclick=()=>document.getElementById('date-editor').close();
document.getElementById('date-clear').onclick=async()=>{document.getElementById('date-editor').close();await updateDates(editingId,'','')};
document.getElementById('date-today').onclick=async()=>{document.getElementById('date-editor').close();await setToday(editingId)};
document.getElementById('back-link').href=location.pathname.replace(/subin-cells-site\/?.*$/,'');
setInterval(()=>{const el=document.getElementById('clock');if(el)el.textContent=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date())},1000);
refreshRemoteData(true);
setInterval(()=>{if(document.visibilityState==='visible'&&(getApiKey()||isDemo()))refreshRemoteData(false)},60000);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&(getApiKey()||isDemo()))refreshRemoteData(false)});
