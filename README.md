# Token Powers

Paste an ERC-20 from Ethereum mainnet and see what its deployer can still do to
the people holding it: freeze a wallet, raise the tax, switch selling off.

It's read-only. The page never asks for a signature and never builds a
transaction.

[Live](https://vuduykhang2306.github.io/token-powers/) ·
[the audit this came out of](https://github.com/Vuduykhang2306/smart-contract-security-lab/tree/main/reviews/2026-09_FatTokenV5)

## Why it exists

I reviewed a launchpad token template that several mainnet tokens are deployed
from. The most useful conclusion wasn't any single finding:

> Every dangerous power in that template is decided in the constructor, and no
> function can switch any of them back on. A buyer can read five values on
> chain and know their exposure for good.

That's useful to know but hard to act on, because reading five values on
Etherscan means knowing which five. This page does that check for you.

## Two kinds of danger

These contracts have two different kinds of danger, and people mix them up.
That's why "ownership renounced" often gets read as "this token is safe".

An owner power is something a privileged address can choose to do later: raise
the tax, freeze a holder, switch trading off. Renouncing ownership removes all
of them for good.

A baked-in mechanism runs by itself on every transfer, without anyone calling
anything: a kill-block window that flags early buyers, or an airdrop loop that
makes small transfers revert. Renouncing ownership doesn't remove these. It
makes them permanent, because the setter that could have turned them off can't
be called anymore either.

So the same `owner() = 0xdead` is good news for the first kind and bad news for
the second. The page says which is which instead of printing one verdict.

## How it reads a token

The ABI in [`lib/abi.ts`](lib/abi.ts) is a list of probes. No token implements
all of it. Each entry is called against the address: the ones that answer are
powers the token actually has, and the ones that revert are powers it doesn't
have. That's what `allowFailure` is for. Here a revert counts as an answer.

The flag names come from the template above, plus the names other token
families use for the same thing (`isReward`, `isBlacklisted`, `_blackList`,
`isBlackListed`).

## The sell simulation

Reading flags tells you which powers exist. It doesn't tell you whether a sell
goes through right now, because whatever blocks it might not be one of the
flags.

So [`lib/simulate.ts`](lib/simulate.ts) asks the chain directly, using
`eth_call` with a state override: give the wallet a balance it doesn't have,
try the transfer, and see whether the EVM reverts. Nothing is signed or
broadcast, and the fake balance only exists inside that one call.

Finding where to write the fake balance is trial and error. For each of the
first 32 storage slots, compute `keccak256(address . slot)`, override it, and
read `balanceOf` back. The slot that returns the fake number is the balance
mapping.

It's the same thing the fork PoCs in my audit repo do, just without Foundry.
There the harness calls `deal()`; here the RPC does it.

## What it can't tell you

- It probes for names. A token that hides the same power behind a name that
  isn't on the list will look clean. A green result is one input to a decision,
  and it isn't an audit.
- The sell is simulated at the token level, as a transfer straight to the
  pair, which is what the router's `transferFrom` does in the end. It shows the
  transfer is allowed. It doesn't show the trade is worth making.
- Slot discovery fails on some tokens: proxies, packed structs, unusual
  layouts. Those show "could not determine" instead of a false all-clear.
- It doesn't read the source. Ownership behind a multisig or a timelock looks
  the same here as ownership behind one person's key.

## Running it

```bash
npm install
npm run dev          # http://localhost:3000
npm run build        # static export into out/
```

`npm run verify` runs the reading logic in `lib/` against mainnet without a
browser, on three tokens whose behaviour is already known:

```
=== BabyGOAT ===      22/32 probes answer, owner renounced, isReward present,
                      airdrop loop permanently on, sell simulation: sellable
=== USDC ===           3/32 probes answer, live owner, blacklist, pausable
=== SHIB ===           0/32 probes answer, no admin surface these probes find
```

The analysis takes contract reads in and gives verdicts out, so it can be
checked against known tokens instead of only by looking at the UI.

## Stack

Next.js (App Router, static export), TypeScript, wagmi, viem, TanStack Query,
Tailwind. Wallet support is the injected connector only. WalletConnect needs a
project id, which would mean putting a secret in a static site, and this page
has no reason to ask for one.

Tiếng Việt: [README.vi.md](README.vi.md)

## Licence

MIT.
