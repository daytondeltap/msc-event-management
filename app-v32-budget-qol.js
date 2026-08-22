/* v32: budget ledger, calculator, and mobile navigation quality-of-life layer. */
(() => {
  'use strict';

  const MOBILE = matchMedia('(max-width: 900px)');
  const PRIMARY_MOBILE_VIEWS = new Set(['home','plan','events','board','budget']);
  const UTILITY_IDS = new Set(['importButton','exportButton','settingsButton']);
  const DEFAULT_CATEGORIES = ['Supplies','Food','Venue','Transport','Printing','Decor','Tech','Tickets','Donation','Fundraising','Reimbursement','Other'];
  let ledgerFilter = 'all';
  let calcText = '';
  let calcResult = 0;
  let menuObserver = null;
  let menuSyncQueued = false;

  const fmtBudgetMoney = value => {
    const n = Number(value) || 0;
    const decimals = Math.abs(n % 1) > 0.00001 ? 2 : 0;
    return `${n < 0 ? '−' : ''}฿${Math.abs(n).toLocaleString(undefined,{minimumFractionDigits:decimals,maximumFractionDigits:2})}`;
  };
  const today = () => {
    const d = new Date();
    const p = n => String(n).padStart(2,'0');
    return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
  };

  function ensureBudgetState(){
    if(!Array.isArray(state.budgetLedger)) state.budgetLedger=[];
    state.annualBudget=Math.max(0,+state.annualBudget||0);
  }

  function ledgerEventName(entry){
    return state.events.find(e=>e.id===entry.eventId)?.name || '';
  }

  function ledgerRows(){
    ensureBudgetState();
    const filtered=[...state.budgetLedger]
      .filter(x=>ledgerFilter==='all'||x.type===ledgerFilter)
      .sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))||(+b.createdAt||0)-(+a.createdAt||0));
    if(!filtered.length) return '<div class="budget-empty">No money entries in this filter yet.</div>';
    return `<div class="budget-ledger-list">${filtered.map(entry=>{
      const eventName=ledgerEventName(entry);
      return `<article class="budget-ledger-row ${entry.type}">
        <div class="budget-ledger-main">
          <span class="budget-ledger-type">${entry.type==='income'?'Money in':'Expense'}</span>
          <strong>${esc(entry.note||entry.category||'Budget entry')}</strong>
          <small>${esc(entry.category||'Other')} · ${esc(entry.date||'No date')}${eventName?` · <button class="budget-event-link" data-open-event="${esc(entry.eventId)}">${esc(eventName)}</button>`:''}</small>
        </div>
        <div class="budget-ledger-amount ${entry.type}">${entry.type==='income'?'+':'−'}${fmtBudgetMoney(entry.amount).replace(/^−/,'')}</div>
        <button class="icon-button budget-delete" type="button" data-budget-delete="${esc(entry.id)}" aria-label="Delete budget entry">×</button>
      </article>`;
    }).join('')}</div>`;
  }

  function eventBudgetRows(){
    const rows=visible().filter(e=>(+e.budgetPlanned||0)||(+e.budgetActual||0));
    if(!rows.length) return '<div class="budget-empty">No event budgets yet. Add a planned budget in an event record.</div>';
    return `<div class="budget-event-list">${rows.map(e=>{
      const planned=+e.budgetPlanned||0, actual=+e.budgetActual||0;
      const pct=planned>0?Math.min(100,(actual/planned)*100):0;
      const over=planned>0&&actual>planned;
      return `<button class="budget-event-row" type="button" data-open-event="${esc(e.id)}">
        <span class="budget-event-copy"><strong>${esc(e.name||'Untitled event')}</strong><small>${fmtBudgetMoney(actual)} spent of ${fmtBudgetMoney(planned)} planned</small></span>
        <span class="budget-mini-progress"><i style="width:${pct}%" class="${over?'over':''}"></i></span>
        <span class="budget-event-delta ${over?'over':''}">${over?`${fmtBudgetMoney(actual-planned)} over`:`${fmtBudgetMoney(Math.max(0,planned-actual))} left`}</span>
      </button>`;
    }).join('')}</div>`;
  }

  function calculatorMarkup(){
    const keys=['7','8','9','÷','4','5','6','×','1','2','3','−','0','.','%','+','(',')','DEL','='];
    return `<div class="budget-calculator">
      <label class="field full"><span>Calculator</span><input id="budgetCalcInput" inputmode="decimal" autocomplete="off" placeholder="e.g. 3500 + 12 × 85" value="${esc(calcText)}"></label>
      <div class="budget-calc-result" id="budgetCalcResult">${fmtBudgetMoney(calcResult)}</div>
      <div class="budget-keypad">${keys.map(key=>`<button type="button" class="budget-key ${key==='='?'equals':''}" data-calc-key="${esc(key)}">${esc(key)}</button>`).join('')}</div>
      <div class="budget-calc-actions">
        <button type="button" class="button secondary" data-calc-action="clear">Clear</button>
        <button type="button" class="button secondary" data-calc-action="use">Use as entry amount</button>
        <button type="button" class="button primary" data-calc-action="budget">Set as total budget</button>
      </div>
    </div>`;
  }

  function budgetMarkup(){
    ensureBudgetState();
    const t=budgetSnapshot();
    const budgetBase=+state.annualBudget||0;
    const usedPct=budgetBase>0?Math.min(100,(t.trackedSpend/Math.max(1,budgetBase+t.income))*100):0;
    const remainingClass=t.available<0?'negative':t.available<budgetBase*.15?'warning':'';
    const events=state.events.slice().sort((a,b)=>String(a.name||'').localeCompare(String(b.name||'')));
    return `<div class="budget-shell budget-v32">
      <div class="budget-hero panel">
        <div class="budget-hero-copy">
          <div class="eyebrow">Money workspace</div>
          <h2>Budget & cash log</h2>
          <p>Set the board budget, calculate costs, log spending and money received, and tie expenses back to events.</p>
        </div>
        <form id="budgetTargetForm" class="budget-target-form">
          <label class="field"><span>Total budget</span><input id="budgetTargetInput" type="number" inputmode="decimal" min="0" step="0.01" value="${esc(state.annualBudget)}"></label>
          <button class="button primary" type="submit">Update budget</button>
        </form>
      </div>

      <div class="budget-summary-grid">
        <div class="budget-summary-card"><span>Total budget</span><strong>${fmtBudgetMoney(state.annualBudget)}</strong><small>Base funds available</small></div>
        <div class="budget-summary-card"><span>Planned</span><strong>${fmtBudgetMoney(t.planned)}</strong><small>Across event plans</small></div>
        <div class="budget-summary-card"><span>Tracked spend</span><strong>${fmtBudgetMoney(t.trackedSpend)}</strong><small>Event actuals + unassigned expenses</small></div>
        <div class="budget-summary-card income"><span>Money in</span><strong>${fmtBudgetMoney(t.income)}</strong><small>Fundraising, reimbursements, donations</small></div>
        <div class="budget-summary-card ${remainingClass}"><span>Available</span><strong>${fmtBudgetMoney(t.available)}</strong><small>${t.available<0?'Over available funds':'Budget + income − tracked spend'}</small></div>
      </div>

      <div class="budget-progress-wrap panel">
        <div class="budget-progress-head"><span><strong>${Math.round(usedPct)}%</strong> of available funds used</span><span>${fmtBudgetMoney(t.available)} available</span></div>
        <div class="budget-progress"><i style="width:${usedPct}%" class="${t.available<0?'over':''}"></i></div>
      </div>

      <div class="budget-workspace-grid">
        <section class="panel budget-entry-panel">
          <div class="panel-header"><div><h2>Log money</h2><p>Add an expense or money received. Linked expenses automatically add to that event's actual spend.</p></div></div>
          <form id="budgetEntryForm" class="budget-entry-form">
            <div class="budget-type-toggle" role="group" aria-label="Entry type">
              <button type="button" class="budget-type active" data-budget-type="expense">− Expense</button>
              <button type="button" class="budget-type" data-budget-type="income">＋ Money in</button>
              <input type="hidden" name="type" value="expense">
            </div>
            <div class="field-grid two budget-form-grid">
              <label class="field"><span>Amount</span><input id="budgetEntryAmount" name="amount" type="number" inputmode="decimal" min="0.01" step="0.01" required placeholder="0"></label>
              <label class="field"><span>Date</span><input name="date" type="date" value="${today()}"></label>
              <label class="field"><span>Category</span><select name="category">${DEFAULT_CATEGORIES.map(c=>`<option>${esc(c)}</option>`).join('')}</select></label>
              <label class="field"><span>Event (optional)</span><select name="eventId"><option value="">General / no event</option>${events.map(e=>`<option value="${esc(e.id)}">${esc(e.name||'Untitled')}</option>`).join('')}</select></label>
            </div>
            <label class="field full"><span>What was it for?</span><input name="note" maxlength="120" placeholder="e.g. poster printing, ticket sales, reimbursement"></label>
            <div class="budget-submit-row"><button class="button primary" type="submit">Add entry</button><small>Saved with this board and shared with collaborators.</small></div>
          </form>
        </section>

        <section class="panel budget-calculator-panel">
          <div class="panel-header"><div><h2>Quick calculator</h2><p>Use +, −, ×, ÷, parentheses and percentages.</p></div></div>
          ${calculatorMarkup()}
        </section>
      </div>

      <div class="budget-detail-grid">
        <section class="panel">
          <div class="panel-header"><div><h2>Money history</h2><p>${state.budgetLedger.length} logged entr${state.budgetLedger.length===1?'y':'ies'}.</p></div><div class="budget-filter-row"><button type="button" class="budget-filter ${ledgerFilter==='all'?'active':''}" data-budget-filter="all">All</button><button type="button" class="budget-filter ${ledgerFilter==='expense'?'active':''}" data-budget-filter="expense">Expenses</button><button type="button" class="budget-filter ${ledgerFilter==='income'?'active':''}" data-budget-filter="income">Money in</button></div></div>
          ${ledgerRows()}
        </section>
        <section class="panel">
          <div class="panel-header"><div><h2>Event budgets</h2><p>Tap an event to edit its planned or actual amount.</p></div></div>
          ${eventBudgetRows()}
        </section>
      </div>
    </div>`;
  }

  function evaluateExpression(raw){
    const src=String(raw||'').replace(/[×x]/g,'*').replace(/[÷]/g,'/').replace(/[−–—]/g,'-').replace(/,/g,'').replace(/\s+/g,'');
    if(!src) return 0;
    let i=0;
    const peek=()=>src[i]||'';
    const eat=c=>{if(peek()===c){i++;return true}return false};
    function primary(){
      if(eat('+')) return primary();
      if(eat('-')) return -primary();
      let value;
      if(eat('(')){
        value=expression();
        if(!eat(')')) throw new Error('Missing )');
      }else{
        const start=i;
        while(/[0-9.]/.test(peek())) i++;
        const token=src.slice(start,i);
        if(!token||token==='.'||(token.match(/\./g)||[]).length>1) throw new Error('Invalid number');
        value=Number(token);
      }
      while(eat('%')) value/=100;
      return value;
    }
    function term(){
      let value=primary();
      while(true){
        if(eat('*')) value*=primary();
        else if(eat('/')){const d=primary();if(d===0)throw new Error('Divide by zero');value/=d;}
        else break;
      }
      return value;
    }
    function expression(){
      let value=term();
      while(true){
        if(eat('+')) value+=term();
        else if(eat('-')) value-=term();
        else break;
      }
      return value;
    }
    const result=expression();
    if(i!==src.length||!Number.isFinite(result)) throw new Error('Invalid expression');
    return Math.round((result+Number.EPSILON)*100)/100;
  }

  function updateCalculator(nextText=calcText, shouldEvaluate=false){
    calcText=String(nextText||'');
    const input=document.getElementById('budgetCalcInput');
    if(input&&input.value!==calcText) input.value=calcText;
    if(shouldEvaluate){
      try{calcResult=evaluateExpression(calcText);const result=document.getElementById('budgetCalcResult');if(result)result.textContent=fmtBudgetMoney(calcResult);}
      catch{toast('Check the calculator expression');}
    }
  }

  function refreshBudget(){
    budget();
    if(view==='budget') setView('budget',false);
  }

  // Replace the original read-only budget renderer while preserving the public function name used by render().
  budget = function(){
    const target=$('#budgetView');
    if(target) target.innerHTML=budgetMarkup();
  };

  document.addEventListener('input',event=>{
    if(event.target?.id==='budgetCalcInput') calcText=event.target.value;
  });

  document.addEventListener('keydown',event=>{
    if(event.target?.id==='budgetCalcInput'&&event.key==='Enter'){
      event.preventDefault();
      updateCalculator(event.target.value,true);
    }
    if(event.key==='Escape') closeMobileMore();
  });

  document.addEventListener('submit',event=>{
    if(event.target?.id==='budgetTargetForm'){
      event.preventDefault();
      const value=Math.max(0,+document.getElementById('budgetTargetInput')?.value||0);
      state.annualBudget=value;
      save();render();setView('budget',false);toast('Budget updated');
      return;
    }
    if(event.target?.id==='budgetEntryForm'){
      event.preventDefault();
      ensureBudgetState();
      const data=new FormData(event.target);
      const amount=Math.max(0,+data.get('amount')||0);
      if(!amount){toast('Enter an amount');return;}
      const type=data.get('type')==='income'?'income':'expense';
      const eventId=String(data.get('eventId')||'');
      const entry={id:uid(),type,amount,date:String(data.get('date')||today()),category:String(data.get('category')||'Other'),note:String(data.get('note')||'').trim(),eventId,createdAt:Date.now()};
      state.budgetLedger.push(entry);
      if(type==='expense'&&eventId){
        const linked=state.events.find(e=>e.id===eventId);
        if(linked) linked.budgetActual=Math.max(0,(+linked.budgetActual||0)+amount);
      }
      save();render();setView('budget',false);toast(type==='income'?'Money received logged':'Expense logged');
      return;
    }
  });

  document.addEventListener('click',event=>{
    const typeButton=event.target.closest?.('[data-budget-type]');
    if(typeButton){
      const form=typeButton.closest('#budgetEntryForm');
      if(!form)return;
      const type=typeButton.dataset.budgetType==='income'?'income':'expense';
      form.elements.type.value=type;
      form.querySelectorAll('[data-budget-type]').forEach(b=>b.classList.toggle('active',b===typeButton));
      return;
    }

    const deleteButton=event.target.closest?.('[data-budget-delete]');
    if(deleteButton){
      ensureBudgetState();
      const id=deleteButton.dataset.budgetDelete;
      const entry=state.budgetLedger.find(x=>x.id===id);
      if(!entry)return;
      if(!confirm('Delete this money entry?'))return;
      if(entry.type==='expense'&&entry.eventId){
        const linked=state.events.find(e=>e.id===entry.eventId);
        if(linked) linked.budgetActual=Math.max(0,(+linked.budgetActual||0)-(+entry.amount||0));
      }
      state.budgetLedger=state.budgetLedger.filter(x=>x.id!==id);
      save();render();setView('budget',false);toast('Budget entry deleted');
      return;
    }

    const filterButton=event.target.closest?.('[data-budget-filter]');
    if(filterButton){ledgerFilter=filterButton.dataset.budgetFilter||'all';refreshBudget();return;}

    const key=event.target.closest?.('[data-calc-key]');
    if(key){
      const value=key.dataset.calcKey;
      if(value==='='){updateCalculator(calcText,true);return;}
      if(value==='DEL'){updateCalculator(calcText.slice(0,-1));return;}
      const normalized=value==='×'?' × ':value==='÷'?' ÷ ':value==='−'?' − ':value;
      updateCalculator(calcText+normalized);
      return;
    }

    const action=event.target.closest?.('[data-calc-action]');
    if(action){
      if(action.dataset.calcAction==='clear'){
        calcText='';calcResult=0;updateCalculator('');const result=document.getElementById('budgetCalcResult');if(result)result.textContent=fmtBudgetMoney(0);return;
      }
      try{calcResult=evaluateExpression(document.getElementById('budgetCalcInput')?.value||calcText);calcText=document.getElementById('budgetCalcInput')?.value||calcText;}
      catch{toast('Check the calculator expression');return;}
      if(action.dataset.calcAction==='use'){
        const amount=document.getElementById('budgetEntryAmount');if(amount){amount.value=calcResult;amount.focus();amount.scrollIntoView({block:'center'});}return;
      }
      if(action.dataset.calcAction==='budget'){
        if(calcResult<0){toast('Budget cannot be negative');return;}
        state.annualBudget=calcResult;save();render();setView('budget',false);toast('Calculator result set as budget');return;
      }
    }

    if(event.target.closest?.('#mobileMoreButton')){toggleMobileMore();return;}
    if(event.target.closest?.('[data-mobile-more-close]')){closeMobileMore();return;}
    const proxy=event.target.closest?.('[data-mobile-proxy]');
    if(proxy){
      event.preventDefault();
      document.getElementById(proxy.dataset.mobileProxy)?.click();
      closeMobileMore();
      return;
    }
    if(event.target.closest?.('#mobileMoreSheet [data-view]')){
      closeMobileMore();
      if(MOBILE.matches) setTimeout(()=>window.scrollTo({top:0,behavior:'auto'}),0);
    }
  });

  function ensureMobileMore(){
    let button=document.getElementById('mobileMoreButton');
    const nav=document.querySelector('.nav-list');
    if(nav&&!button){
      button=document.createElement('button');
      button.id='mobileMoreButton';button.type='button';button.className='nav-item mobile-more-button';button.setAttribute('aria-label','More tools');
      button.innerHTML='<span>•••</span><b>More</b>';
      nav.appendChild(button);
    }
    if(!document.getElementById('mobileMoreSheet')){
      const sheet=document.createElement('div');sheet.id='mobileMoreSheet';sheet.className='mobile-more-sheet';sheet.setAttribute('aria-hidden','true');
      sheet.innerHTML='<div class="mobile-more-backdrop" data-mobile-more-close></div><section class="mobile-more-panel" role="dialog" aria-modal="true" aria-labelledby="mobileMoreTitle"><div class="mobile-more-head"><div><div class="eyebrow">Workspace</div><h2 id="mobileMoreTitle">More</h2></div><button class="icon-button" type="button" data-mobile-more-close aria-label="Close">×</button></div><div class="mobile-more-grid" id="mobileMoreGrid"></div></section>';
      document.body.appendChild(sheet);
    }
    return {button,nav};
  }

  function labelForNav(el){return el.querySelector('b')?.textContent?.trim()||el.getAttribute('aria-label')||el.id||el.dataset.view||'Tool';}
  function iconForNav(el){return el.querySelector('span')?.textContent?.trim()||'◇';}

  function syncMobileMore(){
    menuSyncQueued=false;
    const {button,nav}=ensureMobileMore();
    const grid=document.getElementById('mobileMoreGrid');
    if(!nav||!grid||!button)return;
    const items=[...nav.children].filter(el=>el instanceof HTMLElement&&el!==button&&(el.matches('.nav-item')||el.tagName==='BUTTON'));
    if(!MOBILE.matches){
      items.forEach(el=>el.classList.remove('msc-mobile-secondary'));
      button.hidden=true;closeMobileMore();return;
    }
    button.hidden=false;
    const extras=[];
    items.forEach(el=>{
      const v=el.dataset.view||'';
      const secondary=(v&&!PRIMARY_MOBILE_VIEWS.has(v))||UTILITY_IDS.has(el.id);
      el.classList.toggle('msc-mobile-secondary',secondary);
      if(secondary) extras.push(el);
    });
    grid.innerHTML=extras.map(el=>{
      const v=el.dataset.view||'';
      const active=v&&v===view?' active':'';
      if(v) return `<button type="button" class="mobile-more-item${active}" data-view="${esc(v)}"><span>${esc(iconForNav(el))}</span><b>${esc(labelForNav(el))}</b></button>`;
      return `<button type="button" class="mobile-more-item" data-mobile-proxy="${esc(el.id)}"><span>${esc(iconForNav(el))}</span><b>${esc(labelForNav(el))}</b></button>`;
    }).join('')||'<div class="budget-empty">No extra tools yet.</div>';
    button.classList.toggle('active',!!view&&!PRIMARY_MOBILE_VIEWS.has(view));
  }

  function queueMobileMore(){if(menuSyncQueued)return;menuSyncQueued=true;requestAnimationFrame(syncMobileMore);}
  function openMobileMore(){
    if(!MOBILE.matches)return;
    syncMobileMore();
    const sheet=document.getElementById('mobileMoreSheet');if(!sheet)return;
    sheet.classList.add('open');sheet.setAttribute('aria-hidden','false');document.body.classList.add('mobile-more-open');
  }
  function closeMobileMore(){
    const sheet=document.getElementById('mobileMoreSheet');if(!sheet)return;
    sheet.classList.remove('open');sheet.setAttribute('aria-hidden','true');document.body.classList.remove('mobile-more-open');
  }
  function toggleMobileMore(){const sheet=document.getElementById('mobileMoreSheet');sheet?.classList.contains('open')?closeMobileMore():openMobileMore();}

  function initMobileMore(){
    const {nav}=ensureMobileMore();
    if(nav&&!menuObserver){menuObserver=new MutationObserver(queueMobileMore);menuObserver.observe(nav,{childList:true,subtree:false});}
    MOBILE.addEventListener?.('change',queueMobileMore);
    window.addEventListener('resize',queueMobileMore,{passive:true});
    window.addEventListener('msc:viewchange',queueMobileMore);
    queueMobileMore();setTimeout(queueMobileMore,300);setTimeout(queueMobileMore,900);
  }

  ensureBudgetState();
  budget();
  initMobileMore();
  window.MSC_BUDGET_QOL={evaluate:evaluateExpression,refresh:refreshBudget,syncMobileMenu:syncMobileMore};
})();
