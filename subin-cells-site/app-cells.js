"use strict";
/* ===== 픽셀 평면도 엔진 ===== */
const CW=110,CH=76,GAP=6,COLS=5,CORR=26,PAD=10,LOBBY_H=48;
const px=(c,x,y,w,h,col)=>{c.fillStyle=col;c.fillRect(x|0,y|0,w,h)};
const hash=s=>{let h=0;for(const ch of String(s))h=(h*31+ch.charCodeAt(0))|0;return Math.abs(h)};
const SKIN='#f0c8a0',OUTLINE='#241d30';
const THEME={
  work:{trim:'#3d6b8a',wall:'#e8d8b8',wallDark:'#d8c5a0',floor:'#b08a5e',shirt:'#3e6f8f',accent:'#7fb8d8'},
  dev:{trim:'#6b5390',wall:'#e8d8b8',wallDark:'#d8c5a0',floor:'#b08a5e',shirt:'#6b5390',accent:'#b49ae0'},
  personal:{trim:'#a0665c',wall:'#e8d8b8',wallDark:'#d8c5a0',floor:'#b08a5e',shirt:'#a0665c',accent:'#e8a08e'},
  lobby:{trim:'#8a7a4a',wall:'#e8d8b8',wallDark:'#d8c5a0',floor:'#b08a5e',shirt:'#7a7390',accent:'#d8c88a'}
};
const HAIRS=['#3b2d24','#1d1b20','#6b4a2f','#584040','#2e3b52'];
const skyOf=h=>h<6?'#1c1c40':h<9?'#f0a082':h<17?'#8fd0f0':h<20?'#f09070':'#1c1c40';
function drawWindow(c,x,y,frame){px(c,x,y,24,24,OUTLINE);px(c,x+2,y+2,20,20,skyOf(seoulHour()));const h=seoulHour();if(h>=6&&h<20){px(c,x+5,y+5,5,5,'#ffe9a8');px(c,x+6,y+4,3,7,'#ffe9a8');px(c,x+4,y+6,7,3,'#ffe9a8')}else{px(c,x+5,y+5,5,5,'#e8e4c9');px(c,x+7,y+5,3,2,skyOf(h))}px(c,x+2+((frame*3)%16),y+15,3,2,'rgba(255,255,255,.6)');px(c,x+11,y+2,1,20,OUTLINE);px(c,x+2,y+11,20,1,OUTLINE)}
function drawDesk(c,x,y,state,frame){px(c,x,y,40,3,'#7a5638');px(c,x,y+3,40,15,'#8a6a4a');px(c,x+3,y+18,4,7,'#5f4732');px(c,x+33,y+18,4,7,'#5f4732');const on=state==='type'||state==='panic';px(c,x+5,y-11,15,11,OUTLINE);px(c,x+7,y-9,11,7,on?(frame?'#bfe9ff':'#8fd4f5'):'#4a4458');if(on&&frame)px(c,x+9+((frame*2)%4),y-7,2,2,'#fff')}
function drawPlant(c,x,y){px(c,x+2,y+5,8,6,'#a05543');px(c,x,y+1,4,4,'#4f8a4f');px(c,x+8,y-1,4,5,'#5f9e5f');px(c,x+4,y-4,4,5,'#4f8a4f')}
function drawShelf(c,x,y){px(c,x,y,20,2,'#7a5638');px(c,x+2,y-6,3,6,'#c96a5a');px(c,x+6,y-6,3,6,'#5a8ab0');px(c,x+10,y-6,3,6,'#c9a35a');px(c,x+15,y-4,4,4,'#8a7a4a')}
function drawPoster(c,x,y){px(c,x,y,14,15,'#f5ecd8');px(c,x+2,y+2,10,7,'#d8806a');px(c,x+2,y+11,10,2,'#a09880')}
function drawLamp(c,x,y,on){px(c,x+4,0,1,y,'#4a4030');px(c,x,y,9,4,'#5a5040');px(c,x+2,y+4,5,2,on?'#ffe9a8':'#8a8070');if(on){c.fillStyle='#ffe9a8';c.globalAlpha=.13;c.beginPath();c.moveTo(x+2,y+6);c.lineTo(x+7,y+6);c.lineTo(x+15,y+55);c.lineTo(x-7,y+55);c.closePath();c.fill();c.globalAlpha=1}}
function drawChar(c,x,y,o){const {hair,shirt,pose,frame,blink}=o,bob=frame&&(pose==='type'||pose==='panic'||pose==='walk')?-1:0,yy=y+bob;
  if(pose==='stand'||pose==='walk'){px(c,x+2,yy,8,2,hair);px(c,x+1,yy+2,10,1,hair);px(c,x+2,yy+3,8,4,SKIN);if(!blink){px(c,x+4,yy+4,1,1,OUTLINE);px(c,x+7,yy+4,1,1,OUTLINE)}else{px(c,x+4,yy+4,2,1,OUTLINE);px(c,x+7,yy+4,2,1,OUTLINE)}px(c,x+2,yy+7,8,7,shirt);px(c,x+1,yy+8,1,5,SKIN);px(c,x+10,yy+8,1,5,SKIN);if(pose==='walk'&&frame){px(c,x+3,yy+14,3,6,OUTLINE);px(c,x+7,yy+14,3,5,'#3a3448')}else{px(c,x+3,yy+14,3,6,'#3a3448');px(c,x+7,yy+14,3,6,'#3a3448')}return}
  px(c,x+2,yy,8,2,hair);px(c,x+1,yy+2,10,1,hair);px(c,x+2,yy+3,8,4,SKIN);
  if(pose==='sleep'){px(c,x+3,yy+4,2,1,OUTLINE);px(c,x+7,yy+4,2,1,OUTLINE)}else if(!blink){px(c,x+5,yy+4,1,1,OUTLINE);px(c,x+8,yy+4,1,1,OUTLINE)}else{px(c,x+5,yy+4,2,1,OUTLINE);px(c,x+8,yy+4,2,1,OUTLINE)}
  px(c,x+2,yy+7,8,6,shirt);
  if(pose==='panic'){px(c,x-1,yy+4,2,4,SKIN);px(c,x+11,yy+4,2,4,SKIN)}
  else if(pose==='sip'){px(c,x+10,yy+7,3,3,SKIN);px(c,x+11,yy+5,3,3,'#e8e4d8');if(frame)px(c,x+12,yy+2,1,2,'rgba(255,255,255,.7)')}
  else if(pose==='sleep'){px(c,x+10,yy+8,3,2,SKIN)}
  else{px(c,x+10,yy+8+(frame?1:0),4,2,SKIN);px(c,x+10,yy+10-(frame?1:0),4,2,SKIN)}
  px(c,x+3,yy+13,3,3,'#3a3448');px(c,x+7,yy+13,3,3,'#3a3448')}
