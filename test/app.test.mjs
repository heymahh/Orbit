import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import http from 'node:http';
import path from 'node:path';
import { createApp } from '../server.mjs';
import { parseRepository, safePath, detectProject, dockerArguments } from '../lib/runner.mjs';

test('GitHub URLs are normalized without accepting foreign hosts or injected arguments', () => {
  assert.equal(parseRepository('vitejs/vite').url, 'https://github.com/vitejs/vite');
  assert.equal(parseRepository('https://github.com/owner/repo.git').name,'repo');
  for (const url of ['http://github.com/a/b','https://evil.test/a/b','https://github.com.evil.test/a/b','https://user:pass@github.com/a/b','https://github.com:4430/a/b','https://github.com/a/b/tree/main','https://github.com/-a/b','file:///a/b','a/b && whoami','https://github.com/a/b?x=1']) assert.throws(() => parseRepository(url), url);
});

test('manifest detection suggests executable scripts, leaves libraries without commands', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(),'orbit-detect-'));
  try {
    await fs.writeFile(path.join(root,'package.json'),JSON.stringify({scripts:{dev:'vite'}}));
    assert.equal((await detectProject(root)).command,'npm run dev');
    await fs.writeFile(path.join(root,'package.json'),'{}');
    assert.equal((await detectProject(root)).command,'');
    await fs.unlink(path.join(root,'package.json'));
    await fs.writeFile(path.join(root,'requirements.txt'),'');
    await fs.writeFile(path.join(root,'app.py'),'print("ok")');
    const python = await detectProject(root);
    assert.equal(python.language,'Python'); assert.equal(python.command,'python app.py');
    assert.equal(python.install,'python -m pip install -r requirements.txt');
    await fs.writeFile(path.join(root,'package.json'),'{bad');
    assert.match((await detectProject(root)).note,/inválido/);
  } finally { await fs.rm(root,{recursive:true,force:true}); }
});

test('file browsing rejects traversal and symlink escapes', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(),'orbit-path-'));
  try {
    const project = path.join(root,'project'); await fs.mkdir(project);
    await fs.writeFile(path.join(project,'hello.txt'),'hello');
    await fs.writeFile(path.join(root,'secret.txt'),'secret');
    assert.equal(await safePath(project,'hello.txt'), await fs.realpath(path.join(project,'hello.txt')));
    await assert.rejects(safePath(project,'../secret.txt'),/dentro do projeto/);
    try { await fs.symlink(path.join(root,'secret.txt'),path.join(project,'link.txt')); await assert.rejects(safePath(project,'link.txt'),/dentro do projeto/); }
    catch (error) { if (error.code !== 'EPERM') throw error; t.diagnostic('Windows does not allow symlink creation for this account. Traversal assertion passed.'); }
  } finally { await fs.rm(root,{recursive:true,force:true}); }
});

test('Docker restricts resources, permissions, mounts and published ports', () => {
  const args = dockerArguments({image:'node:22-bookworm',network:false,port:8000},'C:\\projects\\demo','node app.js','orbit-test');
  assert.ok(args.includes('--network=none')); assert.ok(args.includes('--cap-drop=ALL'));
  assert.ok(args.includes('--security-opt=no-new-privileges')); assert.ok(args.includes('--pids-limit=256'));
  assert.ok(args.includes('127.0.0.1:8000:8000')); assert.ok(!args.includes('--privileged'));
  assert.ok(!args.some(arg => arg.includes('docker.sock')));
  assert.deepEqual(args.slice(-4),['node:22-bookworm','sh','-lc','node app.js']);
  assert.throws(() => dockerArguments({image:'--privileged'},'/tmp/demo','id','orbit-test'));
  assert.throws(() => dockerArguments({image:'node',port:80},'/tmp/demo','id','orbit-test'));
});

