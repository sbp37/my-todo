"use strict";
/* ===== 픽셀 세포 지도 엔진 (SecondBrain OS 스타일) ===== */
/* 가구 에셋 자료: kArchive · 출처: 쓰레드 dogfooter (개인·상업 사용 가능, 출처 표기 조건) */
const SPR={};['desk','chair','chair2','sofa','shelf','plants','cactus','cabinet','coffeetable','armchair','mtable','divider','vending','dining','bunk'].forEach(n=>{const i=new Image();i.src='assets/props/'+n+'.png';i.onload=()=>drawPlan();SPR[n]=i});
function spr(c,name,bx,by,h){const im=SPR[name];if(!im||!im.naturalWidth)return;const w=im.naturalWidth*h/im.naturalHeight;c.drawImage(im,Math.round(bx),Math.round(by-h),w,h)}
const COLS=4,WALL=8,RIW=144,RIH=86,CELL_W=RIW+WALL*2,CELL_H=RIH+WALL*2,CORR=42,PAD=14,TICK=20,WALK=16,BAND=16;
const px=(c,x,y,w,h,col)=>{c.fillStyle=col;c.fillRect(x|0,y|0,w,h)};
const hash=s=>{let h=0;for(const ch of String(s))h=(h*31+ch.charCodeAt(0))|0;return Math.abs(h)};
const SKIN='#f0c8a0',OUTLINE='#241d30';
const PLATES=['#c98436','#3a5a8c','#c95a4a','#4a8a6a','#7a5a9c','#c9a13a','#b45a8a','#5a8a3a'];
const HAIRS=['#3b2d24','#1d1b20','#6b4a2f','#584040','#2e3b52'];
const SHIRTS={work:'#3e6f8f',dev:'#6b5390',personal:'#a0665c',main:'#8a7a4a'};
const skyOf=h=>h<6?'#1c1c40':h<9?'#f0a082':h<17?'#8fd0f0':h<20?'#f09070':'#1c1c40';
const fnt=(s,w='')=>`${w} ${Math.round(s*(local.fscale||1))}px ${local.mono?'"Courier New",monospace':'"Noto Sans KR",sans-serif'}`;
/* ----- 아바타(작은 얼굴) 데이터URL 캐시 ----- */
const AV={};
function avatarURL(seed){if(AV[seed])return AV[seed];const h=hash(seed),cv=document.createElement('canvas');cv.width=cv.height=16;const c=cv.getContext('2d');
  px(c,0,0,16,16,PLATES[h%PLATES.length]);px(c,2,2,12,12,'#efe5cd');
  px(c,4,4,8,7,SKIN);const hair=HAIRS[h%HAIRS.length];px(c,3,2,10,3,hair);px(c,3+(h%3),3,2,3,hair);px(c,11-(h%3),3,2,3,hair);
  px(c,5,7,1,2,OUTLINE);px(c,10,7,1,2,OUTLINE);
  if(h%4===0)px(c,6,10,4,1,'#a05543');else px(c,6,10,4,1,OUTLINE);
  if(h%5===0){px(c,4,6,3,3,'#3a3448');px(c,9,6,3,3,'#3a3448')}
  px(c,3,11,10,4,SHIRTS[['work','dev','personal'][h%3]]);return AV[seed]=cv.toDataURL()}
