import { promises as fs, createReadStream, createWriteStream } from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPOSITORY = 'boykopovar/AnyPS5';
const LIMIT = 512 * 1024 * 1024;
const sourcePath = fileURLToPath(import.meta.url);
const root = path.dirname(path.dirname(sourcePath));
const quote = value => '"' + value.replace(/"/g, '') + '"';

export function managedRecipe(project, appRoot = root) {
  if (project.fullName?.toLowerCase() !== REPOSITORY.toLowerCase()) return null;
  const cli = quote(path.join(appRoot, 'lib', 'managed-project.mjs'));
  const node = quote(process.execPath);
  return {
    recipe: 'anyps5-release', mode: 'native', image: '', port: project.port || 4385,
    install: node + ' ' + cli + ' install-anyps5',
    command: node + ' ' + cli + ' run-anyps5',
    note: 'Perfil automático do AnyPS5: Instalar baixa o conversor web, as bibliotecas Windows/Linux e o relinker nativo oficial. Executar inicia o conversor; use Abrir app. Não precisa de Docker nem CMake. Usa a versão publicada, que pode ser diferente do código main. Para converter, forneça seus arquivos de entrada.'
  };
}

export async function archiveEntries(file) {
  const handle = await fs.open(file, 'r');
  try {
    const stat = await handle.stat();
    const tailSize = Math.min(stat.size, 65557);
    const tail = Buffer.alloc(tailSize);
    await handle.read(tail, 0, tailSize, stat.size - tailSize);
    let end = -1;
    for (let index = tail.length - 22; index >= 0; index--) if (tail.readUInt32LE(index) === 0x06054b50 && index + 22 + tail.readUInt16LE(index + 20) === tail.length) { end = index; break; }
    if (end < 0) throw new Error('Arquivo ZIP inválido ou incompleto.');
    const count = tail.readUInt16LE(end + 10);
    const size = tail.readUInt32LE(end + 12);
    const offset = tail.readUInt32LE(end + 16);
    if (count === 0xffff || size > 32 * 1024 * 1024 || offset + size > stat.size) throw new Error('Estrutura ZIP não suportada.');
    const directory = Buffer.alloc(size);
    await handle.read(directory, 0, size, offset);
    const entries = [];
    let cursor = 0;
    for (let i = 0; i < count; i++) {
      if (cursor + 46 > size || directory.readUInt32LE(cursor) !== 0x02014b50) throw new Error('Diretório ZIP inválido.');
      const expandedBytes = directory.readUInt32LE(cursor + 24);
      const nameSize = directory.readUInt16LE(cursor + 28);
      const extraSize = directory.readUInt16LE(cursor + 30);
      const commentSize = directory.readUInt16LE(cursor + 32);
      const attributes = directory.readUInt32LE(cursor + 38);
      const name = directory.toString('utf8', cursor + 46, cursor + 46 + nameSize);
      const normalized = name.replace(/\\/g, '/');
      if (!normalized || normalized.startsWith('/') || /^[A-Za-z]:/.test(normalized) || normalized.split('/').some(part => part === '..' || part.includes(':')) || ((attributes >>> 16) & 0xf000) === 0xa000) throw new Error('O ZIP contém um caminho ou link não permitido.');
      entries.push({ name: normalized, expandedBytes });
      cursor += 46 + nameSize + extraSize + commentSize;
      if (cursor > size) throw new Error('Entrada ZIP incompleta.');
    }
    if (entries.reduce((sum, entry) => sum + entry.expandedBytes, 0) > 2 * 1024 * 1024 * 1024) throw new Error('O conteúdo extraído excede o limite de 2 GB.');
    return entries;
  } finally { await handle.close(); }
}

async function json(url) {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Orbit-Local', Accept: 'application/vnd.github+json', ...(process.env.GITHUB_TOKEN ? { Authorization: 'Bearer ' + process.env.GITHUB_TOKEN } : {}) },
    signal: AbortSignal.timeout(30000)
  });
  if (!response.ok) throw new Error('GitHub indisponível (HTTP ' + response.status + '). Tente novamente em alguns minutos.');
  return response.json();
}
async function digestFile(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
async function download(asset, destination, tag) {
  const allowed = 'https://github.com/' + REPOSITORY + '/releases/download/' + tag + '/';
  if (!asset.browser_download_url?.startsWith(allowed) || !Number.isSafeInteger(asset.size) || asset.size <= 0 || asset.size > LIMIT) throw new Error('Pacote oficial inválido: ' + asset.name);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  let hash;
  try {
    if ((await fs.stat(destination)).size === asset.size) {
      hash = await digestFile(destination);
      if (asset.digest === 'sha256:' + hash) { console.log('Já verificado: ' + asset.name); return hash; }
    }
  } catch {}
  console.log('Baixando ' + asset.name + ' (' + (asset.size / 1024 / 1024).toFixed(1) + ' MB)…');
  const response = await fetch(asset.browser_download_url, { signal: AbortSignal.timeout(10 * 60 * 1000) });
  if (!response.ok) throw new Error('Falha ao baixar ' + asset.name + ': HTTP ' + response.status);
  let bytes = 0, lastReport = 0;
  const hashState = createHash('sha256');
  const temp = destination + '.part';
  const stream = Readable.fromWeb(response.body);
  stream.on('data', chunk => {
    bytes += chunk.length; hashState.update(chunk);
    if (bytes > asset.size) stream.destroy(new Error('Pacote maior que o tamanho publicado.'));
    if (Date.now() - lastReport > 2000) { lastReport = Date.now(); console.log(asset.name + ': ' + Math.round(bytes / asset.size * 100) + '%'); }
  });
  await pipeline(stream, createWriteStream(temp));
  hash = hashState.digest('hex');
  if (bytes !== asset.size) throw new Error('Download incompleto: ' + asset.name);
  if (asset.digest && asset.digest !== 'sha256:' + hash) throw new Error('A verificação SHA-256 falhou: ' + asset.name);
  await fs.rename(temp, destination);
  console.log('Download verificado: ' + asset.name);
  return hash;
}

export async function extract(file, destination) {
  await archiveEntries(file);
  await fs.mkdir(destination, { recursive: true });
  const args = process.platform === 'win32'
    ? ['-NoProfile', '-NonInteractive', '-Command', 'Expand-Archive -LiteralPath $env:ORBIT_ARCHIVE -DestinationPath $env:ORBIT_DESTINATION -Force']
    : ['-o', file, '-d', destination];
  const bin = process.platform === 'win32' ? 'powershell.exe' : 'unzip';
  await new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: 'inherit', windowsHide: true, env: { ...process.env, ORBIT_ARCHIVE: file, ORBIT_DESTINATION: destination } });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve() : reject(new Error('Não foi possível extrair o pacote. Código ' + code)));
  });
}

