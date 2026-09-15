/**
 * Runs the app's own reading logic against Ethereum mainnet, with no browser.
 *
 * The point is that the analysis in `lib/` is testable on its own: it takes
 * contract reads in and produces verdicts out, so it can be checked against
 * tokens whose behaviour is already known rather than only eyeballed in the UI.
 *
 *   npm run verify
 */
import { createPublicClient, http, type Address } from "viem";
import { mainnet } from "viem/chains";
import { ADDRESS_PROBES, NULLARY_PROBES, erc20Abi, probeAbi } from "../lib/abi";
import { analyse, fees, flagFunction, ownerOf, type Probes } from "../lib/powers";
import { checkCanSell } from "../lib/simulate";

const client = createPublicClient({
  chain: mainnet,
  transport: http("https://ethereum-rpc.publicnode.com", { batch: { wait: 16 } }),
});

/** No wallet involved; the balance for the sell simulation is faked anyway. */
const WHO = "0x1111111111111111111111111111111111111111" as Address;

const TOKENS: { label: string; address: Address; expect: string }[] = [
  {
    label: "BabyGOAT",
    address: "0x26d86F942D514B470Ba5dF311027a870110F6699",
    expect: "ownership renounced, isReward flag present, airdrop loop permanently on",
  },
  {
    label: "USDC",
    address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    expect: "live owner, blacklist, pausable",
  },
  {
    label: "SHIB",
    address: "0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE",
    expect: "no admin surface these probes can find",
  },
];

async function report(label: string, address: Address, expect: string) {
  console.log(`\n=== ${label} ===`);
  console.log(`expected: ${expect}`);

  const names = [...NULLARY_PROBES, ...ADDRESS_PROBES];
  const data = await client.multicall({
    contracts: [
      { address, abi: erc20Abi, functionName: "name" },
      { address, abi: erc20Abi, functionName: "symbol" },
      { address, abi: erc20Abi, functionName: "decimals" },
      { address, abi: erc20Abi, functionName: "totalSupply" },
      ...NULLARY_PROBES.map((n) => ({ address, abi: probeAbi, functionName: n })),
      ...ADDRESS_PROBES.map((n) => ({ address, abi: probeAbi, functionName: n, args: [WHO] })),
    ] as never,
    allowFailure: true,
  });

  const probes: Probes = {};
  (data as readonly { status: string; result?: unknown }[]).slice(4).forEach((r, i) => {
    if (r.status === "success") probes[names[i]] = r.result;
  });

  const meta = data as readonly { status: string; result?: unknown }[];
  const decimals = meta[2].status === "success" ? Number(meta[2].result) : 18;
  const supply = meta[3].status === "success" ? (meta[3].result as bigint) : undefined;

  console.log(`${meta[0].result} (${meta[1].result}), ${decimals} decimals`);
  console.log(`probes answering: ${Object.keys(probes).length}/${names.length}`);
  console.log(`owner: ${JSON.stringify(ownerOf(probes))}`);
  console.log(`flag function: ${flagFunction(probes) ?? "none"}`);
  const f = fees(probes);
  console.log(`fees: buy=${f.buy ?? "n/a"} sell=${f.sell ?? "n/a"} (basis points)`);

  for (const p of analyse(probes, decimals, supply)) {
    console.log(`  [${p.verdict.toUpperCase().padEnd(7)}] ${p.title}`);
  }

  const pair = probes._mainPair as Address | undefined;
  if (!pair) {
    console.log("  no _mainPair(), skipping the sell simulation");
    return;
  }
  console.log(`  pair: ${pair}`);
  console.log(`  sell simulation: ${JSON.stringify(await checkCanSell(client, address, pair, WHO))}`);
}

async function main() {
  for (const t of TOKENS) {
    await report(t.label, t.address, t.expect);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
