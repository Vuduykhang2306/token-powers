"use client";

import { useMemo, useState } from "react";
import { formatUnits, type Address, type ContractFunctionParameters } from "viem";
import { useAccount, usePublicClient, useReadContracts } from "wagmi";
import { decimalsUint256Abi, erc20Abi, ADDRESS_PROBES, NULLARY_PROBES, probeAbi } from "@/lib/abi";
import { analyse, fees, flagFunction, formatBps, ownerOf, type Probes } from "@/lib/powers";
import { checkCanSell, type SellCheck } from "@/lib/simulate";
import { PowerCard } from "./PowerCard";

/** Placeholder holder address, used when no wallet is connected. */
const PROBE_ADDRESS = "0x1111111111111111111111111111111111111111" as Address;

type Props = { token: Address };

export function TokenReport({ token }: Props) {
  const { address: connected } = useAccount();
  const client = usePublicClient();
  const who = (connected ?? PROBE_ADDRESS) as Address;

  // Built at runtime from the probe list, so it's typed as a plain array of
  // call parameters instead of the exact tuple wagmi infers from inline code.
  const contracts = useMemo<ContractFunctionParameters[]>(
    () => [
      { address: token, abi: erc20Abi, functionName: "name" },
      { address: token, abi: erc20Abi, functionName: "symbol" },
      { address: token, abi: erc20Abi, functionName: "decimals" },
      { address: token, abi: erc20Abi, functionName: "totalSupply" },
      { address: token, abi: erc20Abi, functionName: "balanceOf", args: [who] },
      ...NULLARY_PROBES.map((n) => ({ address: token, abi: probeAbi, functionName: n })),
      ...ADDRESS_PROBES.map((n) => ({ address: token, abi: probeAbi, functionName: n, args: [who] })),
    ],
    [token, who],
  );

  // allowFailure is what makes this work: most of these functions don't exist
  // on a given token, so here a revert is an answer and not an error.
  const { data, isLoading, isError } = useReadContracts({
    contracts,
    allowFailure: true,
    query: { enabled: Boolean(token) },
  });

  // T-08 in the review: some tokens return uint256 from decimals() instead of
  // uint8. The normal read fails to decode, so we try a second time.
  const decimalsFallback = useReadContracts({
    contracts: [
      { address: token, abi: decimalsUint256Abi, functionName: "decimals" },
    ] as ContractFunctionParameters[],
    allowFailure: true,
    query: { enabled: Boolean(data && data[2]?.status === "failure") },
  });

  const [sell, setSell] = useState<SellCheck | null>(null);
  const [sellBusy, setSellBusy] = useState(false);

  const probes = useMemo<Probes | null>(() => {
    if (!data) return null;
    const out: Probes = {};
    const names = [...NULLARY_PROBES, ...ADDRESS_PROBES];
    data.slice(5).forEach((r, i) => {
      if (r.status === "success") out[names[i]] = r.result;
    });
    return out;
  }, [data]);

  if (isLoading) return <p className="mt-8 text-sm text-muted">Reading the contract...</p>;
  if (isError || !data || !probes) {
    return <p className="mt-8 text-sm text-risk">Could not read that address. Is it a contract on mainnet?</p>;
  }

  const name = data[0].status === "success" ? (data[0].result as string) : undefined;
  const symbol = data[1].status === "success" ? (data[1].result as string) : undefined;
  const weirdDecimals = data[2].status === "failure";
  const decimals = !weirdDecimals
    ? Number(data[2].result)
    : decimalsFallback.data?.[0]?.status === "success"
      ? Number(decimalsFallback.data[0].result as bigint)
      : 18;
  const totalSupply = data[3].status === "success" ? (data[3].result as bigint) : undefined;
  const balance = data[4].status === "success" ? (data[4].result as bigint) : undefined;

  if (!name && !symbol && totalSupply === undefined) {
    return (
      <p className="mt-8 text-sm text-risk">
        Nothing at that address answers as an ERC-20. Check the address and the network.
      </p>
    );
  }

  const powers = analyse(probes, decimals, totalSupply);
  const { buy, sell: sellFee } = fees(probes);
  const pair = probes._mainPair as Address | undefined;
  const flagFn = flagFunction(probes);
  const flagged = flagFn ? probes[flagFn] : undefined;
  const isFlagged = flagged === true || (typeof flagged === "bigint" && flagged > 0n);
  const { renounced } = ownerOf(probes);

  async function runSellCheck() {
    if (!client || !pair) return;
    setSellBusy(true);
    try {
      setSell(await checkCanSell(client, token, pair, who));
    } finally {
      setSellBusy(false);
    }
  }

  return (
    <div className="mt-8 space-y-6">
      <header className="rounded-lg border border-edge bg-panel p-4">
        <h2 className="text-xl font-semibold">
          {name ?? "Unnamed"} {symbol ? <span className="text-muted">({symbol})</span> : null}
        </h2>
        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-muted">Total supply</dt>
            <dd className="font-mono">{totalSupply !== undefined ? formatUnits(totalSupply, decimals) : "?"}</dd>
          </div>
          <div>
            <dt className="text-muted">Decimals</dt>
            <dd className="font-mono">
              {decimals}
              {weirdDecimals ? <span className="text-warn"> (returned as uint256)</span> : null}
            </dd>
          </div>
          <div>
            <dt className="text-muted">Buy tax</dt>
            <dd className="font-mono">{buy !== undefined ? formatBps(buy) : "n/a"}</dd>
          </div>
          <div>
            <dt className="text-muted">Sell tax</dt>
            <dd className="font-mono">{sellFee !== undefined ? formatBps(sellFee) : "n/a"}</dd>
          </div>
        </dl>
      </header>

      {connected ? (
        <section className="rounded-lg border border-edge bg-panel p-4">
          <h3 className="font-semibold">Your wallet</h3>
          <p className="mt-1 text-sm text-[#c3c9d6]">
            Holding{" "}
            <span className="font-mono">
              {balance !== undefined ? formatUnits(balance, decimals) : "?"} {symbol ?? ""}
            </span>
            .{" "}
            {flagFn ? (
              isFlagged ? (
                <span className="text-risk">
                  This token has you flagged through {flagFn}. Flagged wallets cannot move their tokens
                  {renounced ? ", and with ownership renounced there is nobody left to clear it." : "."}
                </span>
              ) : (
                <span className="text-safe">Not flagged by {flagFn} as of this block.</span>
              )
            ) : (
              <span className="text-muted">This token has no per-address flag for this tool to check.</span>
            )}
          </p>

          {pair ? (
            <div className="mt-3">
              <button
                onClick={runSellCheck}
                disabled={sellBusy}
                className="rounded-lg border border-edge px-3 py-2 text-sm hover:border-muted disabled:opacity-50"
              >
                {sellBusy ? "Simulating..." : "Simulate a sell from this wallet"}
              </button>
              <p className="mt-2 text-xs text-muted">
                Runs one <span className="font-mono">eth_call</span> with a faked balance. Nothing is signed, nothing
                is broadcast, no tokens are needed.
              </p>
              {sell ? (
                <p className="mt-2 text-sm">
                  {sell.status === "sellable" ? (
                    <span className="text-safe">
                      The transfer to the pair goes through. Found the balance at storage slot {sell.slot}.
                    </span>
                  ) : sell.status === "blocked" ? (
                    <span className="text-risk">Blocked: {sell.reason}</span>
                  ) : (
                    <span className="text-muted">Could not determine: {sell.reason}</span>
                  )}
                </p>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : (
        <p className="text-sm text-muted">
          Connect a wallet to check whether this token has your address flagged, and to simulate a sell from it.
        </p>
      )}

      <section className="space-y-3">
        <h3 className="text-lg font-semibold">What the deployer can do to you</h3>
        {powers.length ? (
          powers.map((p) => <PowerCard key={p.id} power={p} />)
        ) : (
          <p className="text-sm text-muted">
            None of the probed functions answered. Either this is a plain ERC-20 with no admin surface, or it uses
            names this tool does not know. Read the source before concluding the first.
          </p>
        )}
      </section>
    </div>
  );
}
