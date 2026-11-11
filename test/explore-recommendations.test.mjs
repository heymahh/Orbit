import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {recommendationProfile,rankRecommendations,createRecommendations} from '../lib/explore-recommendations.mjs';
import {createApp} from '../server.mjs';
const repo=(fullName,description,extra={})=>({fullName,name:fullName.split('/')[1],owner:fullName.split('/')[0],description,url:'https://github.com/'+fullName,topics:[],...extra});
const raw=item=>({full_name:item.fullName,name:item.name,owner:{login:item.owner},html_url:item.url,description:item.description,language:item.language,stargazers_count:item.stars,topics:item.topics,archived:item.archived,fork:item.fork});
const view=item=>repo(item.full_name,item.description,{topics:item.topics,stars:item.stargazers_count,language:item.language});
test('explicit purpose wins over unrelated favorites and bilingual purpose beats stars/language',()=>{
 const profile=recommendationProfile({explorePreferences:{intent:'Quero editar vídeos'},explorePins:[repo('drivers/updater','Driver updater')]});
 assert.ok(profile.queries.includes('video editor'));assert.ok(!profile.queries.includes('driver updater'));
 const result=rankRecommendations([repo('org/clip','Video editor',{stars:10,language:'Python'}),repo('org/huge','An unrelated API in Python',{stars:10000000,language:'Python'}),repo('org/awesome-video','Video editor resources',{stars:100000})],profile);
 assert.deepEqual(result.map(item=>item.name),['clip']);assert.match(result[0].recommendationReason,/vídeo/);
});
test('recent search, favorites and library provide purpose signals; unknown interests use safe keywords',()=>{
 assert.match(recommendationProfile({explorePreferences:{lastSearch:'emuladores'}}).queries[0],/emulator/);
 assert.match(recommendationProfile({explorePins:[repo('org/notes','Take notes and organize knowledge')]}).queries[0],/note taking/);
 assert.match(recommendationProfile({projects:[repo('org/audio','Audio editor')]}).queries[0],/audio editor/);
 const profile=recommendationProfile({explorePreferences:{intent:'astronomia language:Shell'}});assert.ok(!profile.queries[0].includes('language:'));assert.match(profile.queries[0],/astronomia/);
 assert.equal(recommendationProfile({}).queries.length,0);
});
test('recommendations deduplicate, exclude saved repositories and filter irrelevant projects',()=>{
 const profile=recommendationProfile({explorePreferences:{intent:'senhas'}});
 const one=repo('org/vault','Password manager');const two=repo('org/other','Password manager');
 const items=rankRecommendations([one,one,two,repo('org/fork','Password manager',{fork:true}),repo('org/old','Password manager',{archived:true})],profile,new Set(['org/vault']));assert.deepEqual(items.map(item=>item.fullName),['org/other']);
});
test('recommendations cache concurrent calls, keep same-interest stale results and isolate changed intent',async()=>{
 let calls=0,timestamp=1,fail=false;
 const recommend=createRecommendations({now:()=>timestamp,ttl:100,repoView:view,github:async endpoint=>{calls++;assert.match(decodeURIComponent(endpoint),/archived:false fork:false/);if(fail)throw Error('offline');await new Promise(resolve=>setTimeout(resolve,10));return{items:[raw(repo('org/clip','Video editor',{language:'Python'}))]};}});
 const state={explorePreferences:{intent:'editar vídeos'}};
 await Promise.all([recommend(state,'Python'),recommend(state,'Python')]);assert.equal(calls,1);
 await recommend(state,'Python');assert.equal(calls,1);timestamp=200;fail=true;assert.equal((await recommend(state,'Python')).stale,true);
 await assert.rejects(recommend({explorePreferences:{intent:'senhas'}},'Python'),/offline/);
 await assert.rejects(recommend(state,'bad" language:Shell'),/linguagem/);
});
test('partial searches remain retryable and no interests makes no GitHub requests',async()=>{
 let calls=0;const recommend=createRecommendations({repoView:view,github:async()=>{calls++;return{incomplete_results:true,items:[raw(repo('org/clip','Video editor'))]};}});
 assert.equal((await recommend({})).needsInterests,true);assert.equal(calls,0);
 const state={explorePreferences:{intent:'video'}};assert.equal((await recommend(state)).partial,true);await recommend(state);assert.equal(calls,2);
});
test('explore preferences authenticate, validate, persist across restarts and drive live recommendations',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'orbit-recommendations-'));let app;
 const options={dataDirectory:directory,port:0,backgroundReleaseChecks:false,recommendationGithub:async()=>({items:[raw(repo('org/clip','Video editor',{language:'Python'}))]})};
 try{
  app=await createApp(options);let headers={'Content-Type':'application/json','X-Orbit-Token':app.token};
  assert.equal((await fetch(app.url+'/api/explore/recommendations')).status,403);
  const post=input=>fetch(app.url+'/api/explore/preferences',{method:'POST',headers,body:JSON.stringify(input)});
  for(const input of [null,{}, {intent:123},{intent:'x'.repeat(201)}])assert.equal((await post(input)).status,400);
  assert.equal((await post({intent:'editar vídeos',lastSearch:'drivers'})).status,200);
  const result=await (await fetch(app.url+'/api/explore/recommendations',{headers})).json();assert.equal(result.items[0].fullName,'org/clip');assert.match(result.basis,/editar vídeos/);
  await app.close();app=await createApp(options);headers={'Content-Type':'application/json','X-Orbit-Token':app.token};assert.equal(app.state.explorePreferences.intent,'editar vídeos');assert.equal(app.state.explorePreferences.lastSearch,'drivers');
  await post({intent:''});assert.equal(app.state.explorePreferences.intent,'');assert.equal(app.state.explorePreferences.lastSearch,'drivers');
 }finally{await app?.close();await fs.rm(directory,{recursive:true,force:true});}
});

test('purpose-specific topics outrank incidental mentions in very popular unrelated editors',()=>{
 const profile=recommendationProfile({explorePreferences:{intent:'editar vídeos'}});
 const result=rankRecommendations([repo('org/rich-text','Text editor with video uploads',{stars:999999,topics:['rich-text']}),repo('org/cut','Video editing application',{stars:10,topics:['video-editor']})],profile);
 assert.equal(result[0].fullName,'org/cut');
});
