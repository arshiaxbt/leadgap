import { createConfig } from "@privy-io/wagmi";
import { http } from "viem";
import { polygon } from "viem/chains";

export const walletConfig = createConfig({
  chains: [polygon],
  transports: {
    [polygon.id]: http(),
  },
});
