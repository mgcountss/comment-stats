/*
 * Comment Stats — YouTube Studio collector
 * ----------------------------------------
 * Paste this whole file into the DevTools console while on
 *   https://studio.youtube.com/channel/<YOUR_CHANNEL_ID>/comments
 * (the channel-wide Comments page, NOT a single video's comments).
 *
 * How it works: YouTube Studio loads comments from its own internal API
 * (the requests you see in the Network tab under /youtubei/v1/comment/...).
 * This script listens for those requests, copies one as a template, then
 * replays it page by page until every comment and reply has been fetched.
 * It never sends anything anywhere except back to studio.youtube.com.
 *
 * Steps:
 *   1. Paste the script, press Enter.
 *   2. Scroll the comment list down until more comments load (this lets the
 *      script capture the "next page" request).
 *   3. Click "N replies" under any comment that has replies (captures the
 *      replies request). Optional, but needed for complete reply data.
 *   4. Run:  commentStats.start()
 *   5. When it finishes, comments.json downloads automatically. Drop it on the
 *      Comment Stats page (or merge it with tools/merge.mjs).
 *
 * Useful commands:
 *   commentStats.status()     what has been captured so far
 *   commentStats.stop()       stop early (you can still download)
 *   commentStats.download()   download what has been collected
 *   commentStats.debug()      download the raw captured requests/responses
 *                             (send this file if the collector can't parse the data)
 */
