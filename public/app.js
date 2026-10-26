import { parseDisplayOptions, filterKey, readSavedPage } from './options.js';

const $ = (id) => document.getElementById(id);
const DAY = 86_400_000;
let savedTv = false;
try { savedTv = localStorage.getItem('prview.tv') === '1'; } catch { /* Storage is optional. */ }
const displayOptions = parseDisplayOptions(window.location.search, { savedTv });
let savedPage = null;
try { savedPage = readSavedPage(sessionStorage.getItem('prview.page'), filterKey(displayOptions)); } catch { /* Kiosk storage may be unavailable. */ }
const state = { snapshot: null, page: 0, pageSize: displayOptions.pageSize ?? 5, rotation: displayOptions.rotate, elapsed: 0, lastTick: performance.now(), loading: false, unauthorized: false, offline: false, hovered: false, interacting: false, rowsKey: '', tv: displayOptions.tv, repoFilter: displayOptions.repo };
const dateFormat = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' });
const clockFormat = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const numberFormat = new Intl.NumberFormat('pt-BR');

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function daysSince(value) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? Math.max(0, Math.floor((Date.now() - timestamp) / DAY)) : 0;
}

function relative(value) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return '—';
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `há ${minutes} min`;
  if (minutes < 1440) return `há ${Math.floor(minutes / 60)} h`;
  return `há ${Math.floor(minutes / 1440)} d`;
}

function validGitHubUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'github.com' && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

function needsAttention(pr) {
  return pr.reviewDecision === 'CHANGES_REQUESTED' || ['FAILURE', 'ERROR'].includes(pr.checks) || pr.mergeable === 'CONFLICTING';
}

function waitingReview(pr) {
  return !pr.isDraft && pr.reviewDecision === 'REVIEW_REQUIRED';
}

function review(pr) {
  if (pr.isDraft) return ['draft', 'Rascunho'];
  if (pr.reviewDecision === 'CHANGES_REQUESTED') return ['changes', 'Ajustes pedidos'];
  if (pr.reviewDecision === 'APPROVED') return ['approved', 'Aprovado'];
  if (waitingReview(pr)) return ['review', 'Aguardando revisão'];
  return ['open', 'Em aberto'];
}

function checks(value) {
  if (value === 'SUCCESS') return ['success', '✓', 'Passando'];
  if (['FAILURE', 'ERROR'].includes(value)) return ['failure', '×', 'Falhando'];
  if (['PENDING', 'EXPECTED'].includes(value)) return ['pending', '◷', 'Em execução'];
  return ['none', '—', 'Não informado'];
}

function allPRs() { return state.snapshot?.pullRequests ?? []; }

function filteredPRs() {
  const query = $('search').value.trim().toLocaleLowerCase('pt-BR');
  const repo = state.repoFilter;
  const status = $('status-filter').value;
  return allPRs().filter((pr) => {
    if (repo && pr.repository.toLowerCase() !== repo.toLowerCase()) return false;
    if (query && !`${pr.repository} ${pr.title} #${pr.number}`.toLocaleLowerCase('pt-BR').includes(query)) return false;
    if (status === 'attention' && !needsAttention(pr)) return false;
    if (status === 'review' && !waitingReview(pr)) return false;
    if (status === 'approved' && (pr.isDraft || pr.reviewDecision !== 'APPROVED')) return false;
    if (status === 'draft' && !pr.isDraft) return false;
    return true;
  });
}

