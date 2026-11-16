"use strict";
// 📱 뒤로 가기: 휴대폰에서 화면을 밀어 뒤로 가면 사이트를 나가지 않고 앞 화면으로 돌아오게 한다.
// 탭을 바꾸거나 부동산 안에서 화면을 옮길 때(realestate.js의 go), 트래커를 열 때 브라우저 기록을 하나씩 쌓고,
// 뒤로 가기(popstate)가 오면 그 기록대로 화면을 되돌린다. 스크롤 위치도 같이 기억한다.
// 맨 마지막(tracker.js 다음)에 로드한다.
(()=>{
const snap=()=>({tab:local.tab,re:window.reNav?.get(),tracker:document.body.classList.contains("tr-on")?1:0});
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const here=()=>location.pathname+location.search+location.hash;
let restoring=false;

// 지금 화면의 스크롤 위치를 지금 기록에 적어 둔다(다른 화면으로 가기 직전에 부른다).
window.navRemember=()=>{if(restoring)return;const s=history.state?.nav;if(s)history.replaceState({nav:{...s,y:Math.round(scrollY)}},"",here())};
// 지금 화면을 새 기록으로 쌓는다. 바로 앞 기록과 같으면 쌓지 않는다.
window.navPush=(url)=>{if(restoring)return;const s=snap();const cur=history.state?.nav;if(cur&&same({...cur,y:undefined},{...s,y:undefined}))return;history.pushState({nav:s},"",url||here())};

// 처음 열었을 때의 화면을 첫 기록으로 둔다.
history.replaceState({nav:snap()},"",here());

// 탭 버튼: app-render.js가 탭을 바꾼 뒤(버블 단계)에 기록을 쌓는다. 잠긴 탭은 lock.js가 먼저 막는다.
document.querySelectorAll(".tabs [data-tab]").forEach(b=>b.addEventListener("click",()=>setTimeout(()=>window.navPush(),0)));
document.querySelector(".tabs")?.addEventListener("click",e=>{if(e.target.closest("[data-tab]"))window.navRemember()},true);

// 트래커: 열 때 #tracker 기록을 쌓는다(tracker.js는 주소가 이미 #tracker면 기록을 건드리지 않는다).
document.addEventListener("click",e=>{
  if(e.target.closest?.("#tracker-open")&&!window.SUBIN_LOCK?.locked&&location.hash!=="#tracker"){window.navRemember();history.pushState({nav:{...snap(),tracker:1}},"",location.pathname+location.search+"#tracker")}
},true);
// 트래커의 "‹ 비서" 버튼은 기록을 하나 되돌리는 것으로 닫는다(그래야 다음 뒤로 가기가 한 번에 앞 화면으로 간다).
let passClose=false;
document.addEventListener("click",e=>{
  const b=e.target.closest?.('.tr-wrap [data-act="close"]');
  if(!b||passClose)return;
  if(history.state?.nav?.tracker){e.preventDefault();e.stopImmediatePropagation();history.back()}
},true);
const closeTracker=()=>{const b=document.querySelector('.tr-wrap [data-act="close"]');if(!b)return;passClose=true;try{b.click()}finally{passClose=false}};

window.addEventListener("popstate",e=>{
  const s=e.state?.nav;if(!s)return;
  restoring=true;
  try{
    // 트래커가 열려 있는데 돌아갈 화면이 트래커가 아니면 닫는다. 트래커로 돌아가는 건 tracker.js의 hashchange가 연다.
    if(!s.tracker&&document.body.classList.contains("tr-on"))closeTracker();
    // 잠긴 상태(가족 링크)에서는 부동산 말고 다른 탭으로 돌아가지 않는다.
    const tab=window.SUBIN_LOCK?.locked?"realestate":s.tab;
    if(tab==="realestate")window.reNav?.set(s.re);
    const changed=tab!==local.tab;
    if(changed){local.tab=tab;save();render()}
    if(tab==="realestate"&&!changed)window.reNav?.draw();
  }finally{restoring=false}
  requestAnimationFrame(()=>window.scrollTo(0,s.y||0));
});
})();
