# SkyeSkiff, watched live

Run at 2026-11-06 21:47:42 UTC against https://skyeskiff.skyemeta.com. Nothing here is staged: every transaction is on Base and every receipt checks against InsumerAPI's public keys.

Cast:
- Creator: 0xF4605E4964FCEe7fba5908619C19a1aF0b5cb98E, a Coinbase Smart Wallet (a contract account; signs with ERC-1271). It also pays for every call, per call, with x402.
- Agent B: 0xCd97C6e12503C5F012532362B4A32ce0e185C157, a regular wallet holding 1.2 USDC.
- Agent C: 0x9d3C52e867579722715Dc487A9019386B7c3C4ad, a regular wallet holding 0 USDC.

The room's rule: hold at least 0.5 USDC on Base.

## 1. The smart wallet opens the room

declare: HTTP 402, quote 0.5 USDC on Base. Paying as 0xF460…b98E (smart wallet, ERC-1271)…
declare: HTTP 200, settled: true, tx https://basescan.org/tx/0xe096c6defa0ad1bb46bf0c0413bf3db9a9863b4453b4b046c44fef65ff5e5707
Room ch_499c251076bfa81f3901eb2f0a8d0e2e is open and live (session ses_826cbe3fee42041c5b2593ddc1f4cd3f). The creator's own wallet was checked first: it holds 1.35 USDC.
```
{
  "channelId": "ch_499c251076bfa81f3901eb2f0a8d0e2e",
  "sessionId": "ses_826cbe3fee42041c5b2593ddc1f4cd3f",
  "conditions": [
    {
      "type": "token_balance",
      "chainId": 8453,
      "contractAddress": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      "threshold": "0.5"
    }
  ],
  "capacity": 3
}
```

## 2. A regular wallet that qualifies joins

join B: HTTP 402, quote 0.15 USDC on Base. Paying as 0xF460…b98E (smart wallet, ERC-1271)…
join B: HTTP 200, settled: true, tx https://basescan.org/tx/0x36c08bc2db104ed454e5bd18f84b18c5698423b0c95e3c14981f2a3410fbee65
B is in. Members now: 0xf460…b98e, 0xcd97…c157.
Receipt for creator: attestation ATST-D77F2800EDBFA2A6, pass=true, signed by insumer-attest-v2 (ES256) and insumer-attest-pq1 (ML-DSA-65)
Receipt for B: attestation ATST-2C4A220FAB9D89CB, pass=true, signed by insumer-attest-v2 (ES256) and insumer-attest-pq1 (ML-DSA-65)

## 3. A regular wallet that does not qualify is refused

join C: HTTP 402, quote 0.15 USDC on Base. Paying as 0xF460…b98E (smart wallet, ERC-1271)…
join C: HTTP 403, settled: true, tx https://basescan.org/tx/0x6a8d8b730c8e8b6b342f94e365385efe73a39bf9e6f6c57466cb7181d0bdfc7e
```
{
  "pass": false
}
```
C is refused: InsumerAPI signed "not met" for 0.5 USDC. The call was paid for (a signed answer is an answer), and C never entered.

## 4. B stops qualifying: it sends its USDC away

B sent 1.2 USDC to the creator: https://basescan.org/tx/0x5c72127142755706d55a123cfe0cf37780a2af7dee85349f5889ae59f730f1fe (block 54056468, success). B now holds 0 USDC. Nothing told SkyeSkiff; the room still lists B.
Session read before any re-check: members 0xf460…b98e, 0xcd97…c157.

## 5. A member asks for a fresh check

re-verify: HTTP 402, quote 0.3 USDC on Base. Paying as 0xF460…b98E (smart wallet, ERC-1271)…
re-verify: HTTP 200, settled: true, tx https://basescan.org/tx/0x8d64112751a41bb3b05f68e8b3799a4f75fba07dcb09eea7670bd2b6129fc884
```
{
  "valid": true,
  "ejected": [
    "0xcd97c6e12503c5f012532362b4a32ce0e185c157"
  ],
  "remaining": [
    "0xf4605e4964fcee7fba5908619c19a1af0b5cb98e"
  ]
}
```
B is out. The creator stays. No admin pressed anything: the chain changed, the next check noticed.
Receipt for creator: attestation ATST-F057122ADE93681C, pass=true, signed by insumer-attest-v2 (ES256) and insumer-attest-pq1 (ML-DSA-65)

## 6. B tries to get back in

join B again: HTTP 402, quote 0.15 USDC on Base. Paying as 0xF460…b98E (smart wallet, ERC-1271)…
join B again: HTTP 403, settled: true, tx https://basescan.org/tx/0xd900b2be5574e001f337ca0fec51b17d8225de293f573774946149d3e0c58739
```
{
  "pass": false
}
```
Refused: a signed "not met". Being in once buys nothing; the rule is checked every time.

## 7. Who is in the room now

```
{
  "valid": true,
  "members": [
    "0xf4605e4964fcee7fba5908619c19a1af0b5cb98e"
  ]
}
```

## 8. Check the receipts without trusting anyone

Each receipt is checked with insumer-verify, InsumerAPI's own open-source verifier, against a saved copy of https://insumermodel.com/.well-known/jwks.json. Nothing is asked of SkyeSkiff.
- creator at declare (ATST-D77F2800EDBFA2A6, pass=true): ES256 signature VERIFIED, condition hashes match, post-quantum signature verified, JWT VERIFIED and bound to this receipt
- B at join (ATST-2C4A220FAB9D89CB, pass=true): ES256 signature VERIFIED, condition hashes match, post-quantum signature verified, JWT VERIFIED and bound to this receipt
- creator at re-check (ATST-F057122ADE93681C, pass=true): ES256 signature VERIFIED, condition hashes match, post-quantum signature verified, JWT VERIFIED and bound to this receipt
  saved docs/receipts/2026-11-06-1-creator-declare.json
  saved docs/receipts/2026-11-06-2-b-join.json
  saved docs/receipts/2026-11-06-3-creator-re-check.json

Balances at the end: creator 1.8 USDC, B 0 USDC, C 0 USDC. Every call above was paid per call by the smart wallet over x402.