/* ----- 방 내부 소품 ----- */
function drawWindow(c,x,y,frame){px(c,x,y,22,22,OUTLINE);px(c,x+2,y+2,18,18,skyOf(seoulHour()));const h=seoulHour();if(h>=6&&h<20){px(c,x+4,y+4,4,4,'#ffe9a8');px(c,x+5,y+3,2,6,'#ffe9a8');px(c,x+3,y+5,6,2,'#ffe9a8')}else{px(c,x+4,y+4,4,4,'#e8e4c9')}px(c,x+2+((frame*3)%14),y+13,2,2,'rgba(255,255,255,.6)');px(c,x+10,y+2,1,18,OUTLINE);px(c,x+2,y+10,18,1,OUTLINE)}
function drawDesk(c,x,y,state,frame){px(c,x,y,38,3,'#6f4f33');px(c,x,y+3,38,13,'#8a6a4a');px(c,x+3,y+16,4,7,'#5f4732');px(c,x+31,y+16,4,7,'#5f4732');const on=state==='type'||state==='panic';px(c,x+5,y-10,14,10,OUTLINE);px(c,x+7,y-8,10,6,on?(frame?'#bfe9ff':'#8fd4f5'):'#4a4458');if(on&&frame)px(c,x+9+((frame*2)%3),y-6,2,2,'#fff')}
function drawPlant(c,x,y){px(c,x+2,y+4,8,6,'#a05543');px(c,x,y,4,4,'#4f8a4f');px(c,x+8,y-2,4,5,'#5f9e5f');px(c,x+4,y-5,4,5,'#4f8a4f')}
function drawShelf(c,x,y){px(c,x,y,22,2,'#6f4f33');px(c,x+2,y-7,3,7,'#c96a5a');px(c,x+6,y-7,3,7,'#5a8ab0');px(c,x+10,y-7,3,7,'#c9a35a');px(c,x+16,y-5,4,5,'#8a7a4a')}
function drawPoster(c,x,y){px(c,x,y,14,15,'#f5ecd8');px(c,x+2,y+2,10,7,'#d8806a');px(c,x+2,y+11,10,2,'#a09880')}
function drawServer(c,x,y,frame){px(c,x,y,16,26,'#3a3450');px(c,x+2,y+2,12,6,'#262240');px(c,x+2,y+10,12,6,'#262240');px(c,x+3,y+4,2,2,frame?'#7fe8a0':'#3a7a50');px(c,x+3,y+12,2,2,frame?'#e8c878':'#7a6a40');px(c,x+2,y+18,12,5,'#262240')}
function drawBoard(c,x,y,frame){px(c,x,y,30,20,OUTLINE);px(c,x+2,y+2,26,16,'#d8e4dc');c.fillStyle='#5a6a62';for(let i=0;i<3;i++)px(c,x+4,y+5+i*5,14+((i*7+frame*3)%9),1,'#5a6a62');px(c,x+22,y+5,4,4,'#c95a4a')}
function drawSofa(c,x,y){px(c,x,y+6,30,10,'#7a5a48');px(c,x,y,5,8,'#8a6a58');px(c,x+25,y,5,8,'#8a6a58');px(c,x+2,y+2,26,5,'#8a6a58')}
function drawLamp(c,x,y,on){px(c,x+4,0,1,y,'#4a4030');px(c,x,y,9,4,'#5a5040');px(c,x+2,y+4,5,2,on?'#ffe9a8':'#8a8070');if(on){c.fillStyle='#ffe9a8';c.globalAlpha=.12;c.beginPath();c.moveTo(x+2,y+6);c.lineTo(x+7,y+6);c.lineTo(x+16,y+50);c.lineTo(x-7,y+50);c.closePath();c.fill();c.globalAlpha=1}}
function drawBed(c,x,y){px(c,x,y+9,34,10,'#7a4f3e');px(c,x,y+5,34,4,'#96604a');px(c,x+2,y+6,9,5,'#e8e4d8');px(c,x+2,y+15,3,4,'#4f3a2c');px(c,x+29,y+15,3,4,'#4f3a2c')}
function drawRug(c,x,y,w){px(c,x,y,w,7,'#a9705a');px(c,x+3,y+2,w-6,3,'#c08a68')}
function drawBoxes(c,x,y){px(c,x,y+8,12,10,'#b08a5a');px(c,x+13,y+11,10,7,'#9a7448');px(c,x+2,y+10,8,1,'#8a6a42')}
function drawMiniTag(c,x,y,txt){c.font=fnt(7);const w=Math.round(c.measureText(txt).width)+10;px(c,x-1,y-1,w+2,12,OUTLINE);px(c,x,y,w,10,'#f5f2ea');c.fillStyle='#241d30';c.textBaseline='middle';c.fillText(txt,x+5,y+6)}
/* ----- 캐릭터 ----- */
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
function drawBubbleIcon(c,x,y,kind,frame){px(c,x,y,9,9,'#f5f2ea');px(c,x+4,y+9,2,3,'#f5f2ea');if(kind==='panic'){px(c,x+4,y+2,2,4,'#d05050');px(c,x+4,y+7,2,1,'#d05050')}if(kind==='sleep'){c.fillStyle='#8a93c9';c.font=fnt(7,'bold');c.fillText('z',x+3,y+7);if(frame)c.fillText('z',x+9,y-2)}if(kind==='wait'){px(c,x+2,y+4,2,2,'#8a93c9');px(c,x+5,y+4,2,2,'#8a93c9');px(c,x+8,y+4,2,2,'#8a93c9')}}
/* ----- 상태 ----- */
function roomState(t){if(isDone(t))return'sleep';const s=dueState(t);if(s==='overdue'||t.urgent)return'panic';if(s==='today'||t.status==='doing')return'type';if(t.status==='waiting'||t.status==='later')return'wait';return'coffee'}
const STATE_PCT={sleep:100,panic:62,type:38,wait:18,coffee:8};
const STATE_KR={sleep:'수면 중',panic:'긴급 처리 중',type:'작업 중',wait:'대기 중',coffee:'휴식'};
function planRooms(){const out=[];for(const cat of ['work','dev','personal']){for(const t of orderedTasks(cat))out.push(t);for(const t of TASKS.tasks.filter(x=>x.category===cat&&isDone(x)&&toSeoulDate(x.completedAt)===todayISO()))out.push(t)}return out}
function hottest(rooms){return rooms.find(t=>roomState(t)==='panic')||rooms.find(t=>roomState(t)==='type')||rooms[0]}
/* ----- 레이아웃 ----- */
let planRects=[];
function computeLayout(n){const rows=Math.max(2,Math.ceil(n/COLS));const W=PAD*2+COLS*CELL_W;let y=PAD+WALK;const rects=[];for(let r=0;r<rows;r++){for(let col=0;col<COLS;col++){rects.push({x:PAD+col*CELL_W,y,w:CELL_W,h:CELL_H,row:r,idx:r*COLS+col})}y+=CELL_H;if(r<rows-1)y+=CORR}return{W,H:y+BAND+TICK+PAD,rects,rows}}
/* ----- 방 그리기 ----- */
function drawRoomCell(c,r,t){const state=roomState(t),h=hash(t.id),tk=animFrame(),frame=tk%2===0,blink=tk%11===0,lit=state!=='sleep';
  const x=r.x,y=r.y,ix=x+WALL,iy=y+WALL,plate=PLATES[h%PLATES.length];
  px(c,x,y,CELL_W,CELL_H,OUTLINE);px(c,x+2,y+2,CELL_W-4,CELL_H-4,lit?'#9a7a68':'#3a3448');
  px(c,ix,iy,RIW,RIH,lit?'#efe5cd':'#241f38');
  /* 상단 스캘럽 발란스 */
  px(c,ix,iy,RIW,3,lit?'#6b4f42':'#312842');for(let i=4;i<RIW-4;i+=10)px(c,ix+i,iy+3,5,2,lit?'#6b4f42':'#312842');
  if(lit){px(c,ix,iy+RIH-10,RIW,10,'#d8c9a8');px(c,ix,iy+RIH-10,RIW,1,'rgba(0,0,0,.15)')}
  /* 명패 — 방 위쪽 벽을 가로지르는 탭 */
  const name=t.title.slice(0,8);c.font=fnt(8,'bold');const pw=Math.min(RIW-10,Math.round(c.measureText(name).width)+12);
  px(c,ix+4,iy-4,pw+2,15,OUTLINE);px(c,ix+5,iy-3,pw,13,plate);c.fillStyle='#fff';c.textBaseline='middle';c.fillText(name,ix+11,iy+4);
  const fy=iy+RIH-2;
  if(lit){const v=h%4;
    drawRug(c,ix+RIW-92,fy-12,56);
    /* 벽 장식 */
    if(v===0)drawWindow(c,ix+RIW-32,iy+8,frame);else if(v===1)drawPoster(c,ix+RIW-26,iy+10);else if(v===2)drawBoard(c,ix+RIW-48,iy+10,frame);else drawShelf(c,ix+RIW-36,iy+24);
    /* 가구 스프라이트 */
    if(v===0){spr(c,'shelf',ix+4,fy,48);spr(c,'cactus',ix+62,fy,28)}
    else if(v===1){spr(c,'sofa',ix+2,fy,32);spr(c,'coffeetable',ix+38,fy,20);spr(c,'plants',ix+72,fy,34)}
    else if(v===2){spr(c,'vending',ix+4,fy,46);spr(c,'cabinet',ix+40,fy,26);spr(c,'cactus',ix+72,fy,24)}
    else{spr(c,'dining',ix+4,fy,32);spr(c,'armchair',ix+48,fy,34)}
    spr(c,'desk',ix+RIW-70,fy,44);spr(c,'chair',ix+RIW-88,fy,28);
    /* 책상 모니터 상태 표시 */
    if(state==='type'||state==='panic'){px(c,ix+RIW-54,fy-34,12,9,OUTLINE);px(c,ix+RIW-52,fy-32,8,5,frame?'#bfe9ff':'#8fd4f5')}
    const hair=HAIRS[h%HAIRS.length],shirt=SHIRTS[t.category]||SHIRTS.main;
    const poses={type:'type',panic:'panic',coffee:'sip',wait:'stand',sleep:'sleep'};
    const pose=poses[state];
    const cx=pose==='wait'?ix+18:ix+RIW-82,cy=pose==='wait'?fy-40:fy-44;
    drawMiniTag(c,cx-6,cy-16,{type:'작업',panic:'긴급',coffee:'휴식',wait:'대기'}[state]||'대기');
    drawChar(c,cx,cy,{hair,shirt,pose,frame,blink});
    if(state==='panic'){drawBubbleIcon(c,ix+RIW-86,iy+20,'panic',frame);if(frame){c.fillStyle='rgba(208,80,80,.15)';c.fillRect(ix,iy,RIW,RIH)}}
    if(state==='wait')drawBubbleIcon(c,ix+24,iy+22,'wait',frame);
    drawLamp(c,ix+RIW/2-4,iy+4,lit&&state!=='coffee')}
  else{spr(c,'bunk',ix+36,fy,54);drawChar(c,ix+16,iy+RIH-40,{hair:HAIRS[h%HAIRS.length],shirt:'#5a5468',pose:'sleep',frame,blink:true});drawBubbleIcon(c,ix+RIW-16,iy+16,'sleep',frame);c.fillStyle='rgba(16,12,32,.45)';c.fillRect(ix,iy,RIW,RIH)}
  if(local.selected===t.id){px(c,x-2,y-2,CELL_W+4,2,'#e8d54b');px(c,x-2,y+CELL_H,CELL_W+4,2,'#e8d54b');px(c,x-2,y,2,CELL_H,'#e8d54b');px(c,x+CELL_W,y,2,CELL_H,'#e8d54b')}}
