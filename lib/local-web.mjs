import { createReadStream, promises as fs } from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { httpReady } from './docker-project.mjs';
import { installAnyPS5, serveAnyPS5 } from './managed-project.mjs';
import { superviseNative } from './native-supervisor.mjs';
import { prepareProject, projectEnvironment } from './prepare.mjs';
import { safePath } from './runner.mjs';

const loopback = '127.0.0.1';
const mime = {
  '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8',
  '.js':'text/javascript; charset=utf-8', '.mjs':'text/javascript; charset=utf-8',
  '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png',
  '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.webp':'image/webp',
  '.gif':'image/gif', '.ico':'image/x-icon', '.wasm':'application/wasm',
  '.woff':'font/woff', '.woff2':'font/woff2', '.mp4':'video/mp4'
};
const notify = message => process.send?.(message);
const progress = label => { console.log(label); notify({type:'orbit-progress',label}); };

async function listen(server, port) {
  await new Promise((resolve,reject) => {
    server.once('error',reject);
    server.listen(port,loopback,resolve);
  });
  return server.address().port;
}

async function serveStatic(directory, port) {
  const root = await fs.realpath(directory);
  const server = http.createServer(async (request,response) => {
    const address = server.address().port;
    if (![loopback+':'+address,'localhost:'+address].includes(request.headers.host)) {
      response.writeHead(403).end();
      return;
    }
    if (!['GET','HEAD'].includes(request.method)) {
      response.writeHead(405).end();
      return;
    }
    try {
      const relative = decodeURIComponent(new URL(request.url,'http://'+loopback).pathname).replace(/^\/+/,'') || '.';
      let file = await safePath(root,relative);
      if ((await fs.stat(file)).isDirectory()) file = await safePath(root,path.join(path.relative(root,file),'index.html'));
      if (path.relative(root,file).split(path.sep).some(segment => segment.startsWith('.'))) throw Error('Arquivo privado.');
      const stat = await fs.stat(file);
      if (!stat.isFile()) throw Error('Arquivo não encontrado.');
      response.writeHead(200,{'Content-Type':mime[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'Content-Length':stat.size,'X-Content-Type-Options':'nosniff'});
      if (request.method === 'HEAD') response.end();
      else createReadStream(file).on('error',() => response.destroy()).pipe(response);
    } catch { response.writeHead(404).end(); }
  });
  await listen(server,port);
  return server;
}

async function waitForWeb(port, signal) {
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    signal.throwIfAborted();
    if (await httpReady(port,'/',status => status >= 200 && status < 500)) return;
    await delay(700,undefined,{signal});
  }
  throw Error('O app não respondeu na porta ' + port + '. Confira a porta e o comando de execução em Configuração.');
}

async function executeLocalWeb(action, directory, project, plan) {
  const base = await safePath(directory,plan.appDir || '.');
  if (plan.runtime === 'static' || plan.runtime === 'anyps5') {
    if (plan.runtime === 'anyps5') {
      const installed = await fs.access(path.join(base,'.orbit-runtime','installed.json')).then(() => true, () => false);
      if (action === 'install' || !installed) {
        progress('Preparando o conversor local');
        const release = await installAnyPS5(base);
        notify({type:'orbit-release',release});
      }
    }
    if (action === 'install') return;
    const server = plan.runtime === 'static' ? await serveStatic(base,plan.port) : await serveAnyPS5(base,plan.port,loopback);
    notify({type:'orbit-running',port:server.address().port});
    return;
  }

  progress('Preparando dependências locais');
  const install = plan.install && plan.build ? '('+plan.install+') && '+plan.build : plan.install || plan.build || '';
  if (plan.runtime !== 'custom' || install) await prepareProject(base,install);
  if (action === 'install') return;

  // Probe the configured port before starting the command so an existing service
  // on that port cannot be mistaken for this project.
  const probe = net.createServer();
  try { await listen(probe,plan.port); }
  catch (error) {
    if (error.code === 'EADDRINUSE') throw Error('A porta ' + plan.port + ' já está em uso. Escolha outra em Configuração.');
    throw error;
  }
  await new Promise(resolve => probe.close(resolve));

  const env = await projectEnvironment(base,{...process.env,...plan.env,HOST:loopback,PORT:String(plan.port)});
  progress('Aguardando o app local responder na porta ' + plan.port);
  await superviseNative({
    command:plan.command,cwd:base,env,shell:true,port:plan.port,python:plan.runtime === 'python' ? 'python' : undefined,
    label:project.name,ready:signal => waitForWeb(plan.port,signal),
    onStartupError:error => notify({type:'orbit-startup-error',message:error.message})
  },{network:project.network !== false});
}

try {
  await executeLocalWeb(process.argv[2],process.cwd(),JSON.parse(process.env.ORBIT_PROJECT),JSON.parse(process.env.ORBIT_LOCAL_PLAN));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
