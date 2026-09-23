#!/usr/bin/env node
/**
 * Local Custom Pricer & Socket.IO Push Server CLI.
 *
 * Runs a local price server serving the downloaded backpack.tf catalog universe
 * to tf2autobot via HTTP & Socket.IO.
 *
 * Usage:
 *   node scripts/local-pricer.mjs --port=5555
 *   node scripts/local-pricer.mjs --catalog=files/catalogue_bptf_EVERY_SINGLE_ITEM.json
 *   node scripts/local-pricer.mjs --port=5555 --rate=64.0
 *
 * Law: docs/features/price-construct.md · tf2autobot CustomPricer
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadEnv, FILES } from '../lib/env.js';
import { LocalPricerServer, DEFAULT_PORT } from '../lib/local-pricer-server.js';

loadEnv();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../');
const filesDir = FILES || path.join(repoRoot, 'files');

const argv = process.argv.slice(2);

function getFlag(name, fallback = null) {
  const eq = argv.find((a) => a.startsWith(`${name}=`));
  if (eq) return eq.slice(name.length + 1);
  const i = argv.indexOf(name);
  if (i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--')) return argv[i + 1];
  return fallback;
}

async function main() {
  const port = Number(getFlag('--port', process.env.CUSTOM_PRICER_PORT || DEFAULT_PORT)) || DEFAULT_PORT;
  const catalogPath = getFlag('--catalog', path.join(filesDir, 'catalogue_bptf_EVERY_SINGLE_ITEM.json'));
  const keyRefRate = Number(getFlag('--rate', '64.0')) || 64.0;

  console.log('=== Local Custom Pricer & Socket.IO Push Server ===');
  console.log(`Port: ${port}`);
  console.log(`Catalog: ${catalogPath}`);
  console.log(`Key Ref Rate: ${keyRefRate}`);
  console.log('');

  const server = new LocalPricerServer({
    port,
    catalogPath,
    keyRefRate,
  });

  const count = server.loadCatalog();
  console.log(`Loaded ${count.toLocaleString()} items from catalog into memory.`);

  server.on('priceUpdate', (item) => {
    console.log(`[PUSH] ${item.sku} (${item.name}) -> Buy: ${item.buy.keys}k ${item.buy.metal}ref | Sell: ${item.sell.keys}k ${item.sell.metal}ref`);
  });

  await server.start();
  console.log(`\nPricer server listening at http://127.0.0.1:${port}`);
  console.log(`Socket.IO endpoint: http://127.0.0.1:${port}/socket.io/`);
  console.log(`HTTP REST endpoint: http://127.0.0.1:${port}/items`);
  console.log('\nReady for tf2autobot connections.');
}

main().catch((err) => {
  console.error('Pricer server error:', err);
  process.exit(1);
});
