#!/usr/bin/env node
/**
 * Generates `.expo/types/router.d.ts` (the typed-routes declaration file).
 *
 * The Expo dev server writes this file while running, but it deliberately
 * replaces it with a stub once the server shuts down. That stub makes every
 * `router.push('/somewhere')` and `<Redirect href="/somewhere" />` a type
 * error, so a standalone `tsc --noEmit` fails with ~23 bogus errors.
 *
 * This script calls Expo's own generator (`getTypedRoutesDeclarationFile`) with
 * a hand-built require context, so `npm run typecheck` works without the dev
 * server. Run it via the `pretypecheck` npm script, or after adding a route.
 */

const fs = require('node:fs');
const path = require('node:path');

const APP_DIR = path.join(__dirname, '..', 'src', 'app');
const OUT_FILE = path.join(__dirname, '..', '.expo', 'types', 'router.d.ts');
const ROUTE_EXTS = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs']);

/**
 * `@expo/router-server` is not a direct dependency — it ships nested under the
 * Expo CLI, so its location moves between SDK releases. Try the normal
 * resolution first, then fall back to walking a few known nestings.
 */
const loadGenerator = () => {
  const id = '@expo/router-server/build/typed-routes/generate';

  try {
    return require(id);
  } catch {
    /* fall through to the filesystem search */
  }

  const roots = [
    path.join(__dirname, '..', 'node_modules'),
    path.join(__dirname, '..', 'node_modules', 'expo', 'node_modules'),
    path.join(__dirname, '..', 'node_modules', 'expo', 'node_modules', '@expo', 'cli', 'node_modules'),
    path.join(__dirname, '..', 'node_modules', '@expo', 'cli', 'node_modules'),
  ];

  for (const root of roots) {
    const candidate = path.join(root, ...id.split('/'));
    if (fs.existsSync(`${candidate}.js`)) return require(candidate);
  }

  return null;
};

/** Collects `./relative/path` context keys for every file under `src/app`. */
const collectContextKeys = (dir, prefix = '') => {
  const keys = [];

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const ext = path.extname(entry.name);

    if (entry.isDirectory()) {
      keys.push(...collectContextKeys(path.join(dir, entry.name), `${prefix}${entry.name}/`));
    } else if (ROUTE_EXTS.has(ext)) {
      keys.push(`${prefix}${entry.name}`);
    }
  }

  return keys;
};

const main = () => {
  if (!fs.existsSync(APP_DIR)) {
    console.error(`[router-types] no route directory at ${APP_DIR}`);
    process.exit(1);
  }

  const keys = collectContextKeys(APP_DIR).map((k) => `./${k}`);

  // `getRoutes` only needs the keys; `importMode: 'async'` + `ignoreRequireErrors`
  // mean the route modules are never actually loaded.
  const ctx = {
    keys: () => keys,
    resolve: () => ({}),
    id: 'src/app',
  };

  let declaration;
  try {
    const generator = loadGenerator();
    if (!generator) throw new Error('could not locate @expo/router-server');

    declaration = generator.getTypedRoutesDeclarationFile(ctx);
  } catch (error) {
    console.warn(`[router-types] falling back to no route types: ${error.message}`);
    process.exit(0);
  }

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, declaration, 'utf8');

  const routeCount = (declaration.match(/\{ pathname: `/g) ?? []).length;
  console.log(`[router-types] wrote ${path.relative(process.cwd(), OUT_FILE)} (${keys.length} files)`);
  if (routeCount === 0) {
    console.warn('[router-types] warning: no routes were detected');
  }
};

main();
