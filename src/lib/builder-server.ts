export function builderApiCreds() {
  const key = process.env.POLYMARKET_BUILDER_API_KEY?.trim();
  const secret = process.env.POLYMARKET_BUILDER_SECRET?.trim();
  const passphrase = process.env.POLYMARKET_BUILDER_PASSPHRASE?.trim();
  if (!key || !secret || !passphrase) return null;
  return { key, secret, passphrase };
}
