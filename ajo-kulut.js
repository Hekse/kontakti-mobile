const BUCKET='expense-receipts', MAX_IMAGE=5*1024*1024;
const CATEGORIES={hotel:'Hotelli',fuel:'Polttoaine',parking:'Pysäköinti',meal:'Lounas / ruokailu',toll:'Tietulli / lautta',transport:'Julkinen liikenne / taksi',other:'Muu'};
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const today=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')};
const money=n=>Number(n||0).toLocaleString('fi-FI',{minimumFractionDigits:2,maximumFractionDigits:2})+' €';
const decimal=v=>Number(String(v).trim().replace(',','.'));
const formatKm=n=>Number(n||0).toLocaleString('fi-FI',{maximumFractionDigits:2});
const must=(result,label)=>{if(result.error)throw new Error(`${label}: ${result.error.message}`);return result.data};

export function validateReceipt(file,bytes){
  if(!file||file.size<1||file.size>MAX_IMAGE)throw Error('Kuittikuvan sallittu koko on 1–5 Mt.');
  const b=new Uint8Array(bytes);
  const jpg=b.length>3&&b[0]===255&&b[1]===216&&b[2]===255;
  const png=b.length>8&&[137,80,78,71,13,10,26,10].every((n,i)=>b[i]===n);
  const webp=b.length>12&&String.fromCharCode(...b.slice(0,4))==='RIFF'&&String.fromCharCode(...b.slice(8,12))==='WEBP';
  const ext=jpg?'jpg':png?'png':webp?'webp':null;
  const mime=jpg?'image/jpeg':png?'image/png':webp?'image/webp':null;
  if(!ext||file.type!==mime)throw Error('Valitse JPEG-, PNG- tai WebP-kuva.');
  return {ext,mime};
}
export const pendingId=(key,fingerprint)=>{
  let stored=null;try{stored=JSON.parse(sessionStorage.getItem(key)||'null')}catch{}
  if(stored?.fingerprint===fingerprint&&stored.id)return stored.id;
  const id=crypto.randomUUID();sessionStorage.setItem(key,JSON.stringify({fingerprint,id}));return id;
};

