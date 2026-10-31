const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {createServer}=require('node:http');
const {readFile}=require('node:fs/promises');
const path=require('node:path');
let playwright;try{playwright=require('playwright');}catch{playwright=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright');}
let browser,server,base;
const project=(id,title)=>({id,name:title,inlineData:JSON.stringify({title,menuData:[{title:'Program blocks',icon:'<img src=x onerror="window.pwned=1">',items:[]}]})});
before(async()=>{
 server=createServer(async(req,res)=>{try{const file=path.resolve(__dirname,'..','.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!file.startsWith(path.resolve(__dirname,'..')+path.sep)) throw Error();const data=await readFile(file);res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.json')?'application/json':'text/html');res.end(data);}catch{res.statusCode=404;res.end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${server.address().port}`;
 browser=await playwright.chromium.launch({headless:true});
});
after(async()=>{await browser?.close();server?.close();});
async function setup(list=[project('a','Alpha'),project('b','Beta')]){
 const context=await browser.newContext();const page=await context.newPage();
 await page.goto(base+'/index.html');await page.evaluate(list=>localStorage.setItem('ppv.projects',JSON.stringify(list)),list);await page.reload();return {context,page};
}
async function add(page,type,name){
 await page.click(type==='group'?'#addGroup':'#addBlock');await page.fill('#newName',name);if(type!=='group')await page.fill('#newLink','pdf/main.pdf');await page.selectOption('#targetPath','0');await page.click('#confirmAdd');
}
test('create template, edit groups/blocks, export and reload',async()=>{
 const {context,page}=await setup();
 await page.click('#openDefaultBtn');await page.waitForURL('**/viewer.html?**');await page.click('#toggleEdit');
 await add(page,'group','Group > with separator');await add(page,'block','Main [OB1]');
 assert.equal(await page.locator('.group-label').count(),2);
 await page.locator('.menu-row').filter({hasText:'Main [OB1]'}).getByRole('button',{name:'✏️'}).click();
 await page.fill('#editText','Main changed [OB1]');await page.click('#confirmEdit');
 const downloadPromise=page.waitForEvent('download');await page.click('#saveJson');const download=await downloadPromise;assert.equal(download.suggestedFilename(),'project.json');
 await page.reload();assert.equal(await page.getByText('Main changed [OB1]',{exact:true}).count(),1);
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.click('#helpBtn');
 await page.frameLocator('#pdfViewer').locator('.lang.active').waitFor();
 await context.close();
});
test('two projects stay isolated, same-project stale edits and deleted IDs cannot overwrite',async()=>{
 const {context,page}=await setup();await page.goto(base+'/viewer.html?pid=a');
 const second=await context.newPage();await second.goto(base+'/viewer.html?pid=b');
 await page.click('#toggleEdit');await add(page,'group','Only A');
 await second.click('#toggleEdit');await add(second,'group','Only B');
 const data=await page.evaluate(()=>JSON.parse(localStorage.getItem('ppv.projects')));
 assert.match(data[0].inlineData,/Only A/);assert.doesNotMatch(data[0].inlineData,/Only B/);assert.match(data[1].inlineData,/Only B/);
 const stale=await context.newPage();await stale.goto(base+'/viewer.html?pid=a');
 await add(page,'group','New A');
 const alerts=[];stale.on('dialog',async d=>{alerts.push(d.message());await d.accept();});
 await stale.click('#toggleEdit');await add(stale,'group','Stale A');
 assert.ok(alerts.some(x=>x.includes('Nie zapisano')));
 assert.doesNotMatch(await page.evaluate(()=>localStorage.getItem('ppv.projects')),/Stale A/);
 const missing=await context.newPage();missing.on('dialog',d=>d.accept());await missing.goto(base+'/viewer.html?pid=missing');
 assert.doesNotMatch(await page.evaluate(()=>localStorage.getItem('ppv.projects')),/missing/);
 await context.close();
});
test('untrusted titles and section icons do not execute, invalid import leaves catalog intact',async()=>{
 const {context,page}=await setup([project('a','<img src=x onerror="window.pwned=1">')]);
 assert.equal(await page.locator('.card h3 img').count(),0);assert.equal(await page.evaluate(()=>window.pwned),undefined);
 const before=await page.evaluate(()=>localStorage.getItem('ppv.projects'));page.on('dialog',d=>d.accept());
 await page.setInputFiles('#importFile',{name:'bad.json',mimeType:'application/json',buffer:Buffer.from('[null]')});
 assert.equal(await page.evaluate(()=>localStorage.getItem('ppv.projects')),before);
 await page.goto(base+'/viewer.html?pid=a');assert.equal(await page.locator('h4 img').getAttribute('src'),'images/program_blocks.png');assert.equal(await page.evaluate(()=>window.pwned),undefined);
 await context.close();
});
test('duplicate, description, delete, full export/import and small viewport',async()=>{
 const {context,page}=await setup();
 async function action(name){await page.locator('.card').first().locator('.kebab').click();await page.locator('.menu.open').getByRole('button',{name,exact:false}).click();}
 await action('Duplicate');assert.equal(await page.locator('.card').count(),3);
 await action('Edit description');await page.fill('#idxInput','Description test');await page.click('#idxOk');assert.equal(await page.locator('.card').first().locator('.desc').innerText(),'Description test');
 const raw=await page.evaluate(()=>localStorage.getItem('ppv.projects'));
 const dl=page.waitForEvent('download');await page.click('#exportBtn');assert.equal((await dl).suggestedFilename(),'projects.json');
 await action('Delete');await page.click('#idxYes');assert.equal(await page.locator('.card').count(),2);
 page.on('dialog',d=>d.accept());await page.setInputFiles('#importFile',{name:'projects.json',mimeType:'application/json',buffer:Buffer.from(raw)});await page.locator('.card').nth(2).waitFor();assert.equal(await page.locator('.card').count(),3);
 await page.setViewportSize({width:390,height:844});assert.equal(await page.locator('#addBtn').isVisible(),true);
 await page.reload();assert.equal(await page.locator('.card').count(),3);await context.close();
});
test('corrupt catalog and quota failure keep stored bytes, empty catalog stays empty',async()=>{
 const {context,page}=await setup([]);assert.equal(await page.locator('.card').count(),0);
 await page.evaluate(()=>localStorage.setItem('ppv.projects','{broken'));
 const alerts=[];page.on('dialog',async d=>{alerts.push(d.message());await d.accept();});await page.reload();
 await page.click('#openDefaultBtn');assert.equal(await page.evaluate(()=>localStorage.getItem('ppv.projects')),'{broken');
 assert.ok(alerts.some(x=>x.includes('Zapis zablokowany')));
 await page.evaluate(list=>localStorage.setItem('ppv.projects',JSON.stringify(list)),[project('a','Alpha')]);
 await page.goto(base+'/viewer.html?pid=a');const before=await page.evaluate(()=>localStorage.getItem('ppv.projects'));
 await page.evaluate(()=>{const old=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='ppv.projects')throw new DOMException('quota','QuotaExceededError');return old.call(this,k,v);};});
 await page.click('#toggleEdit');await add(page,'group','Not committed');
 assert.equal(await page.evaluate(()=>localStorage.getItem('ppv.projects')),before);
 assert.ok(alerts.some(x=>x.includes('Nie zapisano')));
 const dl=page.waitForEvent('download');await page.click('#saveJson');assert.equal((await dl).suggestedFilename(),'project.json');
 await context.close();
});
