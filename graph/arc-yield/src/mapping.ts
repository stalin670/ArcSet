import { Address, BigDecimal, BigInt, ethereum } from "@graphprotocol/graph-ts";
import { Deposit as DepositEvent, ERC4626, Withdraw as WithdrawEvent } from "../generated/MorphoArcUsdcVault/ERC4626";
import {
  Account,
  ActiveAccount,
  Deposit,
  FinancialsDailySnapshot,
  Token,
  UsageMetricsDailySnapshot,
  UsageMetricsHourlySnapshot,
  Vault,
  VaultDailySnapshot,
  VaultHourlySnapshot,
  Withdraw,
  YieldAggregator,
} from "../generated/schema";

const XYLO_VAULT_ID = "0x240eb85458cd41361bd8c3773253a1d78054f747";
const USDC_ID = "0x3600000000000000000000000000000000000000";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ZERO_BI = BigInt.zero();
const ZERO_BD = BigDecimal.zero();
const USDC_SCALE = BigDecimal.fromString("1000000");
const SHARE_SCALE = BigDecimal.fromString("1000000000000000000");
const SECONDS_PER_DAY = 86400;
const SECONDS_PER_HOUR = 3600;

function tokenAmount(amount: BigInt, scale: BigDecimal): BigDecimal {
  return amount.toBigDecimal().div(scale);
}

function eventId(event: ethereum.Event): string {
  return event.transaction.hash.toHexString() + "-" + event.logIndex.toString();
}

function isXyloVault(address: Address): boolean {
  return address.toHexString() == XYLO_VAULT_ID;
}

function protocolId(address: Address): string {
  return isXyloVault(address) ? "xylonet-arc-testnet" : "morpho-arc-testnet";
}

function getOrCreateProtocol(address: Address): YieldAggregator {
  const id = protocolId(address);
  let protocol = YieldAggregator.load(id);
  if (protocol) return protocol;
  protocol = new YieldAggregator(id);
  protocol.name = isXyloVault(address) ? "XyloNet Vaults on Arc" : "Morpho EarnKit Vaults on Arc";
  protocol.slug = isXyloVault(address) ? "xylonet-arc" : "morpho-earnkit-arc";
  protocol.schemaVersion = "1.3.1";
  protocol.subgraphVersion = "0.3.0";
  protocol.methodologyVersion = "1.0.0";
  protocol.network = "ARC_TESTNET";
  protocol.type = "YIELD";
  protocol.totalValueLockedUSD = ZERO_BD;
  protocol.protocolControlledValueUSD = ZERO_BD;
  protocol.cumulativeSupplySideRevenueUSD = ZERO_BD;
  protocol.cumulativeProtocolSideRevenueUSD = ZERO_BD;
  protocol.cumulativeTotalRevenueUSD = ZERO_BD;
  protocol.cumulativeUniqueUsers = 0;
  protocol.totalPoolCount = 1;
  protocol.save();
  return protocol;
}

function getOrCreateToken(id: string, name: string, symbol: string, decimals: i32): Token {
  let token = Token.load(id);
  if (token) return token;
  token = new Token(id);
  token.name = name;
  token.symbol = symbol;
  token.decimals = decimals;
  token.lastPriceUSD = BigDecimal.fromString("1");
  token.save();
  return token;
}

function getOrCreateVault(event: ethereum.Event): Vault {
  const id = event.address.toHexString();
  let vault = Vault.load(id);
  if (vault) return vault;
  const protocol = getOrCreateProtocol(event.address);
  const xylo = isXyloVault(event.address);
  getOrCreateToken(USDC_ID, "USD Coin", "USDC", 6);
  getOrCreateToken(id, xylo ? "XyloNet USDC Vault Share" : "EarnKit USDC Vault Share", xylo ? "xyUSDC" : "evUSDC", 18);
  vault = new Vault(id);
  vault.protocol = protocol.id;
  vault.name = xylo ? "XyloNet USDC Vault" : "EarnKit USDC Vault (Arc Testnet)";
  vault.symbol = xylo ? "xyUSDC" : "evUSDC";
  vault.inputToken = USDC_ID;
  vault.outputToken = id;
  vault.depositLimit = ZERO_BI;
  vault.createdTimestamp = event.block.timestamp;
  vault.createdBlockNumber = event.block.number;
  vault.totalValueLockedUSD = ZERO_BD;
  vault.cumulativeSupplySideRevenueUSD = ZERO_BD;
  vault.cumulativeProtocolSideRevenueUSD = ZERO_BD;
  vault.cumulativeTotalRevenueUSD = ZERO_BD;
  vault.inputTokenBalance = ZERO_BI;
  vault.outputTokenSupply = ZERO_BI;
  vault.outputTokenPriceUSD = BigDecimal.fromString("1");
  vault.pricePerShare = BigDecimal.fromString("1");
  if (xylo) {
    vault.strategyActive = false;
    vault.strategyAddress = ZERO_ADDRESS;
  }
  vault.eligibility = xylo ? "REJECTED" : "ELIGIBLE";
  vault.eligibilityReason = xylo
    ? "Rejected: the vault exposes a zero strategy address, so assets are not deployed into an active yield strategy."
    : "Eligible: active Arc USDC vault discovered and screened through Circle EarnKit.";
  vault.save();
  return vault;
}

