import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {allocateProjectStorage,projectLocations,verifyProjectStorage,moveProjectFiles,deleteProjectFiles} from '../lib/project-storage.mjs';
import {createDesktopShortcut,removeDesktopShortcut,cleanupProjectDocker,windowsScript} from '../lib/desktop-integration.mjs';
import {createApp} from '../server.mjs';
const fixture=async()=>fs.mkdtemp(path.join(os.tmpdir(),'orbit-manage-'));
const cleanup=async directory=>{assert.equal(path.dirname(directory),os.tmpdir());await fs.rm(directory,{recursive:true,force:true});};
const project=()=>({id:'qa-app',fullName:'qa/demo',owner:'qa',name:'demo',mode:'native',trusted:true,status:'ready',language:'HTML',url:'https://github.com/qa/demo'});
test('custom installation and migration preserve neighboring folders and remove only owned files',async()=>{
 const base=await fixture();try{const data=path.join(base,'data'),first=path.join(base,'first'),second=path.join(base,'second');for(const p of [data,first,second])await fs.mkdir(p);await fs.writeFile(path.join(first,'keep.txt'),'keep');const app=project();app.storage=await allocateProjectStorage(app,first);let locations=projectLocations(app,data);await fs.mkdir(locations.source);await fs.mkdir(locations.native);await fs.writeFile(path.join(locations.source,'app.txt'),'source');await fs.writeFile(path.join(locations.native,'app.exe'),'native');const oldRoot=locations.root;
 const result=await moveProjectFiles(app,second,data,async()=>{});locations=result.locations;assert.equal(await fs.readFile(path.join(locations.source,'app.txt'),'utf8'),'source');assert.equal(await fs.readFile(path.join(locations.native,'app.exe'),'utf8'),'native');assert.equal(await fs.stat(oldRoot).catch(()=>null),null);await deleteProjectFiles(app,data);assert.equal(await fs.readFile(path.join(first,'keep.txt'),'utf8'),'keep');assert.equal(await fs.stat(locations.root).catch(()=>null),null);
 }finally{await cleanup(base);}
});
test('missing ownership markers and links cannot authorize deletion; failed moves keep original data',async t=>{
 const base=await fixture();try{const data=path.join(base,'data'),parent=path.join(base,'apps'),other=path.join(base,'other');for(const p of [data,parent,other])await fs.mkdir(p);const app=project();app.storage=await allocateProjectStorage(app,parent);const original=app.storage;const locations=projectLocations(app,data);await fs.mkdir(locations.source);await fs.writeFile(path.join(locations.source,'keep.txt'),'keep');await assert.rejects(moveProjectFiles(app,other,data,async()=>{throw Error('disk failure');}),/disk failure/);assert.equal(app.storage.root,original.root);assert.equal(await fs.readFile(path.join(locations.source,'keep.txt'),'utf8'),'keep');await assert.rejects(moveProjectFiles(app,locations.source,data,async()=>{}),/fora/);
 const marker=path.join(locations.root,'.orbit-installation.json');const saved=await fs.readFile(marker);await fs.unlink(marker);await assert.rejects(deleteProjectFiles(app,data),/não reconhece/);assert.equal(await fs.readFile(path.join(locations.source,'keep.txt'),'utf8'),'keep');await fs.writeFile(marker,saved);
 await fs.mkdir(path.join(data,'projects'));const outside=path.join(base,'outside');await fs.mkdir(outside);await fs.writeFile(path.join(outside,'keep.txt'),'keep');
 try{await fs.symlink(outside,path.join(data,'projects',app.id),'junction');await assert.rejects(deleteProjectFiles({...app,storage:undefined},data),/link|destino/);assert.equal(await fs.readFile(path.join(outside,'keep.txt'),'utf8'),'keep');}catch(error){if(error.code==='EPERM')t.diagnostic('Symlink creation unavailable; marker and rollback assertions passed.');else throw error;}
 }finally{await cleanup(base);}
});

