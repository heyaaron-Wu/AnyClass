(function(root){
  "use strict";
  const KEY="anyclass.onboardingCompleted";
  const completed=()=>{try{return localStorage.getItem(KEY)==="1"}catch(_error){return false}};
  const persist=()=>{try{localStorage.setItem(KEY,"1")}catch(_error){}};
  const dialog=()=>document.querySelector("[data-onboarding-dialog]");
  const emptyConfirmed=()=>{const state=document.getElementById("emptyState");return Boolean(state&&!state.hidden)};
  const close=()=>{persist();const node=dialog();if(node?.open)node.close()};
  const apply=()=>{const node=dialog();if(!node)return;const shouldOpen=!completed()&&emptyConfirmed();if(shouldOpen&&!node.open){node.showModal();node.querySelector("[data-onboarding-primary]")?.focus({preventScroll:true})}else if(!shouldOpen&&node.open)node.close()};
  addEventListener("DOMContentLoaded",()=>{
    const node=dialog(),state=document.getElementById("emptyState");
    if(!node||!state)return;
    new MutationObserver(apply).observe(state,{attributes:true,attributeFilter:["hidden"]});
    for(const action of node.querySelectorAll("[data-complete-onboarding]"))action.addEventListener("click",persist);
    node.querySelector("[data-dismiss-onboarding]")?.addEventListener("click",close);
    node.addEventListener("cancel",event=>{event.preventDefault();close()});
    node.addEventListener("click",event=>{if(event.target===node)close()});
    apply();
  });
  root.AnyClassOnboarding=Object.freeze({KEY,apply,close,complete:close,completed});
})(globalThis);