function updateVaultState(event: ethereum.Event, vault: Vault, protocol: YieldAggregator): void {
  const contract = ERC4626.bind(event.address);
  const assetsCall = contract.try_totalAssets();
  const supplyCall = contract.try_totalSupply();
  if (!assetsCall.reverted) vault.inputTokenBalance = assetsCall.value;
  if (!supplyCall.reverted) vault.outputTokenSupply = supplyCall.value;
  if (isXyloVault(event.address)) {
    const strategyCall = contract.try_strategy();
    if (!strategyCall.reverted) {
      const strategy = strategyCall.value.toHexString();
      vault.strategyAddress = strategy;
      vault.strategyActive = strategy != ZERO_ADDRESS;
      vault.eligibility = strategy == ZERO_ADDRESS ? "REJECTED" : "EXPERIMENTAL";
      vault.eligibilityReason = strategy == ZERO_ADDRESS
        ? "Rejected: the vault exposes a zero strategy address, so assets are not deployed into an active yield strategy."
        : "Experimental: a strategy is configured, but the integration is not approved for investment execution.";
    }
  }
  vault.totalValueLockedUSD = tokenAmount(vault.inputTokenBalance, USDC_SCALE);
  if (vault.outputTokenSupply && vault.outputTokenSupply!.gt(ZERO_BI)) {
    vault.pricePerShare = tokenAmount(vault.inputTokenBalance, USDC_SCALE)
      .div(tokenAmount(vault.outputTokenSupply!, SHARE_SCALE));
    vault.outputTokenPriceUSD = vault.pricePerShare;
  }
  vault.save();
  protocol.totalValueLockedUSD = vault.totalValueLockedUSD;
  protocol.save();
}

function recordAccount(address: Address, protocol: YieldAggregator, event: ethereum.Event): void {
  const accountId = address.toHexString();
  if (!Account.load(accountId)) {
    new Account(accountId).save();
  }
  const cumulativeId = "cumulative-" + protocol.id + "-" + accountId;
  if (!ActiveAccount.load(cumulativeId)) {
    new ActiveAccount(cumulativeId).save();
    protocol.cumulativeUniqueUsers += 1;
  }
  const day = event.block.timestamp.toI64() / SECONDS_PER_DAY;
  const hour = event.block.timestamp.toI64() / SECONDS_PER_HOUR;
  const dailyId = "daily-" + protocol.id + "-" + accountId + "-" + day.toString();
  const hourlyId = "hourly-" + protocol.id + "-" + accountId + "-" + hour.toString();
  const daily = usageDaily(event, protocol);
  const hourly = usageHourly(event, protocol);
  if (!ActiveAccount.load(dailyId)) {
    new ActiveAccount(dailyId).save();
    daily.dailyActiveUsers += 1;
  }
  if (!ActiveAccount.load(hourlyId)) {
    new ActiveAccount(hourlyId).save();
    hourly.hourlyActiveUsers += 1;
  }
  protocol.save();
  daily.cumulativeUniqueUsers = protocol.cumulativeUniqueUsers;
  hourly.cumulativeUniqueUsers = protocol.cumulativeUniqueUsers;
  daily.save();
  hourly.save();
}

