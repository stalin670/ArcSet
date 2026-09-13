const baseUrl = (process.env.ARC_SET_URL ?? "http://localhost:3000").replace(/\/$/, "");
const transactionHash = process.env.ARC_TEST_TRANSACTION_HASH;

async function check(path, validate) {
  const response = await fetch(`${baseUrl}${path}`, { headers: { Accept: "application/json" } });
  const payload = await response.json();
  if (!response.ok) throw new Error(`${path} returned ${response.status}: ${payload.error ?? "unknown error"}`);
  validate(payload);
  process.stdout.write(`PASS ${path}\n`);
}

await check("/api/health/arc", (payload) => {
  if (payload.status !== "ok" || payload.chainId !== 5042002 || payload.morpho?.status !== "ready") {
    throw new Error("Arc health response failed validation.");
  }
});

await check("/api/protocols/morpho", (payload) => {
  if (payload.protocol !== "Morpho" || payload.health?.morpho?.assetAddress?.toLowerCase() !== "0x3600000000000000000000000000000000000000") {
    throw new Error("Morpho protocol response failed validation.");
  }
});

await check("/api/protocols/uniswap-base", (payload) => {
  if (payload.status !== "ready" || payload.chainId !== 84532 || payload.token0?.toLowerCase() !== "0x036cbd53842c5426634e7929541ec2318f3dcf7e" || payload.fee !== 3000) {
    throw new Error("Base Uniswap protocol response failed validation.");
  }
});

await check("/api/graph/vault-metrics", (payload) => {
  if (typeof payload.configured !== "boolean") throw new Error("Graph readiness response failed validation.");
});

if (transactionHash) {
  await check(`/api/executions/${transactionHash}`, (payload) => {
    if (!["pending", "confirmed", "reverted"].includes(payload.status)) throw new Error("Execution response failed validation.");
  });
}
