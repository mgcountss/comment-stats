// Merge one or more exported comments.json files into data/comments.json
// Usage: node tools/merge.mjs ~/Downloads/comments.json [more.json ...]
import fs from 'node:fs';
import { mergeDatasets, fromDataApiThreads, emptyDataset } from './lib.mjs';
const target = 'data/comments.json';
const base = fs.existsSync(target) ? JSON.parse(fs.readFileSync(target, 'utf8')) : emptyDataset();
const before = base.comments.length;
for (const f of process.argv.slice(2)) {
  let d = JSON.parse(fs.readFileSync(f, 'utf8'));
  if (Array.isArray(d)) d = fromDataApiThreads(d);          // raw Data API commentThreads
  mergeDatasets(base, d);
}
fs.writeFileSync(target, JSON.stringify(base));
console.log(`${before} -> ${base.comments.length} comments (${base.comments.length - before} new), updated ${base.updatedAt}`);
