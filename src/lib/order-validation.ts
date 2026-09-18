export type OrderDraft = {
  quoteTimestamp: number;
  side: "BUY" | "SELL";
  tif: "IOC" | "GTC";
  quantity: number;
  price: number;
  limitPrice: string;
  minNotional: number;
  priceDecimals: number;
  leverage: number;
  maxLeverage: number;
  takeProfit: string;
  stopLoss: string;
};
export function validateOrder(d: OrderDraft): string | null {
  if (
    !Number.isFinite(d.quoteTimestamp) ||
    Date.now() - d.quoteTimestamp > 90_000
  )
    return "Market data is delayed. Wait for a fresh quote before placing an order.";
  if (
    d.tif === "GTC" &&
    (!/^\d+(\.\d+)?$/.test(d.limitPrice) || Number(d.limitPrice) <= 0)
  )
    return "Enter a positive limit price.";
  if (!Number.isFinite(d.price) || d.price <= 0)
    return "A valid market price is required. Wait for data to refresh.";
  if (
    d.tif === "GTC" &&
    (d.limitPrice.split(".")[1]?.length ?? 0) > d.priceDecimals
  )
    return `Limit price supports up to ${d.priceDecimals} decimal places.`;
  if (!Number.isFinite(d.quantity) || d.quantity <= 0)
    return "Enter a size at or above this market’s quantity step.";
  if (
    !Number.isFinite(d.quantity * d.price) ||
    d.quantity * d.price + 1e-9 < d.minNotional
  )
    return `Order value must be at least $${d.minNotional}.`;
  if (
    !Number.isInteger(d.leverage) ||
    d.leverage < 1 ||
    d.leverage > d.maxLeverage
  )
    return "Choose leverage within this market’s limit.";
  for (const [label, value] of [
    ["Take profit", d.takeProfit],
    ["Stop loss", d.stopLoss],
  ]) {
    if (
      value &&
      (!/^\d+(\.\d+)?$/.test(value) ||
        !Number.isFinite(Number(value)) ||
        Number(value) <= 0)
    )
      return `${label} must be a positive price.`;
    if (value && (value.split(".")[1]?.length ?? 0) > d.priceDecimals)
      return `${label} supports up to ${d.priceDecimals} decimal places.`;
  }
  const long = d.side === "BUY";
  if (
    d.takeProfit &&
    (long ? Number(d.takeProfit) <= d.price : Number(d.takeProfit) >= d.price)
  )
    return `Take profit must be ${long ? "above" : "below"} the entry price.`;
  if (
    d.stopLoss &&
    (long ? Number(d.stopLoss) >= d.price : Number(d.stopLoss) <= d.price)
  )
    return `Stop loss must be ${long ? "below" : "above"} the entry price.`;
  return null;
}
