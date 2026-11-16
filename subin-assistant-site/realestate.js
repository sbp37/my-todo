"use strict";
// 🏠 부동산 탭 (1단계): 눈여겨볼 단지 목록·상세·일정.
// app-base.js의 apiGet·apiPost·esc·getApiKey·setStatus를 그대로 쓴다.
// 조사 내용은 API(resource=realestate)의 seed, 내가 고친 값(메모·관심 매수가·별표·링크)은 user에 들어 있다.
// 버튼 속성은 기존 앱과 겹치지 않게 data-re-* 만 쓴다.
(()=>{
const UI_KEY="subin-re-ui-v1";
const CACHE_KEY="subin-re-cache-v1";
const RE={seed:null,user:{complexes:{}},loaded:false,loading:false,error:"",
  view:"home",detail:"",sort:"rank",region:"all",kind:"all",status:"all",starOnly:false,editLinks:false};
try{Object.assign(RE,JSON.parse(localStorage.getItem(UI_KEY)||"{}"))}catch(e){}
RE.editLinks=false;
const saveUI=()=>{try{localStorage.setItem(UI_KEY,JSON.stringify({view:RE.view,detail:RE.detail,sort:RE.sort,region:RE.region,kind:RE.kind,status:RE.status,starOnly:RE.starOnly}))}catch(e){}};

// cls는 기존 style.css의 .top(상단 헤더) 같은 이름과 겹치지 않게 s- 를 붙인다.
const STATUS={top:{label:"추천",cls:"s-top"},watch:{label:"관심",cls:"s-watch"},dip:{label:"조정 시 매수",cls:"s-dip"},hold:{label:"보류",cls:"s-hold"},out:{label:"제외",cls:"s-out"},presale:{label:"분양권",cls:"s-presale"}};
const KIND={apt:"아파트",jusang:"주상복합",presale:"분양권·입주권"};
const SORTS=[["rank","종합 순위"],["gap","기회 가격에 가까운 순"],["price","가격 낮은 순"],["riseHigh","많이 오른 순"],["riseLow","덜 오른 순"],["transfer","환승 적은 순"],["yeoksam","역삼 가까운 순"],["jamsil","잠실 가까운 순"],["new","신축 순"]];

/* ---------- 계산 ---------- */
const eok=n=>n==null?"-":(Math.round(n*100)/100)+"억";
const thisYear=()=>Number(todayISO().slice(0,4));
const ageText=c=>c.built>thisYear()?`${c.built}년 입주 예정`:`${c.built}년 · ${thisYear()-c.built+1}년차`;
const ustate=id=>RE.user.complexes?.[id]||{};
const targetOf=c=>{const u=ustate(c.id);return "target" in u?u.target:c.target};
const statusOf=c=>ustate(c.id).status||c.status;
const rise=c=>c.p24&&c.p26?(c.p26-c.p24)/c.p24:null;
const gap=c=>{const t=targetOf(c);return t&&c.p26?c.p26-t:null};
// cm: [역삼 최소시간, 환승, 역삼 최소환승, 환승, 잠실 최소시간, 환승, 잠실 최소환승, 환승]
const fewest=c=>(c.cm[3]??c.cm[1])+(c.cm[7]??c.cm[5]);
const trText=n=>n===0?"무환승":`환승 ${n}`;
function gapText(c){const g=gap(c);if(g==null)return"";if(g<=0)return"관심가 도달";return `관심가까지 ${eok(g)}`}
function searchName(c){return c.q||c.name.replace(/\(.*?\)/g,"").replace(/^(황학동|마장동|풍납|제기동|신도림)\s+/,"").split("·")[0].trim()}
function linksOf(c){
  const q=searchName(c),area=c.gu.split(" ").pop(),u=ustate(c.id).links||{};
  return {
    naver:u.naver||`https://m.land.naver.com/search/result/${encodeURIComponent(q)}`,
    hogang:u.hogang||c.hg||`https://search.naver.com/search.naver?query=${encodeURIComponent("호갱노노 "+area+" "+q)}`,
    plan:u.plan||`https://search.naver.com/search.naver?where=image&query=${encodeURIComponent(q+" "+c.area+" 평면도")}`,
    road:u.road||`https://map.kakao.com/link/search/${encodeURIComponent(area+" "+q)}`
  };
}

/* ---------- 불러오기·저장 ---------- */
function applyRemote(r){RE.seed=r.seed||null;RE.user=r.user&&r.user.complexes?r.user:{complexes:{}};RE.loaded=!!RE.seed}
async function load(force){
  if(RE.loading||(RE.loaded&&!force))return;
  RE.loading=true;RE.error="";
  if(!RE.loaded){try{const x=JSON.parse(localStorage.getItem(CACHE_KEY)||"null");if(x?.seed){applyRemote(x);draw()}}catch(e){}}
  try{
    const r=await apiGet("realestate");
    if(!r.seed)throw new Error("NO_DATA");
    applyRemote(r);
    try{localStorage.setItem(CACHE_KEY,JSON.stringify({seed:RE.seed,user:RE.user}))}catch(e){}
  }catch(e){RE.error=RE.loaded?"지금은 연결이 불안정해서 마지막으로 불러온 내용을 보여주고 있어요.":"부동산 데이터를 불러오지 못했어요. 잠시 후 다시 시도해 주세요."}
  RE.loading=false;draw();
}
async function patch(id,p){
  const prev=RE.user.complexes[id];
  RE.user.complexes={...RE.user.complexes,[id]:{...(prev||{}),...p}};
  try{
    const r=await apiPost({action:"re_patch",id,patch:p});
    if(r.user?.complexes)RE.user=r.user;
    try{localStorage.setItem(CACHE_KEY,JSON.stringify({seed:RE.seed,user:RE.user}))}catch(e){}
    setStatus("저장됨","ok");setTimeout(()=>setStatus("최신 상태","ok"),900);return true;
  }catch(e){
    const c={...RE.user.complexes};if(prev)c[id]=prev;else delete c[id];RE.user.complexes=c;
    RE.error="저장하지 못했어요. 잠시 후 다시 시도해 주세요.";return false;
  }
}

/* ---------- 조각 ---------- */
const pill=c=>{const s=STATUS[statusOf(c)]||STATUS.watch;return `<span class="re-pill ${s.cls}">${s.label}</span>`};
// 최소환승 경로가 따로 있으면 "또는 28분 무환승"으로 같이 보여준다.
const leg=(name,min,tr,min2,tr2)=>`${name} ${min}분 <small>${trText(tr)}${min2!=null?` · 또는 ${min2}분 ${trText(tr2)}`:""}</small>`;
function commuteLine(c){return `${leg("역삼",c.cm[0],c.cm[1],c.cm[2],c.cm[3])}<br>${leg("잠실",c.cm[4],c.cm[5],c.cm[6],c.cm[7])}`}
function card(c){
  const r=rise(c),g=gapText(c),star=ustate(c.id).star;
  return `<button class="card re-card" data-re-open="${esc(c.id)}">
    <div class="re-card-top">${c.rank?`<span class="re-rank">${c.rank}</span>`:""}<h4>${star?"⭐ ":""}${esc(c.name)}</h4>${pill(c)}</div>
    <div class="re-sub">${esc(c.gu)} ${esc(c.dong)} · ${ageText(c)} · ${c.hh.toLocaleString()}세대${c.kind==="jusang"?" · 주상복합":""}</div>
    <div class="re-nums"><span class="re-price">${c.area}㎡ ${eok(c.p26)}</span>${r!=null?`<span class="re-rise">2년 +${Math.round(r*100)}%</span>`:""}${g?`<span class="re-gap ${gap(c)<=0?"hit":""}">${g}</span>`:""}</div>
    <div class="re-commute">${commuteLine(c)}</div>
    <p class="re-one">${esc(c.one)}</p>
  </button>`;
}
const list=(title,items,cls="")=>items&&items.length?`<section class="re-block ${cls}"><h3>${title}</h3><ul>${items.map(x=>`<li>${esc(x)}</li>`).join("")}</ul></section>`:"";
function subnav(){
  const tabs=[["home","요약"],["list","단지"],["timeline","일정"],["notes","분양권·기준"]];
  return `<nav class="re-nav" aria-label="부동산 화면">${tabs.map(([k,l])=>`<button data-re-view="${k}" class="${(RE.view===k||(RE.view==="detail"&&k==="list"))?"on":""}">${l}</button>`).join("")}</nav>`;
}

/* ---------- 요약 ---------- */
function viewHome(){
  const d=RE.seed.docs,cs=RE.seed.complexes;
  const near=cs.filter(c=>gap(c)!=null&&["top","watch","dip"].includes(statusOf(c))).sort((a,b)=>gap(a)-gap(b)).slice(0,5);
  const stars=cs.filter(c=>ustate(c.id).star);
  const ym=todayISO().slice(0,7),next=d.timeline.filter(t=>t.date.slice(0,7)>=ym).slice(0,4);
  return `<section class="card re-panel"><div class="re-eyebrow">지금 시장 · ${esc(d.asOf)} 기준</div><ul class="re-bullets">${d.market.map(x=>`<li>${esc(x)}</li>`).join("")}</ul></section>
  <section class="card re-panel"><div class="re-eyebrow">내 예산</div><ul class="re-bullets">${d.budget.lines.map(x=>`<li>${esc(x)}</li>`).join("")}</ul></section>
  ${stars.length?`<section class="section"><div class="section-title"><h3>⭐ 별표한 단지</h3><span>${stars.length}곳</span></div><div class="re-grid">${stars.map(card).join("")}</div></section>`:""}
  <section class="section"><div class="section-title"><h3>🎯 기회 가격에 가까운 단지</h3><span>최근 실거래 − 관심 매수가</span></div><div class="re-grid">${near.map(card).join("")}</div></section>
  <section class="section"><div class="section-title"><h3>🗓 다가오는 일정</h3><button class="re-link" data-re-view="timeline">전체 보기</button></div><div class="re-tl">${next.map(tlItem).join("")}</div></section>`;
}

/* ---------- 목록 ---------- */
function sorted(cs){
  const last=v=>v==null?Infinity:v,by={
    rank:(a,b)=>last(a.rank)-last(b.rank),
    gap:(a,b)=>last(gap(a))-last(gap(b)),
    price:(a,b)=>last(a.p26)-last(b.p26),
    riseHigh:(a,b)=>(rise(b)??-1)-(rise(a)??-1),
    riseLow:(a,b)=>last(rise(a))-last(rise(b)),
    transfer:(a,b)=>fewest(a)-fewest(b)||(a.cm[0]+a.cm[4])-(b.cm[0]+b.cm[4]),
    yeoksam:(a,b)=>a.cm[0]-b.cm[0],
    jamsil:(a,b)=>a.cm[4]-b.cm[4],
    new:(a,b)=>b.built-a.built
  };
  const order=["top","watch","dip","presale","hold","out"];
  return [...cs].sort((a,b)=>(by[RE.sort]||by.rank)(a,b)||order.indexOf(statusOf(a))-order.indexOf(statusOf(b))||a.name.localeCompare(b.name,"ko"));
}
function viewList(){
  const all=RE.seed.complexes;
  const shown=sorted(all.filter(c=>(RE.region==="all"||c.region===RE.region)&&(RE.kind==="all"||c.kind===RE.kind)&&(RE.status==="all"||statusOf(c)===RE.status||(RE.status==="holdout"&&["hold","out"].includes(statusOf(c))))&&(!RE.starOnly||ustate(c.id).star)));
  const chips=(key,opts)=>`<div class="re-chips" role="group">${opts.map(([v,l])=>`<button data-re-filter="${key}" data-re-value="${v}" class="${RE[key]===v?"on":""}" aria-pressed="${RE[key]===v}">${l}</button>`).join("")}</div>`;
  return `<section class="card re-controls">
    <label class="re-sort">정렬 <select id="re-sort">${SORTS.map(([v,l])=>`<option value="${v}" ${RE.sort===v?"selected":""}>${l}</option>`).join("")}</select></label>
    ${chips("region",[["all","전체 지역"],["서울","서울"],["경기","경기"]])}
    ${chips("kind",[["all","전체 유형"],["apt","아파트"],["jusang","주상복합"],["presale","분양권"]])}
    ${chips("status",[["all","전체 상태"],["top","추천"],["watch","관심"],["dip","조정 시 매수"],["holdout","보류·제외"]])}
    <div class="re-chips"><button data-re-star class="${RE.starOnly?"on":""}" aria-pressed="${RE.starOnly}">⭐ 별표만</button></div>
  </section>
  <div class="section-title"><h3>단지 ${shown.length}곳</h3><span>가격은 최근 실거래 중앙값</span></div>
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
function viewDetail(){
  const c=RE.seed.complexes.find(x=>x.id===RE.detail);
  if(!c){RE.view="list";return viewList()}
  const u=ustate(c.id),L=linksOf(c),r=rise(c),t=targetOf(c),g=gap(c);
  const facts=[
    r!=null?["2년 변화",`+${eok(c.p26-c.p24)} (+${Math.round(r*100)}%)`]:null,
    c.peak?["2021년 고점 대비",`${Math.round(c.p26/c.peak*100)}%`]:null,
    c.vol?["거래량 (5~7월 → 8~10월)",`${c.vol[0]}건 → ${c.vol[1]}건`]:null,
    ["역까지",`${esc(c.st)} 도보 ${c.walk}분`]
  ].filter(Boolean);
  const cmRow=(label,min,tr,min2,tr2)=>`<div class="re-cm-row"><b>${label}</b><span>최소시간 ${min}분 · ${trText(tr)}</span>${min2!=null?`<span>최소환승 ${min2}분 · ${trText(tr2)}</span>`:""}</div>`;
  return `<div class="re-detail-head"><button class="re-back" data-re-view="list">‹ 목록</button><button class="re-star ${u.star?"on":""}" data-re-starone="${esc(c.id)}" aria-pressed="${!!u.star}">${u.star?"⭐ 별표함":"☆ 별표"}</button></div>
  <section class="card re-panel re-hero"><div class="re-card-top">${c.rank?`<span class="re-rank">${c.rank}</span>`:""}<h2>${esc(c.name)}</h2>${pill(c)}</div>
    <div class="re-sub">${esc(c.region)} ${esc(c.gu)} ${esc(c.dong)} · ${ageText(c)} · ${c.hh.toLocaleString()}세대 · ${KIND[c.kind]||""}</div>
    <p class="re-one">${esc(c.one)}</p>
    <div class="re-links"><a href="${esc(L.naver)}" target="_blank" rel="noopener">네이버부동산</a><a href="${esc(L.hogang)}" target="_blank" rel="noopener">호갱노노</a><a href="${esc(L.plan)}" target="_blank" rel="noopener">평면도</a><a href="${esc(L.road)}" target="_blank" rel="noopener">지도·로드뷰</a><button class="re-link" data-re-editlinks>${RE.editLinks?"닫기":"링크 고치기"}</button></div>
    ${RE.editLinks?`<form class="re-linkform" id="re-linkform"><p>검색 화면으로 열리는 링크는 단지 페이지 주소를 붙여 넣으면 다음부터 바로 열려요. 비우면 기본 검색 링크를 써요.</p>${[["naver","네이버부동산"],["hogang","호갱노노"],["plan","평면도"],["road","지도·로드뷰"]].map(([k,l])=>`<label>${l}<input type="url" name="${k}" value="${esc((u.links||{})[k]||"")}" placeholder="https://"></label>`).join("")}<button type="submit" class="primary">링크 저장</button></form>`:""}
  </section>
  <section class="card re-panel"><div class="re-eyebrow">가격 · ${c.area}㎡</div>
    <div class="re-bigprice">${eok(c.p26)} <small>${esc(c.range||"")}</small></div>
    ${priceBars(c)}
    <dl class="re-facts">${facts.map(([k,v])=>`<div><dt>${k}</dt><dd>${v}</dd></div>`).join("")}</dl>
  </section>
  <section class="card re-panel re-target"><div class="re-eyebrow">🎯 기회 가격</div>
    <form id="re-targetform" class="re-targetform"><label>관심 매수가 <input type="number" step="0.05" min="0" max="99" name="target" value="${t??""}" inputmode="decimal"> 억</label><button type="submit">저장</button></form>
    <p class="re-target-note">${g==null?"관심 매수가를 정하면 최근 실거래와의 차이를 보여줘요.":g<=0?`최근 실거래가 관심 매수가 이하예요 (${eok(-g)} 아래).`:`최근 실거래가 관심 매수가보다 ${eok(g)} 높아요.`}${c.target&&t===c.target?" 제안값이라 직접 고칠 수 있어요.":""}</p>
  </section>
  <section class="card re-panel"><div class="re-eyebrow">🚇 통근</div>
    ${cmRow("역삼역",c.cm[0],c.cm[1],c.cm[2],c.cm[3])}${cmRow("잠실역",c.cm[4],c.cm[5],c.cm[6],c.cm[7])}
    <p class="re-note">${esc(c.cmnote||"도보 포함 추정치예요. 대기 시간 5~10분은 빠져 있어요.")}</p>
  </section>
  ${list("📈 호재",c.cat)}${list("👍 장점",c.pros,"pros")}${list("👎 단점",c.cons,"cons")}${list("🏘 주민 정보",c.tips)}${list("✅ 계약 전 확인할 것",c.checks,"checks")}
  ${c.timing||c.redev?`<section class="re-block"><h3>⏱ 시기 · 정비</h3><ul>${c.timing?`<li>${esc(c.timing)}</li>`:""}${c.redev?`<li>재건축·리모델링: ${esc(c.redev)}</li>`:""}</ul></section>`:""}
  <section class="card re-panel"><div class="re-eyebrow">📝 내 메모</div><form id="re-memoform"><textarea name="memo" rows="4" maxlength="4000" placeholder="임장 메모, 중개사 통화 내용 등">${esc(u.memo||"")}</textarea><button type="submit">메모 저장</button></form></section>`;
}

/* ---------- 일정 · 기준 ---------- */
function tlItem(t){
  const past=t.date.slice(0,7)<todayISO().slice(0,7),mine=t.area==="내 일정";
  const [y,m,d]=t.date.split("-"),when=`${y}년${m?" "+Number(m)+"월":""}${d?" "+Number(d)+"일":""}`;
  return `<div class="re-tl-item ${past?"past":""} ${mine?"mine":""}"><div class="re-tl-date">${when}</div><div><b>${esc(t.title)}</b><p>${esc(t.body)}</p><span class="re-tl-area">${esc(t.area)}</span></div></div>`;
}
const viewTimeline=()=>`<section class="card re-panel"><div class="re-eyebrow">매수 일정에 영향을 주는 일</div><div class="re-tl">${RE.seed.docs.timeline.map(tlItem).join("")}</div></section>`;
function viewNotes(){
  const d=RE.seed.docs;
  return `${list("🏗 분양권·입주권",d.presale)}${list("📏 이 화면의 기준",d.rules)}${list("⚠️ 확인하지 못한 것",d.limits)}`;
}

/* ---------- 그리기 ---------- */
function draw(){
  if(local.tab!=="realestate")return;
  const app=document.getElementById("app");if(!app)return;
  if(!RE.loaded){app.innerHTML=`<div id="re-root"><div class="empty">${RE.error?esc(RE.error):"부동산 데이터를 불러오는 중이에요."}</div></div>`;return}
  const body=RE.view==="list"?viewList():RE.view==="detail"?viewDetail():RE.view==="timeline"?viewTimeline():RE.view==="notes"?viewNotes():viewHome();
  app.innerHTML=`<div id="re-root">${subnav()}${RE.error?`<div class="re-error" role="alert">${esc(RE.error)}</div>`:""}${body}</div>`;
  bind();
}
function go(view,id){RE.view=view;if(id)RE.detail=id;RE.editLinks=false;RE.error="";saveUI();draw();window.scrollTo(0,0)}
function bind(){
  const root=document.getElementById("re-root");
  root.querySelectorAll("[data-re-view]").forEach(b=>b.onclick=()=>go(b.dataset.reView));
  root.querySelectorAll("[data-re-open]").forEach(b=>b.onclick=()=>go("detail",b.dataset.reOpen));
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
window.renderRealEstate=()=>{
  if(document.getElementById("re-root")&&RE.loaded)return;
  draw();load(false);
};
})();
