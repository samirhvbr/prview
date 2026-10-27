/** Keep only explicitly supplied, valid display settings; never retain credentials. */
export function sanitizeDisplayParams(search) {
  const params = new URLSearchParams(search);
  const clean = new URLSearchParams();
  const single = (name) => params.getAll(name).length === 1 ? params.get(name) : null;
  for (const name of ['tv', 'rotate']) {
    const value = single(name);
    if (value === '1' || value === '0') clean.set(name, value);
  }
  const integer = (name, min, max) => {
    const value = single(name);
    if (value === null || !/^\d{1,5}$/.test(value)) return null;
    const number = Number(value);
    return number >= min && number <= max ? number : null;
  };
  for (const [name, min, max] of [['page_seconds', 5, 300], ['page_size', 1, 20], ['reload_seconds', 30, 86400]]) {
    const value = name === 'reload_seconds' && single(name) === '0' ? 0 : integer(name, min, max);
    if (value !== null) clean.set(name, String(value));
  }
  const repo = single('repo');
  const validRepo = repo && /^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?\/[a-z\d_.-]{1,100}$/i.test(repo)
    && !['.', '..'].includes(repo.split('/')[1]);
  if (validRepo) clean.set('repo', repo);
  const status = single('status');
  if (['attention', 'review', 'approved', 'draft'].includes(status)) clean.set('status', status);
  const query = single('q');
  if (query !== null && query.length <= 200 && !/[\u0000-\u001f\u007f]/.test(query) && query.trim()) clean.set('q', query.trim());
  return clean;
}

/** Parse display-only options, sharing validation with the HTTP token redirect. */
export function parseDisplayOptions(search, { savedTv = false } = {}) {
  const params = sanitizeDisplayParams(search);
  return {
    tv: params.has('tv') ? params.get('tv') === '1' : savedTv === true,
    rotate: params.has('rotate') ? params.get('rotate') === '1' : true,
    pageSeconds: params.has('page_seconds') ? Number(params.get('page_seconds')) : null,
    pageSize: params.has('page_size') ? Number(params.get('page_size')) : null,
    // Full reload interrupts interactive filters; enable it only through the link.
    reloadSeconds: params.has('reload_seconds') ? Number(params.get('reload_seconds')) : 0,
    repo: params.get('repo') ?? '',
    status: params.get('status') ?? '',
    query: params.get('q') ?? '',
  };
}

export function filterKey({ repo = '', status = '', query = '' }) {
  return JSON.stringify([repo.toLowerCase(), status, query.trim().toLocaleLowerCase('pt-BR')]);
}

/** Only resume the page when the link's filters still describe the same queue. */
export function readSavedPage(raw, expectedFilterKey) {
  try {
    const saved = JSON.parse(raw);
    return saved?.filterKey === expectedFilterKey && Number.isSafeInteger(saved.page) && saved.page >= 0
      ? saved.page : null;
  } catch { return null; }
}
