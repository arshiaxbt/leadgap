export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startIngestLoop } = await import("./lib/store");
  startIngestLoop();
}
