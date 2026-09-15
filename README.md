# Token Powers

Paste an ERC-20 from Ethereum mainnet and see what its deployer can still do to
the people holding it: freeze a wallet, raise the tax, switch selling off.

Read-only. The page never asks for a signature and never builds a transaction.

**[Live](https://vuduykhang2306.github.io/token-powers/)** ·
[the audit this came out of](https://github.com/Vuduykhang2306/smart-contract-security-lab/tree/main/reviews/2026-09_FatTokenV5)

## Why it exists

I reviewed a launchpad token template that several mainnet tokens are deployed
from. The conclusion worth keeping was not any single finding:

> Every dangerous power in that template is decided in the constructor, and no
> function can switch any of them back on. A buyer can read five booleans on
> chain and know their exposure permanently.

That is a useful fact and nobody can act on it, because reading five booleans on
Etherscan means knowing which five. This is that check, as a page.

## The distinction it is built around

There are two different kinds of danger in these contracts and people conflate
them, which is why "ownership renounced" gets read as a clean bill of health.

**An owner power** is something a privileged address can choose to do later:
raise the tax, freeze a holder, switch trading off. Renouncing ownership kills
all of them, permanently.

**A baked-in mechanism** runs on its own, on every transfer, with nobody calling
anything: a kill-block window that flags early buyers, an airdrop loop that
reverts small transfers. Renouncing ownership does not kill these. It makes them
permanent, because the setter that could have switched them off is now
unreachable too.

So the same `owner() = 0xdead` is good news for the first kind and bad news for
the second, and the page says which is which instead of printing one verdict.

## How it reads a token

The ABI in [`lib/abi.ts`](lib/abi.ts) is a probe, not a real interface. No token
implements all of it. Every entry is called against the address and the ones
that answer are the powers that token actually has; the ones that revert are the
powers it does not. `allowFailure` is the whole mechanism — a revert is the
answer, not an error.

The flag names come from the template above, plus the naming conventions other
token families use for the same thing (`isReward`, `isBlacklisted`, `_blackList`,
`isBlackListed`).

## The sell simulation

Reading flags tells you what powers exist. It does not tell you whether a sell
goes through right now, because the block can come from somewhere the flags do
not mention.

So [`lib/simulate.ts`](lib/simulate.ts) asks the chain directly, with
`eth_call` and a state override: give the wallet a balance it does not have,
then try the transfer and see whether the EVM reverts. Nothing is signed,
nothing is broadcast, and the override exists only inside that one call.

Finding where to write the fake balance is guess-and-check: for each of the
first 32 storage slots, compute `keccak256(address . slot)`, override it, and
read `balanceOf` back. The slot that returns the faked number is the balance
mapping.

This is the same thing the fork proofs of concept in my audit repo do, minus
Foundry — there the harness calls `deal()`, here the RPC does it.

## What it will not tell you

- **It probes for names.** A token that hides the same power behind a name that
  is not in the list reads as clean. A green result is one input to a decision,
  not an audit.
- **The sell is simulated at the token level**, as a transfer straight to the
  pair, which is what the router's `transferFrom` ends up doing. It proves the
  transfer is allowed, not that the trade is worth making.
- **Slot discovery fails on some tokens** — proxies, packed structs, unusual
  layouts. Those get "could not determine" rather than a wrong reassurance.
- **It does not read the source.** Ownership behind a multisig or a timelock
  looks identical here to ownership behind one person's key.

## Running it

```bash
npm install
npm run dev          # http://localhost:3000
npm run build        # static export into out/
```

`npm run verify` runs the reading logic in `lib/` against mainnet with no
browser, over three tokens whose behaviour is already known:

```
=== BabyGOAT ===      22/32 probes answer, owner renounced, isReward present,
                      airdrop loop permanently on, sell simulation: sellable
=== USDC ===           3/32 probes answer, live owner, blacklist, pausable
=== SHIB ===           0/32 probes answer, no admin surface these probes find
```

The analysis takes contract reads in and produces verdicts out, so it can be
checked against known tokens instead of only eyeballed in the UI.

## Stack

Next.js (App Router, static export), TypeScript, wagmi, viem, TanStack Query,
Tailwind. Wallet support is the injected connector only: WalletConnect needs a
project id, which means a secret in a static site, and this page has no reason
to ask for one.

Tiếng Việt: [README.vi.md](README.vi.md)

## Licence

MIT.