function drawGhost(c,r){const x=r.x,y=r.y;px(c,x+2,y+2,CELL_W-4,CELL_H-4,'rgba(143,111,82,.14)');px(c,x+WALL,y+WALL,RIW,RIH,'rgba(0,0,0,.12)');c.strokeStyle='rgba(180,160,120,.35)';c.setLineDash([4,4]);c.strokeRect(x+3.5,y+3.5,CELL_W-7,CELL_H-7);c.setLineDash([]);c.fillStyle='rgba(200,190,220,.35)';c.font=fnt(8);c.textBaseline='middle';c.fillText('빈 세포',x+WALL+6,y+CELL_H-14)}
function drawTalkBubble(c,rects,rooms){const hot=hottest(rooms.filter(t=>!isDone(t)));if(!hot)return;const i=rooms.indexOf(hot),r=rects[i];if(!r)return;
  const txt=hot.nextAction?`"${hot.nextAction}"부터 할게요.`:`"${hot.title}" 먼저 끝내볼게요.`;const t=txt.length>24?txt.slice(0,23)+'…':txt;
  c.font=fnt(8);const bw=Math.round(c.measureText(t).width)+14,bh=16,bx=Math.max(4,Math.min(r.x+r.w/2-bw/2,800-bw)),by=r.y-2;
  px(c,bx-1,by-1,bw+2,bh+2,OUTLINE);px(c,bx,by,bw,bh,'#f7f2e4');px(c,bx+bw/2-3,by+bh,6,4,'#f7f2e4');px(c,bx+bw/2-1,by+bh+4,2,2,'#f7f2e4');
  c.fillStyle='#241d30';c.textBaseline='middle';c.fillText(t,bx+7,by+bh/2+1)}
