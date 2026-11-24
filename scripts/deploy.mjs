// Deploys dist/ to GitHub Pages by force-pushing it to the gh-pages branch of the repo.
// Usage: npm run build && node scripts/deploy.mjs   (set ERRATA_REPO=owner/name to override the repo)
import { execSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const DEPLOY_DIR = join(ROOT, '.deploy');

if (!existsSync(join(DIST, 'index.html'))) {
  console.error('deploy: dist/index.html not found. Run `npx vite build && node scripts/postbuild-sw.mjs` first.');
  process.exit(1);
}

function run(cmd, cwd = ROOT) {
  execSync(cmd, { cwd, stdio: 'inherit' });
}

let repo = process.env.ERRATA_REPO;
if (!repo) {
  try {
    repo = execSync('gh repo view --json nameWithOwner -q .nameWithOwner', {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'inherit'],
    }).trim();
  } catch (err) {
    console.error('deploy: could not determine repo. Set ERRATA_REPO=owner/name or run from a repo linked to gh.');
    process.exit(1);
  }
}
if (!repo || !repo.includes('/')) {
  console.error(`deploy: invalid repo "${repo}" (expected owner/name).`);
  process.exit(1);
}
const [owner, name] = repo.split('/');
console.log(`deploy: repo ${repo}`);

// Fresh staging directory containing only the built site.
rmSync(DEPLOY_DIR, { recursive: true, force: true });
mkdirSync(DEPLOY_DIR, { recursive: true });
cpSync(DIST, DEPLOY_DIR, { recursive: true });

const stamp = new Date().toISOString();
run('git init -q', DEPLOY_DIR);
run('git checkout -q -b gh-pages', DEPLOY_DIR);
run('git add -A', DEPLOY_DIR);
run(`git commit -q -m "Deploy ${stamp}"`, DEPLOY_DIR);
run(`git push -f https://github.com/${repo}.git gh-pages`, DEPLOY_DIR);

// Ensure Pages serves the gh-pages branch; an existing config is fine.
try {
  execSync(`gh api -X POST repos/${repo}/pages -f "source[branch]=gh-pages" -f "source[path]=/"`, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  console.log('deploy: GitHub Pages enabled for gh-pages.');
} catch (err) {
  const text = `${err.stderr ?? ''}${err.stdout ?? ''}${err.message ?? ''}`;
  if (/already exists|already enabled|409|422/i.test(text)) {
    console.log('deploy: GitHub Pages already configured.');
  } else {
    console.warn('deploy: could not configure Pages automatically; enable it in repo Settings > Pages (branch gh-pages, /).');
    console.warn(text.trim());
  }
}

console.log(`deploy: done. https://${owner}.github.io/${name}/`);