function drawBubble(c,x,y,kind,frame){px(c,x,y,9,9,'#f5f2ea');px(c,x+4,y+9,2,3,'#f5f2ea');if(kind==='panic'){px(c,x+4,y+2,2,4,'#d05050');px(c,x+4,y+7,2,1,'#d05050')}if(kind==='sleep'){c.fillStyle='#8a93c9';c.font='7px monospace';c.fillText('z',x+3,y+7);if(frame)c.fillText('z',x+9,y-2)}if(kind==='wait'){px(c,x+2,y+4,2,2,'#8a93c9');px(c,x+5,y+4,2,2,'#8a93c9');px(c,x+8,y+4,2,2,'#8a93c9')}}
/* ===== 상태 ===== */
function roomState(t){if(isDone(t))return'sleep';const s=dueState(t);if(s==='overdue'||t.urgent)return'panic';if(s==='today'||t.status==='doing')return'type';if(t.status==='waiting'||t.status==='later')return'wait';return'coffee'}
/* ===== 평면도 레이아웃 ===== */
let planRects=[];
function planRooms(){const out=[];for(const cat of ['work','dev','personal']){for(const t of orderedTasks(cat))out.push(t);for(const t of TASKS.tasks.filter(x=>x.category===cat&&isDone(x)&&toSeoulDate(x.completedAt)===todayISO()))out.push(t)}return out}
function computeLayout(n){const rows=Math.max(1,Math.ceil(n/COLS));const W=PAD*2+COLS*CW+(COLS-1)*GAP;let y=PAD;const rects=[];for(let r=0;r<rows;r++){for(let col=0;col<COLS;col++){const i=r*COLS+col;if(i>=n)break;rects.push({x:PAD+col*(CW+GAP),y,w:CW,h:CH,row:r})}y+=CH+GAP;if(r<rows-1)y+=CORR}return{W,H:y+LOBBY_H+PAD,rects,rows}}
function drawRoomCell(c,r,t,dim){const state=roomState(t),th=THEME[t.category]||THEME.lobby,h=hash(t.id),tk=animFrame(),frame=tk%2===0,blink=tk%11===0,lit=state!=='sleep';
  const x=r.x,y=r.y;
  px(c,x-2,y-2,CW+4,CH+4,OUTLINE);
  px(c,x,y,CW,CH,lit?th.wall:'#3a3450');
  if(lit){px(c,x,y,CW,3,th.trim);px(c,x,y+3,CW,1,'rgba(0,0,0,.08)')}
  px(c,x,y+CH-12,CW,12,lit?th.floor:'#2e2a42');
  if(lit){px(c,x,y+CH-12,CW,1,'rgba(0,0,0,.15)');for(let i=0;i<CW;i+=14)px(c,x+i,y+CH-7,1,7,'rgba(0,0,0,.12)')}
  drawWindow(c,x+5,y+7,frame);
  if(lit){if(h%3===0)drawShelf(c,x+38,y+16);else if(h%3===1)drawPoster(c,x+40,y+9);else drawPlant(c,x+38,y+52);if(h%5===4)drawPlant(c,x+32,y+52)}
  drawLamp(c,x+92,y+3,lit&&state!=='coffee');
  drawDesk(c,x+62,y+48,state,frame);
  const hair=HAIRS[h%HAIRS.length];
  const poses={type:'type',panic:'panic',coffee:'sip',wait:'stand',sleep:'sleep'};
  const pose=poses[state];
  if(lit){if(pose!=='stand'){px(c,x+50,y+50,12,3,'#5f4732');px(c,x+52,y+53,3,11,'#4a382a');px(c,x+58,y+53,3,11,'#4a382a')}
    drawChar(c,pose==='wait'?x+34:x+52,pose==='wait'?y+34:y+24,{hair,shirt:th.shirt,pose,frame,blink});
    if(state==='panic'){drawBubble(c,x+44,y+8,'panic',frame);if(frame){c.fillStyle='rgba(208,80,80,.18)';c.fillRect(x,y,CW,CH)}}
    if(state==='wait')drawBubble(c,x+42,y+14,'wait',frame)}
  else{drawChar(c,x+52,y+24,{hair,shirt:'#5a5468',pose:'sleep',frame,blink:true});drawBubble(c,x+44,y+8,'sleep',frame);c.fillStyle='rgba(16,12,32,.35)';c.fillRect(x,y,CW,CH)}
  if(dim){c.fillStyle='rgba(14,12,28,.72)';c.fillRect(x-2,y-2,CW+4,CH+4)}
  px(c,x+2,y+CH-13,CW-4,11,'rgba(20,16,32,.85)');
  c.fillStyle=lit?'#e8e2d0':'#7a7490';c.font='bold 8px "Noto Sans KR",sans-serif';c.textBaseline='middle';
  const label=(t.emoji?t.emoji+' ':'')+t.title;c.fillText(label.length>11?label.slice(0,10)+'…':label,x+5,y+CH-7)}