function renderPR(pr) {
  const row = element('article', `pr-row${needsAttention(pr) ? ' needs-attention' : ''}`);
  const identity = element('div', 'pr-identity');
  const repoLine = element('div', 'repo-line');
  const repoName = element('span', 'repo-name', pr.repository);
  repoName.title = pr.repository;
  repoLine.append(repoName, element('span', 'repo-divider', '/'), element('span', 'pr-number', `#${pr.number}`));
  if (pr.isPrivate) repoLine.append(element('span', 'private-badge', 'PRIVADO'));
  const safeUrl = validGitHubUrl(pr.url);
  const title = element(safeUrl ? 'a' : 'span', 'pr-title', pr.title);
  title.title = pr.title;
  if (safeUrl) { title.href = safeUrl; title.target = '_blank'; title.rel = 'noopener noreferrer'; }
  identity.append(repoLine, title);
  const reviewCell = element('div', 'review-cell');
  const [reviewClass, reviewText] = review(pr);
  const badge = element('span', `status-badge ${reviewClass}`, reviewText);
  reviewCell.append(badge);
  if (pr.mergeable === 'CONFLICTING') reviewCell.append(element('span', 'conflict', 'Conflito de merge'));
  const [checkClass, checkIcon, checkText] = checks(pr.checks);
  const checkCell = element('div', `checks-cell ${checkClass}`);
  const symbol = element('span', 'check-symbol', checkIcon);
  symbol.setAttribute('aria-hidden', 'true');
  checkCell.append(symbol, element('span', '', checkText));
  const age = daysSince(pr.createdAt);
  const ageCell = element('div', 'age-cell');
  const ageValue = element('div', `age-number${age >= (state.snapshot?.staleDays ?? 14) ? ' old' : ''}`, age === 0 ? '<1' : numberFormat.format(age));
  ageValue.append(element('span', 'age-unit', age === 1 ? 'dia' : 'dias'));
  const created = new Date(pr.createdAt);
  ageCell.title = Number.isFinite(created.getTime()) ? `Aberto em ${created.toLocaleString('pt-BR')}` : '';
  ageCell.append(ageValue, element('span', 'date-label', Number.isFinite(created.getTime()) ? dateFormat.format(created).replace('.', '') : ''));
  const inactive = daysSince(pr.updatedAt) >= (state.snapshot?.staleDays ?? 14);
  const activity = element('div', `activity-cell${inactive ? ' stale' : ''}`, relative(pr.updatedAt));
  if (inactive) activity.append(element('span', '', 'Sem novidades'));
  row.append(identity, reviewCell, checkCell, ageCell, activity);
  return row;
}

function renderMetrics() {
  const prs = allPRs();
  const ready = Boolean(state.snapshot?.updatedAt);
  $('metric-total').textContent = ready ? numberFormat.format(prs.length) : '—';
  $('metric-repos').textContent = ready ? numberFormat.format(new Set(prs.map((pr) => pr.repository)).size) : '—';
  $('metric-review').textContent = ready ? numberFormat.format(prs.filter(waitingReview).length) : '—';
  $('metric-oldest').textContent = ready && prs.length ? (daysSince(prs[0].createdAt) || '<1') : '—';
  $('metric-oldest-unit').textContent = ready && prs.length ? (daysSince(prs[0].createdAt) === 1 ? 'dia' : 'dias') : '';
  $('oldest-repo').textContent = prs[0] ? `${prs[0].repository} #${prs[0].number}` : ready ? 'Nenhum PR na fila' : 'Aguardando primeira leitura';
  if (state.snapshot?.username) $('author').textContent = `@${state.snapshot.username}`;
}

function updateRepoOptions() {
  const selected = state.repoFilter;
  const repos = [...new Set(allPRs().map((pr) => pr.repository))].sort((a, b) => a.localeCompare(b));
  const selectedRepo = repos.find((repo) => repo.toLowerCase() === selected.toLowerCase());
  // Keep explicit filters even before data arrives or after their last PR closes.
  if (selected && !selectedRepo) repos.push(selected);
  if (selectedRepo) state.repoFilter = selectedRepo;
  const key = repos.join('\n');
  if ($('repo-filter').dataset.optionsKey === key) return;
  $('repo-filter').dataset.optionsKey = key;
  const first = element('option', '', 'Todos os repositórios');
  first.value = '';
  $('repo-filter').replaceChildren(first, ...repos.map((repo) => { const option = element('option', '', repo); option.value = repo; return option; }));
  $('repo-filter').value = state.repoFilter;
}

