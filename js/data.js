// Data loading, merging and statistics shared by the dashboard and the race page.

export const DATA_URL = 'data/comments.json';
const LOCAL_KEY = 'comment-stats:imported';

export async function loadDataset() {
  const res = await fetch(DATA_URL, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Could not load ${DATA_URL} (${res.status})`);
  return normalize(await res.json());
}

/** Accept the v2 format, or raw Data API commentThreads (legacy), and return v2. */
export function normalize(d) {
  if (Array.isArray(d)) d = fromThreads(d);
  if (!d || !Array.isArray(d.comments)) throw new Error('Not a Comment Stats export (missing "comments")');
  d.authors ||= {}; d.videos ||= {};
  return d;
}

function fromThreads(threads) {
  const ds = { version: 2, channelId: '', updatedAt: '', authors: {}, videos: {}, comments: [] };
  const add = (s, id, v, r) => {
    const a = s.authorChannelId?.value || s.authorDisplayName;
    ds.authors[a] = { n: s.authorDisplayName, i: s.authorProfileImageUrl };
    ds.comments.push({ id, v, a, t: s.textOriginal ?? s.textDisplay ?? '', l: s.likeCount || 0, p: Date.parse(s.publishedAt) / 1000, ...(r && { r }) });
  };
  for (const t of threads) {
    const top = t.snippet?.topLevelComment || t.topLevelComment;
    const v = t.snippet?.videoId || t.videoId;
    ds.channelId ||= t.snippet?.channelId || t.channelId || '';
    add(top.snippet, top.id, v);
    for (const r of t.replies?.comments || t.replies || []) add(r.snippet || r, r.id, v, (r.snippet || r).parentId || top.id);
  }
  ds.updatedAt = new Date(Math.max(...ds.comments.map(c => c.p)) * 1000).toISOString();
  return ds;
}

export function merge(a, b) {
  const out = { ...a, authors: { ...a.authors, ...b.authors }, videos: { ...a.videos, ...b.videos } };
  const byId = new Map(a.comments.map(c => [c.id, c]));
  let added = 0;
  for (const c of b.comments) { if (!byId.has(c.id)) added++; byId.set(c.id, { ...byId.get(c.id), ...c }); }
  out.comments = [...byId.values()];
  out.channelId ||= b.channelId;
  out.updatedAt = [a.updatedAt, b.updatedAt].filter(Boolean).sort().at(-1);
  return { data: out, added };
}

// Imported exports are remembered per-browser so a refresh keeps them.
export function saveImported(d) { try { localStorage.setItem(LOCAL_KEY, JSON.stringify(d)); return true; } catch { return false; } }
export function loadImported() { try { const s = localStorage.getItem(LOCAL_KEY); return s ? normalize(JSON.parse(s)) : null; } catch { return null; } }
export function clearImported() { try { localStorage.removeItem(LOCAL_KEY); } catch { } }

/** Build every derived structure the UI needs. */
export function analyze(d) {
  const comments = d.comments.filter(c => c && c.id && c.p).sort((x, y) => x.p - y.p);
  const byId = new Map(comments.map(c => [c.id, c]));
  const users = new Map();
  const user = id => {
    let u = users.get(id);
    if (!u) {
      const a = d.authors[id] || {};
      u = { id, name: a.n || id, image: a.i || '', commentsG: 0, repliesG: 0, interactions: 0, likesR: 0, repliesR: 0,
        firstC: null, lastC: null, firstR: null, lastR: null, posts: [], repliedTo: new Map(), repliedBy: new Map() };
      users.set(id, u);
    }
    return u;
  };
  // handle -> author id, so "@name ..." replies can be credited to the person actually addressed
  const byHandle = new Map();
  for (const [id, a] of Object.entries(d.authors)) if (a?.n) byHandle.set(a.n.replace(/^@+/, '').toLowerCase(), id);
  const mentionTarget = c => {
    const m = /^@+([\w.\-\u00C0-\uFFFF]+)/.exec(c.t || '');
    if (!m) return null;
    let h = m[1].toLowerCase();
    while (h && !byHandle.has(h)) { const t = h.replace(/[.\-_]$/, ''); if (t === h) break; h = t; }
    return byHandle.get(h) || null;
  };
  let totalLikes = 0, totalReplies = 0;
  const videos = new Map();
  for (const c of comments) {
    const u = user(c.a);
    u.posts.push(c);
    u.interactions++;
    u.likesR += c.l || 0;
    totalLikes += c.l || 0;
    const ts = c.p;
    if (c.r) {
      totalReplies++;
      u.repliesG++;
      u.firstR ??= ts; u.lastR = ts;
      const parent = byId.get(c.r);
      if (parent) {
        const pu = user(parent.a);
        pu.repliesR++;
        const to = mentionTarget(c) || parent.a;
        c.to = to;
        if (to !== c.a) {
          const tu = user(to);
          u.repliedTo.set(to, (u.repliedTo.get(to) || 0) + 1);
          tu.repliedBy.set(c.a, (tu.repliedBy.get(c.a) || 0) + 1);
        }
      }
    } else {
      u.commentsG++;
      u.firstC ??= ts; u.lastC = ts;
    }
    if (c.v) {
      const v = videos.get(c.v) || { id: c.v, title: d.videos[c.v] || '', count: 0, likes: 0 };
      v.count++; v.likes += c.l || 0; videos.set(c.v, v);
    }
  }
  return {
    raw: d, comments, byId, users, videos,
    totals: { comments: comments.length - totalReplies, replies: totalReplies, likes: totalLikes, posts: comments.length, people: users.size, videos: videos.size },
    first: comments[0]?.p, last: comments.at(-1)?.p,
  };
}

// ---------- small shared helpers ----------
export const fmt = n => (n ?? 0).toLocaleString('en-US');
export const fmtDate = s => s ? new Date(s * 1000).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
export const fmtDateTime = s => s ? new Date(s * 1000).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';
export const dayKey = s => { const d = new Date(s * 1000); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
export function allDays(fromSec, toSec) {
  const out = [], d = new Date(fromSec * 1000); d.setHours(0, 0, 0, 0);
  const end = new Date(toSec * 1000);
  while (d <= end) { out.push(dayKey(d / 1000)); d.setDate(d.getDate() + 1); }
  return out;
}
export const commentUrl = c => c.v ? `https://www.youtube.com/watch?v=${encodeURIComponent(c.v)}&lc=${encodeURIComponent(c.id)}` : null;
export function colorFor(str) {
  let h = 0; for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360} 65% 55%)`;
}
export function el(tag, props = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'style') Object.assign(e.style, v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null) e.append(c);
  return e;
}
