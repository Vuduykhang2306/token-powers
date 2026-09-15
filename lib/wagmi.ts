import { createConfig, http } from "wagmi";
import { mainnet } from "wagmi/chains";
import { injected } from "wagmi/connectors";

/**
 * Mainnet only, and read-only.
 *
 * The injected connector is the only one here on purpose: WalletConnect needs a
 * project id, which means a secret in a static site, and this page has no
 * reason to ask for one. It never requests a signature or builds a transaction.
 *
 * Batching matters more than it looks. The probe fires around forty `eth_call`s
 * per token and the sell simulation fires another thirty-odd, so without
 * batching a public RPC would rate-limit the page on the first search.
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
