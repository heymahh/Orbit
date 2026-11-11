import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pickReleaseAsset, scoreAndroidAsset, scoreWindowsAsset, scoreWindowsInstaller } from './native-project.mjs';

export const RELEASE_CHECK_INTERVAL = 60 * 60 * 1000;
const repositoryName = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const time = value => Date.parse(value || '') || 0;
export function releaseReference(release, fullName) {
  const tag = String(release?.tag_name || release?.tag || '').trim().slice(0, 180);
  if (!tag || !repositoryName.test(fullName || '')) return null;
  return { id: String(release.id || tag), tag, publishedAt: release.published_at || release.publishedAt || null, prerelease: Boolean(release.prerelease), url: 'https://github.com/' + fullName + '/releases/tag/' + encodeURIComponent(tag) };
}
export function latestPublishedRelease(releases) {
  const published = (Array.isArray(releases) ? releases : []).filter(item => item && !item.draft && item.tag_name && item.published_at);
  const stable = published.filter(item => !item.prerelease);
  return (stable.length ? stable : published).sort((a, b) => time(b.published_at) - time(a.published_at))[0] || null;
}
function semanticVersion(tag) {
  const match = String(tag).match(/^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([\w.-]+))?(?:\+[\w.-]+)?$/i);
  return match ? { parts: match.slice(1, 4).map(item => Number(item || 0)), pre: match[4] || '' } : null;
}
export function isNewerRelease(candidate, baseline) {
  if (!candidate || !baseline || candidate.tag === baseline.tag || candidate.id === baseline.id) return false;
  const a = semanticVersion(candidate.tag), b = semanticVersion(baseline.tag);
  if (a && b) {
    for (let i = 0; i < 3; i++) if (a.parts[i] !== b.parts[i]) return a.parts[i] > b.parts[i];
    if (a.pre !== b.pre && (!a.pre || !b.pre)) return !a.pre;
    if (a.pre !== b.pre) return a.pre.localeCompare(b.pre, 'en', { numeric: true }) > 0;
    return false;
  }
  return time(candidate.publishedAt) > time(baseline.publishedAt);
}

export function availableProjectRelease(project) {
  const tracking = project.releaseTracking;
  const local = project.installedRelease || tracking?.cached ||
    (project.sourceTag ? releaseReference({tag:project.sourceTag},project.fullName) : null);
  const latest = tracking && (Object.hasOwn(tracking,'compatible') ? tracking.compatible : tracking.latest);
  return isNewerRelease(latest,local) ? latest : null;
}

export async function recoverInstalledRelease(project, nativePath) {
  if (project.installedRelease || !/^[\w .-]+$/.test(project.name || '')) return null;
  const folders = await fs.readdir(nativePath,{withFileTypes:true}).catch(() => []);
  const versions = [];
  for (const folder of folders) {
    if (!folder.isDirectory() || !semanticVersion(folder.name)) continue;
    const executable = await fs.lstat(path.join(nativePath,folder.name,'app',project.name+'.exe')).catch(() => null);
    if (executable?.isFile() && executable.size) versions.push(folder.name);
  }
  return versions.length === 1 ? releaseReference({tag:versions[0]},project.fullName) : null;
}

async function cachedRelease(project, releases, nativeDirectory) {
  if (!nativeDirectory || !/^[\w-]+$/.test(project.id)) return null;
  const cacheRoot = project.storage?.root ? path.join(project.storage.root,'native') : path.join(nativeDirectory,project.id);
  const cachedFolders = new Set(await fs.readdir(cacheRoot).catch(() => []));
  if (!cachedFolders.size) return null;
  // An archive with its expected size proves this release was downloaded.
  for (const release of [...releases].filter(item => !item.draft).sort((a, b) => time(b.published_at) - time(a.published_at))) {
    const name = String(release.tag_name || 'latest').replace(/[^\w.-]/g, '_');
    if (!cachedFolders.has(name)) continue;
    const folder = path.join(cacheRoot, name);
    for (const asset of release.assets || []) {
      if (!asset.name || /[\\/]/.test(asset.name) || asset.name === '..') continue;
      const stat = await fs.stat(path.join(folder, asset.name)).catch(() => null);
      if (stat?.isFile() && stat.size > 0 && stat.size === asset.size) return releaseReference(release, project.fullName);
    }
  }
  return null;
}