function drawCorridor(c,y,W){px(c,0,y,W,CORR,'#232039');px(c,0,y,W,2,'#2e2a48');px(c,0,y+CORR-2,W,2,'#1a1730');for(let i=30;i<W-30;i+=90){px(c,i,y+8,10,4,'#3a3450');px(c,i+2,y+8,6,2,'#4a4468')}}
function drawRunner(c,y,W){const tk=animFrame(),span=W-40,pos=(tk*7)%(span*2),x=20+(pos>span?span*2-pos:pos),dir=pos>span?-1:1,th=THEME[['work','dev','personal'][tk%3]];drawChar(c,x,y+3,{hair:'#1d1b20',shirt:th.shirt,pose:'walk',frame:tk%2===0,blink:false});if(dir<0){px(c,x-6,y+9,4,2,'#f5f2ea');px(c,x-8,y+11,2,1,'#f5f2ea')}}
function drawLobbyStrip(c,y,W){px(c,0,y,W,LOBBY_H,'#1a1730');px(c,0,y,W,2,'#2e2a48');
  const today=todayISO(),evts=(CAL.events||[]).filter(e=>e.date<=today&&(e.endDate||e.date)>=today),plus=(CAL.events||[]).filter(e=>e.date>today).slice(0,2);
  px(c,10,y+8,150,LOBBY_H-14,'#d8cdb0');px(c,12,y+10,146,6,'#a89878');
  c.fillStyle='#3a3020';c.font='bold 7px "Noto Sans KR",sans-serif';c.textBaseline='top';c.fillText('오늘 일정',15,y+11);
  c.fillStyle='#4a4030';c.font='7px "Noto Sans KR",sans-serif';
  (evts.slice(0,3)).forEach((e,i)=>c.fillText(`${e.time||'종일'}  ${e.title}`,15,y+19+i*8));
  if(!evts.length)c.fillText('오늘 일정 없음',15,y+20);
  px(c,180,y+12,4,LOBBY_H-16,'#4a4030');drawChar(c,186,y+14,{hair:'#3b2d24',shirt:THEME.lobby.shirt,pose:'stand',frame:animFrame()%2===0,blink:animFrame()%11===0});
  c.fillStyle='#8a80a8';c.font='7px "Noto Sans KR",sans-serif';c.fillText('안내데스크',206,y+16);
  plus.forEach((e,i)=>c.fillText(`→ ${fmtDate(e.date)} ${e.title}`,206,y+26+i*8));
  const h=seoulHour(),icon=h>=6&&h<20?'☀':'☾';c.font='10px monospace';c.fillStyle='#e8c878';c.fillText(icon,W-24,y+16)}
