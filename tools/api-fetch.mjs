// Alternative to the Studio collector: fetch every public comment with the
// official YouTube Data API v3 (needs a free API key from Google Cloud).
// Usage: YT_API_KEY=... node tools/api-fetch.mjs UCSgk1g0AZi9_759yfz-iIHg [out.json]
// Quota: ~1 unit per 100 comments; 10,000 units/day free.
import fs from 'node:fs';
import { fromDataApiThreads } from './lib.mjs';
const key = process.env.YT_API_KEY;
const [, , channelId, out = 'comments-api.json'] = process.argv;
if (!key || !channelId) { console.error('Usage: YT_API_KEY=... node tools/api-fetch.mjs <channelId> [out.json]'); process.exit(1); }
const api = async (path, params) => {
  const u = new URL(`https://www.googleapis.com/youtube/v3/${path}`);
  Object.entries({ ...params, key }).forEach(([k, v]) => u.searchParams.set(k, v));
  for (let i = 0; ; i++) {
    const r = await fetch(u);
    if (r.ok) return r.json();
    const body = await r.text();
    if (r.status === 403 && /commentsDisabled/.test(body)) return { items: [] };
    if (i > 3 || r.status === 400 || /quota/i.test(body)) throw new Error(`${r.status} ${body.slice(0, 300)}`);
    await new Promise(s => setTimeout(s, 1000 * (i + 1)));
  }
};
async function* pages(path, params) {
  let pageToken = '';
  do { const d = await api(path, { ...params, ...(pageToken && { pageToken }) }); yield* d.items || []; pageToken = d.nextPageToken; } while (pageToken);
}
const ch = await api('channels', { part: 'contentDetails', id: channelId });
const uploads = ch.items[0].contentDetails.relatedPlaylists.uploads;
const videos = {};
for await (const it of pages('playlistItems', { part: 'snippet', playlistId: uploads, maxResults: 50 })) videos[it.snippet.resourceId.videoId] = it.snippet.title;
console.log(`${Object.keys(videos).length} videos`);
const threads = [];
let n = 0;
for (const videoId of Object.keys(videos)) {
  for await (const t of pages('commentThreads', { part: 'snippet,replies', videoId, maxResults: 100, textFormat: 'plainText' })) {
    // the thread only embeds up to 5 replies; fetch the rest
    if (t.snippet.totalReplyCount > (t.replies?.comments?.length || 0)) {
      const all = [];
      for await (const r of pages('comments', { part: 'snippet', parentId: t.id, maxResults: 100, textFormat: 'plainText' })) all.push(r);
      t.replies = { comments: all };
    }
    threads.push(t);
  }
  if (++n % 20 === 0) console.log(`${n}/${Object.keys(videos).length} videos, ${threads.length} threads`);
}
const ds = fromDataApiThreads(threads, channelId);
ds.videos = videos;
fs.writeFileSync(out, JSON.stringify(ds));
console.log(`wrote ${ds.comments.length} comments to ${out}`);
