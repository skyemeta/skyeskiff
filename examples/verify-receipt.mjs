// Check a saved SkyeSkiff receipt yourself, with InsumerAPI's own open-source verifier.
//
//   node verify-receipt.mjs ../docs/receipts/*.json          uses the saved key set, fully offline
//   node verify-receipt.mjs --live ../docs/receipts/*.json   fetches the live JWKS instead
//
// A receipt is the attestation InsumerAPI signed for one agent. SkyeSkiff passes it on
// unchanged, so nothing here asks SkyeSkiff anything. Each file holds { receipt: {...} } as
// saved by showcase.mjs, or a bare receipt.
//
// Deps: insumer-verify, @noble/post-quantum (npm i in examples/).
import fs from 'fs';
import path from 'path';
const NM = new URL('./node_modules/', import.meta.url).pathname;
const { verifyAttestation } = await import(NM + 'insumer-verify/build/index.js');

const args = process.argv.slice(2);
const live = args.includes('--live');
const files = args.filter(a => a !== '--live');
if (!files.length) {
  console.log('usage: node verify-receipt.mjs [--live] <receipt.json> ...');
  process.exit(1);
}

// Saved copy next to the receipts (InsumerAPI never removes keys, so a copy keeps old receipts checkable).
async function keySet(file) {
  if (live) return (await fetch('https://insumermodel.com/.well-known/jwks.json')).json();
  const saved = path.join(path.dirname(file), 'jwks.json');
  if (!fs.existsSync(saved)) throw new Error(`no jwks.json beside ${file}; use --live`);
  return JSON.parse(fs.readFileSync(saved, 'utf8'));
}

const mark = ok => (ok ? 'ok  ' : 'FAIL');
let allGood = true;
for (const file of files) {
  if (path.basename(file) === 'jwks.json') continue;
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  const receipt = saved.receipt || saved.data || saved;
  // evidence mode: report every verdict, never refuse a record for its age
  const v = await verifyAttestation({ ok: true, data: receipt }, { jwks: await keySet(file), mode: 'evidence' });
  const c = v.checks;
  const a = receipt.attestation || {};
  console.log(`\n${path.basename(file)}${saved.agent ? `  (${saved.agent} at ${saved.step})` : ''}`);
  console.log(`  attestation ${a.id}, pass=${a.pass}, attested ${a.attestedAt}`);
  console.log(`  ${mark(c.signature.passed)} ES256 signature (${receipt.kid})`);
  console.log(`  ${mark(c.conditionHashes.passed)} condition hashes`);
  console.log(`  ${mark(c.pq.status === 'verified')} post-quantum ML-DSA-65 signature: ${c.pq.status}${c.pq.reason ? ` (${c.pq.reason})` : ''}`);
  if (c.jwt) console.log(`  ${mark(c.jwt.passed)} JWT signed and matching this receipt${c.jwt.pq ? `, its post-quantum signature ${c.jwt.pq.status}` : ''}`);
  console.log(`  ${c.expiry.passed ? 'ok  ' : 'note'} expiry: ${c.expiry.passed ? 'still current' : 'expired, as a saved receipt will be; it proves what was true at attestedAt, it does not grant access now'}`);
  const good = c.signature.passed && c.conditionHashes.passed && c.pq.status === 'verified' && (!c.jwt || c.jwt.passed);
  if (!good) allGood = false;
}
console.log(allGood ? '\nEvery receipt checks out.' : '\nAt least one receipt did NOT check out.');
process.exit(allGood ? 0 : 1);