function renderFilterSummary() {
  const parts = [];
  if (state.repoFilter) parts.push(state.repoFilter);
  if ($('status-filter').value) parts.push($('status-filter').selectedOptions[0].textContent);
  if ($('search').value.trim()) parts.push(`Busca: “${$('search').value.trim()}”`);
  $('filter-summary').hidden = !state.tv || !parts.length;
  $('filter-summary-text').textContent = parts.join(' · ');
}

function renderNotice() {
  const notice = $('notice');
  const snapshot = state.snapshot;
  let title = '', detail = '';
  if (state.unauthorized) {
    title = 'Este navegador precisa de acesso ao painel.';
    detail = 'Abra novamente o link original com o token de acesso. Não é necessário fazer login.';
  } else if (state.offline) {
    title = 'Não foi possível atualizar o painel.';
    detail = snapshot?.updatedAt ? 'A última leitura foi mantida. A conexão será tentada novamente automaticamente.' : 'Verifique a conexão com o servidor. Uma nova tentativa será feita automaticamente.';
  } else if (snapshot?.error || snapshot?.stale) {
    title = snapshot.updatedAt ? 'Exibindo a última leitura disponível.' : 'Aguardando conexão com o GitHub.';
    detail = snapshot.error?.message || 'Os dados estão desatualizados. Uma nova leitura será tentada automaticamente.';
    const retry = new Date(snapshot.retryAt);
    if (snapshot.retryAt && Number.isFinite(retry.getTime()) && retry.getTime() > Date.now()) detail += ` Nova tentativa a partir de ${retry.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.`;
  }
  notice.hidden = !title;
  notice.classList.toggle('error', state.unauthorized);
  $('notice-title').textContent = title;
  $('notice-detail').textContent = detail;
  let status = 'Conectando', className = '';
  if (state.unauthorized) { status = 'Acesso expirado'; className = 'error'; }
  else if (state.offline) { status = 'Sem conexão'; className = 'warning'; }
  else if (snapshot?.error || snapshot?.stale) { status = 'Dados pendentes'; className = 'warning'; }
  else if (snapshot?.updatedAt) { status = 'Sincronizado'; className = 'live'; }
  $('connection').className = `connection ${className}`;
  $('connection-text').textContent = status;
}

function measurePageSize() {
  if (displayOptions.pageSize !== null) return displayOptions.pageSize;
  if (window.innerWidth <= 720) return 5;
  const rowHeight = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--row-height')) || 88;
  const rowsTop = $('rows').getBoundingClientRect().top;
  const reserved = document.querySelector('.queue-footer')?.offsetHeight || 65;
  const available = window.innerHeight - rowsTop - reserved - 56;
  return Math.max(1, Math.min(15, Math.floor(available / rowHeight)));
}

