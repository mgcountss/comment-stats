import { loadDataset, loadImported, merge, analyze, fmt, fmtDate, colorFor, el } from './data.js';

const $ = s => document.querySelector(s);
let A, frames = [], idx = 0, timer = null, nodes = new Map();
const S = { metric: 'posts', topN: 15, speed: 3, step: 'week' };
const H = () => (innerWidth < 640 ? 30 : 38);

(async () => {
  try {
    let d = await loadDataset();
    const imp = loadImported();
    if (imp) d = merge(d, imp).data;
    A = analyze(d);
  } catch (e) { $('#loader span').textContent = e.message; return; }
  $('#updated').textContent = `${fmt(A.totals.posts)} posts · ${fmt(A.totals.people)} people · ${fmtDate(A.first)} – ${fmtDate(A.last)}`;
  $('#loader').classList.add('hidden');
  build();
  draw();
})();

// Frames: cumulative totals at the end of each step. Only stores per-step deltas
// and the running values of people who are ever in contention to keep memory low.
function stepKey(sec) {
  const d = new Date(sec * 1000);
  if (S.step === 'month') return new Date(d.getFullYear(), d.getMonth() + 1, 1) / 1000 - 1;
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1) / 1000 - 1;
  if (S.step === 'day') return day;
  const add = (7 - d.getDay()) % 7; // end of week (Sunday)
  return day + add * 86400;
}
function value(c) {
  if (S.metric === 'likes') return c.l || 0;
  if (S.metric === 'c') return c.r ? 0 : 1;
  if (S.metric === 'r') return c.r ? 1 : 0;
  return 1;
}
function build() {
  const totals = new Map();
  frames = [];
  let cur = null, end = 0;
  const push = () => {
    const top = [...totals.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, S.topN);
    frames.push({ t: end, top });
  };
  for (const c of A.comments) {
    const k = stepKey(c.p);
    if (cur !== null && k !== cur) { push(); }
    cur = k; end = k;
    const v = value(c);
    if (v) totals.set(c.a, (totals.get(c.a) || 0) + v);
  }
  if (cur !== null) push();
  idx = Math.min(idx, frames.length - 1);
  $('#scrub').max = frames.length - 1;
}

function draw() {
  const f = frames[idx];
  if (!f) return;
  const h = H(), race = $('#race');
  race.style.setProperty('--h', `${h}px`);
  race.style.setProperty('--dur', `${Math.min(0.45, 0.9 / S.speed)}s`);
  race.style.height = `${S.topN * (h + 6)}px`;
  const max = f.top[0]?.[1] || 1;
  const live = new Set();
  f.top.forEach(([id, v], i) => {
    live.add(id);
    let n = nodes.get(id);
    if (!n) {
      const u = A.users.get(id);
      n = el('div', { class: 'bar', style: { transform: `translateY(${S.topN * (h + 6)}px)`, opacity: 0 } },
        el('span', { class: 'rk' }),
        el('img', { src: u?.image || '', alt: '', referrerpolicy: 'no-referrer' }),
        el('span', { class: 'label', text: u?.name || id }),
        el('div', { class: 'track' }, el('div', { class: 'fill', style: { background: colorFor(id) } }), el('span', { class: 'val' })));
      race.append(n); nodes.set(id, n);
      n.offsetWidth; // start the enter transition from below
    }
    n.style.transform = `translateY(${i * (h + 6)}px)`;
    n.style.opacity = 1;
    n.querySelector('.rk').textContent = i + 1;
    n.querySelector('.fill').style.width = `calc(${(v / max) * 100}% - ${(v / max) * 4}rem)`;
    n.querySelector('.val').textContent = fmt(v);
  });
  for (const [id, n] of nodes) if (!live.has(id)) {
    n.style.transform = `translateY(${(S.topN + 2) * (h + 6)}px)`; n.style.opacity = 0;
  }
  // prune nodes that have been off-screen for a while
  if (nodes.size > S.topN * 4) for (const [id, n] of nodes) if (!live.has(id)) { n.remove(); nodes.delete(id); }
  $('#date').textContent = new Date(f.t * 1000).toLocaleDateString(undefined, S.step === 'month' ? { year: 'numeric', month: 'short' } : { year: 'numeric', month: 'short', day: 'numeric' });
  $('#scrub').value = idx;
}

function play() {
  if (timer) return pause();
  if (idx >= frames.length - 1) idx = 0;
  $('#play').textContent = '❚❚ Pause';
  const tick = () => {
    if (idx >= frames.length - 1) return pause();
    idx++; draw();
    timer = setTimeout(tick, 1000 / S.speed);
  };
  tick();
}
function pause() { clearTimeout(timer); timer = null; $('#play').textContent = '▶ Play'; }
function reset() { nodes.forEach(n => n.remove()); nodes.clear(); }

$('#play').addEventListener('click', play);
$('#restart').addEventListener('click', () => { pause(); idx = 0; draw(); play(); });
$('#scrub').addEventListener('input', e => { pause(); idx = +e.target.value; draw(); });
$('#speed').addEventListener('change', e => { S.speed = +e.target.value; });
for (const [sel, key, num] of [['#metric', 'metric'], ['#topn', 'topN', true], ['#step', 'step']]) {
  $(sel).addEventListener('change', e => {
    const t = frames[idx]?.t;
    S[key] = num ? +e.target.value : e.target.value;
    build(); reset();
    if (t) idx = Math.max(0, frames.findIndex(f => f.t >= t));
    draw();
  });
}
addEventListener('resize', () => draw());
addEventListener('keydown', e => { if (e.code === 'Space' && e.target === document.body) { e.preventDefault(); play(); } });