export async function installAnyPS5(directory) {
  const runtime = path.join(directory, '.orbit-runtime');
  const packages = path.join(runtime, 'packages');
  await fs.mkdir(packages, { recursive: true });
  const release = await json('https://api.github.com/repos/' + REPOSITORY + '/releases/latest');
  const tag = release.tag_name;
  if (!/^[A-Za-z0-9._-]+$/.test(tag || '')) throw new Error('Versão de release inválida.');
  console.log('Preparando AnyPS5 ' + tag + ' a partir dos pacotes oficiais.');
  const required = name => { const asset = release.assets?.find(item => item.name === name); if (!asset) throw new Error('A release não contém ' + name); return asset; };
  const webAsset = required('web-' + tag + '.zip');
  const webZip = path.join(packages, webAsset.name);
  await download(webAsset, webZip, tag);
  const webRoot = path.join(runtime, 'web', tag);
  await extract(webZip, webRoot);
  const metadata = JSON.parse(await fs.readFile(path.join(webRoot, 'web-release.json'), 'utf8'));
  if (metadata.tag !== tag) throw new Error('O conversor não corresponde à versão publicada.');
  const manifest = { tag, url: release.html_url, platforms: {} };
  for (const platform of ['windows', 'linux']) {
    const asset = required('prx-' + platform + '-' + tag + '.zip');
    const archive = path.join(packages, asset.name);
    const hash = await download(asset, archive, tag);
    const entries = await archiveEntries(archive);
    const relative = 'libraries/' + platform + '-' + hash + '.zip';
    await fs.mkdir(path.join(webRoot, 'libraries'), { recursive: true });
    await fs.copyFile(archive, path.join(webRoot, relative));
    manifest.platforms[platform] = { path: relative, size: asset.size, expandedBytes: entries.reduce((sum, entry) => sum + entry.expandedBytes, 0), sha256: hash };
    if (platform === (process.platform === 'win32' ? 'windows' : 'linux') && ['win32', 'linux'].includes(process.platform)) await extract(archive, path.join(runtime, 'native', tag, 'libraries'));
  }
  if (['win32', 'linux'].includes(process.platform)) {
    const asset = required('relinker-' + tag + (process.platform === 'win32' ? '.exe' : ''));
    const binary = path.join(runtime, 'native', tag, process.platform === 'win32' ? 'relinker.exe' : 'relinker');
    await download(asset, binary, tag);
    if (process.platform !== 'win32') await fs.chmod(binary, 0o755);
  }
  await fs.writeFile(path.join(webRoot, 'release.json'), JSON.stringify(manifest, null, 2));
  await fs.writeFile(path.join(runtime, 'installed.json.tmp'), JSON.stringify({ repository: REPOSITORY, tag, installedAt: new Date().toISOString(), revision: metadata.revision, webRoot: path.relative(runtime, webRoot) }, null, 2));
  await fs.rename(path.join(runtime, 'installed.json.tmp'), path.join(runtime, 'installed.json'));
  console.log('AnyPS5 ' + tag + ' instalado: conversor web, bibliotecas Windows/Linux e relinker nativo.');
  console.log('Agora clique em Executar e depois em Abrir app.');
  return release;
}