/* ----- 복도 / 로비 / 티커 ----- */
function corridorPlate(c,x,y,w,txt){px(c,x,y,w,16,'#14132a');px(c,x,y,w,1,'#3a3450');c.fillStyle='#c8c2d8';c.font=fnt(8,'bold');c.textBaseline='middle';c.fillText(txt,x+7,y+9)}
function corridorWalk(c,y,W,h){px(c,0,y,W,h,'#96684c');px(c,0,y,W,2,'#6f4c38');px(c,0,y+h-2,W,2,'#6f4c38');
  for(let i=8;i<W;i+=26)px(c,i,y+3,1,h-6,'rgba(90,58,38,.35)');
  for(let col=0;col<=COLS;col++){const p=PAD+col*CELL_W-5;px(c,p,y-2,10,h+4,'#7d5a42');px(c,p+1,y-2,8,h+4,'#8f6a50');px(c,p+3,y+3,4,4,'#c9a13a')}
  for(let i=60;i<W-50;i+=90){px(c,i,y+4,6,3,'#54402e');px(c,i+1,y+1,4,3,'#e8c878')}}
function drawCorridor(c,y,W,n,act){corridorWalk(c,y,W,CORR);
  c.font=fnt(8,'bold');const lt=`세포 ${n} · 가동 ${act}`;corridorPlate(c,PAD+6,y+13,Math.round(c.measureText(lt).width)+14,lt);
  const now=new Date(),doy=Math.floor((now-new Date(now.getFullYear(),0,0))/864e5),tm=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hour12:false}).format(now);
  const rt=`DAY ${doy} — ${tm}`;corridorPlate(c,W-PAD-6-Math.round(c.measureText(rt).width)-14,y+13,Math.round(c.measureText(rt).width)+14,rt)}