export function createReleaseUpdates({ state, github, save = async () => {}, nativeDirectory, now = Date.now, intervalMs = RELEASE_CHECK_INTERVAL, minimumCheckMs = 60000, startupDelayMs = 10000 } = {}) {
  state.releaseNotifications = Array.isArray(state.releaseNotifications) ? state.releaseNotifications : [];
  state.releaseUpdateCheck = { ...state.releaseUpdateCheck, checking: false };
  let running, closed = false, startupTimer, intervalTimer;
  const view = () => ({ items: state.releaseNotifications, ...state.releaseUpdateCheck });
  async function perform(force) {
    const start = now();
    if (!force && time(state.releaseUpdateCheck.nextCheckAt) > start) return view();
    if (time(state.releaseUpdateCheck.lastCheckedAt) && start - time(state.releaseUpdateCheck.lastCheckedAt) < minimumCheckMs) return view();
    Object.assign(state.releaseUpdateCheck, { checking: true, error: '' });
    const failures = [];
    try {
      for (const project of [...state.projects]) {
        if (closed) break;
        if (project.status === 'cloning' || !repositoryName.test(project.fullName || '')) continue;
        try {
          const releases = await github('repos/' + project.fullName + '/releases?per_page=100');
          if (closed || !state.projects.includes(project)) continue;
          if (!Array.isArray(releases)) throw new Error('Resposta de Releases inválida.');
          const latest = releaseReference(latestPublishedRelease(releases), project.fullName);
          const cached = project.installedRelease ? null : await cachedRelease(project,releases,nativeDirectory);
          if (closed || !state.projects.includes(project)) continue;
          const tracking = project.releaseTracking ||= {};
          tracking.cached = cached;
          const score = project.kind === 'android' ? scoreAndroidAsset : project.installedRelease || cached ? scoreWindowsAsset : null;
          const published = score && releases.filter(release => release?.published_at).sort((a,b) => time(b.published_at) - time(a.published_at));
          tracking.compatible = score ? releaseReference(pickReleaseAsset(published,score)?.release,project.fullName) : latest;
          if (process.platform === 'win32' && project.kind !== 'android') {
            const installer = pickReleaseAsset(releases.filter(item=>item?.published_at).sort((a,b)=>time(b.published_at)-time(a.published_at)),scoreWindowsInstaller);
            tracking.windowsInstaller = releaseReference(installer?.release,project.fullName);
          }
          if (!tracking.initialized) {
            tracking.baseline = project.installedRelease || cached || latest;
            tracking.initialized = true;
          }
          if (latest && !tracking.baseline && tracking.checkedAt) {
            // A repository with no releases now has its first published version.
            tracking.baseline = { id: '', tag: '', publishedAt: tracking.checkedAt };
          }
          if (latest && isNewerRelease(latest, tracking.baseline)) {
            const id = 'release-' + createHash('sha256').update(project.id + '\0' + latest.tag).digest('hex').slice(0, 24);
            if (!state.releaseNotifications.some(item => item.id === id)) {
              state.releaseNotifications.unshift({ id, type: 'release', projectId: project.id, projectName: project.name || project.fullName.split('/')[1], fullName: project.fullName, tag: latest.tag, previousTag: tracking.baseline.tag || null, url: latest.url, publishedAt: latest.publishedAt, createdAt: new Date(now()).toISOString(), readAt: null, announcedAt: null });
            }
            tracking.baseline = latest;
          }
          tracking.latest = latest;
          tracking.checkedAt = new Date(now()).toISOString();
          tracking.error = '';
        } catch (error) {
          project.releaseTracking = { ...project.releaseTracking, error: String(error.message).slice(0, 300) };
          failures.push(project.fullName);
          if (error.upstreamStatus === 403 || error.upstreamStatus === 429 || /Limite do GitHub/i.test(error.message)) break;
        }
      }
    } finally {
      const existing = new Set(state.projects.map(project => project.id));
      state.releaseNotifications = state.releaseNotifications.filter(item => existing.has(item.projectId)).slice(0, 100);
      Object.assign(state.releaseUpdateCheck, { checking: false, lastCheckedAt: new Date(now()).toISOString(), nextCheckAt: new Date(now() + intervalMs).toISOString(), error: failures.length ? 'Não foi possível verificar todos os projetos. O histórico foi preservado; tente novamente mais tarde.' : '' });
      await save();
    }
    return view();
  }
  function check({ force = false } = {}) {
    if (closed) return Promise.resolve(view());
    if (!running) running = perform(force).finally(() => { running = null; });
    return running;
  }
  async function claim(ids) {
    const selected = new Set(ids);
    const items = state.releaseNotifications.filter(item => selected.has(item.id) && !item.readAt && !item.announcedAt);
    for (const item of items) item.announcedAt = new Date(now()).toISOString();
    await save();
    return { items };
  }
  async function markRead(ids) {
    const selected = ids === 'all' ? null : new Set(ids);
    for (const item of state.releaseNotifications) if ((!selected || selected.has(item.id)) && !item.readAt) item.readAt = new Date(now()).toISOString();
    await save();
    return view();
  }
  function start() {
    if (closed || startupTimer || intervalTimer) return;
    const run = () => check().catch(() => {});
    startupTimer = setTimeout(run, startupDelayMs); startupTimer.unref?.();
    intervalTimer = setInterval(run, intervalMs); intervalTimer.unref?.();
  }
  async function close() { closed = true; clearTimeout(startupTimer); clearInterval(intervalTimer); await running?.catch(() => {}); }
  return { check, claim, markRead, start, close, view };
}
