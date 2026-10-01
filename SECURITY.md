# Security

Do not commit wallet private keys, seed phrases, API keys, router payer secrets, or production environment variables to this repository. Configure secrets only in the deployment provider's encrypted environment-variable settings.

Financial write protection checks actual datastore persistence, rather than accepting a reachable in-memory store as durable. New live payment creation and mainnet token launch preparation require verified append-only persistence. Existing payment tracking continues while the storage upgrade is pending.

The unmaintained native `bigint-buffer` package is replaced by the small, bounded JavaScript implementation in `vendor/safe-bigint-buffer`. Tests cover unsigned 64-bit limits, byte order, overflows and real SPL-token transfer encoding. Express, WebSocket and JSON-RPC dependencies have been updated, and CSV parsing uses the patched version. The dependency scan currently has no high, moderate or critical findings.

The remaining low severity elliptic advisory is inherited through Irys's bundled Ethereum/Arweave signing dependencies. SPLIT uses the Solana uploader, and does not expose those signing APIs. It remains an upstream dependency finding; this project has not received an independent security audit. Do not suppress it or claim the dependency tree is free of advisories.

Revenue distributions use a lease and a private journal of signed transaction bytes before broadcasting. Retries resume the same signature, and confirmed history is indexed by signature. Expired transactions with no confirmed receipt require review rather than an automatic replacement payment.
