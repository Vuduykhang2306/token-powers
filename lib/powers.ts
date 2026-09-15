import { formatUnits, isAddressEqual, zeroAddress, type Address } from "viem";

/**
 * Turning raw reads into a verdict.
 *
 * The distinction this file is built around came out of reviewing a launchpad
 * token template: there are two different kinds of danger in these contracts and
 * people conflate them.
 *
 *  - An OWNER POWER is something a privileged address can choose to do later:
 *    raise the tax, freeze a holder, switch trading off. Renouncing ownership
 *    kills all of them permanently.
 *
 *  - A BAKED-IN MECHANISM runs on its own, on every transfer, with nobody
 *    calling anything. Renouncing ownership does not kill it. It makes it
 *    permanent, because the setter that could have switched it off is now
 *    unreachable too.
 *
 * "Ownership renounced" is read everywhere as a clean bill of health. For the
 * second kind it is the opposite.
 */

export type Verdict = "safe" | "warn" | "risk" | "unknown";

export type Power = {
  id: string;
  title: string;
  verdict: Verdict;
  /** One sentence, in terms of what it does to the person holding the token. */
  detail: string;
  /** The on-chain read this conclusion rests on, so it can be checked by hand. */
  evidence: string;
};

export type Probes = Record<string, unknown>;

const DEAD = "0x000000000000000000000000000000000000dEaD" as Address;

const has = (p: Probes, k: string) => p[k] !== undefined && p[k] !== null;
const bool = (p: Probes, k: string) => p[k] === true;
const big = (p: Probes, k: string) => (typeof p[k] === "bigint" ? (p[k] as bigint) : undefined);

export function ownerOf(p: Probes): { owner?: Address; renounced: boolean; present: boolean } {
  const raw = (p.owner ?? p.getOwner) as Address | undefined;
  if (!raw) return { renounced: false, present: false };
  const renounced = isAddressEqual(raw, zeroAddress) || isAddressEqual(raw, DEAD);
  return { owner: raw, renounced, present: true };
}

/** Which per-address flag function this token actually implements, if any. */
export function flagFunction(p: Probes): string | undefined {
  return ["isReward", "isBlacklisted", "_blackList", "isBlackListed", "blacklist", "_isBlacklisted"].find(
    (n) => has(p, n),
  );
}

function pct(v: bigint | undefined): string {
  if (v === undefined) return "?";
  // These templates store fees in basis points: 500 is 5%.
  return `${Number(v) / 100}%`;
}

