PulseOps

Server Monitoring & Incident Response Dashboard

PulseOps is a full-stack operations platform for monitoring server health, evaluating alert rules, managing incidents, and notifying response teams. It combines a React operations dashboard with a Node.js/Express API and a concurrency-safe MySQL data layer.

The project demonstrates production-minded engineering practices including database transactions, row-level locking, optimistic concurrency control, idempotent operations, automatic incident creation and recovery, refresh-token rotation, role-based access control, audit timelines, and UTC-safe timestamps.

Project status

Local frontend and backend integration: complete

Server, alert, incident, and notification workflows: complete

Responsive operations dashboard: complete

Automated workflow scripts: available

Production deployment and live-demo verification: pending

Features

Operations dashboard

Live infrastructure overview

Managed, operational, degraded, and offline server counts

Active alert and incident summaries

CPU, memory, disk, and response-time telemetry

Recent incidents and infrastructure attention panels

Automatic polling with loading, error, and empty states

Server management

Register, view, search, filter, update, and soft-delete servers

Restore deleted servers

Update operational status

Environment and location tracking

Configurable heartbeat intervals

Optimistic locking through resource versions

Health monitoring

Authenticated heartbeat ingestion

ONLINE, DEGRADED, OFFLINE, and UNKNOWN states

CPU, memory, disk, latency, and uptime metrics

Duplicate heartbeat protection

Stale heartbeat detection

Missed-heartbeat scheduler

Automatic offline detection and recovery

UTC-based reported and received timestamps

Alert rules and alerts

Global and server-specific alert rules

CPU, memory, disk, and response-time thresholds

Configurable breach and recovery thresholds

Consecutive breach/recovery requirements

Enable, disable, update, and soft-delete rules

NORMAL, BREACHING, ALERTING, and RECOVERING state machine

Alert evaluation history

Automatic alert-to-incident integration

Incident response

Automatic and manual incidents

Search, filtering, pagination, and detail views

Incident acknowledgement

Assignment and unassignment

Severity changes

Resolution, closure, and reopening

Investigation comments

Append-only incident timeline

Occurrence tracking for repeated failures

Idempotent manual incident creation

Optimistic conflict detection

Notifications

User-specific notification inbox

Unread counts

Mark one or all notifications as read

Notification details and soft deletion

Events for incidents, alerts, server failures, and recovery

Authentication and authorization

JWT access tokens

HTTP-only refresh-token cookie

Refresh-token rotation and reuse detection

Password-change and role-change session invalidation

Account lockout controls

Protected frontend routes

Automatic access-token refresh and failed-request retry

ADMIN, RESPONDER, and VIEWER application roles

Technology stack

Layer

Technologies

Frontend

React 19, React Router, Vite 8, CSS

Backend

Node.js, Express 5

Database

MySQL 8, mysql2

Authentication

JWT, bcryptjs, HTTP-only refresh cookies

Security

Helmet, CORS allowlist, rate limiting, environment validation

Scheduling

node-cron

Testing

Node.js test runner and integration workflow scripts

Architecture

flowchart TD
    UI[React operations dashboard] --> API[Express REST API]
    API --> SEC[Authentication and RBAC]
    API --> SVC[Business services]
    SVC --> REPO[Repository layer]
    REPO --> DB[(MySQL 8)]
    SVC --> JOB[Monitoring scheduler]
    JOB --> DB

Monitoring lifecycle

stateDiagram-v2
    [*] --> Online
    Online --> Offline: heartbeat missed
    Offline --> IncidentOpen: create incident
    IncidentOpen --> IncidentUpdated: repeated failure
    IncidentUpdated --> Resolved: healthy heartbeat
    IncidentOpen --> Resolved: healthy heartbeat
    Resolved --> [*]

Backend layering

routes/ defines HTTP endpoints and access policies.

controllers/ translates HTTP input and output.

services/ contains validation, transactions, and business rules.

repositories/ contains SQL and locking operations.

jobs/ runs scheduled missed-heartbeat checks.

scripts/ creates schemas and executes regression flows.

test/ contains automated unit tests.

Repository structure

backend/ — Express API, database scripts, monitoring engine, and tests

frontend/ — React dashboard, pages, API clients, and authentication context

README.md — project documentation

.gitignore — repository-wide ignore rules

Prerequisites

Node.js 20.19.0 or newer compatible version

npm

MySQL 8

Git

Vite 8 requires Node.js ^20.19.0 or >=22.12.0.

Local setup

1. Clone the repository

git clone <your-repository-url>
cd PulseOps

2. Configure the backend

cd backend
npm ci

Create .env from .env.example.

PowerShell:

Copy-Item .env.example .env

Bash:

cp .env.example .env

Update the database credentials, administrator credentials, JWT secret, and frontend origin before continuing.

Example development configuration:

NODE_ENV=development
PORT=5000
FRONTEND_URL=http://localhost:5173
TRUST_PROXY=

