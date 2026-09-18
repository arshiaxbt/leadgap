import type { PerpsSession } from "@polymarket/client";
import { BUILDER_CODE } from "./builder";
import { validateOrder, type OrderDraft } from "./order-validation";

/** Validate again at the execution boundary, then apply leverage before placing. */
export async function submitPerpOrder(
  session: Pick<PerpsSession, "updateLeverage" | "placeOrder">,
  draft: OrderDraft & {
    instrumentId: number;
    quantityText: string;
    reduceOnly: boolean;
    isolatedOnly: boolean;
  },
) {
  const invalid = validateOrder(draft);
  if (invalid) throw new Error(invalid);
  const { OrderSide, PerpsTimeInForce } = await import("@polymarket/client");
  if (!draft.reduceOnly)
    await session.updateLeverage({
      instrumentId: draft.instrumentId,
      leverage: draft.leverage,
      crossMargin: !draft.isolatedOnly,
    });
  const revalidated = validateOrder(draft);
  if (revalidated) throw new Error(revalidated);
  const common = {
    instrumentId: draft.instrumentId,
    side: draft.side === "BUY" ? OrderSide.BUY : OrderSide.SELL,
    quantity: draft.quantityText,
    reduceOnly: draft.reduceOnly,
    builderCode: BUILDER_CODE,
  };
  const request =
    draft.tif === "GTC"
      ? ({
          ...common,
          timeInForce: PerpsTimeInForce.GTC,
          price: draft.limitPrice,
        } as const)
      : ({ ...common, timeInForce: PerpsTimeInForce.IOC } as const);
  return draft.takeProfit
    ? session.placeOrder({
        ...request,
        takeProfit: { triggerPrice: draft.takeProfit },
        ...(draft.stopLoss
          ? { stopLoss: { triggerPrice: draft.stopLoss } }
          : {}),
      })
    : draft.stopLoss
      ? session.placeOrder({
          ...request,
          stopLoss: { triggerPrice: draft.stopLoss },
        })
      : session.placeOrder(request);
}