export function analyse(p: Probes, decimals: number, totalSupply?: bigint): Power[] {
  const out: Power[] = [];
  const { owner, renounced, present } = ownerOf(p);

  // ---- 1. Who is in charge -------------------------------------------------
  if (!present) {
    out.push({
      id: "owner",
      title: "Ownership",
      verdict: "unknown",
      detail:
        "No owner() or getOwner(). Either there is genuinely no admin, or control sits behind a name this tool does not probe for. Read the source before assuming the former.",
      evidence: "owner() and getOwner() both revert",
    });
  } else if (renounced) {
    out.push({
      id: "owner",
      title: "Ownership renounced",
      verdict: "safe",
      detail:
        "Owner is the zero or dead address, so every owner-only function below is permanently unreachable. It does not switch off anything that runs by itself.",
      evidence: `owner() = ${owner}`,
    });
  } else {
    out.push({
      id: "owner",
      title: "Ownership is live",
      verdict: "risk",
      detail:
        "A single address still controls every owner-only function below. Whether that address is a person, a multisig or a timelock is not something this tool can tell you.",
      evidence: `owner() = ${owner}`,
    });
  }

  const ownerPower: Verdict = renounced ? "safe" : "risk";
  const ownerNote = renounced ? " Dead: ownership is renounced." : "";

  // ---- 2. Can somebody freeze your wallet ---------------------------------
  const flagFn = flagFunction(p);
  if (flagFn) {
    out.push({
      id: "freeze",
      title: "Per-wallet blocking exists",
      verdict: renounced ? "warn" : "risk",
      detail: renounced
        ? `The contract keeps a per-address flag (${flagFn}) and a flagged wallet cannot move its tokens. Nobody can add new entries now, but anyone already flagged is frozen for good - there is no one left to clear it.`
        : `The contract keeps a per-address flag (${flagFn}). The owner can set it on any wallet, and a flagged wallet cannot sell or even transfer.`,
      evidence: `${flagFn}(address) answers`,
    });
  }

  // ---- 3. Owner-only switches ---------------------------------------------
  if (has(p, "enableChangeTax")) {
    const on = bool(p, "enableChangeTax");
    out.push({
      id: "changeTax",
      title: "Tax can be changed after launch",
      verdict: on ? ownerPower : "safe",
      detail: on
        ? `The tax rates are not fixed. The owner can move them at any time, up to whatever ceiling the contract enforces.${ownerNote}`
        : "The deployer turned this off at construction and there is no function to turn it back on. Tax rates are fixed for the life of the contract.",
      evidence: `enableChangeTax() = ${on}`,
    });
  }

  if (has(p, "enableOffTrade")) {
    const on = bool(p, "enableOffTrade");
    out.push({
      id: "offTrade",
      title: "Trading can be switched off",
      verdict: on ? ownerPower : "safe",
      detail: on
        ? `Trading runs behind a switch the owner holds. Off means nobody sells.${ownerNote}`
        : "No trading switch was enabled at construction.",
      evidence: `enableOffTrade() = ${on}`,
    });
  }

  if (has(p, "enableWalletLimit") || has(p, "enableSwapLimit")) {
    const on = bool(p, "enableWalletLimit") || bool(p, "enableSwapLimit");
    const maxWallet = big(p, "maxWalletAmount");
    const maxBuy = big(p, "maxBuyAmount");
    const fmt = (v?: bigint) =>
      v === undefined || totalSupply === undefined || totalSupply === 0n
        ? "?"
        : `${formatUnits(v, decimals)} (${((Number(v) / Number(totalSupply)) * 100).toFixed(2)}% of supply)`;
    out.push({
      id: "limits",
      title: "Holding and buy limits",
      verdict: on ? (renounced ? "warn" : "risk") : "safe",
      detail: on
        ? `Limits are active. Max wallet ${fmt(maxWallet)}, max buy ${fmt(maxBuy)}. Set low enough, a limit stops transfers rather than merely capping them.${ownerNote}`
        : "No wallet or buy limits were enabled at construction.",
      evidence: `enableWalletLimit()/enableSwapLimit()`,
    });
  }

  // ---- 4. Mechanisms that run on their own --------------------------------
  if (has(p, "enableKillBlock")) {
    const on = bool(p, "enableKillBlock");
    const kb = big(p, "kb");
    out.push({
      id: "killBlock",
      title: "Kill block",
      verdict: on ? "risk" : "safe",
      detail: on
        ? `Every buyer inside the first ${kb ?? "?"} blocks after launch is flagged automatically and can never sell. This runs on its own; renouncing ownership does not stop it, it only removes the person who could have cleared the flags.`
        : "No kill-block window was enabled at construction.",
      evidence: `enableKillBlock() = ${on}, kb() = ${kb ?? "n/a"}`,
    });
  }

  if (has(p, "airdropEnable")) {
    const on = bool(p, "airdropEnable");
    const n = big(p, "airdropNumbs");
    out.push({
      id: "airdrop",
      title: "Airdrop loop on every transfer",
      verdict: on && (n ?? 0n) > 0n ? "warn" : "safe",
      detail:
        on && (n ?? 0n) > 0n
          ? `Each transfer sends ${n} dust transfers first and subtracts that from the amount, so any transfer smaller than ${n} wei reverts. Small, but it runs on every single trade and nobody can switch it off.`
          : "The airdrop loop is off.",
      evidence: `airdropEnable() = ${on}, airdropNumbs() = ${n ?? "n/a"}`,
    });
  }

  if (has(p, "transferFee")) {
    const fee = big(p, "transferFee");
    const on = (fee ?? 0n) > 0n;
    out.push({
      id: "transferFee",
      title: "Wallet-to-wallet transfers are taxed",
      verdict: on ? "warn" : "safe",
      detail: on
        ? `Sending tokens to a friend costs ${pct(fee)}, not only buying and selling.`
        : "Plain transfers between wallets are untaxed.",
      evidence: `transferFee() = ${fee ?? "n/a"}`,
    });
    if (has(p, "enableTransferFee") && bool(p, "enableTransferFee") !== on) {
      out.push({
        id: "flagDesync",
        title: "A public flag contradicts the fee it controls",
        verdict: "warn",
        detail: `enableTransferFee() reports ${bool(p, "enableTransferFee")} while transferFee() is ${fee}. One of them is lying, which usually means a setter writes the fee and forgets the flag. Do not trust the flag on this token.`,
        evidence: `enableTransferFee() = ${bool(p, "enableTransferFee")}, transferFee() = ${fee}`,
      });
    }
  }

  if (has(p, "paused")) {
    const on = bool(p, "paused");
    out.push({
      id: "paused",
      title: on ? "Token is paused right now" : "Pausable",
      verdict: on ? "risk" : ownerPower,
      detail: on
        ? "Transfers are currently blocked contract-wide."
        : `A pause function exists. Paused means nobody moves tokens.${ownerNote}`,
      evidence: `paused() = ${on}`,
    });
  }

  return out;
}

/** Current buy and sell tax, in basis points, if this token exposes them. */
export function fees(p: Probes): { buy?: bigint; sell?: bigint } {
  const sum = (keys: string[]) => {
    const parts = keys.map((k) => big(p, k)).filter((v): v is bigint => v !== undefined);
    return parts.length ? parts.reduce((a, b) => a + b, 0n) : undefined;
  };
  return {
    buy: sum(["_buyFundFee", "_buyLPFee", "_buyBurnFee"]),
    sell: sum(["_sellFundFee", "_sellLPFee", "_sellBurnFee"]),
  };
}

export const formatBps = pct;