DB_HOST=localhost
DB_PORT=3306
DB_USER=pulseops_app
DB_PASSWORD=replace_with_database_password
DB_NAME=pulseops
DB_CONNECTION_LIMIT=10

ADMIN_FULL_NAME=PulseOps Administrator
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=replace_with_a_strong_password

JWT_SECRET=replace_with_a_unique_random_secret_of_at_least_64_characters
JWT_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_DAYS=7

HTTP_REQUEST_TIMEOUT_MS=30000
HTTP_HEADERS_TIMEOUT_MS=15000
HTTP_KEEP_ALIVE_TIMEOUT_MS=5000
SHUTDOWN_TIMEOUT_MS=10000

Never commit the real .env file.

3. Initialize the database

Run the schema scripts from backend/:

npm run db:auth
npm run db:refresh-tokens
npm run db:monitoring
npm run db:health-monitoring
npm run db:incidents
npm run db:alert-rules
npm run db:alert-rule-management
npm run db:notifications
npm run db:admin

4. Start the backend

npm run dev

Local API:

http://localhost:5000/api

Startup must confirm that the MySQL session timezone is +00:00.

5. Configure and start the frontend

Open another terminal:

cd frontend
npm ci

Create frontend/.env:

VITE_API_URL=http://localhost:5000/api

Start the dashboard:

npm run dev

Local dashboard:

http://localhost:5173

Available commands

Backend

Command

Purpose

npm run dev

Start the API with Nodemon

npm start

Start the API with Node.js

npm test

Run Node.js unit tests

npm run db:auth

Create authentication tables and default roles

npm run db:refresh-tokens

Create refresh-token tables

npm run db:monitoring

Create server-monitoring tables

npm run db:health-monitoring

Create health-monitoring tables

npm run db:incidents

Create incident tables

npm run db:alert-rules

Create alert-rule tables and defaults

npm run db:alert-rule-management

Upgrade alert-rule management schema

npm run db:notifications

Create notification tables

npm run db:admin

Create the initial administrator

npm run test:incident-flow

Test automatic incident lifecycle

npm run test:missed-heartbeat

Test missed-heartbeat processing

npm run test:alert-rules

Test alert-rule evaluation

npm run test:threshold-incidents

Test threshold incident integration

npm run test:alert-rule-management

Test alert-rule management

Frontend

Command

Purpose

npm run dev

Start the Vite development server

npm run build

Create a production build

npm run preview

Preview the production build locally

API overview

Base path:

/api

All protected endpoints require:

Authorization: Bearer <access-token>

Authentication

Method

Endpoint

Access

POST

/auth/login

Public

POST

/auth/refresh

Refresh cookie

POST

/auth/logout

Refresh cookie

GET

/auth/me

Authenticated

Servers and heartbeats

Method

Endpoint

Access

GET

/servers

Authenticated

GET

/servers/:serverId

Authenticated

POST

/servers

ADMIN / MANAGER*

PATCH

/servers/:serverId

ADMIN / MANAGER*

PATCH

/servers/:serverId/status

ADMIN / MANAGER*

DELETE

/servers/:serverId

ADMIN

PATCH

/servers/:serverId/restore

ADMIN

POST

/servers/:serverId/heartbeat

ADMIN / MANAGER*

Incidents

Method

Endpoint

Access

GET

/incidents

Authenticated

GET

/incidents/:id

Authenticated

GET

/incidents/:id/timeline

Authenticated

POST

/incidents

ADMIN / RESPONDER

PATCH

/incidents/:id/acknowledge

ADMIN / RESPONDER

PATCH

/incidents/:id/assign

ADMIN / RESPONDER

PATCH

/incidents/:id/unassign

ADMIN / RESPONDER

PATCH

/incidents/:id/severity

ADMIN / RESPONDER

PATCH

/incidents/:id/resolve

ADMIN / RESPONDER

PATCH

/incidents/:id/close

ADMIN / RESPONDER

PATCH

/incidents/:id/reopen

ADMIN / RESPONDER

POST

/incidents/:id/comments

ADMIN / RESPONDER

Manual incident creation requires an Idempotency-Key header.

Alert rules

Method

Endpoint

Access

GET

/alert-rules

ADMIN

POST

/alert-rules

ADMIN

GET

/alert-rules/:id

ADMIN

PATCH

/alert-rules/:id

ADMIN

DELETE

/alert-rules/:id

ADMIN

PATCH

/alert-rules/:id/status

ADMIN

GET

/alert-rules/:id/states

ADMIN

Alerts

Method

Endpoint

Access

GET

/alerts

Authenticated

GET

/alerts/summary

Authenticated

GET

/alerts/:id

Authenticated

GET

/alerts/:id/evaluations

Authenticated

Notifications

Method

Endpoint

Access

GET

/notifications

Authenticated user

GET

/notifications/unread-count

Authenticated user

