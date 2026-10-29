import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { defineChain } from "viem";
export const hashkey = defineChain({
  id: 133,
  name: "HashKey Testnet",
  nativeCurrency: { name: "HSK", symbol: "HSK", decimals: 18 },
  rpcUrls: { default: { http: ["https://testnet.hsk.xyz"] } },
});
export const walletConfig = createConfig({
  chains: [hashkey],
  connectors: [injected()],
  transports: { 133: http() },
});
