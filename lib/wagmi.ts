import { createConfig, http } from "wagmi";
import { mainnet } from "wagmi/chains";
import { injected } from "wagmi/connectors";

/**
 * Mainnet only, and read-only.
 *
 * Only the injected connector is used, on purpose: WalletConnect needs a
 * project id, which would mean putting a secret in a static site, and this
 * page has no reason to ask for one. It never asks for a signature or builds a
 * transaction.
 *
 * Batching matters here. The probe sends around forty `eth_call`s per token
 * and the sell simulation another thirty or so, so without batching a public
 * RPC would rate-limit the page on the first search.
 */
export const config = createConfig({
  chains: [mainnet],
  connectors: [injected()],
  transports: {
    [mainnet.id]: http("https://ethereum-rpc.publicnode.com", {
      batch: { wait: 16 },
    }),
  },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}