function usageDaily(event: ethereum.Event, protocol: YieldAggregator): UsageMetricsDailySnapshot {
  const day = event.block.timestamp.toI64() / SECONDS_PER_DAY;
  const id = protocol.id + "-" + day.toString();
  let snapshot = UsageMetricsDailySnapshot.load(id);
  if (snapshot) return snapshot;
  snapshot = new UsageMetricsDailySnapshot(id);
  snapshot.protocol = protocol.id;
  snapshot.dailyActiveUsers = 0;
  snapshot.cumulativeUniqueUsers = protocol.cumulativeUniqueUsers;
  snapshot.dailyTransactionCount = 0;
  snapshot.dailyDepositCount = 0;
  snapshot.dailyWithdrawCount = 0;
  snapshot.totalPoolCount = protocol.totalPoolCount;
  snapshot.blockNumber = event.block.number;
  snapshot.timestamp = event.block.timestamp;
  return snapshot;
}

function usageHourly(event: ethereum.Event, protocol: YieldAggregator): UsageMetricsHourlySnapshot {
  const hour = event.block.timestamp.toI64() / SECONDS_PER_HOUR;
  const id = protocol.id + "-" + hour.toString();
  let snapshot = UsageMetricsHourlySnapshot.load(id);
  if (snapshot) return snapshot;
  snapshot = new UsageMetricsHourlySnapshot(id);
  snapshot.protocol = protocol.id;
  snapshot.hourlyActiveUsers = 0;
  snapshot.cumulativeUniqueUsers = protocol.cumulativeUniqueUsers;
  snapshot.hourlyTransactionCount = 0;
  snapshot.hourlyDepositCount = 0;
  snapshot.hourlyWithdrawCount = 0;
  snapshot.blockNumber = event.block.number;
  snapshot.timestamp = event.block.timestamp;
  return snapshot;
}

function updateSnapshots(event: ethereum.Event, protocol: YieldAggregator, vault: Vault): void {
  const daily = usageDaily(event, protocol);
  const hourly = usageHourly(event, protocol);
  daily.dailyTransactionCount += 1;
  hourly.hourlyTransactionCount += 1;
  daily.blockNumber = event.block.number;
  daily.timestamp = event.block.timestamp;
  hourly.blockNumber = event.block.number;
  hourly.timestamp = event.block.timestamp;
  daily.save();
  hourly.save();

  const day = event.block.timestamp.toI64() / SECONDS_PER_DAY;
  const hour = event.block.timestamp.toI64() / SECONDS_PER_HOUR;
  let financial = FinancialsDailySnapshot.load(protocol.id + "-" + day.toString());
  if (!financial) financial = new FinancialsDailySnapshot(protocol.id + "-" + day.toString());
  financial.protocol = protocol.id;
  financial.totalValueLockedUSD = protocol.totalValueLockedUSD;
  financial.protocolControlledValueUSD = ZERO_BD;
  financial.dailySupplySideRevenueUSD = ZERO_BD;
  financial.cumulativeSupplySideRevenueUSD = protocol.cumulativeSupplySideRevenueUSD;
  financial.dailyProtocolSideRevenueUSD = ZERO_BD;
  financial.cumulativeProtocolSideRevenueUSD = protocol.cumulativeProtocolSideRevenueUSD;
  financial.dailyTotalRevenueUSD = ZERO_BD;
  financial.cumulativeTotalRevenueUSD = protocol.cumulativeTotalRevenueUSD;
  financial.blockNumber = event.block.number;
  financial.timestamp = event.block.timestamp;
  financial.save();

  let vaultDaily = VaultDailySnapshot.load(vault.id + "-" + day.toString());
  if (!vaultDaily) vaultDaily = new VaultDailySnapshot(vault.id + "-" + day.toString());
  vaultDaily.protocol = protocol.id;
  vaultDaily.vault = vault.id;
  vaultDaily.totalValueLockedUSD = vault.totalValueLockedUSD;
  vaultDaily.cumulativeSupplySideRevenueUSD = vault.cumulativeSupplySideRevenueUSD;
  vaultDaily.dailySupplySideRevenueUSD = ZERO_BD;
  vaultDaily.cumulativeProtocolSideRevenueUSD = vault.cumulativeProtocolSideRevenueUSD;
  vaultDaily.dailyProtocolSideRevenueUSD = ZERO_BD;
  vaultDaily.cumulativeTotalRevenueUSD = vault.cumulativeTotalRevenueUSD;
  vaultDaily.dailyTotalRevenueUSD = ZERO_BD;
  vaultDaily.inputTokenBalance = vault.inputTokenBalance;
  vaultDaily.outputTokenSupply = vault.outputTokenSupply === null ? ZERO_BI : vault.outputTokenSupply!;
  vaultDaily.outputTokenPriceUSD = vault.outputTokenPriceUSD;
  vaultDaily.pricePerShare = vault.pricePerShare;
  vaultDaily.blockNumber = event.block.number;
  vaultDaily.timestamp = event.block.timestamp;
  vaultDaily.save();

  let vaultHourly = VaultHourlySnapshot.load(vault.id + "-" + hour.toString());
  if (!vaultHourly) vaultHourly = new VaultHourlySnapshot(vault.id + "-" + hour.toString());
  vaultHourly.protocol = protocol.id;
  vaultHourly.vault = vault.id;
  vaultHourly.totalValueLockedUSD = vault.totalValueLockedUSD;
  vaultHourly.cumulativeSupplySideRevenueUSD = vault.cumulativeSupplySideRevenueUSD;
  vaultHourly.hourlySupplySideRevenueUSD = ZERO_BD;
  vaultHourly.cumulativeProtocolSideRevenueUSD = vault.cumulativeProtocolSideRevenueUSD;
  vaultHourly.hourlyProtocolSideRevenueUSD = ZERO_BD;
  vaultHourly.cumulativeTotalRevenueUSD = vault.cumulativeTotalRevenueUSD;
  vaultHourly.hourlyTotalRevenueUSD = ZERO_BD;
  vaultHourly.inputTokenBalance = vault.inputTokenBalance;
  vaultHourly.outputTokenSupply = vault.outputTokenSupply === null ? ZERO_BI : vault.outputTokenSupply!;
  vaultHourly.outputTokenPriceUSD = vault.outputTokenPriceUSD;
  vaultHourly.pricePerShare = vault.pricePerShare;
  vaultHourly.blockNumber = event.block.number;
  vaultHourly.timestamp = event.block.timestamp;
  vaultHourly.save();
}

