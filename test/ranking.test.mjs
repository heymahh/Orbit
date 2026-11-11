import test from 'node:test';
import assert from 'node:assert/strict';
import { rankingQuery, createRanking } from '../lib/ranking.mjs';

test('ranking filters preserve the GitHub ordering criteria and handle C\+\+ and C#', () => {
  const date = new Date('2026-10-23T14:00:00Z');
  assert.equal(rankingQuery('Todos','all',date), 'stars:>0 archived:false fork:false');
  assert.match(rankingQuery('C++','month',date), /language:"C\+\+" created:>=2026-09-23$/);
  assert.match(rankingQuery('C#','year',date), /language:"C#" created:>=2026-01-01$/);
  assert.throws(() => rankingQuery('Python stars:>999999'), {status:400});
  assert.throws(() => rankingQuery('Todos','invalid'), {status:400});
});

test('ranking deduplicates concurrent requests, caches by filter and expires after ten minutes', async () => {
  let timestamp = Date.parse('2026-10-23T14:00:00Z');
  const calls = [];
  const ranking = createRanking({
    now: () => timestamp,
    repoView: item => ({fullName:item.full_name,stars:item.stargazers_count}),
    github: async endpoint => {
      calls.push(endpoint);
      await new Promise(resolve => setImmediate(resolve));
      return {items:Array.from({length:30},()=>({full_name:'owner/repo',stargazers_count:12345})),total_count:100};
    }
  });
  const [first, second] = await Promise.all([ranking('C++'), ranking('C++')]);
  assert.deepEqual(first, second);
  assert.equal(calls.length,1);
  const url = new URL('https://api.github.com/' + calls[0]);
  assert.equal(url.searchParams.get('sort'),'stars');
  assert.equal(url.searchParams.get('order'),'desc');
  assert.equal(url.searchParams.get('per_page'),'30');
  assert.match(url.searchParams.get('q'), /language:"C\+\+"/);
  assert.equal(first.items[0].stars,12345);
  await ranking('C++');
  assert.equal(calls.length,1);
  await ranking('Python');
  assert.equal(calls.length,2);
  timestamp += 600001;
  const refreshed = await ranking('C++');
  assert.equal(calls.length,3);
  assert.notEqual(refreshed.updatedAt,first.updatedAt);
});

test('ranking keeps the last successful list during an outage and permits retry after a first failure', async () => {
  let timestamp = 1000000;
  let failing = true;
  let calls = 0;
  const ranking = createRanking({
    now: () => timestamp, repoView: item => item,
    github: async () => { calls++; if (failing) throw new Error('Sem rede'); return {items:Array.from({length:30},()=>({fullName:'a/b'})),total_count:30}; }
  });
  await assert.rejects(ranking(), /Sem rede/);
  failing = false;
  const first = await ranking();
  assert.equal(calls,2);
  timestamp += 600001; failing = true;
  const stale = await ranking();
  assert.equal(stale.stale,true);
  assert.equal(stale.updatedAt,first.updatedAt);
  assert.deepEqual(stale.items,first.items);
  assert.match(stale.warning,/última consulta/);
  await assert.rejects(ranking('Rust'), /Sem rede/);
});

test('an incomplete search is retryable and never replaces a successful ranking', async () => {
  let timestamp = 1000000;
  let incomplete = true;
  const ranking = createRanking({
    now: () => timestamp, repoView: item => item,
    github: async () => ({items:incomplete ? [] : [{fullName:'a/b'}],total_count:1,incomplete_results:incomplete})
  });
  const partial = await ranking();
  assert.equal(partial.partial,true);
  assert.equal(partial.stale,false);
  incomplete = false;
  const successful = await ranking();
  timestamp += 600001; incomplete = true;
  const stale = await ranking();
  assert.equal(stale.stale,true);
  assert.deepEqual(stale.items,successful.items);
});

test('small languages broaden the candidate range instead of omitting low-star projects', async () => {
  const queries = [];
  const ranking = createRanking({repoView: item => item, github: async endpoint => {
    const query = new URL('https://api.github.com/' + endpoint).searchParams.get('q'); queries.push(query);
    return {items: query.includes('stars:>=1000') ? [] : [{fullName:'small/project',stars:20}],total_count:1};
  }});
  const data = await ranking('Kotlin');
  assert.equal(queries.length,2); assert.match(queries[0],/stars:>=1000/); assert.match(queries[1],/stars:>0/);
  assert.equal(data.items[0].stars,20);
});
test('extra ranking filters map to safe GitHub qualifiers, including new repositories of the week', async () => {
  const date = new Date('2026-10-24T06:00:00Z');
  const query = rankingQuery({ language: 'Rust', period: 'week', updated: 'month', topic: 'game', stars: '1000', license: 'mit', lists: 'hide' }, date);
  assert.equal(query, 'stars:>=1000 archived:false fork:false language:"Rust" created:>=2026-10-17 pushed:>=2026-09-24 topic:game license:mit -topic:awesome-list -topic:awesome -topic:resources');
  assert.throws(() => rankingQuery({ topic: 'game stars:>1' }), { status: 400 });
  assert.throws(() => rankingQuery({ sort: 'random' }), { status: 400 });
  const calls = [];
  const ranking = createRanking({ repoView: item => item, github: async endpoint => { calls.push(endpoint); return { items: [], total_count: 0 }; } });
  const data = await ranking({ period: 'week', sort: 'forks' });
  const url = new URL('https://api.github.com/' + calls[0]);
  assert.equal(url.searchParams.get('sort'), 'forks');
  assert.match(url.searchParams.get('q'), /created:>=/);
  assert.equal(calls.length, 1, 'a semana não usa a faixa de 1000 estrelas');
  assert.equal(data.period, 'week');
});
