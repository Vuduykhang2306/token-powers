"use client";

import { useAccount, useConnect, useDisconnect } from "wagmi";

const short = (a: string) => `${a.slice(0, 6)}...${a.slice(-4)}`;

export function ConnectButton() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();

  if (isConnected && address) {
    return (
      <button
        onClick={() => disconnect()}
        className="rounded-lg border border-edge bg-panel px-3 py-2 font-mono text-sm hover:border-muted"
        title="Disconnect"
      >
        {short(address)}
      </button>
    );
  }

  const injected = connectors[0];
  if (!injected) {
    return <span className="text-sm text-muted">No browser wallet detected</span>;
  }

  return (
    <button
      onClick={() => connect({ connector: injected })}
      disabled={isPending}
      className="rounded-lg border border-edge bg-panel px-3 py-2 text-sm font-medium hover:border-muted disabled:opacity-50"
    >
      {isPending ? "Connecting..." : "Connect wallet"}
    </button>
  );
}
