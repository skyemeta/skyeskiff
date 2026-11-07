# SkyeSkiff delegation and revocation, watched live

Run at 2026-11-07 16:40:47 UTC against https://skyeskiff.skyemeta.com. Every transaction is on Base and every receipt checks against InsumerAPI's public keys. The data is dummy: no real provider, no real brief.

Cast:
- Principal (the approved provider): 0x7de88F9D224cf170dF625Cf6aFd1E04d0c2e0B5B. Signs the delegations and, later, revokes one. Holds 0.000307578336570418 ETH on Base for that transaction.
- Room creator (the application that enforces the result): 0xe7dB600bae17484489DbD0b3000b77BDc327a293. Opens the room and pays from its credits. It is a member too, so it carries its own delegation from the principal.
- Research agent: 0x72092393F113A8175Ed7ec2D08ccBcA028BEdc77. Delegated by the principal.

The room: agents must carry a delegation from the principal (agentStanding.delegatedBy), plus one ordinary condition every member meets: a plain key account on Base (account_code "none"). Framework: ERC-7710, MetaMask Delegation Framework, DelegationManager 0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3 on Base, root authority.

The creator's credit balance: 6. This run uses 5.

## 1. The principal delegates to the creator and to the research agent

Two EIP-712 signatures by the principal, one per delegate. Nothing is sent on-chain and no gas is spent. The agent's delegation:
```
{
  "delegator": "0x7de88F9D224cf170dF625Cf6aFd1E04d0c2e0B5B",
  "delegate": "0x72092393F113A8175Ed7ec2D08ccBcA028BEdc77",
  "authority": "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
  "caveats": [],
  "salt": "1794069647951715",
  "signature": "0x833260b0e4474dcb…"
}
```

## 2. The creator opens the room

declare: HTTP 200. Credits 6 → 5.
Room ch_33311d5a136234d8805dfbc90d282fda is open and live (session ses_c3c60f34491705b429cc384d5abb1c91). The creator was checked first, delegation included.
```
{
  "channelId": "ch_33311d5a136234d8805dfbc90d282fda",
  "sessionId": "ses_c3c60f34491705b429cc384d5abb1c91",
  "conditions": [
    {
      "type": "account_code",
      "chainId": 8453,
      "expect": "none"
    }
  ],
  "agentStanding": {
    "delegatedBy": [
      "0x7de88F9D224cf170dF625Cf6aFd1E04d0c2e0B5B"
    ]
  },
  "capacity": 2,
  "reverifyPolicy": "creator"
}
```

## 3. The research agent is admitted

join: HTTP 200. Credits 5 → 4.
The agent is in. Members: 0xe7db…a293, 0x7209…dc77.
Receipt for creator: attestation ATST-D54AAEF77BD6884B, pass=true, delegation met=true, signed by insumer-attest-v2 (ES256) and insumer-attest-pq1 (ML-DSA-65)
Receipt for agent: attestation ATST-CBF7D59E3CC73AAD, pass=true, delegation met=true, signed by insumer-attest-v2 (ES256) and insumer-attest-pq1 (ML-DSA-65)
The agent's delegation hash, from its signed receipt: 0x309878d4cc5a70a3077a581f636be3013d0fa45f422afb959aefcca8c26e6042. Revoked on-chain right now: false.

## 4. The principal revokes the agent's delegation

disableDelegation on the DelegationManager, sent by the principal: https://basescan.org/tx/0x6d2483ad0a3b74ed4166681da4e3c3b45c0e11a7797f44bf48c4bfd92d474a1a (block 54396379, success, gas 56098 at 0.000000336588 ETH).
Revoked on-chain now: true. Nothing told SkyeSkiff; the room still lists the agent.

## 5. The creator asks for a fresh check

re-check: HTTP 200. Credits 4 → 2.
```
{
  "valid": true,
  "ejected": [
    "0x72092393f113a8175ed7ec2d08ccbca028bedc77"
  ],
  "remaining": [
    "0xe7db600bae17484489dbd0b3000b77bdc327a293"
  ]
}
```
The agent is out, on the first check after the revocation. The creator stays with a fresh receipt.
Receipt for agent: attestation ATST-9E5F1ACFD709901B, pass=false, delegation met=false (revoked), signed by insumer-attest-v2 (ES256) and insumer-attest-pq1 (ML-DSA-65)
Receipt for creator: attestation ATST-F61531AB50CBBE74, pass=true, delegation met=true, signed by insumer-attest-v2 (ES256) and insumer-attest-pq1 (ML-DSA-65)

## 6. The agent tries to get back in

rejoin: HTTP 403. Credits 2 → 1.
Refused with a signed "not met": the delegation is revoked.
Receipt for agent: attestation ATST-1B3A7ADCCCCAD711, pass=false, delegation met=false (revoked), signed by insumer-attest-v2 (ES256) and insumer-attest-pq1 (ML-DSA-65)

## 7. Who is in the room now

```
{
  "valid": true,
  "members": [
    "0xe7db600bae17484489dbd0b3000b77bdc327a293"
  ]
}
```

## 8. Check the receipts without trusting anyone

Each receipt is checked with insumer-verify, InsumerAPI's own open-source verifier, against a saved copy of https://insumermodel.com/.well-known/jwks.json. Nothing is asked of SkyeSkiff.
- creator at declare (ATST-D54AAEF77BD6884B, pass=true): ES256 signature VERIFIED, condition hashes match, post-quantum signature verified, JWT VERIFIED and bound to this receipt
- agent at join (ATST-CBF7D59E3CC73AAD, pass=true): ES256 signature VERIFIED, condition hashes match, post-quantum signature verified, JWT VERIFIED and bound to this receipt
- agent at ejected (ATST-9E5F1ACFD709901B, pass=false): ES256 signature VERIFIED, condition hashes match, post-quantum signature verified, JWT VERIFIED and bound to this receipt
- creator at re-check (ATST-F61531AB50CBBE74, pass=true): ES256 signature VERIFIED, condition hashes match, post-quantum signature verified, JWT VERIFIED and bound to this receipt
- agent at rejoin refused (ATST-1B3A7ADCCCCAD711, pass=false): ES256 signature VERIFIED, condition hashes match, post-quantum signature verified, JWT VERIFIED and bound to this receipt
  saved docs/receipts/delegation/2026-11-07-1-creator-declare.json
  saved docs/receipts/delegation/2026-11-07-2-agent-join.json
  saved docs/receipts/delegation/2026-11-07-3-agent-ejected.json
  saved docs/receipts/delegation/2026-11-07-4-creator-re-check.json
  saved docs/receipts/delegation/2026-11-07-5-agent-rejoin-refused.json

Credits: 6 at the start, 1 at the end. The only cost outside credits was the principal's one revoke transaction above.