// Dentro do Docker o servidor precisa ouvir em 0.0.0.0 para o Docker repassar a porta publicada.
export async function serveAnyPS5(directory, port = 4385, host = process.env.ORBIT_LISTEN_HOST || '127.0.0.1') {
  const runtime = path.join(directory, '.orbit-runtime');
  let installation;
  try { installation = JSON.parse(await fs.readFile(path.join(runtime, 'installed.json'), 'utf8')); }
  catch { throw new Error('AnyPS5 ainda não está instalado. Clique em Instalar e aguarde a conclusão.'); }
  const webRoot = await fs.realpath(path.join(runtime, installation.webRoot));
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Porta inválida para o conversor.');
  const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.wasm': 'application/wasm', '.zip': 'application/zip' };
  const server = http.createServer(async (request, response) => {
    try {
      // Aceita só nomes de loopback (protege contra DNS rebinding), em qualquer porta: o Docker publica o app numa porta aleatória.
      if (!/^(127\.0\.0\.1|localhost)(:\d{1,5})?$/.test(request.headers.host || '')) { response.writeHead(403); response.end(); return; }
      if (request.method !== 'GET' && request.method !== 'HEAD') { response.writeHead(405); response.end(); return; }
      const url = new URL(request.url, 'http://127.0.0.1:' + port);
      const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
      const resolved = path.resolve(webRoot, relative);
      if (resolved !== webRoot && !resolved.startsWith(webRoot + path.sep)) throw new Error('Caminho inválido.');
      const file = await fs.realpath(resolved);
      if (!file.startsWith(webRoot + path.sep)) throw new Error('Caminho inválido.');
      const stat = await fs.stat(file);
      if (!stat.isFile()) throw new Error('Arquivo não encontrado.');
      response.writeHead(200, {
        'Content-Type': types[path.extname(file)] || 'application/octet-stream',
        'Content-Length': stat.size, 'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'no-store', 'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
        'Content-Security-Policy': "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; worker-src 'self'; connect-src 'self' https://api.github.com; img-src 'self' data: blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
      });
      if (request.method === 'HEAD') response.end(); else createReadStream(file).on('error', () => response.destroy()).pipe(response);
    } catch { response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); response.end('Arquivo não encontrado.'); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, resolve); });
  console.log('AnyPS5 ' + installation.tag + ': http://127.0.0.1:' + port);
  console.log('Abra este endereço ou clique em Abrir app no Orbit. Seus arquivos são processados no navegador.');
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === sourcePath) {
  try {
    if (process.argv[2] === 'install-anyps5') await installAnyPS5(process.cwd());
    else if (process.argv[2] === 'run-anyps5') {
      const server = await serveAnyPS5(process.cwd(), Number(process.env.ORBIT_PROJECT_PORT || 4385));
      const shutdown = () => { server.closeAllConnections(); server.close(() => process.exit(0)); };
      process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
    } else throw new Error('Ação de preparação não reconhecida.');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
