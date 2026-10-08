export const categories={hotel:'Hotelli',fuel:'Polttoaine',parking:'Pysäköinti',meal:'Lounas / ruokailu',toll:'Tietulli / lautta',transport:'Julkinen liikenne / taksi',other:'Muu'};
export const number=value=>Number(String(value).trim().replace(',','.'));
export function tripValues({date,start,targets,purpose,km,rate,notes}){
  const stops=[start,...targets].map(v=>v.trim());
  if(!date||stops.some(v=>!v)||!purpose.trim()||String(km).trim()===''||String(rate).trim()==='')throw Error('Täytä päivämäärä, lähtöpaikka, kohteet, ajon tarkoitus, kilometrit ja €/km.');
  km=number(km);rate=number(rate);
  if(!Number.isFinite(km)||km<0||!Number.isFinite(rate)||rate<0)throw Error('Tarkista kilometrit ja €/km.');
  const route=stops.join(' → '),description=[purpose.trim(),notes.trim()].filter(Boolean).join('\n');
  if(route.length>500||description.length>2000)throw Error('Reitti tai muistiinpano on liian pitkä.');
  return {date,route,km,rate,notes:description};
}
export function expenseValues(rows){
  return rows.map(row=>{
    const amount=number(row.amount),notes=(row.notes||'').trim();
    if(!categories[row.category]||String(row.amount).trim()===''||!Number.isFinite(amount)||amount<0||notes.length>2000)throw Error('Tarkista kululaji, summa ja kuvaus.');
    return {...row,amount,notes:notes||null};
  });
}
// The same IDs survive a partial save. Changed data starts a separate batch.
export function batchIds(storage,key,fingerprint,count,uuid){
  let old;try{old=JSON.parse(storage.getItem(key)||'null')}catch{}
  if(old?.fingerprint===fingerprint&&old.expenses?.length===count)return old;
  const batch={fingerprint,trip:uuid(),expenses:Array.from({length:count},uuid)};
  storage.setItem(key,JSON.stringify(batch));return batch;
}
