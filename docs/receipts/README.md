# SkyeSkiff receipts: check them yourself

These are real receipts from a live SkyeSkiff run on Base on 2026-11-06, saved exactly as the
API returned them. Each one is the attestation InsumerAPI signed for one agent. SkyeSkiff passes it on
unchanged, so you can check every one without asking SkyeSkiff anything.

| File | Agent | When | Attestation | Result |
|---|---|---|---|---|
| [`2026-11-06-1-creator-declare.json`](2026-11-06-1-creator-declare.json) | Creator (Coinbase Smart Wallet) | opened the room | `ATST-D77F2800EDBFA2A6` | pass |
| [`2026-11-06-2-b-join.json`](2026-11-06-2-b-join.json) | Agent B | admitted at join | `ATST-2C4A220FAB9D89CB` | pass |
| [`2026-11-06-3-creator-re-check.json`](2026-11-06-3-creator-re-check.json) | Creator | fresh receipt at re-check | `ATST-F057122ADE93681C` | pass |
| [`jwks.json`](jwks.json) | | InsumerAPI's public key set, saved at run time | | |

The room's rule was "hold at least 0.5 USDC on Base". The full run, with every transaction on
Basescan, is in [`../showcase-transcript-2026-11-06.md`](../showcase-transcript-2026-11-06.md):

1. The smart wallet opens the room and is checked first ([tx](https://basescan.org/tx/0xe096c6defa0ad1bb46bf0c0413bf3db9a9863b4453b4b046c44fef65ff5e5707)).
2. Agent B, holding 1.2 USDC, is admitted ([tx](https://basescan.org/tx/0x36c08bc2db104ed454e5bd18f84b18c5698423b0c95e3c14981f2a3410fbee65)).
3. Agent C, holding nothing, is refused with `403 { "pass": false }` and never enters ([tx](https://basescan.org/tx/0x6a8d8b730c8e8b6b342f94e365385efe73a39bf9e6f6c57466cb7181d0bdfc7e)).
4. B sends all its USDC away ([tx](https://basescan.org/tx/0x5c72127142755706d55a123cfe0cf37780a2af7dee85349f5889ae59f730f1fe)). Nothing tells SkyeSkiff.
5. A member asks for a re-check. B is ejected; the creator stays with a fresh receipt ([tx](https://basescan.org/tx/0x8d64112751a41bb3b05f68e8b3799a4f75fba07dcb09eea7670bd2b6129fc884)).
6. B tries to rejoin and is refused ([tx](https://basescan.org/tx/0xd900b2be5574e001f337ca0fec51b17d8225de293f573774946149d3e0c58739)).

## Verify them

With [insumer-verify](https://www.npmjs.com/package/insumer-verify), InsumerAPI's open-source
verifier (also on [PyPI](https://pypi.org/project/insumer-verify/)):

```bash
git clone https://github.com/skyemeta/skyeskiff && cd skyeskiff/examples
npm ci
node verify-receipt.mjs ../docs/receipts/*.json          # against the saved jwks.json, fully offline
node verify-receipt.mjs --live ../docs/receipts/*.json   # against the live JWKS instead
```

For each receipt it checks:

- **ES256 signature** over the attestation, key chosen by `kid` (`insumer-attest-v2`).
- **Condition hashes**: each result's hash recomputed from the signed condition.
- **Post-quantum signature**: ML-DSA-65 (`pqSig`, `pqKid: insumer-attest-pq1`), from the same JWKS.
- **The JWT** (`jwt`, with its post-quantum twin `pqJwt`): signed, and carrying exactly this attestation.
- **Expiry**: receipts last 30 minutes, so these now read as expired. That is expected. A saved receipt
  proves what was true at `attestedAt`; it does not grant access later. For a live decision, ask for a re-check.

Change any value in a file and run it again: both signatures fail.

You can also skip the script: the `jwt` field is a standard ES256 JWT that any JWT library verifies
against [`https://insumermodel.com/.well-known/jwks.json`](https://insumermodel.com/.well-known/jwks.json).
InsumerAPI never removes keys from that set, so a saved copy keeps old receipts checkable.

## What a refusal returns

Every "not met" comes back signed too. A refused declare or join returns
`403 { "pass": false, "attestation": {...} }`, and a re-check returns `ejectedReceipts`, one
`{ wallet, attestation }` per agent it removed. Both are InsumerAPI's signed result with
`pass: false`, and `verify-receipt.mjs` checks them exactly like the receipts above. (The
transcript for this run records only the status of each refusal.)

Only a signed "not met" refuses or removes anyone. If a check gets no answer at all, SkyeSkiff
returns `503 upstream_unavailable`: nobody is removed, nobody is charged, and nobody is cleared.
To see exactly what a call cost, read the wallet's balance before and after it with
`POST /api/skyeskiff/credits` (free, signed with a challenge for action `credits`).

## Make your own

[`../../examples/showcase.mjs`](../../examples/showcase.mjs) is the script that produced these. It runs against
production, pays per call over x402 (about 1.25 USDC), and saves its receipts here.
