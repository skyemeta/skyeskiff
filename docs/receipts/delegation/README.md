# Delegation and revocation receipts: check them yourself

Real receipts from a live SkyeSkiff run on Base on 2026-11-07, saved exactly as the API returned
them. A principal (standing in for an approved provider) delegated to a research agent, the agent
was admitted, the principal revoked the delegation on Base, and the next check removed the agent.
Each receipt is the attestation InsumerAPI signed for one agent, passed on unchanged.

| File | Agent | When | Attestation | Result |
|---|---|---|---|---|
| [`2026-11-07-1-creator-declare.json`](2026-11-07-1-creator-declare.json) | Room creator | opened the room | `ATST-D54AAEF77BD6884B` | pass |
| [`2026-11-07-2-agent-join.json`](2026-11-07-2-agent-join.json) | Research agent | admitted at join | `ATST-CBF7D59E3CC73AAD` | pass |
| [`2026-11-07-3-agent-ejected.json`](2026-11-07-3-agent-ejected.json) | Research agent | ejected at re-check | `ATST-9E5F1ACFD709901B` | not met: `revoked` |
| [`2026-11-07-4-creator-re-check.json`](2026-11-07-4-creator-re-check.json) | Room creator | fresh receipt at re-check | `ATST-F61531AB50CBBE74` | pass |
| [`2026-11-07-5-agent-rejoin-refused.json`](2026-11-07-5-agent-rejoin-refused.json) | Research agent | rejoin refused (403) | `ATST-1B3A7ADCCCCAD711` | not met: `revoked` |
| [`jwks.json`](jwks.json) | | InsumerAPI's public key set, saved at run time | | |

The full run is in [`../../delegation-transcript-2026-11-07.md`](../../delegation-transcript-2026-11-07.md),
and the script that produced it is [`../../../examples/delegation.mjs`](../../../examples/delegation.mjs).

## The setup

- **Principal** `0x7de88F9D…0B5B`: signs an ERC-7710 delegation (an EIP-712 signature, no transaction) to each
  member, and later revokes the agent's. A plain key wallet.
- **Room creator** `0xe7dB600b…a293`: opens the room and pays from its credits. It is a member too, so it
  carries its own delegation from the principal.
- **Research agent** `0x72092393…dc77`: the delegate.
- **Room**: `agentStanding: { delegatedBy: [principal] }` plus one ordinary condition, a plain key
  account on Base (`account_code` `"none"`), which new wallets meet. `reverifyPolicy: "creator"`.
- **Framework**: ERC-7710, MetaMask Delegation Framework, DelegationManager
  `0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3` on Base, root authority.

## What happened

1. The creator opened the room (credits 6 → 5) and the agent joined with its delegation (5 → 4).
   Both receipts show the delegation `met: true`.
2. The principal called `disableDelegation` on the DelegationManager:
   [tx](https://basescan.org/tx/0x6d2483ad0a3b74ed4166681da4e3c3b45c0e11a7797f44bf48c4bfd92d474a1a),
   block 54396379, 56,098 gas (0.00000034 ETH). Nothing told SkyeSkiff.
3. The creator asked for a fresh check (4 → 2, one credit per member). The check read Base at block
   54396413, found the delegation revoked, and ejected the agent. The response carried the agent's
   signed "not met" in `ejectedReceipts`; the creator stayed with a fresh pass.
4. The agent tried to rejoin with the same delegation: `403 { "pass": false, "attestation": {...} }` (2 → 1).

The only cost outside credits was the revoke transaction. Creating a delegation costs nothing.

## Verify them

```bash
git clone https://github.com/skyemeta/skyeskiff && cd skyeskiff/examples
npm ci
node verify-receipt.mjs ../docs/receipts/delegation/*.json          # against the saved jwks.json, offline
node verify-receipt.mjs --live ../docs/receipts/delegation/*.json   # against the live JWKS
```

Each receipt checks: the ES256 signature (`insumer-attest-v2`), the condition hashes, the
post-quantum ML-DSA-65 signature (`insumer-attest-pq1`), and the JWT. Receipts with a delegation
condition expire after 5 minutes, so these read as expired now: a saved receipt proves what was true
at its block, it does not grant access later.

In each receipt, the delegation result names the delegator, the delegate and the `delegationHash`
(`0x309878d4…6042` for the agent's). Check the revocation on Base yourself:
`disabledDelegations(0x309878d4cc5a70a3077a581f636be3013d0fa45f422afb959aefcca8c26e6042)` on the
DelegationManager returns `true`.