function drawPlan(){const cv=document.getElementById('plan');if(!cv)return;const rooms=planRooms(),lay=computeLayout(rooms.length);cv.width=lay.W;cv.height=lay.H;const c=cv.getContext('2d');
  px(c,0,0,lay.W,lay.H,'#14152b');
  px(c,PAD-4,PAD-4,lay.W-PAD*2+8,lay.H-LOBBY_H-PAD+6,'#0f0e22');
  let prevRow=-1;lay.rects.forEach((r,i)=>{if(r.row!==prevRow&&r.row>0){}prevRow=r.row});
  for(let r=1;r<lay.rows;r++)drawCorridor(c,PAD+r*(CH+GAP)+(r-1)*CORR,lay.W);
  planRects=[];
  const filter=local.filterCat||'all';
  lay.rects.forEach((r,i)=>{const t=rooms[i];if(!t)return;drawRoomCell(c,r,t,filter!=='all'&&t.category!==filter);planRects.push({x:r.x,y:r.y,w:r.w,h:r.h,id:t.id})});
  for(let r=1;r<lay.rows;r++)drawRunner(c,PAD+r*(CH+GAP)+(r-1)*CORR,lay.W);
  drawLobbyStrip(c,lay.H-LOBBY_H-PAD+2,lay.W)}
