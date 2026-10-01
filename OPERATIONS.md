# SPLIT production operations

The Render web service serves the frontend and API. The independent `split-reconciliation` cron job runs `npm run render:reconcile` every two minutes, calling authenticated production endpoints. It needs only `APP_BASE_URL` and `CRON_SECRET`; wallet secrets remain on the web service.

Reconciliation saves a completed-run heartbeat and scan continuation in Redis. Work resumes after a process restart, overlapping invocations return 409, and an RPC outage retains pending payments. Submitted participant records and their recovery entries commit in one Redis transaction. Health reports reconciliation as healthy only after a successful run within six minutes. Existing v1 payment record readers remain for compatibility with previously created links.

The web service sends operational alerts through Resend to `SPLIT_ALERT_EMAIL`, using its dedicated sending-only `SPLIT_ALERT_RESEND_API_KEY` and `SPLIT_ALERT_FROM` (existing invitation credentials can also be used as a fallback). Alerts contain only event, route, status, request ID, and time. Error bodies, request bodies, headers, signed links and credentials are excluded. Repeated incidents are suppressed for ten minutes. Failed alert deliveries release their suppression lock and are retried by scheduled monitoring. Storage outages use process-local suppression so alert delivery can still proceed.

No verified sending domain was present on the connected Resend account. The initial alert sender uses `onboarding@resend.dev`, restricted to the account owner's email. Switch to a verified sender before expanding recipients or enabling participant invitation email.

The cron process checks core health after reconciliation and exits nonzero on failure or timeout. Render's cron failure notifications provide an independent signal if the web process is unavailable. Confirm the owner's Render notification preferences receive failed-job notifications.

`POST /api/operations-monitor` accepts the cron credential. An empty body checks health; `{"test":true}` sends a monitoring test email; `{"statusOnly":true}` reads recent operational status. Never place the cron credential in a browser bundle, URL, repository, or screenshot.

`GET /healthz` is process liveness. `GET /api/health` checks RPC and storage readiness and includes the real reconciliation heartbeat. The liveness endpoint is suitable for Render's service health check, while the cron monitors feature readiness separately.

The current Render Key Value instance was found on the free plan with disk persistence disabled. Redis transactions protect concurrent writes but cannot survive a Redis instance losing its data. Enable disk persistence on a paid Key Value instance before relying on this store for production financial records.

## Frontend

Edit `frontend/components/` for the five page views, `frontend/styles/` for ordered feature styles, and `public/assets/js/` for page behaviors. `frontend/index.html` is the small shell. `npm run build` assembles `public/index.html` and optimizes `public/assets/site.css`. Generated output is committed because the existing Render build command is `npm install`.

Validate changes with `npm run build`, `npm run audit`, and `npm test`. Financial policy remains Creator 35%, Treasury 20%, Reserve 35%, Protocol 10%, with a $5 USDC-equivalent minimum first buy. Local tests use a Redis protocol fixture and simulated chain RPC; they do not submit financial transactions.
