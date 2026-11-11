import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server.mjs';

test('a published Windows build takes precedence over source and a failed update preserves the installed release', {skip:process.platform !== 'win32'}, async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-plan-'));
  const executable = Buffer.alloc(512);
  executable.write('MZ', 0, 'latin1');
  executable.writeUInt32LE(128, 60);
  executable.write('PE\0\0', 128, 'latin1');
  executable.writeUInt16LE(2, 128 + 24 + 68);
  const digest = 'sha256:' + createHash('sha256').update(executable).digest('hex');
  let corrupt = true;
  const download = http.createServer((request, response) => {
    response.end(corrupt ? Buffer.alloc(executable.length) : executable);
  });
  await new Promise(resolve => download.listen(0,'127.0.0.1',resolve));
  let app;
  try {
    const fullName = 'owner/app';
    const project = {id:'portable',name:'App',fullName,url:'https://github.com/' + fullName,status:'ready',
      installedRelease:{id:'1',tag:'v1.0.0'},releaseTracking:{compatible:{id:'2',tag:'v2.0.0'}}};
    const source = path.join(root,'projects',project.id);
    const previous = path.join(root,'native',project.id,'v1.0.0','app');
    await fs.mkdir(source,{recursive:true});
    await fs.mkdir(previous,{recursive:true});
    await fs.writeFile(path.join(source,'index.html'),'<h1>App</h1>');
    await fs.writeFile(path.join(previous,'App.exe'),executable);
    await fs.writeFile(path.join(root,'state.json'),JSON.stringify({projects:[project],events:[]}));
    const asset = {name:'App.exe',size:executable.length,digest,browser_download_url:'http://127.0.0.1:' + download.address().port};
    const release = {id:2,tag_name:'v2.0.0',body:'Novidades',assets:[asset],published_at:'2026-10-01T00:00:00Z'};
    app = await createApp({dataDirectory:root,port:0,backgroundReleaseChecks:false,releaseGithub:async () => [release]});
    const endpoint = app.url + '/api/projects/' + project.id + '/';
    const headers = {'X-Orbit-Token':app.token,'Content-Type':'application/json'};
    const read = route => fetch(endpoint + route,{headers}).then(response => response.json());
    const post = (route, data) => fetch(endpoint + route,{headers,method:'POST',body:JSON.stringify(data)});
    assert.equal((await read('plan?operation=start')).tag,'v1.0.0');
    assert.equal((await read('plan?operation=install')).method,'release');
    assert.equal((await read('plan?operation=update&tag=v2.0.0')).notes,'Novidades');
    assert.equal((await post('update',{tag:'v3.0.0',confirmNative:true})).status,409);
    const install = async () => {
      assert.equal((await post('update',{tag:'v2.0.0',method:'release',confirmNative:true})).status,202);
      await app.jobs.get(project.id)?.done;
    };
    const current = app.state.projects[0];
    await install();
    assert.equal(current.installedRelease.tag,'v1.0.0');
    assert.equal(current.status,'error');
    corrupt = false;
    await install();
    assert.equal(current.installedRelease.tag,'v2.0.0');
    assert.equal(current.previousRelease.tag,'v1.0.0');
    assert.equal(current.status,'ready');
    assert.equal((await post('rollback',{tag:'v1.0.0'})).status,200);
    assert.equal(current.installedRelease.tag,'v1.0.0');
    assert.deepEqual(await fs.readFile(path.join(previous,'App.exe')),executable);
  } finally {
    await app?.close();
    download.closeAllConnections();
    await new Promise(resolve => download.close(resolve));
    await fs.rm(root,{recursive:true,force:true});
  }
});

test('the Windows installation determines the update target independently of the portable version', {skip:process.platform !== 'win32'}, async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(),'orbit-windows-package-'));
  let app;
  try {
    const fullName = 'owner/app';
    const url = 'https://github.com/' + fullName;
    const project = {id:'app',name:'App',fullName,url,status:'ready',
      installedRelease:{tag:'v2.4.0'},releaseTracking:{windowsInstaller:{tag:'v2.4.0'}}};
    const installation = path.join(root,'system');
    const exe = path.join(installation,'App.exe');
    await fs.mkdir(installation);
    await fs.writeFile(exe,'fixture');
    await fs.writeFile(path.join(root,'state.json'),JSON.stringify({projects:[project],events:[]}));
    const assetNames = ['App-win-Portable.zip','App-win-Setup.exe'];
    const release = {id:4,tag_name:'v2.4.0',assets:assetNames.map(name=>({name}))};
    const registered = {URLInfoAbout:url,DisplayVersion:'2.3.0',InstallLocation:installation,DisplayIcon:'"' + exe + '",0'};
    app = await createApp({dataDirectory:root,port:0,backgroundReleaseChecks:false,releaseGithub:async()=>[release],
      managementServices:{windowsInstallations:async()=>[registered]}});
    const headers = {'X-Orbit-Token':app.token,'Content-Type':'application/json'};
    const read = endpoint => fetch(app.url + endpoint,{headers}).then(response=>response.json());
    const projectRoute = '/api/projects/app/';
    const state = (await read('/api/state')).projects[0];
    assert.deepEqual(state.systemInstall,{version:'2.3.0'});
    assert.equal(state.installedRelease.tag,'v2.4.0');
    assert.equal(state.availableRelease.tag,'v2.4.0');
    const start = await read(projectRoute + 'plan?operation=start');
    assert.equal(start.tag,'2.3.0');
    assert.equal(start.packageMode,'installer');
    const update = await read(projectRoute + 'plan?operation=update&tag=v2.4.0');
    assert.equal(update.packageMode,'installer');
    assert.deepEqual(update.packageChoices.map(item=>item.asset),assetNames);
    const mismatch = await fetch(app.url + projectRoute + 'update',{headers,method:'POST',body:JSON.stringify({
      tag:'v2.4.0',method:'release',packageMode:'installer',asset:assetNames[0],confirmNative:true
    })});
    assert.equal(mismatch.status,409);
    registered.DisplayVersion='2.4.0';
    assert.equal((await read('/api/state')).projects[0].availableRelease,null);
  } finally {
    await app?.close();
    await fs.rm(root,{recursive:true,force:true});
  }
});