function drawRunner(c,y,W){const tk=animFrame(),span=W-60,pos=(tk*7)%(span*2),x=30+(pos>span?span*2-pos:pos);drawChar(c,x,y+CORR-24,{hair:'#1d1b20',shirt:'#7fb8d8',pose:'walk',frame:tk%2===0,blink:false})}
function drawTicker(c,y,W,rooms){px(c,0,y,W,TICK,'#0f0e20');px(c,0,y,W,1,'#2a2848');const act=rooms.filter(t=>!isDone(t)).length,sleep=rooms.length-act;
  c.fillStyle='#5a5478';c.font=fnt(7);c.textBaseline='middle';c.fillText(`팀 메이트는 ${act}개 방 가동 · ${sleep}개 방 수면 중 · 메인 채널 20:00 전까지 리포트`,PAD,y+TICK/2+1)}
function drawPlan(){const cv=document.getElementById('plan');if(!cv)return;const rooms=planRooms(),lay=computeLayout(rooms.length);cv.width=lay.W;cv.height=lay.H;
  const z=local.zoom||fitZoom(lay.W);cv.style.width=Math.round(lay.W*z)+'px';
  const c=cv.getContext('2d');px(c,0,0,lay.W,lay.H,'#0d0c18');
  corridorWalk(c,PAD,lay.W,WALK);
  corridorWalk(c,lay.H-PAD-TICK-BAND,lay.W,BAND);
  lay.rects.forEach(r=>{if(r.row>0&&r.idx%COLS===0)drawCorridor(c,r.y-CORR,lay.W,rooms.length,rooms.filter(t=>!isDone(t)).length)});
  planRects=[];
  lay.rects.forEach((r,i)=>{const t=rooms[i];if(t){drawRoomCell(c,r,t);planRects.push({x:r.x,y:r.y,w:r.w,h:r.h,id:t.id})}else drawGhost(c,r)});
  for(let rr=1;rr<lay.rows;rr++){const r0=lay.rects[rr*COLS];if(r0)drawRunner(c,r0.y-CORR,lay.W)}
  if(remoteReady)drawTalkBubble(c,lay.rects,rooms);
  drawTicker(c,lay.H-TICK-PAD+2,lay.W,rooms)}
