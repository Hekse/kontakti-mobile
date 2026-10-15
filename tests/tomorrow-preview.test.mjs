import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
const html=readFileSync(new URL('../cloud-ui-v2.html',import.meta.url),'utf8');
test('tomorrow is excluded from call queue and next customer',()=>{
 const ctx=vm.createContext({cs:[{id:'a',next_date:'2026-12-31'},{id:'b',next_date:'2027-01-01',priority:true},{id:'c',next_date:'2026-12-30'}],todayISO:()=> '2026-12-31',detailId:'a',callQueue:['a','b','c']});
 vm.runInContext(html.slice(html.indexOf('const isDue='),html.indexOf('function customerList('))+html.slice(html.indexOf('function findNextCustomer('),html.indexOf('let nextBarKey=')),ctx);
 assert.deepEqual(Array.from(ctx.todayList(),c=>c.id),['c','a']);assert.equal(ctx.findNextCustomer().id,'c');ctx.cs=ctx.cs.filter(c=>c.id!=='c');assert.equal(ctx.findNextCustomer(),null);
});
