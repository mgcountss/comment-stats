import { loadDataset, normalize, merge, analyze, saveImported, loadImported, clearImported,
  fmt, fmtDate, fmtDateTime, dayKey, allDays, commentUrl, el } from './data.js';

const $ = s => document.querySelector(s);
const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
let base, A; // base dataset, analysis
let charts = {};

// ---------------- boot ----------------
(async function init() {
  try {
    base = await loadDataset();
    const imported = loadImported();
    let data = base, added = 0;
    if (imported) ({ data, added } = merge(base, imported));
    setData(data);
    if (imported) showBanner(`Including ${fmt(added)} comments from your imported export.`, true);
  } catch (e) {
    $('#loader span').textContent = e.message;
    console.error(e);
    return;
  }
  $('#loader').classList.add('hidden');
  openFromHash();
})();

function setData(d) {
  A = analyze(d);
  $('#updated').textContent = `${fmt(A.totals.posts)} posts · ${fmtDate(A.first)} – ${fmtDate(A.last)} · updated ${fmtDate(Date.parse(d.updatedAt) / 1000 || A.last)}`;
  renderKpis();
  renderActivity();
  renderHeatmap();
  renderTopLiked();
  table.rows = [...A.users.values()];
  rankBy('interactions');
  renderTable();
}

// ---------------- theme ----------------
$('#theme').addEventListener('click', () => {
  const root = document.documentElement;
  const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  root.dataset.theme = dark ? 'light' : 'dark';
  try { localStorage.setItem('comment-stats:theme', root.dataset.theme); } catch { }
  if (A) { renderActivity(); renderHeatmap(); if (current) renderProfileCharts(); }
});

// ---------------- KPIs ----------------
function renderKpis() {
  const t = A.totals;
  const items = [['Comments', t.comments], ['Replies', t.replies], ['Likes', t.likes], ['Total posts', t.posts], ['People', t.people], ['Videos', t.videos]];
  $('#kpis').replaceChildren(...items.map(([l, v]) => el('div', { class: 'kpi' }, el('div', { class: 'v', text: fmt(v) }), el('div', { class: 'l', text: l }))));
}

// ---------------- activity chart ----------------
const activity = { bucket: 'month', mode: 'count' };
segmented('#activity-bucket', v => { activity.bucket = v; renderActivity(); });
segmented('#activity-mode', v => { activity.mode = v; renderActivity(); });

function bucketKey(sec, bucket) {
  const d = new Date(sec * 1000);
  if (bucket === 'month') return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  if (bucket === 'week') { d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return dayKey(d / 1000); }
  return dayKey(sec);
}
function series(posts, bucket, cumulative, from = A.first, to = A.last) {
  const keys = [...new Set(allDays(from, to).map(k => bucketKey(Date.parse(k + 'T12:00') / 1000, bucket)))];
  const idx = new Map(keys.map((k, i) => [k, i]));
  const c = new Array(keys.length).fill(0), r = new Array(keys.length).fill(0);
  for (const p of posts) { const i = idx.get(bucketKey(p.p, bucket)); if (i != null) (p.r ? r : c)[i]++; }
  if (cumulative) for (let i = 1; i < keys.length; i++) { c[i] += c[i - 1]; r[i] += r[i - 1]; }
  return { keys, c, r };
}
function renderActivity() {
  const cum = activity.mode === 'cumulative';
  const { keys, c, r } = series(A.comments, activity.bucket, cum);
  const unit = activity.bucket;
  charts.activity?.destroy();
  charts.activity = new Chart($('#activity'), {
    type: cum ? 'line' : 'bar',
    data: { labels: keys, datasets: [
      { label: 'Comments', data: c, backgroundColor: css('--comment'), borderColor: css('--comment'), fill: cum, pointRadius: 0, borderWidth: cum ? 2 : 0, stack: 's' },
      { label: 'Replies', data: r, backgroundColor: css('--reply'), borderColor: css('--reply'), fill: cum, pointRadius: 0, borderWidth: cum ? 2 : 0, stack: 's' },
    ] },
    options: chartOpts({ scales: { x: { type: 'time', time: { unit, tooltipFormat: unit === 'month' ? 'MMM yyyy' : 'PP' }, stacked: true, grid: { display: false } }, y: { stacked: true, beginAtZero: true } } }),
  });
}
function chartOpts(extra = {}) {
  Chart.defaults.color = css('--muted');
  Chart.defaults.borderColor = css('--border');
  Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
  return { responsive: true, maintainAspectRatio: false, animation: { duration: 300 }, interaction: { mode: 'index', intersect: false },
    plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } } }, ...extra };
}