/* ----- 헤더/사이드바/디테일 ----- */
function counts(){const all=TASKS.tasks,act=all.filter(t=>!isDone(t));return{act:act.length,hot:act.filter(t=>dueState(t)==='today'||t.status==='doing'||dueState(t)==='overdue'||t.urgent).length,sleep:all.filter(t=>isDone(t)&&toSeoulDate(t.completedAt)===todayISO()).length,nodate:act.filter(t=>!t.due).length,done:all.filter(t=>isDone(t)).length}}
function renderHead(){const k=counts();document.getElementById('session-sub').textContent=`세션 ${todayISO().slice(5).replace('-','')} — 각 세포가 맡은 할 일을 처리하고 있습니다. 방을 누르면 오른쪽에 세부가 열립니다.`;
  document.getElementById('hstats').innerHTML=[[k.hot,'위임'],[`수면 ${k.sleep}`,'정지 상태'],[k.nodate,'세부 보고'],['LOCAL','지정 방식'],['running','상태']].map(([v,l])=>`<div class="hstat"><b>${v}</b><span>${l}</span></div>`).join('')}
function renderCells(){const rooms=planRooms(),sel=local.selected||'main';
  const item=(id,name,sub)=>`<button class="cell-item ${sel===id?'on':''}" data-id="${esc(id)}"><img class="av" src="${avatarURL(id)}" alt=""><span class="ci-t"><b>${esc(name)}</b><small>${esc(sub)}</small></span></button>`;
  document.getElementById('cells').innerHTML=item('main','메인','업무·휴식')+rooms.map(t=>item(t.id,t.title.length>9?t.title.slice(0,8)+'…':t.title,`${CAT[t.category].label} · ${STATE_KR[roomState(t)]}`)).join('');
  document.querySelectorAll('.cell-item').forEach(b=>b.onclick=()=>selectCell(b.dataset.id))}