export function handleDeposit(event: DepositEvent): void {
  const protocol = getOrCreateProtocol(event.address);
  const vault = getOrCreateVault(event);
  recordAccount(event.params.owner, protocol, event);
  const deposit = new Deposit(eventId(event));
  deposit.hash = event.transaction.hash.toHexString();
  deposit.logIndex = event.logIndex.toI32();
  deposit.protocol = protocol.id;
  deposit.to = event.address.toHexString();
  deposit.from = event.params.sender.toHexString();
  deposit.blockNumber = event.block.number;
  deposit.timestamp = event.block.timestamp;
  deposit.asset = USDC_ID;
  deposit.amount = event.params.assets;
  deposit.amountUSD = tokenAmount(event.params.assets, USDC_SCALE);
  deposit.shares = event.params.shares;
  deposit.account = event.params.owner.toHexString();
  deposit.vault = vault.id;
  deposit.save();
  updateVaultState(event, vault, protocol);
  const daily = usageDaily(event, protocol);
  const hourly = usageHourly(event, protocol);
  daily.dailyDepositCount += 1;
  hourly.hourlyDepositCount += 1;
  daily.save();
  hourly.save();
  updateSnapshots(event, protocol, vault);
}

export function handleWithdraw(event: WithdrawEvent): void {
  const protocol = getOrCreateProtocol(event.address);
  const vault = getOrCreateVault(event);
  recordAccount(event.params.owner, protocol, event);
  const withdraw = new Withdraw(eventId(event));
  withdraw.hash = event.transaction.hash.toHexString();
  withdraw.logIndex = event.logIndex.toI32();
  withdraw.protocol = protocol.id;
  withdraw.to = event.params.receiver.toHexString();
  withdraw.from = event.address.toHexString();
  withdraw.blockNumber = event.block.number;
  withdraw.timestamp = event.block.timestamp;
  withdraw.asset = USDC_ID;
  withdraw.amount = event.params.assets;
  withdraw.amountUSD = tokenAmount(event.params.assets, USDC_SCALE);
  withdraw.shares = event.params.shares;
  withdraw.account = event.params.owner.toHexString();
  withdraw.vault = vault.id;
  withdraw.save();
  updateVaultState(event, vault, protocol);
  const daily = usageDaily(event, protocol);
  const hourly = usageHourly(event, protocol);
  daily.dailyWithdrawCount += 1;
  hourly.hourlyWithdrawCount += 1;
  daily.save();
  hourly.save();
  updateSnapshots(event, protocol, vault);
}