/* ===== 패널 렌더 ===== */
function renderStats(){const all=TASKS.tasks,act=all.filter(t=>!isDone(t)),today=act.filter(t=>dueState(t)==='today'||t.status==='doing'),over=act.filter(t=>dueState(t)==='overdue'||t.urgent),nodate=act.filter(t=>!t.due),doneToday=all.filter(t=>isDone(t)&&toSeoulDate(t.completedAt)===todayISO());
  document.getElementById('stats').innerHTML=[['오늘',today.length,''],['지연·급함',over.length,over.length?'alert':''],['미정',nodate.length,''],['완료',doneToday.length,'ok']].map(([l,n,cls])=>`<span class="chip ${cls}"><b>${n}</b>${l}</span>`).join('')}
function renderDepts(){const filter=local.filterCat||'all';const counts={all:TASKS.tasks.filter(t=>!isDone(t)).length,work:orderedTasks('work').length,dev:orderedTasks('dev').length,personal:orderedTasks('personal').length};
  document.getElementById('depts').innerHTML=[['all','🏢','전체'],['work','💼','업무부'],['dev','⚙️','개발부'],['personal','🌿','개인부']].map(([k,e,l])=>`<button class="dept ${filter===k?'on':''}" data-cat="${k}"><span class="dept-ic">${e}</span><span class="dept-name">${l}</span><span class="dept-n">${counts[k]}</span></button>`).join('');
  document.querySelectorAll('.dept').forEach(b=>b.onclick=()=>{local.filterCat=b.dataset.cat;save();render()})}
function renderFeed(){const all=TASKS.tasks.filter(t=>!isDone(t)),doneToday=TASKS.tasks.filter(t=>isDone(t)&&toSeoulDate(t.completedAt)===todayISO()),today=todayISO();
  const hot=all.filter(t=>dueState(t)==='overdue'||dueState(t)==='today'||t.urgent),rest=all.filter(t=>!hot.includes(t));
  const evts=(CAL.events||[]).filter(e=>e.date<=today&&(e.endDate||e.date)>=today);
  const pct=all.length+doneToday.length?Math.round(doneToday.length/(all.length+doneToday.length)*100):0;
  document.getElementById('chat-pct').textContent=pct+'% 완료';
  const bubble=t=>`<div class="msg ${dueState(t)==='overdue'||t.urgent?'hot':''}" data-task="${esc(t.id)}"><div class="msg-title">${esc(t.emoji||'')} ${esc(t.title)}</div><div class="msg-meta">${CAT[t.category].emoji} ${CAT[t.category].label} · ${fmtDate(t.due)}${t.estimateMin?' · '+t.estimateMin+'분':''}${urgencyText(t)?' · '+urgencyText(t):''}</div></div>`;
  document.getElementById('feed').innerHTML=`${evts.map(e=>`<div class="msg evt"><div class="msg-title">🗓 ${e.time||'종일'} ${esc(e.title)}</div></div>`).join('')}${hot.map(bubble).join('')}${rest.map(bubble).join('')}${doneToday.map(t=>`<div class="msg done"><div class="msg-title"><s>${esc(t.emoji||'')} ${esc(t.title)}</s></div><div class="msg-meta">완료</div></div>`).join('')}`||'<div class="msg evt">할 일이 없어요</div>';
  document.querySelectorAll('.msg[data-task]').forEach(m=>m.onclick=()=>openCell(m.dataset.task))}
function renderPipeline(){const all=TASKS.tasks,act=all.filter(t=>!isDone(t));const stages=[['할 일',act.filter(t=>!['doing'].includes(t.status)).length],['진행 중',act.filter(t=>t.status==='doing'||dueState(t)==='today').length],['완료',all.filter(t=>isDone(t)).length]];
  document.getElementById('pipeline').innerHTML=stages.map(([l,n],i)=>`${i?'<span class="arrow">→</span>':''}<span class="stage"><b>${n}</b>${l}</span>`).join('')}