function selectCell(id){local.selected=id;save();render()}
function renderDetail(){const el=document.getElementById('detail-body'),k=counts(),rooms=planRooms(),t=TASKS.tasks.find(x=>x.id===local.selected);
  const feed=(CAL.events||[]).filter(e=>e.date<=todayISO()&&(e.endDate||e.date)>=todayISO()).map(e=>({id:e.id,name:'메인',txt:`🗓 ${e.time||'종일'} ${e.title}`}))
    .concat(rooms.filter(x=>!isDone(x)).slice(0,3).map(x=>({id:x.id,name:'메인',txt:`${x.title} — ${STATE_KR[roomState(x)]}`})))
    .concat(TASKS.tasks.filter(x=>isDone(x)&&toSeoulDate(x.completedAt)===todayISO()).map(x=>({id:x.id,name:'메인',txt:`${x.title} 완료 — 휴식 중`})));
  const feedHtml=`<div class="d-feed-head">실시간 생각 일지록 <span>${feed.length}</span></div>${feed.slice(0,7).map(f=>`<div class="d-msg"><img src="${avatarURL(f.id)}" alt=""><div><b>${esc(f.name)}</b><p>${esc(f.txt)}</p></div></div>`).join('')}`;
  if(!t||isDone(t)&&toSeoulDate(t.completedAt)!==todayISO()){const pct=k.act+k.done?Math.round(k.done/(k.act+k.done)*100):0;
    el.innerHTML=`<div class="d-label">선택된 세포</div><div class="d-head"><img class="av-lg" src="${avatarURL('main')}" alt=""><div class="d-t"><b>메인</b><small>전체 요약</small></div><span class="pill-g">활성 상태</span></div>
    <p class="d-desc">방마다 할 일이 살아 있어요. 왼쪽 목록이나 지도에서 세포를 고르면 세부가 열립니다.</p>
    <div class="d-card"><div class="d-card-top">현재 상태 <b>${pct}%</b></div><div class="d-row"><span>진행</span><p>${k.hot}개 방이 지금 작업 중</p></div><div class="d-row"><span>수면</span><p>오늘 완료 ${k.sleep}개</p></div><div class="d-row"><span>미정</span><p>날짜 없는 일 ${k.nodate}개</p></div><div class="bar"><i style="width:${pct}%"></i></div></div>
    <div class="d-btns"><button class="b-dark" id="d-fit">전체 맵 보기<small>지도 맞춤</small></button><button class="b-gray" id="d-add">새 할 일<small>명령 입력</small></button></div>${feedHtml}`;
    document.getElementById('d-fit').onclick=()=>{local.zoom=0;save();drawPlan()};
    document.getElementById('d-add').onclick=()=>document.getElementById('cmd-in').focus();return}
  const state=roomState(t),pct=STATE_PCT[state],cat=CAT[t.category];
  el.innerHTML=`<div class="d-label">선택된 세포</div><div class="d-head"><img class="av-lg" src="${avatarURL(t.id)}" alt=""><div class="d-t"><b>${esc(t.emoji||'')} ${esc(t.title)}</b><small>${cat.label} · ${STATE_KR[state]}</small></div><span class="pill-g ${state==='sleep'?'off':''}">${state==='sleep'?'수면 중':'활성 상태'}</span></div>
  <p class="d-desc">${esc([fmtDate(t.due),t.estimateMin?`약 ${t.estimateMin}분`:'',urgencyText(t)].filter(Boolean).join(' · ')||'기한 없는 보류 작업입니다.')}</p>
  <div class="d-card"><div class="d-card-top">현재 상태 <b>${pct}%</b></div><div class="d-row"><span>분류</span><p>${cat.emoji} ${cat.label}</p></div><div class="d-row"><span>기한</span><p>${esc(fmtDate(t.due))}${t.endDate&&t.endDate!==t.due?' ~ '+esc(fmtDate(t.endDate)):''}</p></div><div class="d-row"><span>메모</span><p>${esc(t.nextAction||urgencyText(t)||'다음 행동 없음')}</p></div><div class="bar"><i style="width:${pct}%"></i></div></div>
  <div class="d-btns"><button class="b-dark" id="d-done">${isDone(t)?'완료 취소':'완료 처리'}<small>세포 동작</small></button><button class="b-gray" id="d-date">날짜 변경<small>일정 조정</small></button></div>${feedHtml}`;
  document.getElementById('d-done').onclick=async()=>{await toggleDone(t.id)};
  document.getElementById('d-date').onclick=()=>openDateEditor(t.id)}
