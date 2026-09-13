# ArcSet

ArcSet is a self-custodial portfolio app built for Arc Testnet. It helps you turn an investment idea into a clear basket, review the route before anything moves, and execute it from your own Circle modular wallet.

Your assets stay in your wallet. ArcSet does not pool deposits, issue a receipt token, or take custody of funds.

This is testnet software. It is meant for experimentation and should not be treated as a production investment product.

## What you can do

- Create or sign in to a passkey-controlled Circle wallet
- Browse baskets built around yield, Bitcoin, currency exposure, and liquidity
- Review target weights, fresh quotes, fees, limits, and protocol details
- Swap assets through Circle App Kit with minimum-output protection
- Deposit USDC into a verified Morpho ERC-4626 vault through EarnKit
- Track wallet balances, vault positions, receipts, and allocation drift
- Bridge USDC between Arc Testnet and Base Sepolia through CCTP
- Add or remove a capped Uniswap V3 liquidity position on Base Sepolia
- Inspect Arc, Morpho, Uniswap, and subgraph health from the data dashboard

## Available baskets

| Basket | What it is designed for |
| --- | --- |
| Arc Dollar Yield | Morpho USDC yield with a liquid USDC reserve |
| Bitcoin Income | cirBTC exposure alongside Morpho income and liquid USDC |
| Global Reserve | Productive USDC, EURC diversification, and liquid USDC |
| Arc Balanced | A mix of cirBTC, Morpho USDC income, EURC, and liquid USDC |
| Cross-Chain Liquidity Preview | Arc Morpho plus a capped Base Sepolia Uniswap V3 position funded through CCTP |

A basket only appears in the public catalog when ArcSet can quote entry, read the resulting position, value it, protect execution, and provide an exit path. Mock vaults and announced-only integrations are kept out.

## How execution works

1. Choose a basket and enter an amount in USDC.
2. ArcSet fetches fresh quotes and checks the required adapters.
3. You review the complete plan, including expected outputs, fees, and limits.
4. One explicit confirmation starts the reviewed plan.
5. ArcSet submits the required wallet operations and shows progress as they settle.
6. Confirmed receipts are saved so completed steps are not repeated after a partial failure.

Arc uses USDC as its native gas token. The native and ERC-20 interfaces represent the same balance, so the app shows one USDC balance and uses the 6-decimal ERC-20 view for transfers and display.

## Run locally

You need Node.js and npm installed.

```bash
npm ci
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) after the development server starts.

### Configure the Circle wallet

Create a client key in Circle Console and bind its passkey domain to your local and production origins. Add the following values to `.env.local`:

```bash
NEXT_PUBLIC_CLIENT_KEY=your-circle-client-key
NEXT_PUBLIC_CLIENT_URL=https://modular-sdk.circle.com/v1/rpc/w3s/buidl
```

ArcSet uses public Arc Testnet and Base Sepolia RPC endpoints by default. No private key should ever be placed in the repository.

## Useful commands

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

To check the live testnet integrations without controlling a browser:

```bash
npm run test:live
```

The live smoke test checks Arc health, Morpho, Base Sepolia Uniswap, and subgraph readiness. Set `ARC_TEST_TRANSACTION_HASH` if you also want to test receipt reconciliation.

## The Graph

The subgraph lives in [`graph/arc-yield`](graph/arc-yield). It follows the core Messari Yield Aggregator v1.3.1 entities and indexes the ERC-4626 deposit and withdrawal flow used by the Arc yield vault.

```bash
npm run graph:install
npm run graph:codegen
npm run graph:build
```

ArcSet does not pretend that a live subgraph exists when it has not been deployed. After deploying through Subgraph Studio, provide the endpoint through server-side environment configuration.

## Safety notes

- Circle passkeys stay on the user's device.
- The session cookie stores only the public credential descriptor and is HTTP-only.
- Sponsored user operations use Circle Gas Station where supported.
- Every route is reviewed before submission.
- Minimum outputs protect swaps from excessive price movement.
- Cross-chain progress is recorded one stage at a time so successful transactions are not silently repeated.
- The repository must never contain private keys, recovery phrases, or server API keys.

For a deeper look at the architecture and execution model, run the app and open `/docs`.
