# ArcSet

ArcSet executes wallet-approved baskets on Arc Testnet and tracks the resulting holdings. Cross-chain liquidity baskets also hold a Base Sepolia liquidity position.

## Language

**Basket**: A versioned investment strategy that allocates USDC among specified assets, yield, and a liquid reserve.

**Basket leg**: One allocation within a basket, either a protocol action or USDC retained in the wallet.

**Basket execution**: One attempt to carry out a reviewed basket plan, including its completed and unfinished legs.

**Position record**: Attribution of wallet holdings to a basket execution, backed by transaction receipts. It is not custody of the assets or an independent proof of their current value.

**Cross-chain route**: The ordered actions that establish Base liquidity from Arc USDC, or remove that liquidity and return its proceeds to Arc.

**Route progress**: The recorded outcomes and unfinished stages of one cross-chain route, used to resume without repeating completed actions.

**Pending execution**: A submitted transaction whose final receipt has not yet been established. Submission alone does not mean completion.