function render(){if(!document.getElementById('plan'))return;const s=document.getElementById('setup-slot');if(s&&remoteReady)s.innerHTML='';renderHead();renderCells();renderDetail();drawPlan()}
/* ===== 애니메이션 루프 ===== */
let animTick=0;const animFrame=()=>animTick;let animTimer=null;
function restartAnim(){if(animTimer)clearInterval(animTimer);animTimer=setInterval(()=>{animTick++;drawPlan()},Math.round(480/(local.speed||1)))}
restartAnim();
function fitZoom(w){const st=document.getElementById('stage-scroll');if(!st)return 1;return Math.max(.5,Math.min(1.6,(st.clientWidth-28)/w))}
/* ===== 툴바 ===== */
document.querySelectorAll('.spd').forEach(b=>{b.classList.toggle('on',Number(b.dataset.spd)===(local.speed||1));b.onclick=()=>{local.speed=Number(b.dataset.spd);save();document.querySelectorAll('.spd').forEach(x=>x.classList.toggle('on',x===b));restartAnim()}});
document.getElementById('tb-font').onclick=e=>{local.mono=!local.mono;save();e.target.classList.toggle('on',local.mono);drawPlan()};
document.getElementById('tb-font').classList.toggle('on',!!local.mono);
document.getElementById('tb-big').onclick=e=>{local.fscale=local.fscale>=1.5?1:local.fscale+.25;save();e.target.classList.toggle('on',local.fscale>1);drawPlan()};
document.getElementById('tb-big').classList.toggle('on',(local.fscale||1)>1);
document.getElementById('tb-zin').onclick=()=>{local.zoom=Math.min(2.5,(local.zoom||fitZoom(document.getElementById('plan').width||800))+.2);save();drawPlan()};
document.getElementById('tb-zout').onclick=()=>{local.zoom=Math.max(.4,(local.zoom||1)-.2);save();drawPlan()};
document.getElementById('tb-fit').onclick=()=>{local.zoom=0;save();drawPlan()};
document.getElementById('tb-follow').onclick=e=>{local.follow=!local.follow;save();e.target.classList.toggle('on',local.follow)};
document.getElementById('tb-follow').classList.toggle('on',!!local.follow);
setInterval(()=>{if(!local.follow||!remoteReady)return;const h=hottest(planRooms().filter(t=>!isDone(t)));if(h&&local.selected!==h.id){local.selected=h.id;save();renderCells();renderDetail()}},3000);
/* ===== 캔버스 클릭 ===== */
function canvasPos(e){const cv=document.getElementById('plan'),b=cv.getBoundingClientRect();return{x:(e.clientX-b.left)*cv.width/b.width,y:(e.clientY-b.top)*cv.height/b.height}}
function hitRoom(p){return planRects.find(r=>p.x>=r.x&&p.x<=r.x+r.w&&p.y>=r.y&&p.y<=r.y+r.h)}
const planCv=document.getElementById('plan');
planCv.addEventListener('click',e=>{const r=hitRoom(canvasPos(e));if(r)selectCell(r.id)});
planCv.addEventListener('dblclick',e=>{const r=hitRoom(canvasPos(e));if(r)openCell(r.id)});
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
/* ===== 명령 입력 → 새 할 일 ===== */
async function submitCmd(){const inp=document.getElementById('cmd-in'),v=inp.value.trim();if(!v)return;inp.value='';
  let cat='personal',title=v;const m=v.match(/^(업무|개발|개인)\s*[:：]\s*(.+)$/);if(m){cat={업무:'work',개발:'dev',개인:'personal'}[m[1]];title=m[2]}
  const id='cells-'+Date.now().toString(36);
  if(isDemo()){TASKS.tasks.push({id,title,category:cat,due:'',priority:90,urgent:false,status:'todo',estimateMin:null,nextAction:'',emoji:'',createdAt:new Date().toISOString()});local.selected=id;save();setStatus('데모','ok');render();return}
  setStatus('등록 중','busy');
  try{await apiPost({action:'upsert_task',task:{external_id:id,title,category:cat,due_date:null,priority:90,urgent:false,status:'todo',source:'cells'}});local.selected=id;save();await refreshRemoteData(false)}catch(e){showError('등록하지 못했어요.');setStatus('실패','error')}}
document.getElementById('cmd-send').onclick=submitCmd;
document.getElementById('cmd-in').addEventListener('keydown',e=>{if(e.key==='Enter')submitCmd()});
document.getElementById('fab').onclick=()=>document.getElementById('cmd-in').focus();
setInterval(()=>{const el=document.getElementById('clock');if(el)el.textContent=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date())},1000);
window.addEventListener('resize',()=>{if(!local.zoom)drawPlan()});
refreshRemoteData(true);
setInterval(()=>{if(document.visibilityState==='visible'&&(getApiKey()||isDemo()))refreshRemoteData(false)},60000);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&(getApiKey()||isDemo()))refreshRemoteData(false)});
