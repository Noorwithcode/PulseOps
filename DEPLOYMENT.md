# PulseOps free-tier deployment guide

This deployment profile runs the React frontend and Express API in one Koyeb web service and uses a TiDB Cloud Starter database. No custom domain is required.

## 1. Push the project to GitHub

Open the PulseOps folder in VS Code and run:

```powershell
git status
git add .
git commit -m "Prepare PulseOps for free-tier deployment"
git push
```

Confirm that `backend/.env`, `node_modules`, `dist`, logs, and database exports are not included in the commit.

## 2. Create the TiDB Cloud Starter database

1. Create a TiDB Cloud Starter instance.
2. Select a region near the Koyeb region you will use.
3. Set a strong database password and save it securely.
4. Open **Connect** and copy the host, port, username, password, and database name.
5. Use the public TLS endpoint. PulseOps enables certificate verification when `DB_SSL=true`.

TiDB Cloud Starter public connections allow internet access by default, so protect the database with a unique password, TLS, and a dedicated application user when available.

Official guides:

- https://docs.pingcap.com/tidbcloud/create-tidb-cluster-serverless/
- https://docs.pingcap.com/tidbcloud/connect-via-standard-connection-serverless/

## 3. Initialize the cloud schema from VS Code

Create or update `backend/.env` locally with the TiDB values:

```dotenv
NODE_ENV=development
PORT=5000
FRONTEND_URL=http://localhost:5173

DB_HOST=<tidb-host>
DB_PORT=4000
DB_USER=<tidb-user>
DB_PASSWORD=<tidb-password>
DB_NAME=<tidb-database>
DB_CONNECTION_LIMIT=5
DB_SSL=true

ADMIN_FULL_NAME=PulseOps Administrator
ADMIN_EMAIL=<your-private-admin-email>
ADMIN_PASSWORD=<your-strong-admin-password>

JWT_SECRET=<unique-random-secret-at-least-64-characters>
JWT_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_DAYS=7

HTTP_REQUEST_TIMEOUT_MS=30000
HTTP_HEADERS_TIMEOUT_MS=15000
HTTP_KEEP_ALIVE_TIMEOUT_MS=5000
SHUTDOWN_TIMEOUT_MS=10000
```

Generate a JWT secret locally if needed:

```powershell
node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
```

Then run:

```powershell
cd backend
npm ci
npm run db:auth
npm run db:refresh-tokens
npm run db:monitoring
npm run db:health-monitoring
npm run db:incidents
npm run db:alert-rules
npm run db:alert-rule-management
npm run db:notifications
npm run db:admin
npm test
cd ..
```

Do not commit `backend/.env`.

## 4. Create the Koyeb web service

1. In Koyeb, select **Create Web Service** and connect the GitHub repository.
2. Choose the branch containing the deployment files.
3. Select the repository-root `Dockerfile` builder.
4. Choose the **Free** instance in Frankfurt or Washington, D.C.
5. Expose port `8000` with HTTP routing on `/`.
6. Configure the HTTP health check as `/api/health` on port `8000`.
7. Add the environment variables below. Store passwords and JWT values as secrets.

```dotenv
NODE_ENV=production
PORT=8000
TRUST_PROXY=1

DB_HOST=<tidb-host>
DB_PORT=4000
DB_USER=<tidb-user>
DB_PASSWORD=<tidb-password>
DB_NAME=<tidb-database>
DB_CONNECTION_LIMIT=5
DB_SSL=true

JWT_SECRET=<same-format-unique-random-secret>
JWT_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_DAYS=7

HTTP_REQUEST_TIMEOUT_MS=30000
HTTP_HEADERS_TIMEOUT_MS=15000
HTTP_KEEP_ALIVE_TIMEOUT_MS=5000
SHUTDOWN_TIMEOUT_MS=10000
```

`FRONTEND_URL` is not required for this same-origin deployment. `VITE_API_URL` is compiled as `/api` by the Dockerfile.

Deploy the service and wait for both build and health checks to pass.

Official Koyeb guide:

- https://www.koyeb.com/docs/build-and-deploy/deploy-with-git

## 5. Verify the live deployment

Use the generated Koyeb URL:

1. Open `https://<your-app>.koyeb.app/api/health` and confirm a successful JSON response.
2. Open `https://<your-app>.koyeb.app/` and sign in.
3. Refresh a protected page to confirm refresh-cookie authentication.
4. Test ADMIN, RESPONDER, and VIEWER authorization.
5. Create and update a server, send a heartbeat, and confirm dashboard telemetry.
6. Test incident acknowledgement, assignment, resolution, alert rules, and notifications.
7. Open a nested route directly and refresh it to confirm the SPA fallback.
8. Check Koyeb logs for errors and confirm no secret values are printed.

## Free-tier limitation

Koyeb's free instance scales to zero after one hour without traffic. While it is asleep, the in-process monitoring scheduler does not run. The first request after sleep can take longer. This is suitable for a portfolio demonstration, not uninterrupted infrastructure monitoring.

Before sharing the public URL, keep the ADMIN account private, change any test-account passwords, and expose only a restricted VIEWER demo account if public login access is needed.
