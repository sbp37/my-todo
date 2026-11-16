"use strict";
// 🔒 가족 공유용 잠금.
// 가족 키(fam_으로 시작)로 열면 부동산 탭만 보이고, 다른 탭은 비밀번호를 넣어야 열린다.
// 막는 건 서버(assistant-api)가 한다: 가족 키만으로는 부동산 읽기만 되고, 비밀번호가 맞아야 나머지를 내려준다.
// 이 파일은 화면을 거기에 맞춰 줄 뿐이다. app-base.js 다음, app-render.js보다 먼저 로드한다.
(()=>{
const PIN_STORE="subin-assistant-pin-v1"; // app-base.js의 pinHeader()가 읽는 이름과 같아야 한다
const LOCK_STORE="subin-assistant-lock-v1";
const isFamilyKey=()=>getApiKey().startsWith("fam_");
// 서버에 묻기 전에도 처음부터 맞는 화면이 나오도록, 키 모양과 지난번 결과로 먼저 정해 둔다.
const LOCK={role:"",locked:isFamilyKey()&&!localStorage.getItem(PIN_STORE),checked:false};
try{const s=JSON.parse(localStorage.getItem(LOCK_STORE)||"null");if(s&&getApiKey()){LOCK.role=s.role||"";if(!isFamilyKey())LOCK.locked=false}}catch(e){}
window.SUBIN_LOCK=LOCK;

// 사이트를 열면 항상 부동산 탭부터 보여준다(트래커는 탭이 아니라 따로 열리는 화면이라 그대로다).
local.tab="realestate";

const style=document.createElement("style");
style.textContent=`
body.locked .tabs button:not([data-tab="realestate"]){opacity:.55}
body.locked .tabs button:not([data-tab="realestate"])::after{content:" 🔒";font-size:.8em}
body.locked #tracker-open{display:none}
body.locked #re-root .re-del{display:none}
#lock-again{border:1px solid var(--line);background:var(--paper);border-radius:999px;padding:5px 10px;font-size:var(--fs-xs);color:var(--muted)}
#lock-dialog input{width:100%;margin-top:14px;padding:11px 12px;border:1px solid var(--line);border-radius:var(--r-sm);background:#fff;font-size:20px;letter-spacing:.3em;text-align:center}
#lock-dialog #lock-error{color:var(--danger);min-height:1.4em}
#lock-dialog .lock-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}
#lock-dialog button{border:1px solid var(--line);background:var(--paper);border-radius:var(--r-sm);padding:9px 16px;font-weight:600}
#lock-dialog button.primary{background:var(--accent);border-color:var(--accent);color:#fff}`;
document.head.appendChild(style);

const remember=()=>{try{localStorage.setItem(LOCK_STORE,JSON.stringify({role:LOCK.role,locked:LOCK.locked}))}catch(e){}};
function apply(){
  document.body.classList.toggle("locked",LOCK.locked);
  if(LOCK.locked&&local.tab!=="realestate"){local.tab="realestate";save()}
  // 가족 키면 주소창에 그대로 공유할 수 있는 주소를 남긴다(app-base.js가 열 때 지운 것을 되돌림).
  if(isFamilyKey()&&!location.hash)history.replaceState(null,"",location.pathname+location.search+"#key="+getApiKey());
  // 가족 키로 비밀번호를 풀었으면 다시 잠그는 버튼을 둔다.
  const host=document.querySelector(".brand-actions"),had=document.getElementById("lock-again");
  const want=isFamilyKey()&&!LOCK.locked&&LOCK.checked;
  if(want&&!had&&host){const b=document.createElement("button");b.id="lock-again";b.type="button";b.textContent="🔒 잠그기";b.onclick=relock;host.prepend(b)}
  if(!want&&had)had.remove();
}

// 다시 잠글 때는 이 기기에 받아 둔 할 일·달력·트래커 내용도 지운다.
function relock(){
  localStorage.removeItem(PIN_STORE);
  for(const k of ["subin-assistant-remote-cache-v1","subin-tracker-cache-v1"])localStorage.removeItem(k);
  TASKS={updatedAt:"",tasks:[]};CAL={syncedAt:"",events:[]};
  // 부동산 탭의 메모·본 매물 같은 개인 기록도 지우고, 잠긴 상태로 다시 받는다.
  window.dropRealEstateCache?.();
  LOCK.locked=true;remember();apply();render();window.reloadRealEstate?.();
}

async function ask(){
  const w=await apiGet("whoami");
  LOCK.role=w.role||"";LOCK.locked=!!w.locked;LOCK.checked=true;
  if(w.pin==="wrong"||w.pin==="blocked")localStorage.removeItem(PIN_STORE);
  remember();
  return w;
}

// app-base.js의 refreshRemoteData를 감싼다: 잠긴 동안에는 할 일·달력을 받지 않고 부동산만 그린다.
const baseRefresh=refreshRemoteData;
window.refreshRemoteData=async function(showBusy){
  if(!getApiKey())return baseRefresh(showBusy);
  if(!LOCK.checked||LOCK.locked){
    try{await ask()}catch(e){
      if(e.message==="AUTH")return baseRefresh(showBusy);
      // 연결이 안 되면 지금 상태 그대로 둔다.
    }
  }
  apply();
  if(LOCK.locked){remoteReady=true;clearError();setStatus("부동산만 보기","");render();return true}
  return baseRefresh(showBusy);
};

/* ---------- 비밀번호 창 ---------- */
let wanted="";
function dialog(){
  let d=document.getElementById("lock-dialog");
  if(d)return d;
  d=document.createElement("dialog");d.id="lock-dialog";d.setAttribute("aria-labelledby","lock-title");
  d.innerHTML=`<form id="lock-form"><h2 id="lock-title">🔒 비밀번호</h2><p>부동산 말고 다른 탭은 비밀번호가 있어야 볼 수 있어요.</p><input id="lock-pin" type="password" inputmode="numeric" autocomplete="off" maxlength="12" aria-label="비밀번호" required><p id="lock-error" role="alert"></p><div class="lock-actions"><button type="button" id="lock-cancel">취소</button><button type="submit" class="primary">열기</button></div></form>`;
  document.body.appendChild(d);
  d.querySelector("#lock-cancel").onclick=()=>d.close();
  d.querySelector("#lock-form").onsubmit=async e=>{
    e.preventDefault();
    const input=d.querySelector("#lock-pin"),err=d.querySelector("#lock-error"),pin=input.value.trim();
    if(!pin)return;
    err.textContent="확인하는 중이에요.";
    localStorage.setItem(PIN_STORE,pin);
    try{
      const w=await ask();
      if(w.locked){
        input.value="";
        err.textContent=w.pin==="blocked"?`여러 번 틀려서 ${w.minutes||10}분 동안 잠겼어요.`:`비밀번호가 맞지 않아요.${w.left?` (${w.left}번 남음)`:""}`;
        return;
      }
      d.close();
      if(wanted&&wanted!=="tracker"){local.tab=wanted;save()}
      apply();render();window.reloadRealEstate?.();await refreshRemoteData(true);
      if(wanted==="tracker")document.getElementById("tracker-open")?.click();
    }catch(x){localStorage.removeItem(PIN_STORE);err.textContent="확인하지 못했어요. 잠시 후 다시 시도해 주세요."}
  };
  return d;
}
function openDialog(tab){wanted=tab;const d=dialog();d.querySelector("#lock-pin").value="";d.querySelector("#lock-error").textContent="";d.showModal();d.querySelector("#lock-pin").focus()}

// 잠긴 탭·트래커 버튼을 누르면 탭을 바꾸는 대신 비밀번호 창을 연다(캡처 단계에서 가로챈다).
document.addEventListener("click",e=>{
  if(!LOCK.locked)return;
  const b=e.target.closest&&e.target.closest('.tabs [data-tab]:not([data-tab="realestate"]),#tracker-open');
  if(!b)return;
  e.preventDefault();e.stopImmediatePropagation();
  openDialog(b.dataset.tab||"tracker");
},true);
// 잠긴 동안에는 주소의 #tracker로도 트래커를 열지 않는다.
if(LOCK.locked&&location.hash==="#tracker")history.replaceState(null,"",location.pathname+location.search);

if(document.body)apply();else document.addEventListener("DOMContentLoaded",apply);
})();