function render(){if(!document.getElementById('plan'))return;const app=document.getElementById('app');if(app)app.innerHTML='';renderStats();renderDepts();renderFeed();renderPipeline();drawPlan()}
/* ===== 애니메이션 루프 ===== */
let animTick=0;const animFrame=()=>animTick;
setInterval(()=>{animTick++;drawPlan()},450);
/* ===== 캔버스 클릭/호버 ===== */
function canvasPos(e){const cv=document.getElementById('plan'),b=cv.getBoundingClientRect();return{x:(e.clientX-b.left)*cv.width/b.width,y:(e.clientY-b.top)*cv.height/b.height}}
function hitRoom(p){return planRects.find(r=>p.x>=r.x&&p.x<=r.x+r.w&&p.y>=r.y&&p.y<=r.y+r.h)}
const planCv=document.getElementById('plan');
planCv.addEventListener('click',e=>{const r=hitRoom(canvasPos(e));if(r)openCell(r.id)});
planCv.addEventListener('mousemove',e=>{planCv.style.cursor=hitRoom(canvasPos(e))?'pointer':'default'});
/* ===== 방 상세 다이얼로그 ===== */
let cellId=null;
function openCell(id){const t=TASKS.tasks.find(x=>x.id===id);if(!t)return;cellId=id;const cat=CAT[t.category];document.getElementById('cell-cat').textContent=`${cat.emoji} ${cat.label}`;document.getElementById('cell-cat').className='pill '+t.category;document.getElementById('cell-title').textContent=`${t.emoji||''} ${t.title}`;document.getElementById('cell-meta').textContent=[fmtDate(t.due)+(t.endDate&&t.endDate!==t.due?' ~ '+fmtDate(t.endDate):''),t.estimateMin?`약 ${t.estimateMin}분`:'',urgencyText(t),{todo:'대기',doing:'진행 중',waiting:'보류',later:'나중에',done:'완료'}[t.status]||''].filter(Boolean).join(' · ');document.getElementById('cell-next').textContent=t.nextAction?'→ '+t.nextAction:'';document.getElementById('cell-done').textContent=isDone(t)?'완료 취소':'✓ 완료';document.getElementById('cell-dialog').showModal()}
document.getElementById('cell-done').onclick=async()=>{document.getElementById('cell-dialog').close();await toggleDone(cellId)};
document.getElementById('cell-today').onclick=async()=>{document.getElementById('cell-dialog').close();await setToday(cellId)};
document.getElementById('cell-date').onclick=()=>{document.getElementById('cell-dialog').close();openDateEditor(cellId)};
document.getElementById('cell-close').onclick=()=>document.getElementById('cell-dialog').close();
/* 날짜 편집 */
let editingId=null;
function openDateEditor(id){editingId=id;const t=TASKS.tasks.find(x=>x.id===id);if(!t)return;document.getElementById('date-task-title').textContent=t.title;document.getElementById('date-start').value=t.due||'';document.getElementById('date-end').value=t.endDate||'';document.getElementById('date-error').textContent='';document.getElementById('date-editor').showModal()}
document.getElementById('date-form').onsubmit=async e=>{e.preventDefault();const a=document.getElementById('date-start').value,b=document.getElementById('date-end').value;if(!a||b&&b<a){document.getElementById('date-error').textContent='종료일은 시작일 이후로 지정해 주세요.';return}document.getElementById('date-editor').close();await updateDates(editingId,a,b)};
document.getElementById('date-cancel').onclick=()=>document.getElementById('date-editor').close();
document.getElementById('date-clear').onclick=async()=>{document.getElementById('date-editor').close();await updateDates(editingId,'','')};
document.getElementById('date-today').onclick=async()=>{document.getElementById('date-editor').close();await setToday(editingId)};
setInterval(()=>{const el=document.getElementById('clock');if(el)el.textContent=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date())},1000);
refreshRemoteData(true);
setInterval(()=>{if(document.visibilityState==='visible'&&(getApiKey()||isDemo()))refreshRemoteData(false)},60000);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&(getApiKey()||isDemo()))refreshRemoteData(false)});