function renderRows(force = false) {
  renderFilterSummary();
  const prs = filteredPRs();
  state.pageSize = measurePageSize();
  const pageCount = Math.max(1, Math.ceil(prs.length / state.pageSize));
  if (savedPage !== null && state.snapshot?.updatedAt) {
    // Apply only after the complete queue and responsive page size are known.
    state.page = savedPage;
    savedPage = null;
  }
  state.page = Math.min(state.page, pageCount - 1);
  const start = state.page * state.pageSize;
  const pageRows = prs.slice(start, start + state.pageSize);
  const key = JSON.stringify([pageRows, state.snapshot?.staleDays, Math.floor(Date.now() / 60_000)]);
  if (force || key !== state.rowsKey) {
    $('rows').replaceChildren(...pageRows.map(renderPR));
    state.rowsKey = key;
  }
  const hasData = Boolean(state.snapshot?.updatedAt);
  $('filtered-count').textContent = hasData ? numberFormat.format(prs.length) : '—';
  $('empty-state').hidden = pageRows.length > 0;
  $('clear-filters').hidden = true;
  if (!pageRows.length) {
    if (state.unauthorized) {
      $('empty-icon').textContent = '⌁';
      $('empty-title').textContent = 'Abra seu link de acesso';
      $('empty-description').textContent = 'Use o endereço com o token configurado para esta instalação.';
    } else if (!hasData && (state.offline || state.snapshot?.error)) {
      $('empty-icon').textContent = '◷';
      $('empty-title').textContent = 'A primeira leitura ainda não chegou';
      $('empty-description').textContent = 'O painel tentará se conectar novamente. Os dados aparecerão aqui quando a leitura estiver completa.';
    } else if (hasData && !allPRs().length) {
      $('empty-icon').textContent = '✓';
      $('empty-title').textContent = 'Tudo em dia por aqui';
      $('empty-description').textContent = 'Nenhum pull request em aberto acessível com as permissões desta instalação.';
    } else if (hasData) {
      $('empty-icon').textContent = '⌕';
      $('empty-title').textContent = 'Nenhum PR com estes filtros';
      $('empty-description').textContent = 'Tente outro termo, repositório ou status para encontrar uma contribuição.';
      $('clear-filters').hidden = false;
    }
  }
  $('range').textContent = hasData ? (prs.length ? `${numberFormat.format(start + 1)}–${numberFormat.format(Math.min(start + state.pageSize, prs.length))} de ${numberFormat.format(prs.length)} pull requests` : '0 pull requests') : 'Aguardando dados';
  $('page-indicator').replaceChildren(document.createTextNode(String(state.page + 1).padStart(2, '0')), element('span', '', `/ ${String(pageCount).padStart(2, '0')}`));
  $('previous').disabled = pageCount <= 1;
  $('next').disabled = pageCount <= 1;
  $('rotate').disabled = pageCount <= 1;
  $('page-progress').hidden = pageCount <= 1;
  updateRotationLabel();
}

function render() {
  renderMetrics();
  updateRepoOptions();
  renderNotice();
  renderRows();
  updateClock();
}

function updateClock() {
  const now = new Date();
  $('clock').textContent = clockFormat.format(now);
  $('clock').dateTime = now.toISOString();
  $('today').textContent = now.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '');
  const reloadNote = displayOptions.reloadSeconds ? ` · reload ${displayOptions.reloadSeconds % 60 === 0 ? `${displayOptions.reloadSeconds / 60} min` : `${displayOptions.reloadSeconds}s`}` : '';
  $('sync-status').textContent = state.snapshot?.updatedAt ? `Última leitura ${relative(state.snapshot.updatedAt)} · consulta ${state.snapshot.refreshSeconds ?? 60}s${reloadNote}` : 'Aguardando sincronização';
}

function rememberPage() {
  try {
    sessionStorage.setItem('prview.page', JSON.stringify({
      page: savedPage ?? state.page,
      filterKey: filterKey({ repo: state.repoFilter, status: $('status-filter').value, query: $('search').value }),
    }));
  } catch { /* Reload still works when session storage is disabled. */ }
}

function updateRotationLabel() {
  $('rotate').setAttribute('aria-pressed', String(state.rotation));
  $('rotate-icon').textContent = state.rotation ? 'Ⅱ' : '▶';
  $('rotate-label').textContent = state.rotation ? 'Rotação automática' : 'Rotação pausada';
  $('rotate').title = state.rotation ? 'Pausar rotação das páginas' : 'Retomar rotação das páginas';
}

function changePage(direction) {
  const pageCount = Math.max(1, Math.ceil(filteredPRs().length / state.pageSize));
  state.page = (state.page + direction + pageCount) % pageCount;
  state.elapsed = 0;
  $('page-progress').value = 0;
  renderRows();
}

function resetFilters() {
  savedPage = null;
  $('search').value = '';
  $('repo-filter').value = '';
  $('status-filter').value = '';
  state.repoFilter = '';
  state.page = 0;
  state.elapsed = 0;
  renderRows();
}