test('local service authenticates requests, executes and stops processes, persists state', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(),'orbit-service-'));
  const id = 'fixture-project';
  const projectDirectory = path.join(root,'projects',id);
  await fs.mkdir(projectDirectory,{recursive:true});
  await fs.writeFile(path.join(projectDirectory,'hello.mjs'),'console.log("ORBIT_NATIVE_OK");');
  await fs.writeFile(path.join(projectDirectory,'wait.mjs'),'console.log("ORBIT_WAITING"); setInterval(()=>{},1000);');
  await fs.writeFile(path.join(projectDirectory,'README.md'),'# Fixture project');
  const fixture = {id,name:'fixture',owner:'local',fullName:'local/fixture',url:'https://github.com/local/fixture',status:'ready',language:'JavaScript',mode:'native',network:true,port:0,image:'node:22-bookworm',install:'node hello.mjs',command:'node hello.mjs',trusted:false};
  await fs.writeFile(path.join(root,'state.json'),JSON.stringify({projects:[fixture],events:[]}));
  const app = await createApp({dataDirectory:root,port:0,allowNative:true});
  let fixtureActivityId;
  const request = (endpoint,options={}) => fetch(app.url + endpoint,{...options,headers:{'X-Orbit-Token':app.token,'Content-Type':'application/json',...options.headers}});
  const waitFor = async predicate => { const deadline = Date.now()+10000; while(Date.now()<deadline) { if (predicate()) return; await new Promise(resolve=>setTimeout(resolve,50)); } throw new Error('Timed out waiting for process'); };
  try {
    await t.test('session and security headers', async () => {
      const session = await fetch(app.url+'/api/session');
      const sessionData=await session.json();
      assert.equal(sessionData.token,app.token);
      assert.equal(sessionData.capabilities.ranking,true);
      assert.equal(sessionData.capabilities.avatars,true);
      assert.equal(sessionData.capabilities.projectImages,true);
      assert.match(session.headers.get('content-security-policy'),/frame-ancestors 'none'/);
      assert.equal((await fetch(app.url+'/api/state')).status,403);
      assert.equal((await request('/api/state',{headers:{Origin:'https://evil.test'}})).status,403);
      const badHostStatus = await new Promise((resolve,reject) => { const req = http.get(app.url+'/api/session',{headers:{Host:'evil.test'}},res=>{res.resume();resolve(res.statusCode);}); req.on('error',reject); });
      assert.equal(badHostStatus,403);
      assert.equal((await fetch(app.url+'/api/session',{headers:{'Sec-Fetch-Site':'cross-site'}})).status,403);
    });
    await t.test('rejects execution before project trust and validates configuration', async () => {
      assert.equal((await request('/api/projects/'+id+'/start',{method:'POST',body:'{}'})).status,400);
      assert.equal((await request('/api/projects/'+id+'/config',{method:'POST',body:JSON.stringify({...fixture,mode:'remote'})})).status,400);
      assert.equal((await request('/api/projects/'+id+'/config',{method:'POST',body:JSON.stringify({...fixture,port:22})})).status,400);
      assert.equal((await request('/api/projects/'+id+'/config',{method:'POST',body:JSON.stringify({...fixture,trusted:true})})).status,200);
    });
    await t.test('reads text and rejects traversal over HTTP',async () => {
      const response=await request('/api/projects/'+id+'/file?path=README.md');
      assert.equal((await response.json()).content,'# Fixture project');
      assert.equal((await request('/api/projects/'+id+'/file?path='+encodeURIComponent('../../../state.json'))).status,400);
    });
    await t.test('runs real native commands and captures output', async () => {
      assert.equal((await request('/api/projects/'+id+'/start',{method:'POST',body:'{}'})).status,202);
      await waitFor(()=>!app.jobs.has(id));
      assert.equal(app.state.projects[0].status,'ready');
      const payload = await (await request('/api/projects/'+id+'/logs')).json();
      assert.ok(payload.entries.some(entry=>entry.text.includes('ORBIT_NATIVE_OK')));
      const events=app.state.events.filter(entry=>entry.projectId===id);
      assert.equal(events.length,1); assert.equal(events[0].status,'ready'); assert.equal(events[0].percent,100); fixtureActivityId=events[0].id;
    });
    await t.test('locks configuration while running and stops the process tree', async () => {
      await request('/api/projects/'+id+'/config',{method:'POST',body:JSON.stringify({...fixture,trusted:true,command:'node wait.mjs'})});
      assert.equal((await request('/api/projects/'+id+'/start',{method:'POST',body:'{}'})).status,202);
      assert.equal((await request('/api/projects/'+id+'/start',{method:'POST',body:'{}'})).status,409);
      assert.equal((await request('/api/projects/'+id+'/config',{method:'POST',body:JSON.stringify({...fixture,trusted:true})})).status,409);
      await new Promise(resolve=>setTimeout(resolve,300));
      assert.equal((await request('/api/projects/'+id+'/stop',{method:'POST',body:'{}'})).status,200);
      await waitFor(()=>!app.jobs.has(id));
      assert.equal(app.state.projects[0].status,'stopped');
      const entries=app.state.events.filter(entry=>entry.projectId===id); assert.equal(entries.length,1); assert.equal(entries[0].id,fixtureActivityId); assert.equal(entries[0].status,'stopped');
    });
    await t.test('reports command failures', async () => {
      await request('/api/projects/'+id+'/config',{method:'POST',body:JSON.stringify({...fixture,trusted:true,command:'node missing.mjs'})});
      await request('/api/projects/'+id+'/start',{method:'POST',body:'{}'});
      await waitFor(()=>!app.jobs.has(id));
      assert.equal(app.state.projects[0].status,'error');
      // A falha chega traduzida: o módulo que falta, e não só o código de saída.
      assert.match(app.state.projects[0].lastError,/Falta o módulo .*missing\.mjs/);
      const entries=app.state.events.filter(entry=>entry.projectId===id); assert.equal(entries.length,1); assert.equal(entries[0].id,fixtureActivityId); assert.equal(entries[0].status,'error'); assert.equal(entries[0].percent,null);
    });
    await t.test('removal preserves downloaded files', async () => {
      assert.equal((await request('/api/projects/'+id,{method:'DELETE',body:'{}'})).status,200);
      assert.equal(app.state.projects.length,0);
      assert.equal(await fs.readFile(path.join(projectDirectory,'README.md'),'utf8'),'# Fixture project');
    });
  } finally { await app.close(); }
  const saved = JSON.parse(await fs.readFile(path.join(root,'state.json'),'utf8'));
  assert.equal(saved.projects.length,0); assert.ok(saved.events.length>0);
  await fs.rm(root,{recursive:true,force:true});
});

test('restart marks unfinished work as interrupted',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'orbit-restart-'));
  await fs.writeFile(path.join(root,'state.json'),JSON.stringify({projects:[{id:'aborted',status:'running'}],events:[]}));
  const app=await createApp({dataDirectory:root,port:0,allowNative:true});
  try { assert.equal(app.state.projects[0].status,'interrupted'); }
  finally { await app.close(); await fs.rm(root,{recursive:true,force:true}); }
});
