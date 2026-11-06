#!/usr/bin/env bash
# Run the paid SkyeSkiff showcase against production, then check its receipts.
# Keys: set SHOWCASE_KEYS_DIR to a folder holding smartwallet.json ({ account, ownerKey }) and
# showcase-agents.json ({ b: { key }, c: { key } }), or type them when asked (input is hidden).
# Keys are never printed. Costs about 1.25 USDC from the creator smart wallet.
# Agent B must hold at least 0.5 USDC on Base.
set -euo pipefail
cd "$(dirname "$0")"
[ -d node_modules/insumer-verify ] || npm ci

K="${SHOWCASE_KEYS_DIR:-}"
if [ -n "$K" ] && [ -f "$K/smartwallet.json" ] && [ -f "$K/showcase-agents.json" ]; then
  echo "Reading keys from $K"
  CREATOR_ACCOUNT=$(node -p "require('$K/smartwallet.json').account")
  CREATOR_OWNER_KEY=$(node -p "require('$K/smartwallet.json').ownerKey")
  AGENT_B_KEY=$(node -p "require('$K/showcase-agents.json').b.key")
  AGENT_C_KEY=$(node -p "require('$K/showcase-agents.json').c.key")
else
  read -rp  "Creator smart wallet address (CREATOR_ACCOUNT): " CREATOR_ACCOUNT
  read -rsp "Creator owner key (CREATOR_OWNER_KEY): " CREATOR_OWNER_KEY; echo
  read -rsp "Agent B key (AGENT_B_KEY): " AGENT_B_KEY; echo
  read -rsp "Agent C key (AGENT_C_KEY): " AGENT_C_KEY; echo
fi
export CREATOR_ACCOUNT CREATOR_OWNER_KEY AGENT_B_KEY AGENT_C_KEY

echo; echo "== Dry run: who is who, and what they hold (nothing is called) =="
node showcase.mjs --dry
echo
read -rp "Agent B needs at least 0.5 USDC and the creator about 1.3. Spend ~1.25 USDC and run it for real? [y/N] " go
[ "$go" = "y" ] || { echo "Stopped. Nothing spent."; exit 0; }

node showcase.mjs
unset CREATOR_OWNER_KEY AGENT_B_KEY AGENT_C_KEY

echo; echo "== Checking the saved receipts offline with insumer-verify =="
node verify-receipt.mjs ../docs/receipts/"$(date -u +%F)"-*.json
