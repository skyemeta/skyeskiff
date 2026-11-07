// SkyeSkiff delegation and revocation: a real run against production that writes its own transcript.
//
// A principal (say, an approved research provider) signs an ERC-7710 delegation to an agent.
// A room that accepts only that principal's agents admits it with a signed pass. The principal
// then revokes the delegation on Base. A fresh check ejects the agent with a signed "not met",
// and the agent's attempt to rejoin is refused with another one. Every call is paid from the
// creator's credits, and the balance is read before and after each call. The run stops on any
// 402 (payment required): it never pays per call.
//
//   node delegation.mjs          run it (about 5 credits, plus one revoke transaction on Base)
//   node delegation.mjs --dry    print the cast and the creator's credit balance, call nothing
//
// Env:
//   PRINCIPAL_KEY  signs the delegations and revokes one. Needs a little ETH on Base for that one transaction.
//   CREATOR_KEY    opens the room and pays from its credits (needs 5). The creator is a member too,
//                  so it carries its own delegation from the principal.
//   AGENT_KEY      the delegated research agent. Needs nothing.
// CREATOR_KEY and AGENT_KEY may be fresh keys: the room's ordinary condition is "a plain key
// account on Base" (account_code "none"), which a brand-new wallet meets. Delegations are
// off-chain signatures; the only on-chain step is the revocation.
//
// Receipts are saved to docs/receipts/delegation/ beside a copy of InsumerAPI's JWKS, so anyone
// can check them later, offline, with verify-receipt.mjs.
// Deps: viem, insumer-verify, @noble/post-quantum (npm ci in examples/).
import fs from 'fs';
const NM = new URL('./node_modules/', import.meta.url).pathname;
const { privateKeyToAccount } = await import(NM + 'viem/_esm/accounts/index.js');
const { createPublicClient, createWalletClient, http, formatEther } = await import(NM + 'viem/_esm/index.js');
const { base } = await import(NM + 'viem/_esm/chains/index.js');
const { verifyAttestation } = await import(NM + 'insumer-verify/build/index.js');

const DRY = process.argv.includes('--dry');
const API = 'https://skyeskiff.skyemeta.com/api/skyeskiff';
const MANAGER = '0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3'; // MetaMask Delegation Framework v1.3.0 on Base
const ROOT = '0x' + 'f'.repeat(64);
const COST = 5; // open 1, join 1, re-check 2 (two members), refused rejoin 1
const dir = new URL('.', import.meta.url);

for (const k of ['PRINCIPAL_KEY', 'CREATOR_KEY', 'AGENT_KEY']) if (!process.env[k]) throw new Error(`${k} is not set`);
const P = privateKeyToAccount(process.env.PRINCIPAL_KEY);
const CR = privateKeyToAccount(process.env.CREATOR_KEY);
const AG = privateKeyToAccount(process.env.AGENT_KEY);
const pc = createPublicClient({ chain: base, transport: http() });

// ---- transcript ----------------------------------------------------------
const T = [];
const say = (...a) => { const l = a.join(' '); T.push(l); console.log(l); };
const h2 = t => say('\n## ' + t + '\n');
const code = o => say('```\n' + (typeof o === 'string' ? o : JSON.stringify(o, null, 2)) + '\n```');
const short = a => a.slice(0, 6) + '…' + a.slice(-4);
const scan = tx => `https://basescan.org/tx/${tx}`;
const now = () => new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
const same = (a, b) => a?.toLowerCase() === b?.toLowerCase();

