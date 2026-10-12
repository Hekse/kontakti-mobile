import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const html=readFileSync(new URL('../cloud-ui-v2.html',import.meta.url),'utf8');
const helpers=html.slice(html.indexOf('function getRelatedByBusinessId('),html.indexOf('function renderDetail('));
function context(cs,LANG='fi'){
  const ctx=vm.createContext({cs,LANG,esc:s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))});
  vm.runInContext(helpers,ctx); return ctx;
}
test('matches normalized business ID, excludes self and sorts names across the loaded workspace',()=>{
  const a={id:'a',name:'Current',business_id:' 1234567-8 '};
  const ctx=context([a,{id:'z',name:'Zulu',business_id:'1234567-8'},{id:'b',name:'Alpha',business_id:'1234567-8'},{id:'other',business_id:'7654321-0'},{id:'blank',business_id:null}]);
  assert.deepEqual(Array.from(ctx.getRelatedByBusinessId(a),x=>x.id),['b','z']);
});
test('missing, whitespace-only and unmatched IDs have no section',()=>{
  const ctx=context([{id:'b',business_id:' '},{id:'c',business_id:null}]);
  for(const business_id of [null,undefined,'',' ','1234567-8']) assert.equal(ctx.renderRelatedPlaces({id:'a',business_id}),'');
});
test('section renders escaped name and city, navigable IDs and both UI languages',()=>{
  const a={id:'a',business_id:'1234567-8'};
  const ctx=context([a,{id:'b"',name:'<Alpha>',city:'A&B',business_id:a.business_id}]);
  const markup=ctx.renderRelatedPlaces(a);
  assert.match(markup,/Muut saman yrityksen paikat/);
  assert.match(markup,/data-related-id="b&quot;"/);
  assert.match(markup,/&lt;Alpha&gt; · A&amp;B/);
  ctx.LANG='en'; assert.match(ctx.renderRelatedPlaces(a),/Other locations of the same company/);
});
test('all inline scripts parse',()=>{
  for(const [,attrs,code] of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)) if(!attrs.includes('src=')) new vm.Script(code.replace(/^import[^\n]*$/gm,''));
});
