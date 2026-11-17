// Shared helpers for the data format used by the app (data/comments.json).
//
// Format (v2):
// {
//   version: 2,
//   channelId: "UC...",
//   updatedAt: "ISO date",
//   authors:  { "<channelId>": { n: "@handle", i: "avatar url" } },
//   videos:   { "<videoId>": "title" },            // optional
//   comments: [ { id, v: videoId, a: authorId, t: text, l: likes, p: unixSeconds, r?: parentId } ]
// }
// Replies are ordinary entries with `r` (the parent comment id).

export function emptyDataset(channelId = '') {
  return { version: 2, channelId, updatedAt: new Date().toISOString(), authors: {}, videos: {}, comments: [] };
}

/** Merge `b` into `a` (newer data wins for likes/text/author info). Returns a. */
export function mergeDatasets(a, b) {
  if (!a.channelId) a.channelId = b.channelId;
  Object.assign(a.authors, b.authors || {});
  Object.assign(a.videos, b.videos || {});
  const byId = new Map(a.comments.map(c => [c.id, c]));
  for (const c of b.comments || []) byId.set(c.id, { ...byId.get(c.id), ...c });
  a.comments = [...byId.values()].sort((x, y) => x.p - y.p);
  a.updatedAt = [a.updatedAt, b.updatedAt].filter(Boolean).sort().at(-1);
  return a;
}

/** Convert YouTube Data API v3 commentThread resources into the v2 format. */
export function fromDataApiThreads(threads, channelId = '') {
  const ds = emptyDataset(channelId);
  const add = (s, id, videoId, parent) => {
    const a = s.authorChannelId?.value || s.authorDisplayName || 'unknown';
    ds.authors[a] = { n: s.authorDisplayName, i: s.authorProfileImageUrl };
    const c = { id, v: videoId, a, t: s.textOriginal ?? s.textDisplay ?? '', l: s.likeCount || 0, p: Math.floor(Date.parse(s.publishedAt) / 1000) };
    if (parent) c.r = parent;
    ds.comments.push(c);
  };
  for (const t of threads) {
    const top = t.snippet?.topLevelComment || t.topLevelComment;
    const s = top.snippet;
    const videoId = t.snippet?.videoId || t.videoId || s.videoId;
    if (!ds.channelId) ds.channelId = t.snippet?.channelId || t.channelId || '';
    add(s, top.id, videoId, null);
    for (const r of (t.replies?.comments || t.replies || [])) {
      const rs = r.snippet || r;
      add(rs, r.id, videoId, rs.parentId || top.id);
    }
  }
  return mergeDatasets(emptyDataset(ds.channelId), ds); // dedupe + sort
}
