// ZEC/USD for the receipt. Looked up live at every checkout.

export async function zecPrice(): Promise<number | null> {
  try {
    const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=zcash&vs_currencies=usd');
    const j = await r.json();
    return j?.zcash?.usd ?? null;
  } catch { return null; }
}
