'use strict';
// The server claims each announcement once, including across tabs and restarts.
window.createReleaseNotifications = function ({ api, openProject, toast, escapeHTML }) {
  const $ = selector => document.querySelector(selector);
  const e = escapeHTML;
  const bell = $('#updates-button'), panel = $('#updates-panel'), popup = $('#update-popup');
  const preferenceKey = 'orbit-release-desktop-enabled';
  let items = [], metadata = {}, listSignature = '', claiming = false, retryAt = 0, timer;
  let desktopEnabled = true;
  try { desktopEnabled = localStorage.getItem(preferenceKey) !== 'off'; } catch {}
  const permission = () => 'Notification' in window ? Notification.permission : 'unsupported';
  const releaseURL = item => /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(item.fullName || '') ? 'https://github.com/' + item.fullName + '/releases/tag/' + encodeURIComponent(item.tag) : 'https://github.com/';
  function position() {
    const header = $('.console-top')?.getBoundingClientRect();
    const appBar = $('.app-bar')?.getBoundingClientRect();
    const top = header?.height ? header.bottom : appBar?.bottom || 16;
    $('.app-shell')?.style.setProperty('--updates-top', Math.max(16, top + 10) + 'px');
  }
  function closePanel() { panel.hidden = true; bell.setAttribute('aria-expanded', 'false'); }
  function openPanel() {
    position(); popup.hidden = true; clearTimeout(timer); panel.hidden = false;
    bell.setAttribute('aria-expanded', 'true'); render();
    panel.querySelector('button')?.focus();
  }
  function desktopState() {
    const value = permission();
    const active = value === 'granted' && desktopEnabled;
    $('#updates-desktop').textContent = active ? 'Desativar no Windows' : 'Ativar no Windows';
    $('#updates-desktop').disabled = ['denied', 'unsupported'].includes(value);
    $('#updates-test').hidden = !active;
    $('#updates-permission').textContent = value === 'denied' ? 'O navegador bloqueou os avisos do Windows. Permita notificações nas configurações deste site. Os avisos dentro do Orbit continuam ativos.' : value === 'unsupported' ? 'Este navegador não oferece notificações do Windows. Os avisos dentro do Orbit continuam ativos.' : active ? 'Avisos do Windows ativos enquanto o Orbit estiver aberto no navegador, mesmo minimizado.' : 'Ative para receber avisos também no Windows. O navegador pede permissão uma vez.';
  }
  function render() {
    const unread = items.filter(item => !item.readAt).length;
    const count = $('#updates-count'); count.textContent = String(unread); count.hidden = !unread;
    bell.setAttribute('aria-label', 'Atualizações' + (unread ? ', ' + unread + ' não lidas' : ''));
    $('#updates-read-all').disabled = !unread;
    $('#updates-check').disabled = Boolean(metadata.checking);
    $('#updates-check').textContent = metadata.checking ? 'Verificando…' : 'Verificar agora';
    $('#updates-status').textContent = metadata.checking ? 'Procurando novas Releases…' : metadata.error || (metadata.lastCheckedAt ? 'Última verificação: ' + new Date(metadata.lastCheckedAt).toLocaleString('pt-BR') : 'A primeira verificação acontecerá em instantes.');
    $('#updates-status').classList.toggle('updates-error', Boolean(metadata.error));
    const signature = JSON.stringify(items);
    if (signature !== listSignature) {
      listSignature = signature;
      $('#updates-list').innerHTML = items.length ? items.map(item => '<article class="update-item' + (item.readAt ? ' is-read' : '') + '"><div class="update-item-heading"><strong>' + e(item.projectName) + '</strong>' + (!item.readAt ? '<span class="update-unread">Nova</span>' : '') + '</div><p>' + e(item.fullName) + '</p><p class="update-version">Versão ' + e(item.tag) + '</p><div class="update-item-actions"><a class="button small" href="' + e(releaseURL(item)) + '" target="_blank" rel="noopener noreferrer" data-update-release="' + e(item.id) + '">Ver Release</a><button class="button small" data-update-project="' + e(item.projectId) + '" data-update-id="' + e(item.id) + '">Ver projeto</button></div></article>').join('') : '<div class="updates-empty"><strong>Nenhum aviso por enquanto.</strong><p>Quando um projeto publicar uma nova Release, o aviso aparecerá aqui.</p></div>';
    }
    desktopState();
  }
  function showDesktop(title, body, tag) {
    if (permission() !== 'granted' || !desktopEnabled) return false;
    try {
      const notification = new Notification(title, { body, icon: '/icon.svg', tag });
      notification.onclick = () => { window.focus(); openPanel(); notification.close(); };
      return true;
    } catch { return false; }
  }
  function announce(batch) {
    if (!batch.length) return;
    const first = batch[0];
    const title = batch.length === 1 ? first.projectName + ' tem uma nova versão' : batch.length + ' projetos têm novas versões';
    const body = batch.length === 1 ? first.tag + ' disponível no GitHub.' : batch.slice(0, 3).map(item => item.projectName + ': ' + item.tag).join(' · ') + (batch.length > 3 ? '…' : '');
    $('#updates-live').textContent = title + '. ' + body;
    $('#update-popup-title').textContent = title;
    $('#update-popup-body').textContent = body;
    if (panel.hidden) {
      position(); popup.hidden = false; clearTimeout(timer);
      timer = setTimeout(() => { if (!popup.contains(document.activeElement) && !popup.matches(':hover')) popup.hidden = true; }, 10000);
    }
    showDesktop('Orbit · Nova versão disponível', batch.map(item => item.projectName + ': ' + item.tag).slice(0, 3).join('\n'), 'orbit-' + first.id);
  }
  async function sync(nextItems = [], nextMetadata = {}) {
    items = nextItems; metadata = nextMetadata; bell.hidden = false; render();
    const pending = items.filter(item => !item.readAt && !item.announcedAt);
    if (metadata.checking || !pending.length || claiming || Date.now() < retryAt) return;
    claiming = true;
    try {
      const claimed = await api('/notifications/claim', { method: 'POST', body: JSON.stringify({ ids: pending.map(item => item.id) }) });
      for (const item of claimed.items) { const local = items.find(value => value.id === item.id); if (local) local.announcedAt = item.announcedAt; }
      announce(claimed.items);
    } catch { retryAt = Date.now() + 30000; }
    finally { claiming = false; }
  }
  async function read(ids) {
    try { const result = await api('/notifications/read', { method: 'POST', body: JSON.stringify({ ids }) }); await sync(result.items, result); }
    catch (error) { toast(error.message); }
  }
  async function check() {
    const previousCheck = metadata.lastCheckedAt;
    metadata = { ...metadata, checking: true }; render();
    try {
      const result = await api('/updates/check', { method: 'POST', body: '{}' });
      await sync(result.items, result);
      if (result.error) toast(result.error);
      else if (result.lastCheckedAt === previousCheck) toast('As versões foram verificadas há pouco. Aguarde um minuto para verificar novamente.');
    } catch (error) { metadata = { ...metadata, checking: false, error: error.message }; render(); toast(error.message); }
  }
  bell.addEventListener('click', event => { event.stopPropagation(); panel.hidden ? openPanel() : closePanel(); });
  panel.addEventListener('click', async event => {
    const button = event.target.closest('button,a'); if (!button) return;
    event.stopPropagation();
    if (button.id === 'updates-close') { closePanel(); bell.focus(); }
    else if (button.id === 'updates-check') await check();
    else if (button.id === 'updates-read-all') await read('all');
    else if (button.dataset.updateRelease) await read([button.dataset.updateRelease]);
    else if (button.dataset.updateProject) { await read([button.dataset.updateId]); closePanel(); openProject(button.dataset.updateProject); }
    else if (button.id === 'updates-test') {
      if (!showDesktop('Orbit · Notificações ativadas', 'Novas Releases dos seus projetos serão avisadas aqui.', 'orbit-notifications-test')) toast('O navegador não conseguiu exibir o aviso. Os avisos dentro do Orbit continuam ativos.');
    } else if (button.id === 'updates-desktop') {
      button.disabled = true;
      try {
        if (permission() === 'granted' && desktopEnabled) desktopEnabled = false;
        else {
          const granted = permission() === 'granted' ? 'granted' : await Notification.requestPermission();
          desktopEnabled = granted === 'granted';
          if (desktopEnabled) showDesktop('Orbit · Notificações ativadas', 'Você receberá um aviso quando houver uma nova Release.', 'orbit-notifications-test');
        }
        try { localStorage.setItem(preferenceKey, desktopEnabled ? 'on' : 'off'); } catch {}
      } catch { toast('O navegador não permitiu ativar os avisos do Windows. Os avisos dentro do Orbit continuam ativos.'); }
      finally { desktopState(); }
    }
  });
  popup.addEventListener('click', event => {
    const button = event.target.closest('button'); if (!button) return;
    event.stopPropagation(); clearTimeout(timer);
    if (button.id === 'update-popup-open') openPanel(); else popup.hidden = true;
  });
  document.addEventListener('click', event => { if (!panel.hidden && !panel.contains(event.target) && !bell.contains(event.target)) closePanel(); });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !panel.hidden && (panel.contains(event.target) || bell.contains(event.target))) { event.preventDefault(); event.stopImmediatePropagation(); closePanel(); bell.focus(); }
  }, true);
  window.addEventListener('resize', position);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) desktopState(); });
  return { sync, check, open: openPanel };
};