PATCH

/notifications/read-all

Authenticated user

GET

/notifications/:id

Notification owner

PATCH

/notifications/:id/read

Notification owner

DELETE

/notifications/:id

Notification owner

Dashboard and health

Method

Endpoint

Access

GET

/dashboard/overview

Authenticated

GET

/health

Public

GET

/database

Public/local health check

Example heartbeat

POST /api/servers/1/heartbeat
Authorization: Bearer <access-token>
Content-Type: application/json

{
  "checkKey": "WEB-PROD-01-HB-001",
  "checkType": "HEARTBEAT",
  "status": "ONLINE",
  "reportedAt": "2026-08-17T10:00:00.000Z",
  "responseTimeMs": 42,
  "cpuUsagePercent": 34.5,
  "memoryUsagePercent": 61.2,
  "diskUsagePercent": 48.7,
  "uptimeSeconds": 86400,
  "message": "Server heartbeat received"
}

Example manual incident

POST /api/incidents
Authorization: Bearer <access-token>
Content-Type: application/json
Idempotency-Key: manual-incident-001

{
  "serverId": 1,
  "incidentType": "MANUAL",
  "title": "Production API latency investigation",
  "description": "Operations reported unusually high API response time.",
  "severity": "HIGH",
  "assignedTo": 1
}

Concurrency and data integrity

PulseOps protects critical workflows with:

MySQL transactions and rollback on failure

SELECT ... FOR UPDATE row locking

Atomic database updates

Unique constraints for deduplication

Version-based optimistic locking

Idempotency records for manual incidents

Append-only incident events

Refresh-token family tracking and reuse detection

UTC session enforcement for every pooled connection

Security controls

Helmet security headers

CORS origin allowlist

General API and login-specific rate limits

Request body size limits

JWT algorithm, issuer, audience, and expiry validation

Minimum 64-character JWT secret

HTTP-only refresh-token cookie

Refresh-token hashing and rotation

Password-change and role-change invalidation

Account lockout after repeated login failures

Production stack-trace suppression

Request, header, keep-alive, and shutdown timeouts

Graceful scheduler, HTTP server, and database shutdown

Testing

Run the unit test suite:

cd backend
npm test

With the backend and database running, execute the integration flows:

npm run test:incident-flow
npm run test:missed-heartbeat
npm run test:alert-rules
npm run test:threshold-incidents
npm run test:alert-rule-management

Expected automatic incident lifecycle:

CREATED -> OCCURRENCE_RECORDED -> RESOLVED

Before publishing a release, also run:

cd frontend
npm run build

Production deployment checklist

Set NODE_ENV=production.

Use HTTPS for the frontend and API.

Set an HTTPS FRONTEND_URL allowlist.

Set VITE_API_URL to the production API /api URL.

Generate a unique JWT secret of at least 64 characters.

Use a dedicated least-privilege MySQL application user.

Run all schema scripts before starting the API.

Configure TRUST_PROXY only for the known proxy topology.

Deploy frontend and backend on the same site when using SameSite=Strict refresh cookies.

Configure SPA fallback/rewrite to index.html for React Router routes.

Add process supervision and centralized logs.

Back up MySQL and test restoration.

Run dependency, integration, and production-build checks.

Known pre-deployment checks

The default schema seeds ADMIN, RESPONDER, and VIEWER, while current server and heartbeat authorization also references MANAGER. Before production, either seed a MANAGER role or replace that permission with the intended existing role.

Remove accidental duplicate source files such as IncidentsPage.jsxIncidentsPage.jsx if present.

Keep .env, node_modules, build output, logs, and database exports out of Git.

Add deployment URLs and screenshots after the production environment is available.

Screenshots

Add portfolio screenshots under docs/screenshots/, for example:

dashboard.png

servers.png

incidents.png

alert-rules.png

notifications.png

mobile-dashboard.png

Then reference them using relative Markdown paths:

![PulseOps operations dashboard](docs/screenshots/dashboard.png)

Portfolio summary

PulseOps demonstrates full-stack development, REST API design, secure authentication, role-based authorization, MySQL transaction handling, concurrency control, monitoring state machines, automatic incident response, notification workflows, responsive React UI development, and production-oriented operational safeguards.

CV highlights

Built a full-stack server monitoring and incident response dashboard using React, Node.js, Express, and MySQL.

Implemented heartbeat monitoring, missed-heartbeat detection, configurable alert rules, and automatic incident creation and recovery.

Designed concurrency-safe workflows using transactions, row locks, optimistic versioning, unique constraints, and idempotency keys.

Implemented JWT authentication, HTTP-only refresh-token rotation, reuse detection, RBAC, rate limiting, and account lockout controls.

Built responsive server, incident, alert, notification, and telemetry interfaces with automatic token refresh and robust UI states.

Author

Nur Alam

This project was created as a portfolio and learning project focused on enterprise-style application development and operational reliability.