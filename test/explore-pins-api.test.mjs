import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createApp} from '../server.mjs';

test('Explore favorites are authenticated, idempotent, canonical and survive a restart',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'orbit-pins-'));
 let app;
 try{
  app=await createApp({dataDirectory:directory,port:0,backgroundReleaseChecks:false});
  const request=(input,headers={'Content-Type':'application/json','X-Orbit-Token':app.token})=>fetch(app.url+'/api/explore/pins',{method:'POST',headers,body:JSON.stringify(input)});
  assert.equal((await request({repo:{fullName:'owner/repo'},pinned:true},{'Content-Type':'application/json'})).status,403);
  for(const input of [{repo:{fullName:'owner/repo'}},{repo:{fullName:'https://evil.example/a/b'},pinned:true},{repo:null,pinned:true}])assert.equal((await request(input)).status,400);
  let result=await request({repo:{fullName:'owner/repo',url:'https://evil.example',name:'changed',language:'Python',description:'My favorite',stars:123},pinned:true});assert.equal(result.status,200);
  let pins=(await result.json()).items;assert.equal(pins.length,1);assert.equal(pins[0].url,'https://github.com/owner/repo');assert.equal(pins[0].name,'repo');
  await request({repo:{fullName:'OWNER/REPO'},pinned:true});assert.equal(app.state.explorePins.length,1);
  await request({repo:{fullName:'another/favorite'},pinned:true});assert.equal(app.state.explorePins[0].fullName,'another/favorite');
  await app.close();app=await createApp({dataDirectory:directory,port:0,backgroundReleaseChecks:false});
  assert.equal(app.state.explorePins.length,2);assert.equal(app.state.explorePins[1].description,'My favorite');assert.equal(app.state.explorePins[1].language,'Python');assert.equal(app.state.explorePins[1].stars,123);
  await request({repo:{fullName:'OWNER/REPO'},pinned:false});assert.deepEqual(app.state.explorePins.map(repo=>repo.fullName),['another/favorite']);
  await request({repo:{fullName:'owner/repo'},pinned:false});assert.equal(app.state.explorePins.length,1);
  assert.equal(app.state.projects.length,0);
 }finally{await app?.close();await fs.rm(directory,{recursive:true,force:true});}
});