async function load() {
  if (state.loading || state.unauthorized) return;
  state.loading = true;
  $('refresh').disabled = true;
  document.body.classList.add('is-refreshing');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);
  try {
    const response = await fetch('/api/dashboard', { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' }, signal: controller.signal });
    if (response.status === 401 || response.status === 403) {
      state.unauthorized = true;
      state.snapshot = null;
      state.offline = false;
      state.page = 0;
      return;
    }
    if (!response.ok) throw new Error('unavailable');
    const snapshot = await response.json();
    if (!snapshot || !Array.isArray(snapshot.pullRequests)) throw new Error('invalid response');
    snapshot.pullRequests.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || String(a.id).localeCompare(String(b.id)));
    state.snapshot = snapshot;
    state.offline = false;
  } catch {
    state.offline = true;
  } finally {
    clearTimeout(timeout);
    state.loading = false;
    $('refresh').disabled = state.unauthorized;
    document.body.classList.remove('is-refreshing');
    render();
  }
}

function setTvMode(enabled) {
  state.tv = enabled;
  document.body.classList.toggle('tv-mode', enabled);
  $('tv-mode').setAttribute('aria-pressed', String(enabled));
  // TV hides the controls but keeps a visible summary of any active filters.
  try { localStorage.setItem('prview.tv', enabled ? '1' : '0'); } catch { /* Storage may be disabled on kiosk browsers. */ }
  state.page = 0;
  state.elapsed = 0;
  renderRows(true);
}

$('refresh').addEventListener('click', load);
$('tv-mode').addEventListener('click', () => setTvMode(!state.tv));
$('fullscreen').addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
  } catch { $('fullscreen').title = 'Tela cheia indisponível neste navegador. Use o modo TV.'; }
});
if (!document.documentElement.requestFullscreen) { $('fullscreen').hidden = true; }
document.addEventListener('fullscreenchange', () => {
  $('fullscreen').setAttribute('aria-label', document.fullscreenElement ? 'Sair da tela cheia' : 'Entrar em tela cheia');
  renderRows(true);
});
$('rotate').addEventListener('click', () => { state.rotation = !state.rotation; state.elapsed = 0; updateRotationLabel(); });
$('previous').addEventListener('click', () => changePage(-1));
$('next').addEventListener('click', () => changePage(1));
for (const id of ['search', 'repo-filter', 'status-filter']) {
  $(id).addEventListener(id === 'search' ? 'input' : 'change', () => {
    savedPage = null;
    if (id === 'repo-filter') state.repoFilter = $('repo-filter').value;
    state.page = 0;
    state.elapsed = 0;
    renderRows();
  });
}
$('clear-filters').addEventListener('click', resetFilters);
$('rows').addEventListener('mouseenter', () => { state.hovered = true; });
$('rows').addEventListener('mouseleave', () => { state.hovered = false; });
$('queue').addEventListener('focusin', (event) => { state.interacting = Boolean(event.target.closest('input, select, a')); });
$('queue').addEventListener('focusout', (event) => { state.interacting = Boolean(event.relatedTarget?.closest('input, select, a') && $('queue').contains(event.relatedTarget)); });
window.addEventListener('resize', () => { state.elapsed = 0; renderRows(true); });
window.addEventListener('online', load);
window.addEventListener('beforeunload', rememberPage);
document.addEventListener('visibilitychange', () => { state.lastTick = performance.now(); if (!document.hidden) load(); });
$('search').value = displayOptions.query;
$('status-filter').value = displayOptions.status;
updateRepoOptions();
setTvMode(state.tv);
updateClock();
load();
if (displayOptions.reloadSeconds > 0) {
  setTimeout(() => { rememberPage(); window.location.reload(); }, displayOptions.reloadSeconds * 1000);
}
setInterval(load, 15_000);
setInterval(() => {
  const now = performance.now();
  const delta = Math.min(1500, now - state.lastTick);
  state.lastTick = now;
  updateClock();
  const pageCount = Math.ceil(filteredPRs().length / state.pageSize);
  if (!state.rotation || (state.hovered && !state.tv) || state.interacting || document.hidden || pageCount <= 1) return;
  const interval = (displayOptions.pageSeconds ?? Math.max(5, Number(state.snapshot?.pageSeconds) || 15)) * 1000;
  state.elapsed += delta;
  $('page-progress').value = Math.min(100, state.elapsed / interval * 100);
  if (state.elapsed >= interval) changePage(1);
}, 500);
