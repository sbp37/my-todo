"use strict";
// 🏠 부동산 탭: 오늘의 부동산 신문, 눈여겨볼 단지 목록·상세·비교, 매수 계획.
// app-base.js의 apiGet·apiPost·esc·getApiKey·setStatus·todayISO를 그대로 쓴다.
// API(resource=realestate)가 주는 것:
//   seed  — 조사 내용(단지·시장 요약·일정)
//   user  — 내가 고친 값(단지별 메모·관심 매수가·별표·상태·링크·내가 본 매물·임장 기록, 전체 메모·비교 목록·자금 계산 값)
//           가족 키로 비밀번호 없이 볼 때는 서버가 개인 기록(메모·매물·임장·계산 값)을 빼고 준다.
//   agent — 에이전트(피클 등)가 올린 신문·단지별 소식·새 단지. "피클 추가" 뱃지로 구분한다.
// 버튼 속성은 기존 앱과 겹치지 않게 data-re-* 만 쓴다.
(()=>{
const UI_KEY="subin-re-ui-v1";
const CACHE_KEY="subin-re-cache-v1";
const RE={seed:null,user:{complexes:{}},agent:{briefs:[],news:[],complexes:[]},loaded:false,loading:false,error:"",
  view:"home",detail:"",sort:"rank",region:"all",kind:"all",status:"all",starOnly:false,editLinks:false,fold:{},syncedAt:0};
try{Object.assign(RE,JSON.parse(localStorage.getItem(UI_KEY)||"{}"))}catch(e){}
RE.editLinks=false;RE.fold={};RE.syncedAt=0;
if(RE.view==="timeline")RE.view="plan"; // 예전 '일정' 화면은 '계획' 안으로 옮겼다
const saveUI=()=>{try{localStorage.setItem(UI_KEY,JSON.stringify({view:RE.view,detail:RE.detail,sort:RE.sort,region:RE.region,kind:RE.kind,status:RE.status,starOnly:RE.starOnly}))}catch(e){}};

// cls는 기존 style.css의 .top(상단 헤더) 같은 이름과 겹치지 않게 s- 를 붙인다.
const STATUS={top:{label:"추천",cls:"s-top"},watch:{label:"관심",cls:"s-watch"},dip:{label:"조정 시 매수",cls:"s-dip"},hold:{label:"보류",cls:"s-hold"},out:{label:"제외",cls:"s-out"},presale:{label:"분양권",cls:"s-presale"}};
const KIND={apt:"아파트",jusang:"주상복합",presale:"분양권·입주권"};
const SORTS=[["rank","종합 순위"],["gap","기회 가격에 가까운 순"],["price","가격 낮은 순"],["riseHigh","많이 오른 순"],["riseLow","덜 오른 순"],["transfer","환승 적은 순"],["yeoksam","역삼 가까운 순"],["jamsil","잠실 가까운 순"],["new","신축 순"],["news","새 소식 순"]];
const BY={pickle:"피클 추가",claude:"Claude 추가"};
const BRIEF_CAT=[["policy","정책"],["loan","대출"],["market","시장"],["subscription","청약·줍줍"],["deal","급매"],["etc","기타"]];
const NEWS_KIND={ask:"호가",listings:"매물 수",trade:"실거래",catalyst:"호재",risk:"악재",review:"실거주 평가",floorplan:"평면도",etc:"기타"};

/* ---------- 계산 ---------- */
const eok=n=>n==null?"-":(Math.round(n*100)/100)+"억";
const thisYear=()=>Number(todayISO().slice(0,4));
const ageText=c=>!c.built?"":c.built>thisYear()?`${c.built}년 입주 예정`:`${c.built}년 · ${thisYear()-c.built+1}년차`;
const complexes=()=>[...RE.seed.complexes,...(RE.agent.complexes||[])];
const findComplex=id=>complexes().find(c=>c.id===id);
const ustate=id=>RE.user.complexes?.[id]||{};
const targetOf=c=>{const u=ustate(c.id);return "target" in u?u.target:c.target};
const statusOf=c=>ustate(c.id).status||c.status;
const rise=c=>c.p24&&c.p26?(c.p26-c.p24)/c.p24:null;
const gap=c=>{const t=targetOf(c);return t&&c.p26?c.p26-t:null};
// cm: [역삼 최소시간, 환승, 역삼 최소환승, 환승, 잠실 최소시간, 환승, 잠실 최소환승, 환승]
const fewest=c=>c.cm?(c.cm[3]??c.cm[1])+(c.cm[7]??c.cm[5]):99;
const trText=n=>n===0?"무환승":`환승 ${n}`;
function gapText(c){const g=gap(c);if(g==null)return"";if(g<=0)return"관심가 도달";return `관심가까지 ${eok(g)}`}
function searchName(c){return c.q||c.name.replace(/\(.*?\)/g,"").replace(/^(황학동|마장동|풍납|제기동|신도림)\s+/,"").split("·")[0].trim()}
function linksOf(c){
  const q=searchName(c),area=c.gu.split(" ").pop(),u=ustate(c.id).links||{};
  return {
    naver:u.naver||`https://m.land.naver.com/search/result/${encodeURIComponent(q)}`,
    hogang:u.hogang||c.hg||`https://hogangnono.com/search?q=${encodeURIComponent(q)}`,
    plan:u.plan||`https://search.naver.com/search.naver?where=image&query=${encodeURIComponent(q+" "+c.area+" 평면도")}`,
    road:u.road||`https://map.kakao.com/link/search/${encodeURIComponent(area+" "+q)}`
  };
}
// 에이전트가 준 주소는 https만 연다.
const safeUrl=u=>/^https:\/\//.test(u||"")?u:"#";
const host=u=>{try{return new URL(u).hostname.replace(/^www\./,"")}catch(e){return"출처"}};
const addDay=(iso,n)=>{const d=new Date(iso+"T00:00:00Z");d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
const dayText=iso=>{const [,m,d]=iso.split("-").map(Number);return `${m}월 ${d}일 (${"일월화수목금토"[new Date(iso+"T00:00:00Z").getUTCDay()]})`};
const byBadge=by=>`<span class="re-by">${esc(BY[by]||BY.pickle)}</span>`;
const newsOf=id=>(RE.agent.news||[]).filter(n=>n.complex_id===id).sort((a,b)=>b.date.localeCompare(a.date)||String(b.created_at).localeCompare(String(a.created_at)));
const freshCount=id=>{const since=addDay(todayISO(),-3);return newsOf(id).filter(n=>n.date>=since).length};
const lastNewsDate=id=>newsOf(id)[0]?.date||"";
const locked=()=>!!(window.SUBIN_LOCK&&window.SUBIN_LOCK.locked); // 가족 키로 보는 중이면 읽기 전용
const listingsOf=id=>ustate(id).listings||[];
const myAsk=id=>{const a=listingsOf(id).filter(l=>!l.gone).map(l=>l.price);return a.length?Math.min(...a):null};
const compareIds=()=>(RE.user.compare||[]).filter(id=>findComplex(id));
// 화면에 보이는 가격이 무엇을 기준으로 한 값인지
const basis=c=>c.agent?`피클이 올린 값${c.date?" · "+dayText(c.date):""}`:(RE.seed.docs.priceBasis||"최근 실거래 중앙값");
const signed=n=>(n>0?"+":n<0?"−":"")+eok(Math.abs(n));
const man=n=>Math.round(n).toLocaleString()+"만";
const typing=()=>{const a=document.activeElement;return !!(a&&a.closest&&a.closest("#re-root")&&/^(TEXTAREA|INPUT)$/.test(a.tagName))};
// 접었다 펴는 상자. 다시 그려도 펴 둔 상태가 유지되게 RE.fold에 적어 둔다.
const fold=(key,title,body,open=false,cls="card re-fold")=>`<details class="${cls}" data-re-fold="${esc(key)}" ${(key in RE.fold?RE.fold[key]:open)?"open":""}><summary><span>${title}</span><i aria-hidden="true"></i></summary><div class="re-fold-body">${body}</div></details>`;

/* ---------- 불러오기·저장 ---------- */
function applyRemote(r){
  RE.seed=r.seed||null;
  RE.user=r.user&&r.user.complexes?r.user:{complexes:{}};
  const a=r.agent||{};RE.agent={briefs:a.briefs||[],news:a.news||[],complexes:a.complexes||[]};
  RE.loaded=!!RE.seed;
}
const cache=()=>{try{localStorage.setItem(CACHE_KEY,JSON.stringify({seed:RE.seed,user:RE.user,agent:RE.agent}))}catch(e){}};
async function load(force){
  if(RE.loading||(RE.loaded&&!force))return;
  RE.loading=true;RE.error="";
  if(!RE.loaded){try{const x=JSON.parse(localStorage.getItem(CACHE_KEY)||"null");if(x?.seed){applyRemote(x);draw()}}catch(e){}}
  try{
    const r=await apiGet("realestate");
    if(!r.seed)throw new Error("NO_DATA");
    applyRemote(r);cache();RE.syncedAt=Date.now();
  }catch(e){RE.error=RE.loaded?"지금은 연결이 불안정해서 마지막으로 불러온 내용을 보여주고 있어요.":"부동산 데이터를 불러오지 못했어요. 잠시 후 다시 시도해 주세요."}
  // 뭔가 적고 있는 중이면 화면을 갈아엎지 않는다(받아 온 내용은 다음에 그릴 때 반영된다).
  RE.loading=false;if(!typing())draw();
}
const saved=()=>{setStatus("저장됨","ok");setTimeout(()=>setStatus("최신 상태","ok"),900)};
async function patch(id,p){
  const prev=RE.user.complexes[id];
  RE.user.complexes={...RE.user.complexes,[id]:{...(prev||{}),...p}};
  try{
    const r=await apiPost({action:"re_patch",id,patch:p});
    if(r.user?.complexes)RE.user=r.user;
    cache();saved();return true;
  }catch(e){
    const c={...RE.user.complexes};if(prev)c[id]=prev;else delete c[id];RE.user.complexes=c;
    RE.error="저장하지 못했어요. 잠시 후 다시 시도해 주세요.";return false;
  }
}
// 단지와 상관없는 내 기록(전체 메모·비교 목록·자금 계산 값)
async function myPut(body){
  try{
    const r=await apiPost({action:"re_my_put",...body});
    if(r.user?.complexes)RE.user=r.user;
    cache();saved();return true;
  }catch(e){RE.error="저장하지 못했어요. 잠시 후 다시 시도해 주세요.";return false}
}
async function setCompare(ids){
  if(ids.length>4){RE.error="비교는 4곳까지 담을 수 있어요. 하나를 빼고 다시 담아 주세요.";draw();return}
  RE.error="";
  const prev=RE.user.compare;RE.user={...RE.user,compare:ids};
  if(!await myPut({compare:ids}))RE.user={...RE.user,compare:prev};
  draw();
}
async function removeAgentItem(type,id){
  if(!confirm("이 글을 지울까요? 지우면 되돌릴 수 없어요."))return;
  try{
    const r=await apiPost({action:"re_agent_delete",type,id});
    if(r.agent)RE.agent={briefs:r.agent.briefs||[],news:r.agent.news||[],complexes:r.agent.complexes||[]};
    cache();saved();
    if(type==="complex"){RE.view="list";RE.detail=""}
  }catch(e){RE.error="지우지 못했어요. 잠시 후 다시 시도해 주세요."}
  draw();
}

/* ---------- 조각 ---------- */
const pill=c=>{const s=STATUS[statusOf(c)]||STATUS.watch;return `<span class="re-pill ${s.cls}">${s.label}</span>`};
// 최소환승 경로가 따로 있으면 "또는 28분 무환승"으로 같이 보여준다.
const leg=(name,min,tr,min2,tr2)=>`${name} ${min}분 <small>${trText(tr)}${min2!=null?` · 또는 ${min2}분 ${trText(tr2)}`:""}</small>`;
function commuteLine(c){return c.cm?`${leg("역삼",c.cm[0],c.cm[1],c.cm[2],c.cm[3])}<br>${leg("잠실",c.cm[4],c.cm[5],c.cm[6],c.cm[7])}`:""}
const subLine=c=>[`${c.gu} ${c.dong}`,ageText(c),c.hh?c.hh.toLocaleString()+"세대":"",c.kind==="jusang"?"주상복합":""].filter(Boolean).map(esc).join(" · ");
function card(c){
  const r=rise(c),g=gapText(c),star=ustate(c.id).star,fresh=freshCount(c.id);
  return `<button class="card re-card" data-re-open="${esc(c.id)}">
    <div class="re-card-top">${c.rank?`<span class="re-rank">${c.rank}</span>`:""}<h4>${star?"⭐ ":""}${esc(c.name)}</h4>${pill(c)}</div>
    <div class="re-sub">${subLine(c)}</div>
    <div class="re-nums"><span class="re-price">${c.area}㎡ ${eok(c.p26)}</span>${r!=null?`<span class="re-rise">2년 +${Math.round(r*100)}%</span>`:""}${g?`<span class="re-gap ${gap(c)<=0?"hit":""}">${g}</span>`:""}</div>
    ${c.cm?`<div class="re-commute">${commuteLine(c)}</div>`:""}
    <p class="re-one">${esc(c.one)}</p>
    ${c.agent||fresh?`<div class="re-card-tags">${c.agent?byBadge(c.by):""}${fresh?`<span class="re-fresh">새 소식 ${fresh}</span>`:""}</div>`:""}
  </button>`;
}
const list=(title,items,cls="")=>items&&items.length?`<section class="re-block ${cls}"><h3>${title}</h3><ul>${items.map(x=>`<li>${esc(x)}</li>`).join("")}</ul></section>`:"";
function subnav(){
  const tabs=[["home","요약"],["paper","신문"],["list","단지"],["compare","비교"],["plan","계획"],["notes","분양권·기준"]];
  return `<nav class="re-nav" aria-label="부동산 화면">${tabs.map(([k,l])=>`<button data-re-view="${k}" class="${(RE.view===k||(RE.view==="detail"&&k==="list"))?"on":""}">${l}</button>`).join("")}</nav>`;
}

/* ---------- 오늘의 부동산 신문 ---------- */
function briefCard(b){
  const groups=BRIEF_CAT.map(([k,l])=>[l,(b.items||[]).filter(i=>i.category===k)]).filter(g=>g[1].length);
  return `<article class="card re-paper">
    <header><h3>📰 ${esc(b.title||dayText(b.date)+" 부동산 신문")}</h3><div class="re-paper-meta"><span>${dayText(b.date)}</span>${byBadge(b.by)}<button class="re-del" data-re-del="brief" data-re-id="${esc(b.id)}" aria-label="이 신문 지우기">지우기</button></div></header>
    ${b.lead?`<p class="re-paper-lead">${esc(b.lead)}</p>`:""}
    ${groups.map(([label,items])=>`<section class="re-paper-sec"><h4>${label}</h4>${items.map(i=>{const c=i.complex_id&&findComplex(i.complex_id);return `<div class="re-paper-item"><b>${esc(i.title)}</b><p>${esc(i.body)}</p><div class="re-src"><a href="${esc(safeUrl(i.source_url))}" target="_blank" rel="noopener">${esc(i.source_name||host(i.source_url))} ↗</a>${c?`<button class="re-link" data-re-open="${esc(c.id)}">${esc(c.name)} 보기</button>`:""}</div></div>`}).join("")}</section>`).join("")}
  </article>`;
}
const briefsDesc=()=>[...(RE.agent.briefs||[])].sort((a,b)=>b.date.localeCompare(a.date)||String(b.created_at).localeCompare(String(a.created_at)));
function paperToday(){
  const all=briefsDesc(),today=todayISO(),yest=addDay(today,-1);
  const recent=all.filter(b=>b.date===today||b.date===yest);
  const shown=recent.length?recent:all.slice(0,1);
  return `<section class="section"><div class="section-title"><h3>📰 오늘의 부동산 신문</h3>${all.length?`<button class="re-link" data-re-view="paper">지난 신문 보기</button>`:""}</div>
    ${shown.length?`${!recent.length?`<p class="re-note">오늘·어제 올라온 신문이 없어서 가장 최근 것을 보여줘요.</p>`:""}${shown.map(briefCard).join("")}`:`<div class="empty">아직 올라온 신문이 없어요. 피클이 글을 올리면 여기에 보여요.</div>`}</section>`;
}
function viewPaper(){
  const all=briefsDesc();
  return `<div class="section-title"><h3>📰 부동산 신문</h3><span>${all.length}건</span></div>${all.length?all.slice(0,60).map(briefCard).join(""):`<div class="empty">아직 올라온 신문이 없어요.</div>`}`;
}

/* ---------- 요약 ---------- */
function viewHome(){
  const d=RE.seed.docs,cs=complexes();
  const near=cs.filter(c=>gap(c)!=null&&["top","watch","dip"].includes(statusOf(c))).sort((a,b)=>gap(a)-gap(b)).slice(0,5);
  const stars=cs.filter(c=>ustate(c.id).star);
  const ym=todayISO().slice(0,7),next=d.timeline.filter(t=>t.date.slice(0,7)>=ym).slice(0,4);
  const since=addDay(todayISO(),-3),fresh=(RE.agent.news||[]).filter(n=>n.date>=since).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,6);
  return `${paperToday()}
  ${fresh.length?`<section class="section"><div class="section-title"><h3>🗞 단지 새 소식</h3><span>최근 3일</span></div><div class="re-news">${fresh.map(n=>newsItem(n,true)).join("")}</div></section>`:""}
  <section class="card re-panel"><div class="re-eyebrow">지금 시장 · ${esc(d.asOf)} 기준</div><ul class="re-bullets">${d.market.map(x=>`<li>${esc(x)}</li>`).join("")}</ul></section>
  ${fold("budget","💰 내 예산",`<ul class="re-bullets">${d.budget.lines.map(x=>`<li>${esc(x)}</li>`).join("")}</ul>${d.plan?`<p class="re-note"><button class="re-link" data-re-view="plan" data-re-foldopen="costs">추가로 드는 돈 · 자금 계산기 보기</button></p>`:""}`)}
  ${stars.length?`<section class="section"><div class="section-title"><h3>⭐ 별표한 단지</h3><span>${stars.length}곳</span></div><div class="re-grid">${stars.map(card).join("")}</div></section>`:""}
  <section class="section"><div class="section-title"><h3>🎯 기회 가격에 가까운 단지</h3><span>실거래 중앙값 − 관심 매수가</span></div><div class="re-grid">${near.map(card).join("")}</div></section>
  <section class="section"><div class="section-title"><h3>🗓 다가오는 일정</h3><button class="re-link" data-re-view="plan" data-re-foldopen="market">전체 보기</button></div><div class="re-tl">${next.map(tlItem).join("")}</div></section>`;
}

/* ---------- 목록 ---------- */
function sorted(cs){
  const last=v=>v==null?Infinity:v,by={
    rank:(a,b)=>last(a.rank)-last(b.rank),
    gap:(a,b)=>last(gap(a))-last(gap(b)),
    price:(a,b)=>last(a.p26)-last(b.p26),
    riseHigh:(a,b)=>(rise(b)??-1)-(rise(a)??-1),
    riseLow:(a,b)=>last(rise(a))-last(rise(b)),
    transfer:(a,b)=>fewest(a)-fewest(b)||last(a.cm&&a.cm[0]+a.cm[4])-last(b.cm&&b.cm[0]+b.cm[4]),
    yeoksam:(a,b)=>last(a.cm?.[0])-last(b.cm?.[0]),
    jamsil:(a,b)=>last(a.cm?.[4])-last(b.cm?.[4]),
    new:(a,b)=>(b.built||0)-(a.built||0),
    news:(a,b)=>lastNewsDate(b.id).localeCompare(lastNewsDate(a.id))
  };
  const order=["top","watch","dip","presale","hold","out"];
  return [...cs].sort((a,b)=>(by[RE.sort]||by.rank)(a,b)||order.indexOf(statusOf(a))-order.indexOf(statusOf(b))||a.name.localeCompare(b.name,"ko"));
}
function viewList(){
  const shown=sorted(complexes().filter(c=>(RE.region==="all"||c.region===RE.region)&&(RE.kind==="all"||c.kind===RE.kind)&&(RE.status==="all"||statusOf(c)===RE.status||(RE.status==="holdout"&&["hold","out"].includes(statusOf(c)))||(RE.status==="agent"&&c.agent))&&(!RE.starOnly||ustate(c.id).star)));
  const chips=(key,opts)=>`<div class="re-chips" role="group">${opts.map(([v,l])=>`<button data-re-filter="${key}" data-re-value="${v}" class="${RE[key]===v?"on":""}" aria-pressed="${RE[key]===v}">${l}</button>`).join("")}</div>`;
  return `<section class="card re-controls">
    <label class="re-sort">정렬 <select id="re-sort">${SORTS.map(([v,l])=>`<option value="${v}" ${RE.sort===v?"selected":""}>${l}</option>`).join("")}</select></label>
    ${chips("region",[["all","전체 지역"],["서울","서울"],["경기","경기"]])}
    ${chips("kind",[["all","전체 유형"],["apt","아파트"],["jusang","주상복합"],["presale","분양권"]])}
    ${chips("status",[["all","전체 상태"],["top","추천"],["watch","관심"],["dip","조정 시 매수"],["holdout","보류·제외"],["agent","피클 추가"]])}
    <div class="re-chips"><button data-re-star class="${RE.starOnly?"on":""}" aria-pressed="${RE.starOnly}">⭐ 별표만</button></div>
  </section>
  <div class="section-title"><h3>단지 ${shown.length}곳</h3><span>가격은 ${esc(RE.seed.docs.priceBasis||"최근 실거래 중앙값")}</span></div>
  <div class="re-grid">${shown.length?shown.map(card).join(""):'<div class="empty">조건에 맞는 단지가 없어요.</div>'}</div>`;
}

/* ---------- 상세 ---------- */
function priceBars(c){
  const t=targetOf(c),rows=[["21년 고점",c.peak],["24년 하반기",c.p24],["최근 실거래",c.p26]].filter(r=>r[1]!=null);
  if(!rows.length)return"";
  const max=Math.max(...rows.map(r=>r[1]),t||0)*1.08;
  return `<div class="re-bars" role="img" aria-label="${esc(rows.map(r=>r[0]+" "+eok(r[1])).join(", ")+(t?", 관심 매수가 "+eok(t):""))}">
    ${rows.map(([l,v],i)=>`<div class="re-bar-row" title="${esc(l)} ${eok(v)}"><span class="re-bar-label">${l}</span><span class="re-bar-track"><span class="re-bar ${i===rows.length-1?"now":""}" style="width:${(v/max*100).toFixed(1)}%"></span>${t?`<span class="re-bar-target" style="left:${(t/max*100).toFixed(1)}%" title="관심 매수가 ${eok(t)}"></span>`:""}</span><span class="re-bar-val">${eok(v)}</span></div>`).join("")}
    ${t?`<div class="re-bar-legend"><span class="re-bar-target-key"></span>관심 매수가 ${eok(t)}</div>`:""}
  </div>`;
}
function newsItem(n,withName){
  const c=withName&&findComplex(n.complex_id);
  const nums=[n.ask!=null?`호가 ${eok(n.ask)}${n.ask_prev!=null?` (이전 ${eok(n.ask_prev)}, ${n.ask<n.ask_prev?"▼ ":n.ask>n.ask_prev?"▲ ":""}${eok(Math.abs(n.ask-n.ask_prev))})`:""}`:"",n.listings!=null?`매물 ${n.listings}건`:"",n.area!=null?`${n.area}㎡`:""].filter(Boolean);
  return `<div class="re-news-item"><div class="re-news-head"><span class="re-kind">${esc(NEWS_KIND[n.kind]||"기타")}</span><span class="re-news-date">${dayText(n.date)}</span>${byBadge(n.by)}<button class="re-del" data-re-del="news" data-re-id="${esc(n.id)}" aria-label="이 소식 지우기">지우기</button></div>
    ${c?`<button class="re-link" data-re-open="${esc(c.id)}">${esc(c.name)}</button>`:""}
    <b>${esc(n.title)}</b>${nums.length?`<div class="re-news-nums">${esc(nums.join(" · "))}</div>`:""}${n.body?`<p>${esc(n.body)}</p>`:""}
    <div class="re-src"><a href="${esc(safeUrl(n.source_url))}" target="_blank" rel="noopener">${esc(n.source_name||host(n.source_url))} ↗</a>${(n.links||[]).map(l=>`<a href="${esc(safeUrl(l.url))}" target="_blank" rel="noopener">${esc(l.label)} ↗</a>`).join("")}</div></div>`;
}
function viewDetail(){
  const c=findComplex(RE.detail);
  if(!c){RE.view="list";return viewList()}
  const u=ustate(c.id),L=linksOf(c),r=rise(c),t=targetOf(c),g=gap(c),news=newsOf(c.id);
  const ro=locked(),ask=myAsk(c.id),inCmp=compareIds().includes(c.id);
  const lastAsk=news.find(n=>n.ask!=null),lastListings=news.find(n=>n.listings!=null);
  const facts=[
    r!=null?["2년 변화 (같은 면적 중앙값)",`${signed(c.p26-c.p24)} (${r>=0?"+":"−"}${Math.abs(Math.round(r*100))}%)`]:null,
    c.peak?["2021년 고점 대비",`${Math.round(c.p26/c.peak*100)}%`]:null,
    c.vol?["거래량 (5~7월 → 8~10월)",`${c.vol[0]}건 → ${c.vol[1]}건`]:null,
    lastAsk?[`최근 호가 (${dayText(lastAsk.date)})`,eok(lastAsk.ask)]:null,
    lastListings?[`매물 수 (${dayText(lastListings.date)})`,`${lastListings.listings}건`]:null,
    ask!=null?["내가 본 최저 호가",eok(ask)]:null,
    c.st?["역까지",`${esc(c.st)}${c.walk!=null?` 도보 ${c.walk}분`:""}`]:null
  ].filter(Boolean);
  const cmRow=(label,min,tr,min2,tr2)=>`<div class="re-cm-row"><b>${label}</b><span>최소시간 ${min}분 · ${trText(tr)}</span>${min2!=null?`<span>최소환승 ${min2}분 · ${trText(tr2)}</span>`:""}</div>`;
  return `<div class="re-detail-head"><button class="re-back" data-re-view="list">‹ 목록</button>${ro?"":`<div class="re-head-actions"><label class="re-status">상태 <select data-re-status aria-label="이 단지의 상태">${Object.entries(STATUS).map(([k,v])=>`<option value="${k}" ${statusOf(c)===k?"selected":""}>${v.label}</option>`).join("")}</select></label><button class="re-star ${inCmp?"on":""}" data-re-cmp="${esc(c.id)}" aria-pressed="${inCmp}">${inCmp?"⚖️ 비교 중":"⚖️ 비교에 담기"}</button><button class="re-star ${u.star?"on":""}" data-re-starone="${esc(c.id)}" aria-pressed="${!!u.star}">${u.star?"⭐ 별표함":"☆ 별표"}</button></div>`}</div>
  <section class="card re-panel re-hero"><div class="re-card-top">${c.rank?`<span class="re-rank">${c.rank}</span>`:""}<h2>${esc(c.name)}</h2>${pill(c)}</div>
    <div class="re-sub">${esc(c.region)} ${subLine(c)}${c.kind!=="jusang"&&KIND[c.kind]?" · "+KIND[c.kind]:""}</div>
    <p class="re-one">${esc(c.one)}</p>
    ${c.agent?`<div class="re-src">${byBadge(c.by)}<span>${dayText(c.date)}</span><a href="${esc(safeUrl(c.source_url))}" target="_blank" rel="noopener">${esc(host(c.source_url))} ↗</a><button class="re-del" data-re-del="complex" data-re-id="${esc(c.id)}">이 단지 지우기</button></div>`:""}
    <div class="re-links"><a href="${esc(L.naver)}" target="_blank" rel="noopener">네이버부동산</a><a href="${esc(L.hogang)}" target="_blank" rel="noopener">호갱노노</a><a href="${esc(L.plan)}" target="_blank" rel="noopener">평면도</a><a href="${esc(L.road)}" target="_blank" rel="noopener">지도·로드뷰</a>${ro?"":`<button class="re-link" data-re-editlinks>${RE.editLinks?"닫기":"링크 고치기"}</button>`}</div>
    ${RE.editLinks?`<form class="re-linkform" id="re-linkform"><p>검색 화면으로 열리는 링크는 단지 페이지 주소를 붙여 넣으면 다음부터 바로 열려요. 비우면 기본 검색 링크를 써요.</p>${[["naver","네이버부동산"],["hogang","호갱노노"],["plan","평면도"],["road","지도·로드뷰"]].map(([k,l])=>`<label>${l}<input type="url" name="${k}" value="${esc((u.links||{})[k]||"")}" placeholder="https://"></label>`).join("")}<button type="submit" class="primary">링크 저장</button></form>`:""}
  </section>
  <section class="card re-panel"><div class="re-eyebrow">가격 · ${c.area}㎡</div>
    <div class="re-bigprice">${eok(c.p26)} <small>${esc(c.range||"")}</small></div>
    ${priceBars(c)}
    <dl class="re-facts">${facts.map(([k,v])=>`<div><dt>${k}</dt><dd>${v}</dd></div>`).join("")}</dl>
    <p class="re-note">가격 기준: ${esc(basis(c))}. 가장 최근 한 건의 거래가가 아니에요. 최신 거래는 <a href="https://rt.molit.go.kr/" target="_blank" rel="noopener">국토부 실거래가</a>나 위의 호갱노노 버튼으로 확인하세요.</p>
  </section>
  <section class="card re-panel re-target"><div class="re-eyebrow">🎯 기회 가격</div>
    ${ro?(t?`<div class="re-bigprice">${eok(t)} <small>관심 매수가</small></div>`:""):`<form id="re-targetform" class="re-targetform"><label>관심 매수가 <input type="number" step="0.05" min="0" max="99" name="target" value="${t??""}" inputmode="decimal"> 억</label><button type="submit">저장</button></form>`}
    <p class="re-target-note">${g==null?"관심 매수가를 정하면 최근 실거래와의 차이를 보여줘요.":g<=0?`최근 실거래가 관심 매수가 이하예요 (${eok(-g)} 아래).`:`최근 실거래가 관심 매수가보다 ${eok(g)} 높아요.`}${!ro&&c.target&&t===c.target?" 제안값이라 직접 고칠 수 있어요.":""}${ask!=null&&t?` 내가 본 최저 호가 ${eok(ask)}는 관심 매수가${ask<=t?" 이하예요.":`보다 ${eok(ask-t)} 높아요.`}`:""}</p>
  </section>
  ${ro?"":listingsCard(c)}
  <section class="card re-panel"><div class="re-eyebrow">🚇 통근</div>
    ${c.cm?`${cmRow("역삼역",c.cm[0],c.cm[1],c.cm[2],c.cm[3])}${cmRow("잠실역",c.cm[4],c.cm[5],c.cm[6],c.cm[7])}<p class="re-note">${esc(c.cmnote||"도보 포함 추정치예요. 대기 시간 5~10분은 빠져 있어요.")}</p>`:`<p class="re-note">통근 정보가 아직 없어요.</p>`}
  </section>
  <section class="re-block"><h3>🗞 최근 소식 <small>${news.length}건</small></h3>${news.length?`<div class="re-news">${news.slice(0,30).map(n=>newsItem(n,false)).join("")}</div>`:`<p class="re-note">아직 올라온 소식이 없어요. 피클이 호가 변동이나 매물 수를 올리면 여기에 쌓여요.</p>`}</section>
  ${list("📈 호재",c.cat)}${list("👍 장점",c.pros,"pros")}${list("👎 단점",c.cons,"cons")}${list("🏘 주민 정보",c.tips)}${list("✅ 계약 전 확인할 것",c.checks,"checks")}
  ${c.timing||c.redev?`<section class="re-block"><h3>⏱ 시기 · 정비</h3><ul>${c.timing?`<li>${esc(c.timing)}</li>`:""}${c.redev?`<li>재건축·리모델링: ${esc(c.redev)}</li>`:""}</ul></section>`:""}
  ${ro?"":`${visitCard(c)}<section class="card re-panel"><div class="re-eyebrow">📝 내 메모</div><form id="re-memoform"><textarea name="memo" rows="4" maxlength="4000" data-keep="memo-${esc(c.id)}" placeholder="중개사 통화 내용, 생각나는 것 등">${esc(u.memo||"")}</textarea><button type="submit">메모 저장</button></form></section>`}`;
}

/* ---------- 내가 본 매물 · 임장 기록 ---------- */
const field=(label,input)=>`<label>${label}${input}</label>`;
function listingsCard(c){
  const ls=[...listingsOf(c.id)].sort((a,b)=>(!!a.gone-!!b.gone)||a.price-b.price),t=targetOf(c);
  const row=l=>`<div class="re-lst ${l.gone?"gone":""}"><div class="re-lst-top"><b>${eok(l.price)}</b>${t?`<span class="re-gap ${l.price<=t?"hit":""}">${l.price<=t?"관심가 이하":`관심가보다 ${eok(l.price-t)} 높음`}</span>`:""}${c.p26?`<span class="re-lst-vs">실거래 중앙값 대비 ${signed(l.price-c.p26)}</span>`:""}${l.gone?`<span class="re-lst-vs">없어진 매물</span>`:""}</div>
    <div class="re-sub">${[l.date?dayText(l.date)+" 확인":"",l.area?l.area+"㎡":"",l.where,l.state,l.agent].filter(Boolean).map(esc).join(" · ")}</div>${l.note?`<p>${esc(l.note)}</p>`:""}
    <div class="re-src">${l.url?`<a href="${esc(safeUrl(l.url))}" target="_blank" rel="noopener">매물 링크 ↗</a>`:""}<button class="re-link" data-re-lgone="${esc(l.id)}">${l.gone?"다시 살리기":"없어짐 표시"}</button><button class="re-del" data-re-ldel="${esc(l.id)}">지우기</button></div></div>`;
  const form=`<form id="re-lstform" class="re-form">
    ${field("호가 (억) *",`<input type="number" name="price" step="0.01" min="0.5" max="200" inputmode="decimal" required>`)}
    ${field("확인한 날",`<input type="date" name="date" value="${todayISO()}">`)}
    ${field("면적 (㎡)",`<input type="number" name="area" step="0.1" min="10" max="300" value="${c.area}" inputmode="decimal">`)}
    ${field("동 · 층 · 향",`<input type="text" name="where" maxlength="40" placeholder="105동 12층 남향">`)}
    ${field("수리 상태",`<input type="text" name="state" maxlength="80" placeholder="올수리 / 기본 / 샷시만">`)}
    ${field("중개사 · 연락처",`<input type="text" name="agent" maxlength="80">`)}
    ${field("매물 링크",`<input type="url" name="url" placeholder="https://">`)}
    ${field("메모",`<input type="text" name="note" maxlength="400" placeholder="7월 입주 가능, 세입자 없음 등">`)}
    <button type="submit">매물 저장</button></form>`;
  return `<section class="card re-panel"><div class="re-eyebrow">🏷 내가 본 매물 <small>${ls.length}건</small></div>
    ${ls.length?`<div class="re-lsts">${ls.map(row).join("")}</div>`:`<p class="re-note" style="margin-top:0">네이버부동산·호갱노노에서 직접 본 매물을 적어 두면 실거래·관심 매수가와 바로 비교돼요.</p>`}
    ${fold("lst-"+c.id,"＋ 매물 적기",form,false,"re-inner")}</section>`;
}
const RATES=[["overall","전체 느낌"],["home","집 상태"],["slope","언덕 없음"],["parking","주차"],["noise","조용함"],["shops","상권"],["manage","단지 관리"]];
function visitCard(c){
  const v=ustate(c.id).visit||{},r=v.rate||{},has=v.date||v.walk!=null||Object.keys(r).length||v.note;
  const summary=has?`<div class="re-visit">${v.date?`<span>${dayText(v.date)} 방문</span>`:""}${v.walk!=null?`<span>역까지 실제 ${v.walk}분</span>`:""}${RATES.filter(([k])=>r[k]).map(([k,l])=>`<span>${l} <b aria-label="5점 중 ${r[k]}점">${"★".repeat(r[k])}${"☆".repeat(5-r[k])}</b></span>`).join("")}</div>${v.note?`<p class="re-memo-text">${esc(v.note)}</p>`:""}`:`<p class="re-note" style="margin-top:0">직접 가서 느낀 것을 적어 두세요. 인터넷 후기(주민 정보)와 따로 보관돼요.</p>`;
  const form=`<form id="re-visitform" class="re-form">
    ${field("다녀온 날",`<input type="date" name="date" value="${esc(v.date||"")}">`)}
    ${field("역까지 실제로 걸은 시간 (분)",`<input type="number" name="walk" min="0" max="90" value="${v.walk??""}" inputmode="numeric">`)}
    ${RATES.map(([k,l])=>field(`${l} (5가 좋음)`,`<select name="rate-${k}"><option value="">-</option>${[1,2,3,4,5].map(n=>`<option ${r[k]===n?"selected":""}>${n}</option>`).join("")}</select>`)).join("")}
    <label class="wide">느낀 점<textarea name="note" rows="4" maxlength="4000" data-keep="visit-${esc(c.id)}" placeholder="출근 시간 체감, 경사, 주차장과 엘리베이터 연결, 주변 분위기 등">${esc(v.note||"")}</textarea></label>
    <button type="submit">임장 기록 저장</button></form>`;
  return `<section class="card re-panel"><div class="re-eyebrow">🚶 임장 기록</div>${summary}${fold("visit-"+c.id,has?"임장 기록 고치기":"＋ 임장 기록 적기",form,false,"re-inner")}</section>`;
}

/* ---------- 비교 ---------- */
function viewCompare(){
  const ro=locked(),ids=compareIds(),cs=ids.map(findComplex);
  const others=complexes().filter(c=>!ids.includes(c.id)).sort((a,b)=>(a.rank??99)-(b.rank??99)||a.name.localeCompare(b.name,"ko"));
  const adder=ro||ids.length>=4?"":`<label class="re-sort">단지 추가 <select id="re-cmp-add"><option value="">고르기</option>${others.map(c=>`<option value="${esc(c.id)}">${esc(c.name)} · ${c.area}㎡ ${eok(c.p26)}</option>`).join("")}</select></label>`;
  const head=`<div class="section-title"><h3>⚖️ 단지 비교</h3><span>${cs.length} / 4곳</span></div>`;
  if(!cs.length)return `${head}<section class="card re-panel"><p class="re-note" style="margin-top:0">${ro?"아직 비교에 담은 단지가 없어요.":"비교할 단지를 2~4곳 골라 주세요. 단지 화면의 '비교에 담기'로도 넣을 수 있어요."}</p>${adder}</section>`;
  const least=f=>{const v=cs.map(f).filter(x=>x!=null);return v.length>1?Math.min(...v):null};
  const row=(label,f,pickBest)=>{const m=pickBest?least(pickBest):null;return `<tr><th scope="row">${label}</th>${cs.map(c=>`<td class="${m!=null&&pickBest(c)===m?"best":""}">${f(c)||"-"}</td>`).join("")}</tr>`};
  const cm=(c,i)=>c.cm?`${c.cm[i]}분 · ${trText(c.cm[i+1])}${c.cm[i+2]!=null?`<small>또는 ${c.cm[i+2]}분 ${trText(c.cm[i+3])}</small>`:""}`:"";
  const bullets=a=>a&&a.length?`<ul>${a.slice(0,3).map(x=>`<li>${esc(x)}</li>`).join("")}</ul>`:"";
  const askOf=c=>newsOf(c.id).find(n=>n.ask!=null);
  return `${head}<section class="card re-controls">${adder||`<span class="re-sort">${ro?"":"4곳이 다 찼어요. 하나를 빼면 다른 단지를 넣을 수 있어요."}</span>`}</section>
  <div class="re-cmp-wrap"><table class="re-cmp"><thead><tr><th></th>${cs.map(c=>`<th scope="col"><button class="re-link" data-re-open="${esc(c.id)}">${esc(c.name)}</button>${ro?"":`<button class="re-del" data-re-cmpdel="${esc(c.id)}" aria-label="${esc(c.name)} 비교에서 빼기">빼기</button>`}</th>`).join("")}</tr></thead><tbody>
    ${row("상태",c=>pill(c))}
    ${row("위치",c=>esc(`${c.gu} ${c.dong}`))}
    ${row("준공 · 세대",c=>esc([ageText(c),c.hh?c.hh.toLocaleString()+"세대":"",c.kind==="jusang"?"주상복합":""].filter(Boolean).join(" · ")))}
    ${row("실거래 중앙값",c=>c.p26!=null?`<b>${c.area}㎡ ${eok(c.p26)}</b><small>${esc(basis(c))}</small>`:"")}
    ${row("2024년 하반기",c=>c.p24!=null?eok(c.p24):"")}
    ${row("2년 변화",c=>{const r=rise(c);return r!=null?`${signed(c.p26-c.p24)} (${r>=0?"+":"−"}${Math.abs(Math.round(r*100))}%)`:""})}
    ${row("2021년 고점 대비",c=>c.peak&&c.p26?`${Math.round(c.p26/c.peak*100)}%`:"")}
    ${row("관심 매수가",c=>targetOf(c)?eok(targetOf(c)):"")}
    ${row("관심가까지",c=>gapText(c),gap)}
    ${row("최근 호가 (피클)",c=>{const n=askOf(c);return n?`${eok(n.ask)}<small>${dayText(n.date)}</small>`:""})}
    ${ro?"":row("내가 본 최저 호가",c=>myAsk(c.id)!=null?eok(myAsk(c.id)):"",c=>myAsk(c.id))}
    ${row("역삼역",c=>cm(c,0),c=>c.cm?c.cm[0]:null)}
    ${row("잠실역",c=>cm(c,4),c=>c.cm?c.cm[4]:null)}
    ${row("역까지",c=>c.st?`${esc(c.st)}${c.walk!=null?` 도보 ${c.walk}분`:""}`:"")}
    ${ro?"":row("내 임장 점수",c=>{const n=ustate(c.id).visit?.rate?.overall;return n?`${"★".repeat(n)}${"☆".repeat(5-n)}`:""})}
    ${row("장점",c=>bullets(c.pros))}
    ${row("단점",c=>bullets(c.cons))}
    ${row("한 줄 평",c=>esc(c.one))}
  </tbody></table></div>
  <p class="re-note">초록 칸은 그 줄에서 가장 유리한 값이에요(관심가에 가장 가까움, 통근 가장 짧음, 호가 가장 낮음). 가격은 실거래 중앙값이라 계약 전에 최신 거래를 다시 확인하세요.</p>`;
}

/* ---------- 계획 ---------- */
// 매매가(억)로 세금·수수료를 어림한다. 전용 85㎡ 이하, 무주택 1주택 취득 기준. 단위는 만원.
function costsFor(price){
  const p=price*10000,rate=price<=6?0.01:price<=9?(price*2/3-3)/100:0.03;
  const relief=price<=12?Math.min(200,p*rate):0; // 생애최초 감면
  const feeRate=price<0.5?0.006:price<2?0.005:price<9?0.004:price<12?0.005:price<15?0.006:0.007;
  const tax=p*rate*1.1-relief,fee=p*feeRate*1.1,legal=p*0.0033;
  return {tax,relief,fee,legal,sum:tax+fee+legal};
}
const CALC_DEF={cash:5,loan:4,price:9,etc:1000,rate:4.5,years:30}; // 내 숫자는 조사 내용(plan.calcDefault)과 저장한 값에서 온다
function calcBox(){
  const v={...CALC_DEF,...(RE.seed.docs.plan?.calcDefault||{}),...(RE.user.calc||{})};
  const f=(k,l,unit,step)=>`<label>${l}<span><input type="number" name="${k}" value="${v[k]}" step="${step}" min="0" inputmode="decimal"> ${unit}</span></label>`;
  return `<form id="re-calc" class="re-calc"><div class="re-calc-in">${f("cash","가진 현금","억",0.1)}${f("loan","대출","억",0.1)}${f("price","매매가","억",0.05)}${f("etc","이사·수리 등","만원",100)}${f("rate","대출 금리","%",0.1)}${f("years","대출 기간","년",5)}</div><div id="re-calc-out" class="re-calc-out" aria-live="polite"></div>${locked()?"":`<button type="submit">이 값 저장</button>`}</form>`;
}
function calcValues(){
  const form=document.getElementById("re-calc");if(!form)return null;
  const v={};for(const k of Object.keys(CALC_DEF)){const n=Number(form[k].value);v[k]=Number.isFinite(n)&&n>=0?n:0}
  return v;
}
function calcRender(){
  const v=calcValues(),out=document.getElementById("re-calc-out");if(!v||!out)return;
  if(!v.price){out.innerHTML=`<p class="re-note">매매가를 넣어 주세요.</p>`;return}
  const cap=price=>Math.min(v.loan,6,price*0.7); // 수도권 주담대 6억, 생애최초 집값의 70%
  const need=price=>price*10000-cap(price)*10000+costsFor(price).sum+v.etc;
  const c=costsFor(v.price),loan=cap(v.price),total=need(v.price),left=v.cash*10000-total;
  let lo=1,hi=40;for(let i=0;i<40;i++){const mid=(lo+hi)/2;if(need(mid)<=v.cash*10000)lo=mid;else hi=mid}
  const r=v.rate/1200,n=v.years*12,pay=loan&&n?(r?loan*10000*r/(1-Math.pow(1+r,-n)):loan*10000/n):0;
  const warn=[v.loan>6?"수도권 주담대는 6억까지라 6억으로 계산했어요.":"",Math.min(v.loan,6)>v.price*0.7?`생애최초도 집값의 70%(${eok(v.price*0.7)})까지라 그만큼만 계산했어요.`:""].filter(Boolean);
  const line=(k,val,note)=>`<div><dt>${k}</dt><dd>${val}${note?`<small>${note}</small>`:""}</dd></div>`;
  out.innerHTML=`<dl class="re-facts">
    ${line("취득세 + 지방교육세",man(c.tax),c.relief?"생애최초 감면 200만 반영":v.price>12?"12억 초과라 감면 없음":"")}
    ${line("중개보수 (상한)",man(c.fee),"부가세 포함, 깎을 수 있음")}
    ${line("등기 · 법무 등",man(c.legal),"어림값")}
    ${line("이사 · 수리 등",man(v.etc),"")}
    ${line("필요한 현금",eok(total/10000),`매매가 − 대출 ${eok(loan)} + 부대비용 ${man(c.sum+v.etc)}`)}
    ${line(left>=0?"남는 돈":"모자란 돈",`<b class="${left>=0?"re-ok":"re-short"}">${man(Math.abs(left))}</b>`,`현금 ${eok(v.cash)} 기준`)}
    ${line("살 수 있는 최대 매매가",`약 ${eok(Math.floor(lo*20)/20)}`,"이 현금·대출을 다 쓸 때")}
    ${line("한 달 원리금",pay?man(pay):"-",pay?`${eok(loan)} · ${v.rate}% · ${v.years}년 원리금균등`:"")}
  </dl>${warn.map(w=>`<p class="re-note">${w}</p>`).join("")}<p class="re-note">어림 계산이에요. 실제 세금·수수료·대출 한도는 계약 전에 다시 확인하세요.</p>`;
}
function stepItem(s){
  const ym=todayISO().slice(0,7),now=s.from<=ym&&ym<=s.to,past=s.to<ym;
  return `<div class="re-step ${now?"now":""} ${past?"past":""}"><div class="re-step-when">${esc(s.when)}${now?` <span class="re-fresh">지금</span>`:""}</div><div><b>${esc(s.title)}</b><ul>${s.todo.map(x=>`<li>${esc(x)}</li>`).join("")}</ul></div></div>`;
}
const ul=a=>`<ul class="re-bullets">${(a||[]).map(x=>`<li>${esc(x)}</li>`).join("")}</ul>`;
function viewPlan(){
  const d=RE.seed.docs,p=d.plan,ro=locked();
  const market=`<div class="re-tl">${d.timeline.map(tlItem).join("")}</div>`;
  if(!p)return fold("market","🗓 시장 일정",market,true);
  const costs=`<p class="re-note" style="margin-top:0">${esc(p.costs.note)}</p>
    <div class="re-costs">${p.costs.rows.map(r=>`<div class="re-cost"><div class="re-cost-top"><b>${esc(r.name)}</b><span>${esc(r.amount)}</span></div><p>${esc(r.note)}</p></div>`).join("")}</div>
    <h4>매매가별 어림 합계</h4>
    <div class="re-cmp-wrap"><table class="re-table"><thead><tr><th scope="col">매매가</th><th scope="col">취득세</th><th scope="col">중개보수</th><th scope="col">합계</th></tr></thead><tbody>${p.costs.cases.map(c=>`<tr><th scope="row">${esc(c.price)}</th><td>${esc(c.tax)}</td><td>${esc(c.fee)}</td><td><b>${esc(c.sum)}</b></td></tr>`).join("")}</tbody></table></div>
    <p class="re-note">${esc(p.costs.casesNote)}</p>
    <h4>사고 나서 매달·매년 드는 돈</h4>${ul(p.costs.after)}
    <h4>🧮 자금 계산기</h4>${calcBox()}`;
  const noteAt=RE.user.note_at?new Date(RE.user.note_at).toLocaleString("ko-KR",{month:"long",day:"numeric",hour:"2-digit",minute:"2-digit"}):"";
  return `<section class="card re-panel"><div class="re-eyebrow">🧭 매수 계획 · ${esc(p.asOf)} 기준</div><p class="re-plan-intro">${esc(p.intro)}</p>${ro?"":`<button class="re-link" data-re-jump="re-note-card">📝 내 메모로 가기</button>`}</section>
  ${fold("steps","🗓 언제 무엇을 하나",`<div class="re-steps">${p.steps.map(stepItem).join("")}</div>`,true)}
  ${fold("permit","📜 토지거래허가제 (토허제)",ul(p.permit))}
  ${fold("costs","💰 추가로 드는 돈 · 자금 계산기",costs)}
  ${fold("cautions","⚠️ 주의할 점",ul(p.cautions))}
  ${fold("tips","💡 팁",ul(p.tips))}
  ${fold("market","📅 시장 일정 (입주 · 교통 · 만기)",market)}
  ${ro?"":`<section class="card re-panel" id="re-note-card"><div class="re-eyebrow">📝 내 메모${noteAt?` <small>마지막 저장 ${esc(noteAt)}</small>`:""}</div><form id="re-noteform"><textarea name="note" rows="8" maxlength="20000" data-keep="note" placeholder="전체 생각, 할 일, 은행 상담 내용, 부모님과 이야기한 것 등 자유롭게">${esc(RE.user.note||"")}</textarea><button type="submit">메모 저장</button></form><p class="re-note">메모는 비밀번호를 푼 사람만 보고 쓸 수 있어요. 가족 공유 링크로만 들어온 화면에는 안 보여요.</p></section>`}
  <section class="re-block"><h3>출처 · 확인</h3><div class="re-src" style="margin-top:0">${(p.sources||[]).map(x=>`<a href="${esc(safeUrl(x.url))}" target="_blank" rel="noopener">${esc(x.label)} ↗</a>`).join("")}</div><p class="re-note">${esc(p.disclaimer||"")}</p></section>`;
}

/* ---------- 일정 · 기준 ---------- */
function tlItem(t){
  const past=t.date.slice(0,7)<todayISO().slice(0,7),mine=t.area==="내 일정";
  const [y,m,d]=t.date.split("-"),when=`${y}년${m?" "+Number(m)+"월":""}${d?" "+Number(d)+"일":""}`;
  return `<div class="re-tl-item ${past?"past":""} ${mine?"mine":""}"><div class="re-tl-date">${when}</div><div><b>${esc(t.title)}</b><p>${esc(t.body)}</p><span class="re-tl-area">${esc(t.area)}</span></div></div>`;
}
function viewNotes(){
  const d=RE.seed.docs;
  return `${list("🏗 분양권·입주권",d.presale)}${list("📏 이 화면의 기준",d.rules)}${list("⚠️ 확인하지 못한 것",d.limits)}`;
}

/* ---------- 그리기 ---------- */
function draw(){
  if(local.tab!=="realestate")return;
  const app=document.getElementById("app");if(!app)return;
  if(!RE.loaded){app.innerHTML=`<div id="re-root"><div class="empty">${RE.error?esc(RE.error):"부동산 데이터를 불러오는 중이에요."}</div></div>`;return}
  const body=RE.view==="list"?viewList():RE.view==="detail"?viewDetail():RE.view==="paper"?viewPaper():RE.view==="compare"?viewCompare():RE.view==="plan"?viewPlan():RE.view==="notes"?viewNotes():viewHome();
  // 저장하지 않은 글(메모 등)은 다시 그려도 남겨 둔다.
  const keep={};document.querySelectorAll("#re-root [data-keep]").forEach(el=>{keep[el.dataset.keep]=el.value});
  const at=RE.syncedAt?new Date(RE.syncedAt).toLocaleTimeString("ko-KR",{hour:"2-digit",minute:"2-digit"}):"";
  app.innerHTML=`<div id="re-root">${subnav()}${RE.error?`<div class="re-error" role="alert">${esc(RE.error)}</div>`:""}${body}<div class="re-sync">${at?`${at}에 불러옴`:"저장해 둔 내용을 보여주는 중"} · <button class="re-link" data-re-reload>다시 불러오기</button></div></div>`;
  app.querySelectorAll("[data-keep]").forEach(el=>{if(el.dataset.keep in keep)el.value=keep[el.dataset.keep]});
  bind();
}
function go(view,id){RE.view=view;if(id)RE.detail=id;RE.editLinks=false;RE.error="";saveUI();draw();window.scrollTo(0,0)}
function bind(){
  const root=document.getElementById("re-root");
  root.querySelectorAll("[data-re-view]").forEach(b=>b.onclick=()=>{if(b.dataset.reFoldopen)RE.fold[b.dataset.reFoldopen]=true;go(b.dataset.reView)});
  root.querySelectorAll("[data-re-fold]").forEach(d=>d.addEventListener("toggle",()=>{RE.fold[d.dataset.reFold]=d.open}));
  root.querySelector("[data-re-reload]").onclick=()=>{RE.loading=false;setStatus("불러오는 중","");load(true).then(()=>setStatus(RE.error?"연결 확인 필요":"최신 상태",RE.error?"":"ok"))};
  root.querySelector("[data-re-jump]")?.addEventListener("click",e=>document.getElementById(e.currentTarget.dataset.reJump)?.scrollIntoView({behavior:"smooth",block:"start"}));
  // 상태 · 비교
  root.querySelector("[data-re-status]")?.addEventListener("change",async e=>{await patch(RE.detail,{status:e.target.value});draw()});
  root.querySelector("[data-re-cmp]")?.addEventListener("click",e=>{const id=e.currentTarget.dataset.reCmp,ids=compareIds();setCompare(ids.includes(id)?ids.filter(x=>x!==id):[...ids,id])});
  root.querySelector("#re-cmp-add")?.addEventListener("change",e=>{if(e.target.value)setCompare([...compareIds(),e.target.value])});
  root.querySelectorAll("[data-re-cmpdel]").forEach(b=>b.onclick=()=>setCompare(compareIds().filter(x=>x!==b.dataset.reCmpdel)));
  // 내가 본 매물 · 임장 기록
  const putListings=async next=>{await patch(RE.detail,{listings:next});draw()};
  root.querySelector("#re-lstform")?.addEventListener("submit",e=>{e.preventDefault();const f=e.target,it={price:Number(f.price.value)};for(const k of ["date","where","state","agent","url","note"]){const v=f[k].value.trim();if(v)it[k]=v}if(f.area.value)it.area=Number(f.area.value);RE.fold["lst-"+RE.detail]=false;putListings([...listingsOf(RE.detail),it])});
  root.querySelectorAll("[data-re-lgone]").forEach(b=>b.onclick=()=>putListings(listingsOf(RE.detail).map(l=>l.id===b.dataset.reLgone?{...l,gone:!l.gone}:l)));
  root.querySelectorAll("[data-re-ldel]").forEach(b=>b.onclick=()=>{if(confirm("이 매물 기록을 지울까요?"))putListings(listingsOf(RE.detail).filter(l=>l.id!==b.dataset.reLdel))});
  root.querySelector("#re-visitform")?.addEventListener("submit",async e=>{e.preventDefault();const f=e.target,rate={};for(const [k] of RATES){const v=f["rate-"+k].value;if(v)rate[k]=Number(v)}const visit={rate,note:f.note.value};if(f.date.value)visit.date=f.date.value;if(f.walk.value!=="")visit.walk=Number(f.walk.value);if(await patch(RE.detail,{visit}))RE.fold["visit-"+RE.detail]=false;draw()});
  // 계획: 메모 · 자금 계산기
  root.querySelector("#re-noteform")?.addEventListener("submit",async e=>{e.preventDefault();await myPut({note:e.target.note.value});draw()});
  const calc=root.querySelector("#re-calc");
  if(calc){calcRender();calc.addEventListener("input",calcRender);calc.addEventListener("submit",async e=>{e.preventDefault();const v=calcValues();if(await myPut({calc:v}))calcRender();else draw()})}
  root.querySelectorAll("[data-re-open]").forEach(b=>b.onclick=()=>go("detail",b.dataset.reOpen));
  root.querySelectorAll("[data-re-del]").forEach(b=>b.onclick=e=>{e.stopPropagation();removeAgentItem(b.dataset.reDel,b.dataset.reId)});
  root.querySelectorAll("[data-re-filter]").forEach(b=>b.onclick=()=>{RE[b.dataset.reFilter]=b.dataset.reValue;saveUI();draw()});
  root.querySelector("[data-re-star]")?.addEventListener("click",()=>{RE.starOnly=!RE.starOnly;saveUI();draw()});
  root.querySelector("#re-sort")?.addEventListener("change",e=>{RE.sort=e.target.value;saveUI();draw()});
  root.querySelector("[data-re-starone]")?.addEventListener("click",async e=>{const id=e.currentTarget.dataset.reStarone;await patch(id,{star:!ustate(id).star});draw()});
  root.querySelector("[data-re-editlinks]")?.addEventListener("click",()=>{RE.editLinks=!RE.editLinks;draw()});
  root.querySelector("#re-targetform")?.addEventListener("submit",async e=>{e.preventDefault();const v=e.target.target.value.trim();await patch(RE.detail,{target:v===""?null:Number(v)});draw()});
  root.querySelector("#re-memoform")?.addEventListener("submit",async e=>{e.preventDefault();await patch(RE.detail,{memo:e.target.memo.value});draw()});
  root.querySelector("#re-linkform")?.addEventListener("submit",async e=>{e.preventDefault();const links={};for(const k of ["naver","hogang","plan","road"]){const v=e.target[k].value.trim();if(v)links[k]=v}if(await patch(RE.detail,{links}))RE.editLinks=false;draw()});
}

// app-render.js의 render()가 부른다. 1분마다 다시 불려도 적던 메모가 지워지지 않게, 이미 그려져 있으면 그대로 둔다.
// 대신 탭을 다시 열 때마다 새 신문·소식을 받아 온다.
let lastLoad=0;
// 잠금을 풀거나 다시 잠갔을 때 lock.js가 부른다(메모처럼 비밀번호가 있어야 받는 내용이 달라진다).
window.reloadRealEstate=()=>{RE.loading=false;return load(true)};
window.dropRealEstateCache=()=>{try{localStorage.removeItem(CACHE_KEY)}catch(e){}RE.user={complexes:{},compare:RE.user.compare};};
window.renderRealEstate=()=>{
  if(document.getElementById("re-root")&&RE.loaded)return;
  draw();
  const stale=Date.now()-lastLoad>60000;
  if(!RE.loaded||stale){lastLoad=Date.now();load(true)}
};
})();
