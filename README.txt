SPLIT — v75 PRODUCTION POLISH

Production changes:
- Existing Render site stays in place; no new website or URL required.
- Group payments no longer fail just because transactional email is not configured.
- Manual participant payment links remain available when email is offline or unconfigured.
- Public health checks separate core payment/launch readiness from optional email delivery.
- Added an in-app guide explaining SPLIT Payments vs SPLIT Launch.
- Added live core-system status, offline feedback, accessible focus states and safer user-facing errors.
- Added stronger HTTP security headers and request IDs without changing wallet flows.
- Updated Trust, Terms and Privacy references from the old Netlify storage model to Render Key Value.
- Preserved fixed launch routing: Creator 35% / Treasury 20% / Reserve 35% / SPLIT Protocol 10%.
- Preserved the minimum $5 USDC-equivalent first buy.

SPLIT — v73 WALLET CONNECTION FIX

Wallet connection changes:
- Wallet chooser renders immediately instead of waiting for Wallet Standard CDN imports.
- Mobile external/in-app browsers get direct wallet-app actions for Phantom, Solflare and Backpack.
- Unsupported dead-end wallet buttons are hidden on mobile unless that wallet is actually injected.
- Deep links reopen the clean SPLIT launch URL and automatically resume the launch wallet chooser.
- Phantom/Solflare/Backpack in-app browser connections use their injected providers normally.
- Android still supports Solana Mobile Wallet Adapter when available.
- Added connection timeouts and useful errors instead of leaving users stuck.
- Added a Copy SPLIT link fallback for phones/in-app browsers that block universal wallet links.
- Desktop Wallet Standard and direct injected extension support remain intact.

SPLIT — v72 NETLIFY PRODUCTION HARDENING

Key launch changes:
- launchReady now checks the wallet-auth secret required by the hardened launch endpoints.
- Immutable creator-revenue split: Creator 35% / Treasury 20% / Reserve 35% / SPLIT Protocol 10%.
- Creator recipient is the connected launch wallet and cannot be changed client-side or by API input.
- Required minimum first buy: $5 USDC-equivalent, converted server-side to SOL and passed to
  Metaplex Genesis as firstBuyAmount.
- Launch wallet is checked for enough SOL before permanent media upload.
- Launchpad backend requires a signed wallet session for Irys uploads, create-launch and register-launch.
- Creator Dashboard now reports the creator's actual distributed share rather than gross routed revenue.
- Creator fee claiming is bounded for Netlify's synchronous function execution window.
- Netlify environment/storage wording corrected across the site and API messages.
- Fixed config readiness check for SPLIT_REVENUE_RESERVE_TREASURY.

SPLIT — v71 NETLIFY BACKEND MIGRATION

This is the Netlify-ready build of SPLIT.

Core migration:
- Vercel Functions -> Netlify Functions
- Vercel Blob -> Netlify Blobs
- Vercel waitUntil -> Netlify context.waitUntil
- Vercel cron -> Netlify Scheduled Function
- /api/* URLs preserved so the existing frontend does not need a route rewrite

Launchpad:
- Irys permanent media upload
- Metaplex Genesis bonding-curve Create Launch
- user-wallet signing and on-chain confirmation
- Metaplex Register Launch
- automatic SPLIT Tokens directory persistence
- creator-revenue routing metadata and claim flow
- server-side Solana RPC confirmation

See NETLIFY-SETUP.txt and .env.example before deployment.
