const {test}=require('node:test');
const assert=require('node:assert/strict');
const legacyModule={exports:{}};new Function('module',require('node:fs').readFileSync(require('node:path').join(__dirname,'../src/safety.js'),'utf8'))(legacyModule);const s=legacyModule.exports;
const payload=()=>({title:'Demo',menuData:[{title:'Program blocks',items:[{text:'Main [OB1]',link:'pdf/main.pdf'}]}]});
test('legacy object and menu array roundtrip',()=>{
 assert.deepEqual(s.project(JSON.stringify(payload())),payload());
 assert.deepEqual(s.project(payload().menuData),{menuData:payload().menuData});
});
test('invalid, empty and excessive structures are rejected',()=>{
 for(const v of ['','null','{}','{"menuData":[{}]}','{',JSON.stringify({menuData:[{title:2,items:[]}]})]) assert.throws(()=>s.project(v));
 let nodes=[]; for(let i=0;i<35;i++) nodes=[{text:'g',children:nodes}];
 assert.throws(()=>s.project({menuData:[{title:'x',items:nodes}]}));
 assert.throws(()=>s.project(' '.repeat(s.MAX_BYTES+1)));
});
test('URL policy rejects executable and ambiguous schemes',()=>{
 for(const u of ['javascript:alert(1)','data:text/html,x','file:///tmp/x','//user:pass@example.com','https://x/\nfoo','\\evil.test/x']) assert.throws(()=>s.safeUrl(u));
 for(const u of ['pdf/a.pdf','https://example.com/a.pdf','../a%20b.pdf']) assert.equal(s.safeUrl(u),u);
});
test('catalog validates all entries and duplicate identities',()=>{
 const p={id:'project-1',name:'x',inlineData:JSON.stringify(payload())};
 assert.deepEqual(s.list([p]),[p]);
 for(const list of [[p,p],[null],[{id:'" onclick="x'}],[{inlineData:'{}'}]]) assert.throws(()=>s.list(list));
});
test('file limit and HTML escaping',()=>{
 for(const size of [0,s.MAX_BYTES+1]) assert.throws(()=>s.file({size}));
 s.file({size:20}); assert.equal(s.escapeHtml('<img "&\'>'),'&lt;img &quot;&amp;&#39;&gt;');
});
function memory(){ const map=new Map();return {getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)}; }
test('quota failure retains committed data and exposes failure',()=>{
 const native=memory(); native.setItem('ppv.projects','[]');
 let notified=0; const store=s.storage(native,()=>notified++);
 native.setItem=()=>{throw Error('QuotaExceededError');};
 assert.throws(()=>store.setItem('ppv.projects','[]')); assert.equal(native.getItem('ppv.projects'),'[]'); assert.equal(store.failed,true); assert.equal(notified,1);
});
test('stale catalog writes are refused',()=>{
 const native=memory(), a=s.storage(native), b=s.storage(native);
 a.setItem('ppv.projects','[]'); assert.throws(()=>b.setItem('ppv.projects','[]'));
 b.getItem('ppv.projects'); b.setItem('ppv.projects','[]'); assert.equal(b.failed,false);
});
test('project update targets only matching ID and keeps other project edits',()=>{
 const a={id:'a',name:'same',inlineData:JSON.stringify(payload())};
 const b={...a,id:'b'};const expected=JSON.stringify(a);
 const changedB={...b,description:'new'};
 const result=s.updateProject([a,changedB],'a',expected,{...payload(),title:'Changed'});
 assert.deepEqual(result.list[1],changedB);assert.equal(result.list[0].name,'Changed');assert.equal(a.name,'same');
 assert.throws(()=>s.updateProject([a,b],'missing',expected,payload()));
 assert.throws(()=>s.updateProject(result.list,'a',expected,payload()));
});