export function createAjoKulut({sb,getWorkspace,getUser,getCustomers}){
  let root=null,loadedAt=0,trips=[],links=[],expenses=[],receipts=[],tripCustomers=new Set(),expenseCustomer='',previewUrl='',savingTrip=false,savingExpense=false;
  const q=id=>root?.querySelector('#'+id);
  const customer=id=>getCustomers().find(c=>c.id===id);
  const status=(id,message,error=false)=>{const el=q(id);if(el){el.textContent=message;el.classList.toggle('error',error)}};
  const page=async(table,workspace,deleted=false)=>{
    const all=[],seen=new Set();let from=0;
    for(;;){let query=sb.from(table).select('*').eq('workspace_id',workspace);query=table==='kontakti_trip_customers'?query.order('trip_id',{ascending:true}).order('customer_id',{ascending:true}):query.order('id',{ascending:true});query=query.range(from,from+499);if(deleted)query=query.is('deleted_at',null);const rows=must(await query,table)||[];let added=0;for(const row of rows){const key=row.id||`${row.trip_id}:${row.customer_id}`;if(!seen.has(key)){seen.add(key);all.push(row);added++}}if(!rows.length||!added)return all;from+=rows.length;}
  };
  function markup(){
    root.innerHTML=`<div class="ajo-head"><h2>Ajo ja kulut</h2><p>Kirjaa kentällä, tarkista koonti ja tulosta raportti.</p></div>
    <section class="ajo-panel"><h3>Lisää ajo</h3><form id="ajoTripForm">
      <div class="ajo-field"><label for="ajoTripDate">Päivämäärä</label><input id="ajoTripDate" type="date" required></div>
      <div class="ajo-field"><label for="ajoRoute">Reitti</label><input id="ajoRoute" maxlength="500" placeholder="Lapinlahti → Iisalmi → Kuopio → Lapinlahti" required></div>
      <div class="ajo-row"><div class="ajo-field"><label for="ajoKm">Kilometrit</label><input id="ajoKm" type="number" inputmode="decimal" min="0" step="0.01" required></div><div class="ajo-field"><label for="ajoRate">€/km</label><input id="ajoRate" type="number" inputmode="decimal" min="0" step="0.0001" required></div></div>
      <div class="ajo-total">Korvaus <strong id="ajoCalc">0,00 €</strong></div>
      <div class="ajo-field"><label for="ajoTripSearch">Asiakkaat (valinnainen, voi valita useita)</label><input id="ajoTripSearch" type="search" placeholder="Hae asiakasta"><div class="ajo-chips" id="ajoTripChips"></div><div class="ajo-results" id="ajoTripResults"></div></div>
      <div class="ajo-field"><label for="ajoTripNotes">Selite (valinnainen)</label><textarea id="ajoTripNotes" maxlength="2000"></textarea></div>
      <button class="ajo-btn primary" type="submit" id="ajoTripSave">Tallenna ajo</button><div class="ajo-message" id="ajoTripStatus" role="status"></div>
    </form></section>
    <section class="ajo-panel"><h3>Lisää kulu</h3><form id="ajoExpenseForm">
      <div class="ajo-field"><label for="ajoExpenseDate">Päivämäärä</label><input id="ajoExpenseDate" type="date" required></div>
      <div class="ajo-field"><label for="ajoCategory">Kategoria</label><select id="ajoCategory">${Object.entries(CATEGORIES).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></div>
      <div class="ajo-field"><label for="ajoAmount">Summa €</label><input id="ajoAmount" type="number" inputmode="decimal" min="0" step="0.01" required></div>
      <div class="ajo-field"><label for="ajoExpenseSearch">Asiakas (valinnainen)</label><input id="ajoExpenseSearch" type="search" placeholder="Hae asiakasta"><div class="ajo-chips" id="ajoExpenseChip"></div><div class="ajo-results" id="ajoExpenseResults"></div></div>
      <div class="ajo-field"><label for="ajoExpenseTrip">Liitä ajoon (valinnainen)</label><select id="ajoExpenseTrip"><option value="">Ei ajoa</option></select></div>
      <div class="ajo-field"><label for="ajoExpenseNotes">Selite (valinnainen)</label><textarea id="ajoExpenseNotes" maxlength="2000"></textarea></div>
      <div class="ajo-field"><label for="ajoReceipt">Kuittikuva (valinnainen)</label><input id="ajoReceipt" type="file" accept="image/jpeg,image/png,image/webp"><div class="ajo-preview" id="ajoReceiptPreview"></div><p>Valitse kamerasta tai puhelimen kuvista. Enintään 5 Mt.</p></div>
      <button class="ajo-btn primary" type="submit" id="ajoExpenseSave">Tallenna kulu</button><div class="ajo-message" id="ajoExpenseStatus" role="status"></div>
    </form></section>
    <section class="ajo-panel"><h3>Koonti ja raportti</h3><div class="ajo-row"><div class="ajo-field"><label for="ajoFrom">Alku</label><input id="ajoFrom" type="date"></div><div class="ajo-field"><label for="ajoTo">Loppu</label><input id="ajoTo" type="date"></div></div>
      <div class="ajo-presets" id="ajoPresets"><button type="button" data-period="week">Tämä viikko</button><button type="button" data-period="prevweek">Edellinen viikko</button><button type="button" data-period="month">Tämä kuukausi</button><button type="button" data-period="prevmonth">Edellinen kuukausi</button><button type="button" data-period="ytd">YTD</button></div>
      <div class="ajo-stat-grid" id="ajoStats"></div><h3>Ajot</h3><div id="ajoTripList"></div><h3>Kulut</h3><div id="ajoExpenseList"></div>
      <button class="ajo-btn" type="button" id="ajoPrintBtn">Tulosta / tallenna PDF</button><div id="ajoPrint"></div>
    </section>`;
    q('ajoTripDate').value=q('ajoExpenseDate').value=today();
    period('month');
    q('ajoTripForm').addEventListener('submit',saveTrip);
    q('ajoExpenseForm').addEventListener('submit',saveExpense);
    q('ajoKm').addEventListener('input',calc);q('ajoRate').addEventListener('input',calc);
    q('ajoTripSearch').addEventListener('input',()=>renderCustomers('trip'));
    q('ajoExpenseSearch').addEventListener('input',()=>renderCustomers('expense'));
    q('ajoReceipt').addEventListener('change',preview);
    q('ajoFrom').addEventListener('change',renderReport);q('ajoTo').addEventListener('change',renderReport);
    q('ajoPresets').addEventListener('click',e=>{const b=e.target.closest('[data-period]');if(b)period(b.dataset.period)});
    q('ajoPrintBtn').addEventListener('click',()=>{renderReport();window.print()});
    root.addEventListener('click',e=>{
      const choose=e.target.closest('[data-ajo-customer]');if(choose){const id=choose.dataset.ajoCustomer;if(choose.dataset.kind==='trip'){tripCustomers.add(id);renderCustomers('trip')}else{expenseCustomer=id;renderCustomers('expense')}return}
      const remove=e.target.closest('[data-ajo-remove]');if(remove){if(remove.dataset.kind==='trip'){tripCustomers.delete(remove.dataset.ajoRemove);renderCustomers('trip')}else{expenseCustomer='';renderCustomers('expense')}return}
      const receipt=e.target.closest('[data-ajo-receipt]');if(receipt)viewReceipt(receipt.dataset.ajoReceipt);
    });
    renderCustomers('trip');renderCustomers('expense');renderReport();
  }
  function calc(){const km=decimal(q('ajoKm').value),rate=decimal(q('ajoRate').value);q('ajoCalc').textContent=Number.isFinite(km)&&Number.isFinite(rate)&&km>=0&&rate>=0?money(Math.round((km*rate+Number.EPSILON)*100)/100):'0,00 €'}
  function renderCustomers(kind){
    const search=q(kind==='trip'?'ajoTripSearch':'ajoExpenseSearch');if(!search)return;
    const selected=kind==='trip'?tripCustomers:new Set(expenseCustomer?[expenseCustomer]:[]);
    q(kind==='trip'?'ajoTripChips':'ajoExpenseChip').innerHTML=[...selected].map(id=>`<button type="button" class="ajo-chip" data-kind="${kind}" data-ajo-remove="${id}">${escapeHtml(customer(id)?.name||'Asiakas')} ×</button>`).join('');
    const term=search.value.trim().toLocaleLowerCase('fi-FI');
    q(kind==='trip'?'ajoTripResults':'ajoExpenseResults').innerHTML=term.length<2?'':getCustomers().filter(c=>!selected.has(c.id)&&!c.deleted_at&&`${c.name} ${c.city||''}`.toLocaleLowerCase('fi-FI').includes(term)).slice(0,20).map(c=>`<button type="button" data-kind="${kind}" data-ajo-customer="${c.id}">${escapeHtml(c.name)}${c.city?' · '+escapeHtml(c.city):''}</button>`).join('');
  }
  function preview(){if(previewUrl)URL.revokeObjectURL(previewUrl);const f=q('ajoReceipt').files[0];const el=q('ajoReceiptPreview');if(!f){el.replaceChildren();return}previewUrl=URL.createObjectURL(f);el.innerHTML=`<img alt="Valittu kuitti" src="${previewUrl}"><span>${escapeHtml(f.name)} · ${(f.size/1024/1024).toFixed(2)} Mt</span>`}
  const iso=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
  function period(which){const d=new Date(),y=d.getFullYear(),m=d.getMonth();let a,b;
    if(which==='ytd'){a=new Date(y,0,1);b=d}
    else if(which==='month'){a=new Date(y,m,1);b=d}
    else if(which==='prevmonth'){a=new Date(y,m-1,1);b=new Date(y,m,0)}
    else{const monday=new Date(y,m,d.getDate()-((d.getDay()+6)%7)+(which==='prevweek'?-7:0));a=monday;b=new Date(monday.getFullYear(),monday.getMonth(),monday.getDate()+6)}
    q('ajoFrom').value=iso(a);q('ajoTo').value=iso(b);renderReport();
  }
  function renderTripOptions(){const selected=q('ajoExpenseTrip').value;q('ajoExpenseTrip').innerHTML='<option value="">Ei ajoa</option>'+trips.map(t=>`<option value="${t.id}">${escapeHtml(t.trip_date+' · '+t.route_text.slice(0,65))}</option>`).join('');q('ajoExpenseTrip').value=trips.some(t=>t.id===selected)?selected:''}
  async function load(){try{const w=await getWorkspace();const [t,l,e,r]=await Promise.all([page('kontakti_trips',w.id,true),page('kontakti_trip_customers',w.id),page('kontakti_expenses',w.id,true),page('kontakti_expense_receipts',w.id)]);trips=t.sort((a,b)=>b.trip_date.localeCompare(a.trip_date)||b.created_at.localeCompare(a.created_at));links=l;expenses=e.sort((a,b)=>b.expense_date.localeCompare(a.expense_date)||b.created_at.localeCompare(a.created_at));receipts=r;loadedAt=Date.now();renderTripOptions();renderReport();return true}catch(error){loadedAt=0;status('ajoTripStatus','Tietojen lataus epäonnistui: '+error.message,true);return false}}
  async function saveTrip(event){event.preventDefault();if(savingTrip)return;savingTrip=true;q('ajoTripSave').disabled=true;
    try{const w=await getWorkspace(),u=getUser();if(!u)throw Error('Kirjaudu uudelleen.');
    const date=q('ajoTripDate').value,route=q('ajoRoute').value.trim(),km=decimal(q('ajoKm').value),rate=decimal(q('ajoRate').value),notes=q('ajoTripNotes').value.trim()||null,customers=[...tripCustomers].sort();
    if(!date||route.length<2||!Number.isFinite(km)||km<0||!Number.isFinite(rate)||rate<0){throw Error('Tarkista päivämäärä, reitti, kilometrit ja €/km.')}
    const fingerprint=JSON.stringify([w.id,date,route,km,rate,notes,customers]),id=pendingId('kontakti-trip-pending',fingerprint);
    status('ajoTripStatus','Tallennetaan…');
    must(await sb.rpc('kontakti_create_trip',{p_id:id,p_workspace:w.id,p_date:date,p_route:route,p_km:km,p_rate:rate,p_notes:notes,p_customers:customers}),'Ajon tallennus');
      const row=must(await sb.from('kontakti_trips').select('id,workspace_id,reimbursement').eq('id',id).eq('workspace_id',w.id).single(),'Ajon varmennus');if(row.id!==id)throw Error('Ajon varmennus ei täsmää');
      sessionStorage.removeItem('kontakti-trip-pending');q('ajoTripForm').reset();q('ajoTripDate').value=today();tripCustomers.clear();renderCustomers('trip');calc();const refreshed=await load();status('ajoTripStatus',refreshed?'Ajo tallennettu · '+money(row.reimbursement):'Ajo tallentui, mutta listan päivitys epäonnistui. Avaa näkymä uudelleen.',!refreshed);
    }catch(error){status('ajoTripStatus',error.message+' Sama tallennus voidaan yrittää uudelleen.',true)}finally{savingTrip=false;q('ajoTripSave').disabled=false}
  }
  async function saveExpense(event){event.preventDefault();if(savingExpense)return;savingExpense=true;q('ajoExpenseSave').disabled=true;
    let w=null,hash=null,path=null,uploaded=false;
    try{w=await getWorkspace();const u=getUser();if(!u)throw Error('Kirjaudu uudelleen.');
    const date=q('ajoExpenseDate').value,category=q('ajoCategory').value,amount=decimal(q('ajoAmount').value),notes=q('ajoExpenseNotes').value.trim()||null,customerId=expenseCustomer||null,tripId=q('ajoExpenseTrip').value||null,file=q('ajoReceipt').files[0];
    if(!date||!CATEGORIES[category]||!Number.isFinite(amount)||amount<0){throw Error('Tarkista päivämäärä, kategoria ja summa.')}
    let mime=null,size=null;
    status('ajoExpenseStatus','Tallennetaan…');
      let bytes=null;
      if(file){if(file.size<1||file.size>MAX_IMAGE)throw Error('Kuittikuvan sallittu koko on 1–5 Mt.');bytes=await file.arrayBuffer();const info=validateReceipt(file,bytes);mime=info.mime;size=file.size;hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');path=`${w.id}/${hash}.${info.ext}`}
      const fingerprint=JSON.stringify([w.id,date,category,amount,notes,customerId,tripId,hash]),id=pendingId('kontakti-expense-pending',fingerprint);
      if(hash){const old=must(await sb.from('kontakti_expense_receipts').select('expense_id').eq('workspace_id',w.id).eq('image_sha256',hash).maybeSingle(),'Kuitin tarkistus');if(old&&old.expense_id!==id)throw Error('Sama kuittikuva on jo liitetty toiseen kuluun.');
        if(!old){const result=await sb.storage.from(BUCKET).upload(path,new Blob([bytes],{type:mime}),{contentType:mime,upsert:false});if(result.error){const known=must(await sb.from('kontakti_expense_receipts').select('expense_id').eq('workspace_id',w.id).eq('image_sha256',hash).maybeSingle(),'Kuitin tarkistus');if(known?.expense_id!==id){if(!/already exists|duplicate|409/i.test(result.error.message))throw result.error;}}else uploaded=true;}
      }
      must(await sb.rpc('kontakti_create_expense',{p_id:id,p_workspace:w.id,p_date:date,p_category:category,p_amount:amount,p_notes:notes,p_customer:customerId,p_trip:tripId,p_sha:hash,p_path:path,p_mime:mime,p_size:size}),'Kulun tallennus');
      const row=must(await sb.from('kontakti_expenses').select('id,amount').eq('id',id).eq('workspace_id',w.id).single(),'Kulun varmennus');if(row.id!==id)throw Error('Kulun varmennus ei täsmää');
      if(hash){const receipt=must(await sb.from('kontakti_expense_receipts').select('expense_id,image_sha256').eq('expense_id',id).single(),'Kuitin varmennus');if(receipt.image_sha256!==hash)throw Error('Kuitin varmennus ei täsmää')}
      sessionStorage.removeItem('kontakti-expense-pending');q('ajoExpenseForm').reset();q('ajoExpenseDate').value=today();expenseCustomer='';renderCustomers('expense');preview();const refreshed=await load();status('ajoExpenseStatus',refreshed?'Kulu tallennettu · '+money(row.amount):'Kulu tallentui, mutta listan päivitys epäonnistui. Avaa näkymä uudelleen.',!refreshed);
    }catch(error){
      // A lost response may mean the DB transaction succeeded. Keep the stable UUID
      // and content-addressed object for a safe retry when the state is uncertain.
      if(uploaded&&hash&&w){try{const used=must(await sb.from('kontakti_expense_receipts').select('id').eq('workspace_id',w.id).eq('image_sha256',hash).maybeSingle(),'Kuitin tarkistus');if(!used){const removed=await sb.storage.from(BUCKET).remove([path]);if(removed.error)throw removed.error}}catch(cleanupError){status('ajoExpenseStatus','Kuitin tilaa ei voitu varmistaa. Säilytä lomake ja yritä uudelleen.',true);return}}
      status('ajoExpenseStatus',error.message.startsWith('Sama kuittikuva on jo liitetty toiseen kuluun.')
        ? error.message+' Valitse toinen kuva tai tarkista aiempi kulu.'
        : error.message+' Sama tallennus voidaan yrittää uudelleen.',true);
    }finally{savingExpense=false;q('ajoExpenseSave').disabled=false}
  }
  async function viewReceipt(path){try{const signed=must(await sb.storage.from(BUCKET).createSignedUrl(path,60),'Kuitin avaus');window.location.assign(signed.signedUrl)}catch(error){status('ajoExpenseStatus',error.message,true)}}
  function renderReport(){if(!root)return;const from=q('ajoFrom')?.value,to=q('ajoTo')?.value;if(!from||!to)return;
    const ts=trips.filter(t=>t.trip_date>=from&&t.trip_date<=to),es=expenses.filter(e=>e.expense_date>=from&&e.expense_date<=to);
    const km=ts.reduce((n,t)=>n+Number(t.kilometers),0),reimbursement=ts.reduce((n,t)=>n+Number(t.reimbursement),0),cost=es.reduce((n,e)=>n+Number(e.amount),0);
    q('ajoStats').innerHTML=`<div class="ajo-stat"><small>Kilometrit</small><strong>${formatKm(km)} km</strong></div><div class="ajo-stat"><small>Km-korvaus</small><strong>${money(reimbursement)}</strong></div><div class="ajo-stat"><small>Muut kulut</small><strong>${money(cost)}</strong></div><div class="ajo-stat"><small>Yhteensä</small><strong>${money(reimbursement+cost)}</strong></div>`;
    const customerNames=t=>links.filter(x=>x.trip_id===t.id).map(x=>customer(x.customer_id)?.name||'Asiakas').join(', ');
    q('ajoTripList').innerHTML=ts.length?ts.map(t=>`<div class="ajo-record"><b>${escapeHtml(t.trip_date)} · ${escapeHtml(t.route_text)}</b><small>${formatKm(t.kilometers)} km · ${money(t.reimbursement)}${customerNames(t)?' · '+escapeHtml(customerNames(t)):''}</small></div>`).join(''):'<p>Ei ajoja ajanjaksolla.</p>';
    q('ajoExpenseList').innerHTML=es.length?es.map(e=>{const r=receipts.find(x=>x.expense_id===e.id);return `<div class="ajo-record"><b>${escapeHtml(e.expense_date)} · ${escapeHtml(CATEGORIES[e.category]||e.category)} · ${money(e.amount)}</b><small>${escapeHtml(customer(e.customer_id)?.name||'')}${e.notes?' · '+escapeHtml(e.notes):''}${r?' · Kuitti '+escapeHtml(r.image_sha256.slice(0,10)):''}</small>${r?`<button type="button" data-ajo-receipt="${escapeHtml(r.storage_path)}">Avaa kuitti</button>`:''}</div>`}).join(''):'<p>Ei kuluja ajanjaksolla.</p>';
    q('ajoPrint').innerHTML=`<h1>Kontakti · Ajo ja kulut</h1><p>Ajanjakso ${escapeHtml(from)}–${escapeHtml(to)}</p><p>${formatKm(km)} km · Km-korvaus ${money(reimbursement)} · Kulut ${money(cost)} · Yhteensä ${money(reimbursement+cost)}</p><h2>Ajot</h2><table><thead><tr><th>Päivä / reitti / asiakkaat</th><th>Km</th><th>Korvaus</th></tr></thead><tbody>${ts.map(t=>`<tr><td>${escapeHtml(t.trip_date)} · ${escapeHtml(t.route_text)}<br>${escapeHtml(customerNames(t))}</td><td>${formatKm(t.kilometers)}</td><td>${money(t.reimbursement)}</td></tr>`).join('')}</tbody></table><h2>Kulut</h2><table><thead><tr><th>Päivä / kategoria / asiakas</th><th>Summa</th><th>Kuitti</th></tr></thead><tbody>${es.map(e=>{const r=receipts.find(x=>x.expense_id===e.id);return `<tr><td>${escapeHtml(e.expense_date)} · ${escapeHtml(CATEGORIES[e.category]||e.category)}<br>${escapeHtml(customer(e.customer_id)?.name||'')} ${escapeHtml(e.notes||'')}</td><td>${money(e.amount)}</td><td>${r?escapeHtml(r.image_sha256.slice(0,16)):'—'}</td></tr>`}).join('')}</tbody></table>`;
  }
  return {open(el){if(root!==el){root=el;markup()}if(Date.now()-loadedAt>30000)load()},prefillCustomer(id){tripCustomers.add(id);expenseCustomer=id;if(root){renderCustomers('trip');renderCustomers('expense')}}};
}
