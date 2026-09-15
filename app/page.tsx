"use client";

import { useEffect, useState } from "react";
import { isAddress, type Address } from "viem";
import { ConnectButton } from "@/components/ConnectButton";
import { TokenReport } from "@/components/TokenReport";

/** Tokens worth looking at. The first is the one my review was written against. */
const EXAMPLES: { label: string; address: Address; note: string }[] = [
  {
    label: "BabyGOAT",
    address: "0x26d86F942D514B470Ba5dF311027a870110F6699",
    note: "the launchpad template I reviewed",
  },
  { label: "USDC", address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", note: "a pausable, blocklisting stablecoin" },
  { label: "SHIB", address: "0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE", note: "a plain token with no admin left" },
];

export default function Home() {
  const [input, setInput] = useState("");
  const [token, setToken] = useState<Address | null>(null);
  const valid = isAddress(input.trim());

  // ?token=0x... makes a result shareable, which is the whole point of a page
  // like this: you send someone the link, not a screenshot of a verdict.
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("token");
    if (fromUrl && isAddress(fromUrl)) {
      setInput(fromUrl);
      setToken(fromUrl as Address);
    }
  }, []);

  function submit(value: string) {
    const v = value.trim();
    if (!isAddress(v)) return;
    setInput(v);
    setToken(v as Address);
    const url = new URL(window.location.href);
    url.searchParams.set("token", v);
    window.history.replaceState(null, "", url);
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:py-16">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Token Powers</h1>
          <p className="mt-2 max-w-xl text-[#c3c9d6]">
            Paste an ERC-20 from Ethereum mainnet. This reads the contract and says what its deployer can still do to
            the people holding it: freeze a wallet, raise the tax, switch selling off.
          </p>
        </div>
        <ConnectButton />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(input);
        }}
        className="mt-8 flex flex-col gap-2 sm:flex-row"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="0x..."
          spellCheck={false}
          aria-label="Token contract address"
          className="hash min-w-0 flex-1 rounded-lg border border-edge bg-panel px-3 py-2 font-mono text-sm outline-none focus:border-muted"
        />
        <button
          type="submit"
          disabled={!valid}
          className="rounded-lg border border-edge bg-panel px-4 py-2 text-sm font-medium hover:border-muted disabled:opacity-40"
        >
          Check
        </button>
      </form>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted">Try:</span>
        {EXAMPLES.map((e) => (
          <button
            key={e.address}
            onClick={() => submit(e.address)}
            title={e.note}
            className="rounded-md border border-edge px-2 py-1 text-xs hover:border-muted"
          >
            {e.label}
          </button>
        ))}
      </div>

      {token ? <TokenReport key={token} token={token} /> : null}

      <footer className="mt-16 border-t border-edge pt-6 text-sm text-muted">
        <p>
          Read-only. The page never asks for a signature and never builds a transaction. A wallet is optional and is
          used for one thing: checking whether <em>that</em> address is flagged by the token, and simulating a sell
          from it.
        </p>
        <p className="mt-3">
          It probes for function names, so a token that hides the same power behind a different name will read as
          clean. A green result here is one input to a decision, not an audit.{" "}
          <a
            className="underline underline-offset-2 hover:text-[#c3c9d6]"
            href="https://github.com/Vuduykhang2306/token-powers"
          >
            Source
          </a>{" "}
          &middot;{" "}
          <a
            className="underline underline-offset-2 hover:text-[#c3c9d6]"
            href="https://github.com/Vuduykhang2306/smart-contract-security-lab/tree/main/reviews/2026-09_FatTokenV5"
          >
            the review this came out of
          </a>
        </p>
      </footer>
    </main>
  );
}
