export const PUSD_TOKEN = "0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB" as const;
export const PUSD_DECIMALS = 6;
export const MIN_PERPS_DEPOSIT = 10;

const UNIT = BigInt(10) ** BigInt(PUSD_DECIMALS);
const MIN_UNITS = BigInt(MIN_PERPS_DEPOSIT) * UNIT;

export const ERC20_BALANCE_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

export function parsePusd(input: string): bigint {
  const trimmed = input.trim();
  if (!/^\d+(\.\d{1,6})?$/.test(trimmed)) {
    throw new Error("Enter a pUSD amount with up to 6 decimals.");
  }
  const [whole, frac = ""] = trimmed.split(".");
  return BigInt(whole) * UNIT + BigInt(frac.padEnd(PUSD_DECIMALS, "0"));
}

export function formatPusd(units: bigint): string {
  const neg = units < BigInt(0);
  const abs = neg ? -units : units;
  const whole = abs / UNIT;
  const frac = (abs % UNIT).toString().padStart(PUSD_DECIMALS, "0").replace(/0+$/, "");
  const body = frac ? `${whole}.${frac}` : whole.toString();
  return neg ? `-${body}` : body;
}

export function assertMinPusd(units: bigint, action: "deposit" | "withdraw") {
  if (units < MIN_UNITS) {
    throw new Error(`Minimum Perps ${action} is ${MIN_PERPS_DEPOSIT} pUSD.`);
  }
}
