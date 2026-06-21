// Bumps the version on every deploy:
//  1. the ?v= cache-buster on the compiled Tailwind stylesheet (so browsers and
//     the cache-first service worker fetch the freshly built CSS), and
//  2. the user-visible "Order Management vX.Y" label, kept in sync with it, so
//     the user can confirm at a glance they're on the latest version.
// Run automatically by `npm run deploy` / `deploy:all`.
import { readFileSync, writeFileSync } from 'node:fs';

const FILE = 'public/index.html';
let html = readFileSync(FILE, 'utf8');

const cssRe = /(tailwind\.css\?v=)(\d+)\.(\d+)/;
const match = html.match(cssRe);
if (!match) {
  console.error('bump-version: could not find tailwind.css?v=X.Y in', FILE);
  process.exit(1);
}

const major = match[2];
const minor = Number(match[3]) + 1;
const version = `${major}.${minor}`;

// 1. cache-buster
html = html.replace(cssRe, `${match[1]}${version}`);

// 2. visible label — keep it in lock-step with the cache-buster
const labelRe = /Order Management v\d+\.\d+/;
if (labelRe.test(html)) {
  html = html.replace(labelRe, `Order Management v${version}`);
} else {
  console.warn('bump-version: visible "Order Management vX.Y" label not found — skipped');
}

writeFileSync(FILE, html);
console.log(`bump-version: v${match[2]}.${match[3]} -> v${version} (cache-buster + visible label)`);
