/* MSC v21: skip v8's full planner clone on large boards. */
(() => {
  'use strict';
  const basePlan=typeof plan==='function'?plan:null;
  if(!basePlan)return;
  plan=function(...args){
    const result=basePlan(...args);
    if((state.events?.length||0)>=20){const viewport=document.getElementById('plannerViewport');if(viewport)viewport.dataset.v8Clean='1';}
    return result;
  };
})();
