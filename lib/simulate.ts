import {
  decodeFunctionResult,
  encodeAbiParameters,
  encodeFunctionData,
  keccak256,
  pad,
  parseAbiParameters,
  parseEther,
  toHex,
  type Address,
  type PublicClient,
} from "viem";
import { erc20Abi } from "./abi";

/**
 * Can this wallet actually sell?
 *
 * Reading flags tells you what powers exist. It does not tell you whether a
 * sell goes through right now, because the block can come from somewhere the
 * flags do not mention. So this asks the chain directly, using `eth_call` with
 * a state override: give the wallet a balance that it does not really have,
 * then try the transfer and see whether the EVM reverts. Nothing is signed and
 * nothing is broadcast - the override exists only inside that one call.
 *
 * This is the same thing the fork proofs of concept in my audit repo do, minus
 * Foundry. There the harness calls `deal()` to fake a balance; here the RPC
 * does it.
 *
 * Two honest limits:
 *
 *  - The sell is simulated at the token level, as a transfer straight to the
 *    pair, which is what the router's `transferFrom` ends up doing. It does not
 *    price the swap, so it proves the transfer is allowed, not that the trade
 *    is worth making.
 *  - Finding the balance slot is a guess-and-check over the first 32 storage
 *    slots. Tokens that store balances somewhere unusual, behind a proxy, or in
 *    a packed struct will not be found, and the answer is "could not determine"
 *    rather than a wrong reassurance.
 */

/** Distinctive enough that matching it back is not a coincidence. */
const FAKE_BALANCE = 123_456_789n * 10n ** 18n;
const SLOTS_TO_TRY = 32;

function mappingSlot(holder: Address, slot: number) {
  // Solidity puts mapping(address => uint) entries at keccak256(key . slot).
  return keccak256(encodeAbiParameters(parseAbiParameters("address, uint256"), [holder, BigInt(slot)]));
}

const fakeValue = pad(toHex(FAKE_BALANCE), { size: 32 });

export type SellCheck =
  | { status: "sellable"; slot: number }
  | { status: "blocked"; slot: number; reason: string }
  | { status: "unknown"; reason: string };

async function balanceUnderOverride(
  client: PublicClient,
  token: Address,
  holder: Address,
  slot: number,
): Promise<bigint | undefined> {
  try {
    const { data } = await client.call({
      to: token,
      data: encodeFunctionData({ abi: erc20Abi, functionName: "balanceOf", args: [holder] }),
      stateOverride: [{ address: token, stateDiff: [{ slot: mappingSlot(holder, slot), value: fakeValue }] }],
    });
    if (!data) return undefined;
    return decodeFunctionResult({ abi: erc20Abi, functionName: "balanceOf", data }) as bigint;
  } catch {
    return undefined;
  }
}

/** Which storage slot holds `balanceOf`, found by overriding each candidate and reading back. */
export async function findBalanceSlot(
  client: PublicClient,
  token: Address,
  holder: Address,
): Promise<number | undefined> {
  const slots = Array.from({ length: SLOTS_TO_TRY }, (_, i) => i);
  // The transport batches these, so this is a handful of requests, not 32.
  const results = await Promise.all(slots.map((s) => balanceUnderOverride(client, token, holder, s)));
  const hit = results.findIndex((v) => v === FAKE_BALANCE);
  return hit === -1 ? undefined : hit;
}

function revertReason(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err);
  const custom = text.match(/reverted with (?:the following reason|custom error):?\s*\n?(.+)/i);
  if (custom) return custom[1].trim().split("\n")[0];
  const short = text.match(/execution reverted:?\s*([^\n]*)/i);
  if (short?.[1]?.trim()) return short[1].trim();
  return "the transfer reverted, with no reason string";
}

export async function checkCanSell(
  client: PublicClient,
  token: Address,
  pair: Address,
  holder: Address,
): Promise<SellCheck> {
  let slot: number | undefined;
  try {
    slot = await findBalanceSlot(client, token, holder);
  } catch (err) {
    return { status: "unknown", reason: `the node refused the state override (${revertReason(err)})` };
  }
  if (slot === undefined) {
    return {
      status: "unknown",
      reason: "could not locate the balance slot in the first 32 storage slots",
    };
  }

  // Sell a thousandth of the faked balance: large enough to clear any dust
  // guard, small enough to stay under a max-transaction cap.
  const amount = FAKE_BALANCE / 1000n;
  try {
    await client.call({
      account: holder,
      to: token,
      data: encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [pair, amount] }),
      stateOverride: [
        { address: token, stateDiff: [{ slot: mappingSlot(holder, slot), value: fakeValue }] },
        { address: holder, balance: parseEther("1") },
      ],
    });
    return { status: "sellable", slot };
  } catch (err) {
    return { status: "blocked", slot, reason: revertReason(err) };
  }
}
