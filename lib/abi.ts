// Probe ABI, not a real interface.
//
// No token has all of these functions. The idea is to call every entry on an
// unknown address and see which ones answer. If a function answers, the
// deployer wrote that power into the contract. If it reverts, this token
// doesn't have it.
//
// The flag names come from the launchpad template I reviewed in
// smart-contract-security-lab/reviews/2026-09_FatTokenV5. More than one token
// uses that template, so it makes sense to probe for its names directly.

export const erc20Abi = [
  { name: "name", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { name: "symbol", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { name: "decimals", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { name: "totalSupply", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "transfer",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
] as const;

/** `decimals()` that returns uint256 instead of uint8 (finding T-08 in the review). */
export const decimalsUint256Abi = [
  { name: "decimals", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
] as const;

const bool = (name: string) =>
  ({ name, type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "bool" }] }) as const;

const uint = (name: string) =>
  ({ name, type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] }) as const;

const addr = (name: string) =>
  ({ name, type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] }) as const;

const boolOfAddress = (name: string) =>
  ({
    name,
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "bool" }],
  }) as const;

const uintOfAddress = (name: string) =>
  ({
    name,
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  }) as const;

export const probeAbi = [
  addr("owner"),
  addr("getOwner"),
  addr("_mainPair"),

  bool("enableKillBlock"),
  bool("enableRewardList"),
  bool("enableChangeTax"),
  bool("enableOffTrade"),
  bool("enableSwapLimit"),
  bool("enableWalletLimit"),
  bool("enableTransferFee"),
  bool("airdropEnable"),
  bool("paused"),
  bool("tradingOpen"),
  bool("tradingActive"),

  uint("kb"),
  uint("airdropNumbs"),
  uint("transferFee"),
  uint("_buyFundFee"),
  uint("_buyLPFee"),
  uint("_buyBurnFee"),
  uint("_sellFundFee"),
  uint("_sellLPFee"),
  uint("_sellBurnFee"),
  uint("maxWalletAmount"),
  uint("maxBuyAmount"),

  // Per-address flags. Different tokens use different names for these, so we
  // probe all of them and use whichever one answers.
  uintOfAddress("isReward"),
  boolOfAddress("isBlacklisted"),
  boolOfAddress("_blackList"),
  boolOfAddress("isBlackListed"),
  boolOfAddress("blacklist"),
  boolOfAddress("_isBlacklisted"),
  boolOfAddress("isExcludedFromFee"),
] as const;

/** Names of every zero-argument probe, in the order the multicall sends them. */
export const NULLARY_PROBES = probeAbi
  .filter((f) => f.inputs.length === 0)
  .map((f) => f.name);

/** Names of every probe that takes a single address. */
export const ADDRESS_PROBES = probeAbi
  .filter((f) => f.inputs.length === 1)
  .map((f) => f.name);