(() => {
  if (window.commentStats?.installed) { console.log('[comment-stats] already installed'); return; }

  const log = (...a) => console.log('%c[comment-stats]', 'color:#e5484d;font-weight:bold', ...a);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const COMMENT_URL = /\/youtubei\/v1\/comment\//;

  const captured = [];          // { url, headers, body, response }
  const comments = new Map();   // id -> normalized comment
  const authors = {};
  const videos = {};
  const repliesDone = new Set();
  let channelId = (location.pathname.match(/channel\/(UC[\w-]{22})/) || [])[1] || '';
  let stopped = false;

  // ---------- capture ----------
  const origFetch = window.fetch;
  window.fetch = async function (input, init = {}) {
    const url = typeof input === 'string' ? input : input.url;
    const res = await origFetch.apply(this, arguments);
    if (COMMENT_URL.test(url)) {
      try {
        let body = init.body;
        if (!body && input instanceof Request) body = await input.clone().text();
        const headers = {};
        const h = new Headers(init.headers || (input instanceof Request ? input.headers : {}));
        h.forEach((v, k) => { headers[k] = v; });
        const json = await res.clone().json();
        record(url, headers, typeof body === 'string' ? body : null, json);
      } catch (e) { /* ignore non-json */ }
    }
    return res;
  };
  const origOpen = XMLHttpRequest.prototype.open, origSend = XMLHttpRequest.prototype.send, origSet = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.open = function (m, url) { this.__cs = { url: String(url), headers: {} }; return origOpen.apply(this, arguments); };
  XMLHttpRequest.prototype.setRequestHeader = function (k, v) { if (this.__cs) this.__cs.headers[k.toLowerCase()] = v; return origSet.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function (body) {
    if (this.__cs && COMMENT_URL.test(this.__cs.url)) {
      this.addEventListener('load', () => {
        try { record(this.__cs.url, this.__cs.headers, typeof body === 'string' ? body : null, JSON.parse(this.responseText)); } catch (e) { }
      });
    }
    return origSend.apply(this, arguments);
  };

  function record(url, headers, body, response) {
    if (!body) return;
    let parsed; try { parsed = JSON.parse(body); } catch { return; }
    const found = ingest(response);
    const entry = { url, headers, body: parsed, response, found, kind: classify(parsed) };
    captured.push(entry);
    log(`captured ${entry.kind} request (${found.length} comments)  total collected: ${comments.size}`);
  }

  // ---------- generic helpers ----------
  function walk(o, fn, path = []) {
    if (!o || typeof o !== 'object') return;
    if (fn(o, path) === false) return;
    for (const k of Object.keys(o)) walk(o[k], fn, path.concat(k));
  }
  const tokenKey = k => /(continuation|pagetoken|token)$/i.test(k) && !/^(click|tracking|visitor|csrf|session|xsrf|id)token/i.test(k);
  function findNextToken(resp) {
    let tok = null;
    walk(resp, o => {
      for (const [k, v] of Object.entries(o)) {
        if (typeof v === 'string' && v.length >= 4 && /next|continuation/i.test(k) && tokenKey(k)) { tok = tok || v; }
        if (k === 'continuationCommand' && v?.token) tok = tok || v.token;
        if (k === 'nextContinuationData' && v?.continuation) tok = tok || v.continuation;
      }
    });
    return tok;
  }
  // Replace the first token-like field in a request body (deep) with `tok`
  function setToken(body, tok) {
    const b = structuredClone(body);
    let done = false;
    walk(b, o => {
      if (done) return false;
      for (const k of Object.keys(o)) {
        if (typeof o[k] === 'string' && tokenKey(k) && !/^(click|tracking)/i.test(k)) { o[k] = tok; done = true; return false; }
      }
    });
    if (!done) b.continuation = tok;
    return b;
  }
  function textOf(v) {
    if (v == null) return '';
    if (typeof v === 'string') return v;
    if (Array.isArray(v)) return v.map(textOf).join('');
    if (typeof v === 'object') {
      if (typeof v.text === 'string' && !v.runs && !v.textSegments) return v.text;
      if (v.simpleText) return v.simpleText;
      if (v.runs) return textOf(v.runs);
      if (v.textSegments) return textOf(v.textSegments);
      if (v.content) return textOf(v.content);
    }
    return '';
  }
  function num(v) {
    if (typeof v === 'number') return v;
    if (typeof v === 'string') { const n = parseFloat(v.replace(/,/g, '')); return isNaN(n) ? 0 : n * (/k/i.test(v) ? 1e3 : /m/i.test(v) ? 1e6 : 1); }
    if (v && typeof v === 'object') return num(v.simpleText || v.text || v.seconds || textOf(v));
    return 0;
  }
  function timeOf(c) {
    for (const k of ['createdTimestamp', 'publishedTimestamp', 'publishTime', 'createTime', 'timestamp', 'publishedAt', 'createdAt', 'timestampUsec', 'timeCreated']) {
      const v = c[k];
      if (v == null) continue;
      if (typeof v === 'object' && v.seconds != null) return Number(v.seconds);
      if (typeof v === 'number' || /^\d+$/.test(v)) { const n = Number(v); return n > 1e14 ? Math.floor(n / 1e6) : n > 1e11 ? Math.floor(n / 1e3) : n; }
      const d = Date.parse(v); if (!isNaN(d)) return Math.floor(d / 1000);
    }
    return 0;
  }
  const looksLikeCommentId = s => typeof s === 'string' && /^Ug[\w-]{10,}(\.[\w-]+)?$/.test(s);

  // Find everything that looks like a comment, normalize, store. Returns ids found.
  function ingest(resp) {
    const found = [];
    walk(resp, o => {
      const id = [o.commentId, o.id].find(looksLikeCommentId);
      if (!id) return;
      const authorObj = o.author || o.authorInfo || o.commentAuthor || o.channel || {};
      const aId = authorObj.channelId || authorObj.externalChannelId || o.authorChannelId?.value || o.authorChannelId || o.authorExternalChannelId || o.channelId;
      const aName = authorObj.displayName || authorObj.title || authorObj.handle || textOf(authorObj.name) || o.authorDisplayName || textOf(o.authorText);
      const text = textOf(o.content ?? o.text ?? o.contentText ?? o.textOriginal ?? o.body);
      if (!aId && !aName) return; // probably just a reference to an id
      let thumb = authorObj.avatarThumbnail?.thumbnails || authorObj.thumbnails?.thumbnails || authorObj.avatar?.thumbnails || o.authorThumbnail?.thumbnails;
      thumb = Array.isArray(thumb) ? thumb[0]?.url : (authorObj.avatarUrl || o.authorProfileImageUrl || '');
      const a = aId || aName;
      authors[a] = { n: aName || authors[a]?.n || a, i: thumb || authors[a]?.i || '' };
      const videoId = o.videoId || o.video?.videoId || o.videoInfo?.videoId || '';
      const vTitle = o.videoTitle || o.video?.title || o.videoInfo?.title;
      if (videoId && vTitle) videos[videoId] = textOf(vTitle);
      const parent = o.parentCommentId || o.parentId || (id.includes('.') ? id.split('.')[0] : null);
      const c = { id, v: videoId || comments.get(parent)?.v || '', a, t: text, l: num(o.likeCount ?? o.voteCount ?? o.likes ?? 0), p: timeOf(o) };
      if (parent && parent !== id) c.r = parent;
      c._rc = num(o.replyCount ?? o.totalReplyCount ?? 0);
      const prev = comments.get(id);
      comments.set(id, prev ? { ...prev, ...Object.fromEntries(Object.entries(c).filter(([, v]) => v !== '' && v !== 0)) } : c);
      found.push(id);
      if (!channelId && o.channelId && /^UC/.test(o.channelId) && !aId) channelId = o.channelId;
      // keep walking: comment objects can contain nested replies
    });
    return found;
  }

  function classify(body) {
    let keyHit = false;
    walk(body, o => { for (const k of Object.keys(o)) if (/repl|parent/i.test(k)) keyHit = true; });
    const s = JSON.stringify(body);
    const hasParentRef = [...comments.keys()].some(id => !id.includes('.') && s.includes(`"${id}"`));
    return keyHit || hasParentRef ? 'replies' : 'list';
  }

  async function send(tpl, body) {
    const headers = { ...tpl.headers };
    delete headers['content-length'];
    const res = await origFetch(tpl.url, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  async function paginate(tpl, firstResp, label) {
    let resp = firstResp, page = 0, tok = findNextToken(resp), seen = new Set();
    while (tok && !stopped && !seen.has(tok)) {
      seen.add(tok);
      let tries = 0;
      while (true) {
        try { resp = await send(tpl, setToken(tpl.body, tok)); break; }
        catch (e) { if (++tries > 4) { log(`${label}: giving up on page (${e.message})`); return; } await sleep(1500 * tries); }
      }
      const got = ingest(resp);
      page++;
      if (page % 5 === 0 || !got.length) log(`${label}: page ${page}, +${got.length}, total ${comments.size}`);
      tok = findNextToken(resp);
      await sleep(250);
    }
  }

  async function start() {
    stopped = false;
    const lists = captured.filter(c => c.kind === 'list');
    const listTpl = lists.find(c => findNextToken(c.response)) || lists[0];
    if (!listTpl) { log('No comment list request captured yet. Scroll the comment list (or change the sort) and try again.'); return; }
    log('Fetching all top-level comments…');
    // Restart from page 1: re-send the captured request without its page token.
    let firstResp;
    try { firstResp = await send(listTpl, stripToken(listTpl.body)); ingest(firstResp); }
    catch (e) { log(`first page failed (${e.message}); continuing from the captured page`); firstResp = listTpl.response; }
    await paginate(listTpl, firstResp, 'comments');

    const repTpl = captured.find(c => c.kind === 'replies');
    const needReplies = [...comments.values()].filter(c => !c.r && c._rc > 0);
    if (repTpl && needReplies.length) {
      const bodyStr = JSON.stringify(repTpl.body);
      const sampleParent = [...comments.keys()].find(id => !id.includes('.') && bodyStr.includes(`"${id}"`));
      if (!sampleParent) log('Could not identify the parent id inside the replies request; skipping replies.');
      else {
        log(`Fetching replies for ${needReplies.length} threads…`);
        let i = 0;
        for (const parent of needReplies) {
          if (stopped) break;
          if (repliesDone.has(parent.id)) continue;
          const have = [...comments.values()].filter(c => c.r === parent.id).length;
          if (have >= parent._rc) { repliesDone.add(parent.id); continue; }
          const body = JSON.parse(bodyStr.split(`"${sampleParent}"`).join(`"${parent.id}"`));
          // drop any token so we start at the first page of replies
          let resp;
          try { resp = await send(repTpl, stripToken(body)); } catch (e) { log(`replies for ${parent.id} failed: ${e.message}`); continue; }
          ingest(resp);
          await paginate({ ...repTpl, body }, resp, `replies ${parent.id}`);
          repliesDone.add(parent.id);
          if (++i % 25 === 0) log(`replies: ${i}/${needReplies.length} threads, total ${comments.size}`);
          await sleep(200);
        }
      }
    } else if (needReplies.length) {
      log(`${needReplies.length} threads have replies that may not be loaded. Click "replies" under one comment, then run commentStats.start() again.`);
    }
    log(`Done. ${comments.size} comments/replies from ${Object.keys(authors).length} people.`);
    download();
  }

  function stripToken(body) {
    const b = structuredClone(body);
    walk(b, o => { for (const k of Object.keys(o)) if (typeof o[k] === 'string' && tokenKey(k) && /continuation|page/i.test(k)) delete o[k]; });
    return b;
  }

  function dataset() {
    const list = [...comments.values()].map(({ _rc, ...c }) => c).sort((a, b) => a.p - b.p);
    return { version: 2, channelId, updatedAt: new Date().toISOString(), source: 'studio-collector', authors, videos, comments: list };
  }
  function save(name, obj) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(obj)], { type: 'application/json' }));
    a.download = name; a.click();
  }
  function download() { save('comments.json', dataset()); }

  window.commentStats = {
    installed: true, start, download,
    stop() { stopped = true; log('stopping…'); },
    debug() { save('comment-stats-debug.json', captured.map(({ url, body, response, kind }) => ({ url: url.replace(/key=[^&]+/, 'key=…'), kind, body, response }))); },
    status() {
      log(`captured requests: ${captured.map(c => c.kind).join(', ') || 'none'}; comments: ${comments.size}; authors: ${Object.keys(authors).length}`);
      return dataset();
    },
  };
  log('Installed. Scroll the comment list, open one "replies" thread, then run commentStats.start()');
})();
