# Comment Stats

Leaderboards, activity charts and per-person profiles for every comment on a YouTube channel.
Static site — no build step. Live at https://comments.mgcounts.com

- **Dashboard** (`index.html`): totals, activity over time (day/week/month, per-period or cumulative),
  a weekday × hour heatmap, the most-liked comments, and a searchable, sortable, paginated leaderboard
  with CSV/JSON export.
- **Profiles**: click anyone for their stats, posts-over-time chart, who they talk to most (and who replies
  to them), and every comment/reply they've posted, with links back to YouTube. Profiles are linkable (`#user=UC…`).
- **Bar chart race** (`race.html`): computed live from the data — pick metric (posts / comments / replies / likes),
  top N, speed and step, and scrub through time.

## Updating the data

### Option A — from YouTube Studio (no API key)
1. Open `https://studio.youtube.com/channel/<channel id>/comments` (the channel-wide Comments page) and set the
   filter to show all comments.
2. Open DevTools → Console, paste the contents of [`tools/studio-collector.js`](tools/studio-collector.js), press Enter.
3. Scroll the comment list until more comments load, and click **replies** under one comment.
4. Run `commentStats.start()`. When it finishes, `comments.json` downloads.
5. Either drag that file onto the dashboard (merged in your browser only), or publish it:
   ```bash
   node tools/merge.mjs ~/Downloads/comments.json
   ```
   then commit `data/comments.json`.

If the collector can't make sense of Studio's responses, run `commentStats.debug()` and share the downloaded file.

### Option B — YouTube Data API v3
```bash
YT_API_KEY=your_key node tools/api-fetch.mjs UCSgk1g0AZi9_759yfz-iIHg comments-api.json
node tools/merge.mjs comments-api.json
```

## Data format
`data/comments.json` holds `{ version: 2, channelId, updatedAt, authors: {id: {n, i}}, videos: {id: title},
comments: [{ id, v, a, t, l, p, r? }] }` — one flat, de-duplicated list where replies carry `r` (the parent id).
`tools/convert-legacy.mjs` converts the old Data API `comments.js` dump into this format.

Chart.js 4.4.1 and chartjs-adapter-date-fns 3.0.0 are vendored in `vendor/`.
