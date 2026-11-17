// One-off: convert the old comments.js (const comments = [...]) into data/comments.json
// Usage: node tools/convert-legacy.mjs path/to/comments.js data/comments.json
import fs from 'node:fs';
import { fromDataApiThreads } from './lib.mjs';
const [, , input, output = 'data/comments.json'] = process.argv;
const src = fs.readFileSync(input, 'utf8').replace(/^\s*const\s+comments\s*=\s*/, '').replace(/;\s*$/, '');
const threads = JSON.parse(src);
const ds = fromDataApiThreads(threads);
ds.updatedAt = new Date(Math.max(...ds.comments.map(c => c.p)) * 1000).toISOString();
fs.writeFileSync(output, JSON.stringify(ds));
console.log(`${ds.comments.length} comments, ${Object.keys(ds.authors).length} authors -> ${output}`);
