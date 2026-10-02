# SPLIT production operations

The Render web service serves the frontend and API, and starts an automatic recovery/monitoring loop at startup and every two minutes. A separate GitHub Actions workflow checks production every five minutes, waking the free Render instance if necessary, and verifies the real completed-run heartbeat. It carries no secrets. GitHub scheduled runs can be delayed; this is a fallback for an account without Render billing, not a strict timing guarantee.

Native Render cron creation was rejected because the account has no payment method. After enabling billing, create `split-reconciliation` on the same repository/branch, with schedule `*/2 * * * *`, build command `node --check scripts/reconcile-render.mjs`, and start command `node scripts/reconcile-render.mjs`. It needs only `APP_BASE_URL` and `CRON_SECRET`; wallet secrets remain on the web service. The shared lease prevents overlap with the built-in recovery loop.

Reconciliation saves a completed-run heartbeat and scan continuation in Redis. Work resumes after a process restart, overlapping invocations return 409, and an RPC outage retains pending payments. Submitted participant records and their recovery entries commit in one Redis transaction. Health reports reconciliation as healthy only after a successful run within six minutes. Existing v1 payment record readers remain for compatibility with previously created links.

The web service sends operational alerts through Resend to `SPLIT_ALERT_EMAIL`, using its dedicated sending-only `SPLIT_ALERT_RESEND_API_KEY` and `SPLIT_ALERT_FROM` (existing invitation credentials can also be used as a fallback). Alerts contain only event, route, status, request ID, and time. Error bodies, request bodies, headers, signed links and credentials are excluded. Repeated incidents are suppressed for ten minutes. Failed alert deliveries release their suppression lock and are retried by scheduled monitoring. Storage outages use process-local suppression so alert delivery can still proceed.

No verified sending domain was present on the connected Resend account. The initial alert sender uses `onboarding@resend.dev`, restricted to the account owner's email. Switch to a verified sender before expanding recipients or enabling participant invitation email.

The external workflow fails if the web service cannot be reached or feature/recovery checks fail. GitHub Actions failure notifications provide an independent signal if the web process is unavailable. Confirm the owner's GitHub notification preferences receive failed-workflow notifications. A future native Render cron also exits nonzero on failure or timeout.

`POST /api/operations-monitor` accepts the cron credential. An empty body checks health; `{"test":true}` sends a monitoring test email; `{"statusOnly":true}` reads recent operational status. Never place the cron credential in a browser bundle, URL, repository, or screenshot.

`GET /healthz` is process liveness. `GET /api/health` checks RPC and storage readiness and includes the real reconciliation heartbeat. The liveness endpoint is suitable for Render's service health check, while the cron monitors feature readiness separately.

The current Render Key Value instance was found on the free plan with disk persistence disabled. Redis transactions protect concurrent writes but cannot survive a Redis instance losing its data. Enable disk persistence on a paid Key Value instance before relying on this store for production financial records.

## Frontend

Edit `frontend/components/` for the five page views, `frontend/styles/` for ordered feature styles, and `public/assets/js/` for page behaviors. `frontend/index.html` is the small shell. `npm run build` assembles `public/index.html` and optimizes `public/assets/site.css`. Generated output is committed for inspection, and `prestart` rebuilds it automatically before serving the site.

Validate changes with `npm run build`, `npm run audit`, and `npm test`. Financial policy remains Creator 35%, Treasury 20%, Reserve 35%, Protocol 10%, with a $5 USDC-equivalent minimum first buy. Local tests use a Redis protocol fixture and simulated chain RPC; they do not submit financial transactions.

## Readiness and live payments

`storageReady` means the store responds. `storageDurable` verifies `INFO persistence` reports append-only persistence with successful writes and no loading state. `paymentCreationReady` requires that durability check. The current free instance therefore remains available for reading and recovering existing requests, while new live payment creation is paused. The form remains available to preview and configure.

The launchpad stays explicitly on Solana devnet. Test tokens have no monetary value. Mainnet launch preparation and creator fee claims require durable storage; do not switch to mainnet until a funded-wallet launch, registration, claim, routing and interruption recovery have been verified. RPC/configuration readiness does not prove this financial flow.

Invitation email is optional. Link sharing is the default and requires participant names, not email addresses. Email mode requires credentials plus `SPLIT_EMAIL_DOMAIN_VERIFIED=true`, which must only be set after the sending domain is actually verified in Resend. Webhook configuration enables delivery tracking but does not block link sharing. Use the existing owner-only operational alert sender until a domain is verified.

Participant payment references are saved locally immediately after the wallet returns them, before the tracking request. A failed save keeps the existing reference visible and blocks a second wallet transfer. Returning to the link retries that reference; a keepalive request also attempts to finish tracking during navigation. The payment page offers manual recovery from wallet history. Automatic server reconciliation starts after the reference reaches storage. If a wallet broadcasts but closes before returning its reference, recover it from wallet history; no browser API can guarantee receiving that response after the page exits.

## Safe storage migration

Do not upgrade the current free instance in place: Render discards its data during an upgrade. Create a separate paid Key Value instance in Virginia with persistence enabled and `noeviction`, and keep the original instance until the switch is verified.

1. Set `SPLIT_STORAGE_MAINTENANCE=true` on the web service and deploy. This pauses API writes and scheduled reconciliation. The website and public directory remain available.
2. Run `scripts/migrate-storage.mjs` on Render's private network, with `SOURCE_REDIS_URL` and `TARGET_REDIS_URL` held in secure runtime variables. First run `node scripts/migrate-storage.mjs --copy --source-paused`, then `node scripts/migrate-storage.mjs --verify --source-paused`. Both report counts, never records or connection secrets. Any mismatch stops the migration without overwriting the destination.
3. Set the web service's `REDIS_URL` to the new internal connection URL, and remove the maintenance flag. Deploy and verify `/api/config` has `storageDurable: true` and `paymentCreationReady: true`, and that existing requests, transaction indices, creator history and reconciliation entries remain accessible.
4. Configure the Render service health check as `/healthz`. For always-on recovery, move the web service to a paid instance and configure the native two-minute reconciliation cron described above.

The service now builds the frontend in `prestart`; edits no longer depend on remembering to refresh generated files manually. Node 24 is the supported runtime. The validation workflow runs the build, source checks, backend tests and desktop/mobile browser flows on every push and PR.

## Interrupted token launches

Launch preparation now saves a private `launch-pending/` record before returning
unsigned transactions to the browser. The internal two-minute scheduler checks
for the existing Genesis account, retries provider registration, and removes the
recovery record only after both directory and creator indexing succeed. It never
signs or broadcasts a launch transaction. Migration copies this recovery queue.

The browser saves preparation and each returned signature before confirmation.
Retry uses those signatures and the same launch rather than requesting another
mint. If a wallet approval was interrupted before its response reached the page,
repeated broadcasting is blocked; check wallet history and the creator dashboard.
Wallet Standard array outputs are supported when reading transaction signatures.

Production activation remains blocked by the actual free Key Value instance
(`persistenceMode: off`) and free web service. The prepared target is a NEW
Virginia Key Value instance with plan `256mb`, `noeviction`, and
`journal_snapshot`, plus an always-on web service (`0.5c-512mb`). Obtain recurring
budget authorization before provisioning these resources. Keep the source KV
intact, pause writes, copy and verify, switch REDIS_URL, then confirm durability.
Only then set SOLANA_NETWORK=solana-mainnet with a matching mainnet RPC. Verify
permanent media upload funding and the router payer's mainnet balance, and perform
wallet-approved launch, registration, split payment, interrupted response, and
revenue routing tests before announcing that the complete mainnet flow passed.