// ---------------- heatmap ----------------
function renderHeatmap() {
  const grid = Array.from({ length: 7 }, () => new Array(24).fill(0));
  for (const c of A.comments) { const d = new Date(c.p * 1000); grid[(d.getDay() + 6) % 7][d.getHours()]++; }
  const max = Math.max(...grid.flat()) || 1;
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const cells = [el('span')];
  for (let h = 0; h < 24; h++) cells.push(el('span', { class: 'hr', text: h % 3 === 0 ? String(h) : '' }));
  grid.forEach((row, di) => {
    cells.push(el('span', { class: 'lab', text: days[di] }));
    row.forEach((n, h) => cells.push(el('span', { class: 'cell', title: `${days[di]} ${h}:00 – ${fmt(n)} posts`, style: { opacity: 0.08 + 0.92 * (n / max) } })));
  });
  $('#heatmap').replaceChildren(...cells);
}

// ---------------- comment list rendering ----------------
function commentItem(c, { showAuthor = true } = {}) {
  const u = A.users.get(c.a);
  const url = commentUrl(c);
  const toId = c.r && (c.to || A.byId.get(c.r)?.a);
  return el('li', {},
    el('img', { src: u?.image || '', alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' }),
    el('div', {},
      el('div', { class: 'c-meta' },
        showAuthor ? el('b', { text: u?.name || c.a, onclick: () => openProfile(c.a) }) : null,
        el('span', { class: `tag ${c.r ? 'reply' : 'comment'}`, text: c.r ? 'reply' : 'comment' }),
        toId && toId !== c.a ? el('span', {}, 'to ', el('b', { text: A.users.get(toId)?.name || '', onclick: () => openProfile(toId) })) : null,
        el('span', { text: `♥ ${fmt(c.l)}` }),
        url ? el('a', { href: url, target: '_blank', rel: 'noopener', text: fmtDateTime(c.p) }) : el('span', { text: fmtDateTime(c.p) }),
        A.raw.videos[c.v] ? el('span', { text: `· ${A.raw.videos[c.v]}` }) : null),
      el('p', { class: 'c-text', text: c.t })));
}

let likedKind = 'all';
segmented('#liked-kind', v => { likedKind = v; renderTopLiked(); });
function renderTopLiked() {
  const list = A.comments.filter(c => likedKind === 'all' || (likedKind === 'r') === !!c.r).sort((a, b) => b.l - a.l).slice(0, 25);
  $('#top-liked').replaceChildren(...list.map(c => commentItem(c)));
}

// ---------------- leaderboard ----------------
const PAGE = 50;
const table = { rows: [], sortKey: 'interactions', asc: false, page: 0, query: '' };
const DATE_KEYS = new Set(['firstC', 'lastC', 'firstR', 'lastR']);

function rankBy(key) { // rank = position by total posts, stable across sorting
  [...table.rows].sort((a, b) => b[key] - a[key] || b.likesR - a.likesR).forEach((u, i) => { u.rank = i + 1; });
}
function sortedRows() {
  const { sortKey: k, asc } = table;
  const q = table.query.toLowerCase();
  let rows = q ? table.rows.filter(u => u.name.toLowerCase().includes(q) || u.id.toLowerCase() === q) : table.rows.slice();
  const dir = asc ? 1 : -1;
  rows.sort((a, b) => {
    if (k === 'name') return dir * a.name.localeCompare(b.name);
    const av = a[k], bv = b[k];
    if (av == null && bv == null) return 0;
    if (av == null) return 1; if (bv == null) return -1; // N/A always last
    return dir * (av - bv) || a.rank - b.rank;
  });
  return rows;
}
function renderTable() {
  const rows = sortedRows();
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  table.page = Math.min(table.page, pages - 1);
  const slice = rows.slice(table.page * PAGE, (table.page + 1) * PAGE);
  $('#table tbody').replaceChildren(...slice.map(u => el('tr', { onclick: () => openProfile(u.id), tabindex: 0, onkeydown: e => e.key === 'Enter' && openProfile(u.id) },
    el('td', { class: 'num rank', text: fmt(u.rank) }),
    el('td', { class: 'name' }, el('img', { src: u.image, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' }), u.name),
    ...['commentsG', 'repliesG', 'interactions', 'likesR', 'repliesR'].map(k => el('td', { class: 'num', text: fmt(u[k]) })),
    ...['firstC', 'lastC', 'firstR', 'lastR'].map(k => el('td', { text: fmtDate(u[k]) })))));
  document.querySelectorAll('#table th').forEach(th => {
    th.classList.toggle('sorted', th.dataset.k === table.sortKey || (table.sortKey === 'rank' && th.dataset.k === 'rank'));
    th.classList.toggle('asc', table.asc);
  });
  $('#pager').replaceChildren(
    el('button', { class: 'btn small', disabled: table.page === 0, onclick: () => { table.page--; renderTable(); } }, '← Prev'),
    el('span', { text: `${fmt(rows.length)} people · page ${table.page + 1} of ${pages}` }),
    el('button', { class: 'btn small', disabled: table.page >= pages - 1, onclick: () => { table.page++; renderTable(); } }, 'Next →'));
}
document.querySelectorAll('#table th').forEach(th => th.addEventListener('click', () => {
  const k = th.dataset.k;
  if (table.sortKey === k) table.asc = !table.asc;
  else { table.sortKey = k; table.asc = k === 'name' || k === 'rank' || DATE_KEYS.has(k); }
  table.page = 0; renderTable();
}));
$('#search').addEventListener('input', e => { table.query = e.target.value.trim(); table.page = 0; renderTable(); });

// ---------------- export ----------------
document.querySelectorAll('[data-export]').forEach(b => b.addEventListener('click', () => {
  const rows = sortedRows();
  const iso = s => s ? new Date(s * 1000).toISOString() : '';
  const cols = ['rank', 'name', 'id', 'commentsG', 'repliesG', 'interactions', 'likesR', 'repliesR', 'firstC', 'lastC', 'firstR', 'lastR'];
  const pick = u => Object.fromEntries(cols.map(k => [k, DATE_KEYS.has(k) ? iso(u[k]) : u[k]]));
  let blob, name;
  if (b.dataset.export === 'csv') {
    const esc = v => /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v;
    const lines = [cols.join(','), ...rows.map(u => cols.map(k => esc(pick(u)[k] ?? '')).join(','))];
    blob = new Blob([lines.join('\n')], { type: 'text/csv' }); name = 'commenters.csv';
  } else {
    blob = new Blob([JSON.stringify(rows.map(pick), null, 2)], { type: 'application/json' }); name = 'commenters.json';
  }
  const a = el('a', { href: URL.createObjectURL(blob), download: name }); a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}));

// ---------------- profile ----------------
let current = null;
const prof = { kind: 'all', sort: 'new', q: '', shown: 50, dir: 'to' };
segmented('#p-kind', v => { prof.kind = v; prof.shown = 50; renderPosts(); });
segmented('#p-sort', v => { prof.sort = v; prof.shown = 50; renderPosts(); });
segmented('#p-int-dir', v => { prof.dir = v; renderInteractions(); });
$('#p-search').addEventListener('input', e => { prof.q = e.target.value.trim().toLowerCase(); prof.shown = 50; renderPosts(); });
$('#p-more').addEventListener('click', () => { prof.shown += 100; renderPosts(); });
$('#p-close').addEventListener('click', () => $('#profile').close());
$('#profile').addEventListener('click', e => { if (e.target === e.currentTarget) e.currentTarget.close(); });
$('#profile').addEventListener('close', () => { current = null; history.replaceState(null, '', location.pathname + location.search); });
addEventListener('hashchange', openFromHash);

function openFromHash() {
  const m = location.hash.match(/user=([^&]+)/);
  if (m && A?.users.has(decodeURIComponent(m[1]))) openProfile(decodeURIComponent(m[1]));
}
function openProfile(id) {
  const u = A.users.get(id);
  if (!u) return;
  current = u;
  Object.assign(prof, { kind: 'all', sort: 'new', q: '', shown: 50 });
  $('#p-search').value = '';
  resetSeg('#p-kind', 'all'); resetSeg('#p-sort', 'new');
  $('#p-img').src = u.image || '';
  $('#p-name').textContent = u.name;
  const ch = $('#p-channel');
  ch.hidden = !/^UC/.test(u.id);
  ch.href = `https://www.youtube.com/channel/${u.id}`;
  const stat = (v, l) => el('div', {}, el('b', { text: v }), el('span', { text: l }));
  const activeDays = new Set(u.posts.map(p => dayKey(p.p))).size;
  $('#p-stats').replaceChildren(
    stat(`#${fmt(u.rank)}`, 'Rank'), stat(fmt(u.commentsG), 'Comments'), stat(fmt(u.repliesG), 'Replies'), stat(fmt(u.interactions), 'Total posts'),
    stat(fmt(u.likesR), 'Likes received'), stat(fmt(u.repliesR), 'Replies received'), stat(fmt(activeDays), 'Active days'),
    stat((u.likesR / u.interactions).toFixed(1), 'Avg likes / post'),
    stat(fmtDate(u.firstC), 'First comment'), stat(fmtDate(u.lastC), 'Last comment'), stat(fmtDate(u.firstR), 'First reply'), stat(fmtDate(u.lastR), 'Last reply'));
  if (!$('#profile').open) $('#profile').showModal();
  $('#profile').scrollTop = 0;
  history.replaceState(null, '', `#user=${encodeURIComponent(id)}`);
  renderProfileCharts();
  renderPosts();
}
function renderProfileCharts() {
  const u = current;
  const span = (u.posts.at(-1).p - u.posts[0].p) / 86400;
  const bucket = span > 400 ? 'week' : 'day';
  const { keys, c, r } = series(u.posts, bucket, true, u.posts[0].p, u.posts.at(-1).p);
  charts.p?.destroy();
  charts.p = new Chart($('#p-chart'), {
    type: 'line',
    data: { labels: keys, datasets: [
      { label: 'Comments', data: c, borderColor: css('--comment'), backgroundColor: css('--comment'), pointRadius: 0, borderWidth: 2, stepped: true },
      { label: 'Replies', data: r, borderColor: css('--reply'), backgroundColor: css('--reply'), pointRadius: 0, borderWidth: 2, stepped: true },
    ] },
    options: chartOpts({ scales: { x: { type: 'time', time: { tooltipFormat: 'PP' }, grid: { display: false } }, y: { beginAtZero: true } } }),
  });
  renderInteractions();
}
function renderInteractions() {
  const m = prof.dir === 'to' ? current.repliedTo : current.repliedBy;
  const sorted = [...m.entries()].sort((a, b) => b[1] - a[1]);
  $('#p-unique').textContent = `· ${fmt(sorted.length)} people`;
  const top = sorted.slice(0, 9);
  const rest = sorted.slice(9).reduce((s, [, n]) => s + n, 0);
  const labels = top.map(([id]) => A.users.get(id)?.name || id);
  const data = top.map(([, n]) => n);
  if (rest) { labels.push('Everyone else'); data.push(rest); }
  const palette = ['#3e63dd', '#e5484d', '#30a46c', '#f76b15', '#8e4ec6', '#12a594', '#d6409f', '#ffc53d', '#0090ff', '#8b8d98'];
  charts.int?.destroy();
  charts.int = new Chart($('#p-int'), {
    type: 'doughnut',
    data: { labels: labels.length ? labels : ['No replies yet'], datasets: [{ data: data.length ? data : [1], backgroundColor: data.length ? palette : [css('--border')], borderColor: css('--surface'), borderWidth: 2 }] },
    options: chartOpts({ interaction: { mode: 'nearest' }, cutout: '55%', plugins: { legend: { position: 'right', labels: { usePointStyle: true, boxWidth: 8 } },
      tooltip: { callbacks: { label: ctx => data.length ? ` ${ctx.label}: ${fmt(ctx.raw)} replies` : ' No replies' } } },
      onClick: (_, els) => { const i = els[0]?.index; if (i != null && top[i]) openProfile(top[i][0]); } }),
  });
}
function renderPosts() {
  let posts = current.posts.filter(p => prof.kind === 'all' || (prof.kind === 'r') === !!p.r);
  if (prof.q) posts = posts.filter(p => p.t.toLowerCase().includes(prof.q));
  posts = posts.slice().sort(prof.sort === 'likes' ? (a, b) => b.l - a.l : prof.sort === 'old' ? (a, b) => a.p - b.p : (a, b) => b.p - a.p);
  $('#p-posts').replaceChildren(...posts.slice(0, prof.shown).map(c => commentItem(c, { showAuthor: false })));
  $('#p-more').hidden = posts.length <= prof.shown;
  $('#p-more').textContent = `Show more (${fmt(posts.length - prof.shown)} left)`;
}

// ---------------- import ----------------
$('#import').addEventListener('change', e => e.target.files[0] && importFile(e.target.files[0]));
addEventListener('dragover', e => { e.preventDefault(); document.body.classList.add('drop-active'); });
addEventListener('dragleave', e => { if (!e.relatedTarget) document.body.classList.remove('drop-active'); });
addEventListener('drop', e => { e.preventDefault(); document.body.classList.remove('drop-active'); const f = e.dataTransfer.files[0]; if (f) importFile(f); });

async function importFile(file) {
  try {
    const d = normalize(JSON.parse(await file.text()));
    const prev = loadImported();
    const combined = prev ? merge(prev, d).data : d;
    const { data, added } = merge(base, combined);
    setData(data);
    const saved = saveImported(combined);
    showBanner(`Imported ${fmt(d.comments.length)} posts (${fmt(added)} not in the published data).${saved ? ' Saved in this browser.' : ' Too large to remember after refresh.'}`, true);
  } catch (err) {
    showBanner(`Couldn't import ${file.name}: ${err.message}`);
  }
}
function showBanner(text, withReset = false) {
  const b = $('#import-banner');
  b.hidden = false;
  b.replaceChildren(el('span', { text }),
    withReset ? el('button', { class: 'btn small', onclick: () => { clearImported(); setData(base); b.hidden = true; } }, 'Remove import') : null,
    el('button', { class: 'btn small', onclick: () => { b.hidden = true; } }, 'Dismiss'));
}

// ---------------- utils ----------------
function segmented(sel, onChange) {
  const g = $(sel);
  g.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    g.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    onChange(b.dataset.v);
  });
}
function resetSeg(sel, v) { $(sel).querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === v)); }