// ---- API helpers ------------------------------------------------------------
const post = async (path, body) => {
  const r = await fetch(API + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  let j = null; try { j = await r.json(); } catch {}
  return { status: r.status, body: j };
};
async function challenge(acct, action) {
  const r = await post('/challenge', { wallet: acct.address, action });
  return { signature: await acct.signMessage({ message: r.body.message }), nonce: r.body.nonce };
}
// The creator's balance: free, and only the wallet's owner can read it.
const credits = async () => (await post('/credits', { wallet: CR.address, ...(await challenge(CR, 'credits')) })).body?.credits;
// One paid call, with the balance read before and after. Stops on 402: this run never pays per call.
async function call(label, path, body) {
  const before = await credits();
  const r = await post(path, body);
  if (r.status === 402) { say(`${label}: HTTP 402 payment required. Stopping here, as the run never pays per call.`); throw new Error('402'); }
  const after = await credits();
  say(`${label}: HTTP ${r.status}. Credits ${before} → ${after}.`);
  return r;
}

// ---- ERC-7710 delegations (MetaMask Delegation Framework) -----------------
const DOMAIN = { name: 'DelegationManager', version: '1', chainId: 8453, verifyingContract: MANAGER };
const TYPES = {
  Delegation: [
    { name: 'delegate', type: 'address' }, { name: 'delegator', type: 'address' }, { name: 'authority', type: 'bytes32' },
    { name: 'caveats', type: 'Caveat[]' }, { name: 'salt', type: 'uint256' },
  ],
  Caveat: [{ name: 'enforcer', type: 'address' }, { name: 'terms', type: 'bytes' }],
};
// The principal signs an EIP-712 delegation. No transaction, no gas.
async function delegate(to) {
  const salt = BigInt(Date.now()) * 1000n + BigInt(Math.floor(Math.random() * 1000));
  const message = { delegate: to, delegator: P.address, authority: ROOT, caveats: [], salt };
  const signature = await P.signTypedData({ domain: DOMAIN, types: TYPES, primaryType: 'Delegation', message });
  return { delegator: P.address, delegate: to, authority: ROOT, caveats: [], salt: salt.toString(), signature };
}
const MANAGER_ABI = [
  { type: 'function', name: 'disableDelegation', stateMutability: 'nonpayable', outputs: [], inputs: [{ name: '_delegation', type: 'tuple', components: [
    { name: 'delegate', type: 'address' }, { name: 'delegator', type: 'address' }, { name: 'authority', type: 'bytes32' },
    { name: 'caveats', type: 'tuple[]', components: [{ name: 'enforcer', type: 'address' }, { name: 'terms', type: 'bytes' }, { name: 'args', type: 'bytes' }] },
    { name: 'salt', type: 'uint256' }, { name: 'signature', type: 'bytes' },
  ] }] },
  { type: 'function', name: 'disabledDelegations', stateMutability: 'view', inputs: [{ type: 'bytes32' }], outputs: [{ type: 'bool' }] },
];
const isRevoked = h => pc.readContract({ address: MANAGER, abi: MANAGER_ABI, functionName: 'disabledDelegations', args: [h] });

// Every receipt is kept, so it can be saved and checked by anyone afterwards.
const receipts = [];
const delegationResult = att => att?.attestation?.results?.find(r => r.type === 'erc7710_delegation');
function receipt(who, att, step) {
  if (!att) { say(`(no receipt returned for ${who} at ${step})`); return; }
  receipts.push({ step, agent: who, receipt: att });
  const d = delegationResult(att);
  say(`Receipt for ${who}: attestation ${att.attestation?.id}, pass=${att.attestation?.pass}${d ? `, delegation met=${d.met}${d.failReason ? ` (${d.failReason})` : ''}` : ''}, signed by ${att.kid} (ES256)${att.pqKid ? ` and ${att.pqKid} (ML-DSA-65)` : ''}`);
}

// ---- the run ----------------------------------------------------------------
say(`# SkyeSkiff delegation and revocation, watched live\n\nRun at ${now()} against https://skyeskiff.skyemeta.com. Every transaction is on Base and every receipt checks against InsumerAPI's public keys. The data is dummy: no real provider, no real brief.\n`);
say(`Cast:\n- Principal (the approved provider): ${P.address}. Signs the delegations and, later, revokes one. Holds ${formatEther(await pc.getBalance({ address: P.address }))} ETH on Base for that transaction.\n- Room creator (the application that enforces the result): ${CR.address}. Opens the room and pays from its credits. It is a member too, so it carries its own delegation from the principal.\n- Research agent: ${AG.address}. Delegated by the principal.\n\nThe room: agents must carry a delegation from the principal (agentStanding.delegatedBy), plus one ordinary condition every member meets: a plain key account on Base (account_code "none"). Framework: ERC-7710, MetaMask Delegation Framework, DelegationManager ${MANAGER} on Base, root authority.`);
const start = await credits();
say(`\nThe creator's credit balance: ${start}. This run uses ${COST}.`);
if (DRY) { say('\n(dry run: no calls made)'); process.exit(0); }
if (!(start >= COST)) throw new Error(`the creator holds ${start} credits; it needs ${COST}`);

h2('1. The principal delegates to the creator and to the research agent');
const dCreator = await delegate(CR.address);
const dAgent = await delegate(AG.address);
say(`Two EIP-712 signatures by the principal, one per delegate. Nothing is sent on-chain and no gas is spent. The agent's delegation:`);
code({ ...dAgent, signature: dAgent.signature.slice(0, 18) + '…' });

h2('2. The creator opens the room');
const conditions = [{ type: 'account_code', chainId: 8453, expect: 'none' }];
const agentStanding = { delegatedBy: [P.address] };
const d = await call('declare', '/declare', { wallet: CR.address, ...(await challenge(CR, 'declare')), conditions, agentStanding, delegation: dCreator, capacity: 2, autoStart: true, reverifyPolicy: 'creator', expiresIn: 3600 });
if (d.status !== 200) { code(d.body); throw new Error('declare did not succeed'); }
const { channelId, sessionId } = d.body;
say(`Room ${channelId} is open and live (session ${sessionId}). The creator was checked first, delegation included.`);
code({ channelId, sessionId, conditions, agentStanding, capacity: 2, reverifyPolicy: 'creator' });

h2('3. The research agent is admitted');
const j = await call('join', '/join', { channelId, wallet: AG.address, ...(await challenge(AG, 'join')), delegation: dAgent });
if (j.status !== 200) { code(j.body); throw new Error('the agent should have been admitted'); }
say(`The agent is in. Members: ${j.body.agents.map(a => short(a.wallet)).join(', ')}.`);
receipt('creator', j.body.agents.find(a => same(a.wallet, CR.address))?.attestation, 'declare');
receipt('agent', j.body.agents.find(a => same(a.wallet, AG.address))?.attestation, 'join');
const agentHash = delegationResult(receipts[receipts.length - 1]?.receipt)?.evaluatedCondition?.delegationHash;
if (agentHash) say(`The agent's delegation hash, from its signed receipt: ${agentHash}. Revoked on-chain right now: ${await isRevoked(agentHash)}.`);

h2('4. The principal revokes the agent\'s delegation');
const wc = createWalletClient({ account: P, chain: base, transport: http() });
const tx = await wc.writeContract({ address: MANAGER, abi: MANAGER_ABI, functionName: 'disableDelegation',
  args: [{ ...dAgent, caveats: [], salt: BigInt(dAgent.salt) }] });
const rc = await pc.waitForTransactionReceipt({ hash: tx });
say(`disableDelegation on the DelegationManager, sent by the principal: ${scan(tx)} (block ${rc.blockNumber}, ${rc.status}, gas ${rc.gasUsed} at ${formatEther(rc.effectiveGasPrice * rc.gasUsed)} ETH).`);
if (agentHash) say(`Revoked on-chain now: ${await isRevoked(agentHash)}. Nothing told SkyeSkiff; the room still lists the agent.`);
await new Promise(r => setTimeout(r, 6000));

h2('5. The creator asks for a fresh check');
const rv = await call('re-check', '/session', { action: 'reverify', sessionId, wallet: CR.address, ...(await challenge(CR, 'reverify')) });
code({ valid: rv.body?.valid, ejected: rv.body?.ejected, remaining: rv.body?.agents?.map(a => a.wallet) });
const out = (rv.body?.ejected || []).some(x => same(x, AG.address));
say(out ? 'The agent is out, on the first check after the revocation. The creator stays with a fresh receipt.' : 'Unexpected: the agent was not ejected.');
for (const e of rv.body?.ejectedReceipts || []) receipt(same(e.wallet, AG.address) ? 'agent' : short(e.wallet), e.attestation, 'ejected');
for (const a of rv.body?.agents || []) receipt(same(a.wallet, CR.address) ? 'creator' : short(a.wallet), a.attestation, 're-check');

h2('6. The agent tries to get back in');
const again = await call('rejoin', '/join', { channelId, wallet: AG.address, ...(await challenge(AG, 'join')), delegation: dAgent });
say(again.status === 403 && again.body?.pass === false ? 'Refused with a signed "not met": the delegation is revoked.' : `Unexpected: ${again.status}`);
receipt('agent', again.body?.attestation, 'rejoin refused');

h2('7. Who is in the room now');
const after = await (await fetch(`${API}/session?id=${sessionId}`)).json();
code({ valid: after.valid, members: after.agents?.map(a => a.wallet) });

h2('8. Check the receipts without trusting anyone');
const jwks = await (await fetch('https://insumermodel.com/.well-known/jwks.json')).json();
say(`Each receipt is checked with insumer-verify, InsumerAPI's own open-source verifier, against a saved copy of https://insumermodel.com/.well-known/jwks.json. Nothing is asked of SkyeSkiff.`);
for (const r of receipts) {
  const v = await verifyAttestation({ ok: true, data: r.receipt }, { jwks, mode: 'evidence' });
  const c = v.checks;
  say(`- ${r.agent} at ${r.step} (${r.receipt.attestation.id}, pass=${r.receipt.attestation.pass}): ES256 signature ${c.signature?.passed ? 'VERIFIED' : 'FAILED'}, condition hashes ${c.conditionHashes?.passed ? 'match' : 'DO NOT match'}, post-quantum signature ${c.pq?.status}${c.jwt ? `, JWT ${c.jwt.passed ? 'VERIFIED and bound to this receipt' : 'FAILED'}` : ''}`);
}

const rdir = new URL('../docs/receipts/delegation/', dir);
const day = new Date().toISOString().slice(0, 10);
fs.mkdirSync(rdir, { recursive: true });
fs.writeFileSync(new URL('jwks.json', rdir), JSON.stringify(jwks, null, 2) + '\n');
receipts.forEach((r, n) => {
  const name = `${day}-${n + 1}-${r.agent.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${r.step.replace(/[^a-z]+/g, '-')}.json`;
  fs.writeFileSync(new URL(name, rdir), JSON.stringify({ channelId, sessionId, step: r.step, agent: r.agent, receipt: r.receipt }, null, 2) + '\n');
  say(`  saved docs/receipts/delegation/${name}`);
});
say(`\nCredits: ${start} at the start, ${await credits()} at the end. The only cost outside credits was the principal's one revoke transaction above.`);
const tfile = new URL(`../docs/delegation-transcript-${day}.md`, dir);
fs.writeFileSync(tfile, T.join('\n') + '\n');
console.log('\ntranscript written to', tfile.pathname);