test('an uninstall can retry after its custom installation folder has already been removed',async()=>{
 const base=await fixture();
 try{
  const record=project();
  record.storage=await allocateProjectStorage(record,base);
  await deleteProjectFiles(record,base);
  await assert.rejects(deleteProjectFiles(record,base),/não foi encontrada/);
  await deleteProjectFiles(record,base,{allowMissing:true});
 }finally{await cleanup(base);}
});
test('legacy storage rejects a redirected parent and does not touch the destination',async t=>{
 const base=await fixture();try{const data=path.join(base,'data'),outside=path.join(base,'outside');await fs.mkdir(data);await fs.mkdir(path.join(outside,'qa-app'),{recursive:true});await fs.writeFile(path.join(outside,'qa-app','keep.txt'),'keep');try{await fs.symlink(outside,path.join(data,'projects'),'junction');}catch(error){if(error.code==='EPERM'){t.skip('Junction unavailable');return;}throw error;}await assert.rejects(verifyProjectStorage(project(),data),/redirecionada/);assert.equal(await fs.readFile(path.join(outside,'qa-app','keep.txt'),'utf8'),'keep');}finally{await cleanup(base);}
});
test('desktop shortcuts handle Unicode, preserve changed files and use real Windows icon generation',async()=>{
 const base=await fixture();try{const desktop=path.join(base,'Área de trabalho'),data=path.join(base,'data');await fs.mkdir(desktop);const app={...project(),name:'Aplicação de teste'};const url='http://127.0.0.1:4310/#app/qa-app';app.shortcut=await createDesktopShortcut(app,url,{dataDirectory:data,desktopPath:desktop,makeIcon:process.platform==='win32'});const bytes=await fs.readFile(app.shortcut.path);assert.equal(bytes[0],255);assert.match(bytes.subarray(2).toString('utf16le'),/URL=http:\/\/127/);
 if(process.platform==='win32'){const icon=await fs.readFile(path.join(data,'shortcuts','qa-app.ico'));assert.deepEqual([...icon.subarray(0,4)],[0,0,1,0]);const quote="'"+app.shortcut.path.replace(/'/g,"''")+"'";assert.equal(await windowsScript('$w=New-Object -ComObject WScript.Shell;[Console]::Write($w.CreateShortcut('+quote+').TargetPath)'),url);}
 await fs.appendFile(app.shortcut.path,Buffer.from('changed'));await assert.rejects(removeDesktopShortcut(app,{dataDirectory:data}),/alterado/);assert.ok(await fs.stat(app.shortcut.path));await fs.writeFile(app.shortcut.path,Buffer.concat([Buffer.from([255,254]),Buffer.from(app.shortcut.content,'utf16le')]));await removeDesktopShortcut(app,{dataDirectory:data});assert.equal(await fs.stat(app.shortcut.path).catch(()=>null),null);
 }finally{await cleanup(base);}
});
test('Docker cleanup requires project ownership and never removes shared image tags',async()=>{
 const calls=[];const app=project();const run=async args=>{calls.push(args);if(args[0]==='info')return{ok:true,output:'1'};if(args[0]==='container'&&args[1]==='inspect')return{ok:true,output:JSON.stringify([{Config:{Labels:{'orbit.project':app.id,'orbit.managed':'true'}},Mounts:[{Name:'orbit-data-'+app.id}]}])};if(args[1]==='inspect')return{ok:true,output:'[{}]'};return{ok:true,output:''};};assert.deepEqual(await cleanupProjectDocker(app,{run}),[]);assert.ok(calls.some(args=>args.join(' ')==='image rm orbit-project-qa-app:latest'));assert.ok(!calls.some(args=>args.includes('prune')));await assert.rejects(cleanupProjectDocker(app,{run:async args=>args[0]==='info'?{ok:true,output:'1'}:{ok:true,output:'[{"Config":{"Labels":{}}}]'}}),/não pertence/);
});

test('Docker cleanup starts the engine and reports a startup failure before deleting anything',async()=>{
 let readyCalls=0;
 const run=async args=>args[0]==='info'?{ok:false,output:'offline'}:{ok:false,output:'No such object'};
 assert.deepEqual(await cleanupProjectDocker(project(),{run,ready:async()=>{readyCalls++;}}),[]);
 assert.equal(readyCalls,1);
 await assert.rejects(cleanupProjectDocker(project(),{run,ready:async()=>{throw Error('startup failure');}}),/startup failure/);
});

test('incomplete Docker cleanup preserves the project for retry after a restart',async()=>{
 const base=await fixture();let app;
 try{
  const data=path.join(base,'data'),record=project();
  for(const folder of ['projects','docker'])await fs.mkdir(path.join(data,folder,record.id),{recursive:true});
  await fs.writeFile(path.join(data,'projects',record.id,'index.html'),'app');
  await fs.writeFile(path.join(data,'state.json'),JSON.stringify({projects:[record],events:[]}));
  let warning=true,calls=0;
  const options={dataDirectory:data,port:0,backgroundReleaseChecks:false,managementServices:{cleanupDocker:async()=>{calls++;return warning?['Docker offline']:[];}}};
  app=await createApp(options);
  const uninstall=()=>fetch(app.url+'/api/projects/'+record.id+'/uninstall',{method:'POST',headers:{'Content-Type':'application/json','X-Orbit-Token':app.token},body:JSON.stringify({confirm:record.fullName})});
  assert.equal((await uninstall()).status,503);
  assert.equal(app.state.projects[0].uninstallDockerPending,true);
  assert.equal(app.state.projects[0].uninstallProgress.step,'docker');
  assert.ok(await fs.stat(path.join(data,'projects',record.id,'index.html')));
  await app.close();app=await createApp(options);
  assert.equal(app.state.projects[0].uninstallDockerPending,true);
  assert.deepEqual(app.state.projects[0].uninstallProgress.completed,[]);
  warning=false;
  assert.equal((await uninstall()).status,200);
  assert.equal(calls,2);
  assert.equal(app.state.projects.length,0);
  assert.equal(await fs.stat(path.join(data,'projects',record.id)).catch(()=>null),null);
 }finally{await app?.close();await cleanup(base);}
});

test('Android warnings require evidence that an app was installed on a device',async()=>{
 const base=await fixture();let app;
 try{
  const data=path.join(base,'data'),record=project();
  await fs.mkdir(path.join(data,'projects',record.id),{recursive:true});
  await fs.writeFile(path.join(data,'projects',record.id,'AndroidManifest.xml'),'<manifest package="qa.demo"/>');
  await fs.writeFile(path.join(data,'projects',record.id,'build.gradle'),'plugins { id "com.android.application" }');
  await fs.writeFile(path.join(data,'state.json'),JSON.stringify({projects:[record],events:[]}));
  app=await createApp({dataDirectory:data,port:0,backgroundReleaseChecks:false});
  assert.equal(app.state.projects[0].kind,'android');
  const response=await fetch(app.url+'/api/projects/'+record.id+'/uninstall',{method:'POST',headers:{'Content-Type':'application/json','X-Orbit-Token':app.token},body:JSON.stringify({confirm:record.fullName})});
  assert.equal(response.status,200);
  assert.equal((await response.json()).android,false);
 }finally{await app?.close();await cleanup(base);}
});
test('management API authenticates, migrates, creates shortcuts, preserves on removal and uninstalls only confirmed apps',async()=>{
 const base=await fixture();let app;try{const data=path.join(base,'data'),target=path.join(base,'target'),desktop=path.join(base,'desktop');for(const p of [target,desktop,path.join(data,'projects','qa-app')])await fs.mkdir(p,{recursive:true});const record=project();await fs.writeFile(path.join(data,'projects','qa-app','index.html'),'app');await fs.writeFile(path.join(data,'state.json'),JSON.stringify({projects:[record],events:[]}));const options={dataDirectory:data,port:0,allowNative:true,backgroundReleaseChecks:false,managementServices:{chooseFolder:async()=>({cancelled:true,path:''}),createShortcut:(p,url)=>createDesktopShortcut(p,url,{dataDirectory:data,desktopPath:desktop,makeIcon:false}),removeShortcut:p=>removeDesktopShortcut(p,{dataDirectory:data}),cleanupDocker:async()=>[]}};
 app=await createApp(options);let headers={'Content-Type':'application/json','X-Orbit-Token':app.token};const post=(endpoint,input={})=>fetch(app.url+endpoint,{method:'POST',headers,body:JSON.stringify(input)});
 assert.equal((await fetch(app.url+'/api/storage/choose',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,403);assert.equal((await (await post('/api/storage/choose')).json()).cancelled,true);
 assert.equal((await post('/api/projects/qa-app/uninstall',{confirm:'wrong'})).status,400);assert.ok(await fs.stat(path.join(data,'projects','qa-app','index.html')));
 let result=await post('/api/projects/qa-app/storage',{parent:target});assert.equal(result.status,200);const moved=(await result.json()).project;assert.ok(moved.storage.root.startsWith(target));assert.equal(await fs.readFile(path.join(app.directory(moved),'index.html'),'utf8'),'app');
 assert.equal((await post('/api/projects/qa-app/shortcut')).status,200);const shortcutPath=app.state.projects[0].shortcut.path;assert.ok(await fs.stat(shortcutPath));await app.close();app=await createApp(options);headers={'Content-Type':'application/json','X-Orbit-Token':app.token};assert.equal(app.state.projects[0].storage.root,moved.storage.root);
 result=await fetch(app.url+'/api/projects/qa-app',{method:'DELETE',headers,body:'{}'});assert.equal(result.status,200);assert.ok(await fs.stat(path.join(moved.storage.root,'source','index.html')));assert.equal(await fs.stat(shortcutPath).catch(()=>null),null);
 app.state.projects.push({...record,storage:moved.storage});assert.equal((await post('/api/projects/qa-app/uninstall',{confirm:record.fullName})).status,200);assert.equal(app.state.projects.length,0);assert.equal(await fs.stat(moved.storage.root).catch(()=>null),null);
 }finally{await app?.close();await cleanup(base);}
});

test('new imports use the chosen folder and create only requested shortcuts after cloning',async()=>{
 const base=await fixture();let app;try{const data=path.join(base,'data'),parent=path.join(base,'Apps escolhidos'),desktop=path.join(base,'desktop');await fs.mkdir(parent);await fs.mkdir(desktop);app=await createApp({dataDirectory:data,port:0,backgroundReleaseChecks:false,managementServices:{cloneCommand:(_repo,target)=>({executable:process.execPath,args:['-e','const fs=require("fs");fs.mkdirSync(process.argv[1],{recursive:true});fs.writeFileSync(require("path").join(process.argv[1],"index.html"),"app");',target]}),createShortcut:(p,url)=>createDesktopShortcut(p,url,{dataDirectory:data,desktopPath:desktop,makeIcon:false})}});
 const headers={'Content-Type':'application/json','X-Orbit-Token':app.token};const response=await fetch(app.url+'/api/projects',{method:'POST',headers,body:JSON.stringify({url:'qa/import-fixture',installationParent:parent,desktopShortcut:true})});assert.equal(response.status,202);const record=await response.json();for(let i=0;i<200&&app.jobs.has(record.id);i++)await new Promise(resolve=>setTimeout(resolve,25));const saved=app.state.projects.find(p=>p.id===record.id);assert.equal(saved.status,'ready');assert.ok(saved.shortcut);assert.ok(await fs.stat(saved.shortcut.path));assert.ok(saved.installationPath.startsWith(parent));assert.ok(await fs.stat(path.join(saved.storage.root,'source','index.html')));
 }finally{await app?.close();await cleanup(base);}
});
test('native actions receive the selected cache paths after moving an app',async()=>{
 const base=await fixture();let app;try{const data=path.join(base,'data'),parent=path.join(base,'apps');await fs.mkdir(parent);const record=project();record.storage=await allocateProjectStorage(record,parent);const locations=projectLocations(record,data);await fs.mkdir(locations.source);await fs.writeFile(path.join(locations.source,'index.html'),'app');record.command='node -e "const fs=require(\'fs\');fs.mkdirSync(process.env.ORBIT_NATIVE_DIRECTORY,{recursive:true});fs.writeFileSync(require(\'path\').join(process.env.ORBIT_NATIVE_DIRECTORY,\'probe.txt\'),process.env.ORBIT_DOCKER_DIRECTORY)"';await fs.mkdir(data);await fs.writeFile(path.join(data,'state.json'),JSON.stringify({projects:[record],events:[]}));app=await createApp({dataDirectory:data,port:0,allowNative:true,backgroundReleaseChecks:false});const response=await fetch(app.url+'/api/projects/qa-app/start',{method:'POST',headers:{'Content-Type':'application/json','X-Orbit-Token':app.token},body:'{}'});assert.equal(response.status,202);for(let i=0;i<200&&app.jobs.has(record.id);i++)await new Promise(resolve=>setTimeout(resolve,25));assert.equal(app.state.projects[0].status,'ready');assert.equal(await fs.readFile(path.join(locations.native,'probe.txt'),'utf8'),locations.docker);
 }finally{await app?.close();await cleanup(base);}
});

test('installation parents cannot be nested inside another managed app',async()=>{
 const base=await fixture();try{const app=project();app.storage=await allocateProjectStorage(app,base);const inside=path.join(app.storage.root,'source');await fs.mkdir(inside);await assert.rejects(allocateProjectStorage({...app,id:'other-app',name:'other'},inside),/fora de outra instalação/);assert.ok(await fs.stat(app.storage.root));}finally{await cleanup(base);}
});

test('readable shortcut names migrate owned legacy names and preserve collisions',async()=>{
 const base=await fixture();try{const desktop=path.join(base,'desktop'),data=path.join(base,'data');await fs.mkdir(desktop);const app=project(),url='http://127.0.0.1:4310/#app/qa-app';let created=await createDesktopShortcut(app,url,{dataDirectory:data,desktopPath:desktop,makeIcon:false});assert.equal(path.basename(created.path),'demo (qa) - Orbit.url');assert.ok(!path.basename(created.path).includes(app.id));const old=path.join(desktop,'demo - Orbit qa-app.url');await fs.rename(created.path,old);app.shortcut={...created,path:old};created=await createDesktopShortcut(app,url,{dataDirectory:data,desktopPath:desktop,makeIcon:false});assert.equal(await fs.stat(old).catch(()=>null),null);assert.equal(path.basename(created.path),'demo (qa) - Orbit.url');app.shortcut=created;await removeDesktopShortcut(app,{dataDirectory:data});
 await fs.writeFile(created.path,'user file');delete app.shortcut;await assert.rejects(createDesktopShortcut(app,url,{dataDirectory:data,desktopPath:desktop,makeIcon:false}),/Já existe/);assert.equal(await fs.readFile(created.path,'utf8'),'user file');
 }finally{await cleanup(base);}
});

test('named folders reserve existing paths and let legacy projects move their files',async()=>{
 const base=await fixture();
 let app;
 try{
  const data=path.join(base,'data'),parent=path.join(data,'projects'),record=project();
  const old=projectLocations(record,data);
  await fs.mkdir(old.source,{recursive:true});
  await fs.mkdir(old.native,{recursive:true});
  await fs.writeFile(path.join(old.source,'index.html'),'legacy source');
  record.executable=path.join(old.native,'demo.exe');
  await fs.writeFile(record.executable,'legacy executable');
  const occupied=path.join(parent,'demo');
  await fs.mkdir(occupied);
  await fs.writeFile(path.join(occupied,'keep.txt'),'keep');
  await fs.writeFile(path.join(data,'state.json'),JSON.stringify({projects:[record],events:[]}));
  const options={dataDirectory:data,port:0,backgroundReleaseChecks:false,managementServices:{
   cloneCommand:(_repo,directory)=>({executable:process.execPath,args:['-e',
    "const fs=require('node:fs');fs.mkdirSync(process.argv[1],{recursive:true});fs.writeFileSync(require('node:path').join(process.argv[1],'index.html'),'new source')",directory]})
  }};
  app=await createApp(options);
  const post=(endpoint,body)=>fetch(app.url+'/api'+endpoint,{method:'POST',headers:{'X-Orbit-Token':app.token,'Content-Type':'application/json'},body:JSON.stringify(body)});
  const rename=await post('/projects/'+record.id+'/storage',{useProjectName:true});
  assert.equal(rename.status,200);
  const {project:moved,warnings}=await rename.json();
  assert.deepEqual(warnings,[]);
  assert.equal(moved.installationPath,path.join(parent,'demo-qa'));
  assert.equal(await fs.readFile(path.join(moved.storage.root,'source','index.html'),'utf8'),'legacy source');
  assert.equal(await fs.readFile(moved.executable,'utf8'),'legacy executable');
  assert.equal(await fs.stat(old.source).catch(()=>null),null);
  const imported=await post('/projects',{url:'other/demo'});
  assert.equal(imported.status,202);
  const next=await imported.json();
  assert.equal(next.installationPath,path.join(parent,'demo-other'));
  for(let i=0;i<200&&app.jobs.has(next.id);i++)await new Promise(resolve=>setTimeout(resolve,25));
  assert.equal(app.state.projects.find(item=>item.id===next.id).status,'ready');
  assert.equal(await fs.readFile(path.join(next.storage.root,'source','index.html'),'utf8'),'new source');
  assert.equal(await fs.readFile(path.join(occupied,'keep.txt'),'utf8'),'keep');
  await app.close();
  app=await createApp(options);
  assert.equal(app.state.projects.find(item=>item.id===record.id).installationPath,moved.installationPath);
 }finally{await app?.close();await cleanup(base);}
});

