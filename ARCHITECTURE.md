# e-sign architecture

The React Router web interface and Hono server live in `apps/remix`. REST endpoints, session-protected workspace routes and background-job endpoints share the domain logic in `packages/lib`. PostgreSQL stores users, teams, envelopes, fields, audit records and capability-operation references through `packages/prisma`.

## Outside actions

Every service action enters `packages/lib/server-only/pramaan.ts`, the single `@pramaan/sdk` client configured by `PRAMAAN_API_KEY` and optional `PRAMAAN_BASE_URL`. The SDK workspace contains the lab fetch client and the contracts this template uses. Errors are replaced with neutral messages. Tests replace the client with a fake and make no live service calls.

| Feature | Capabilities |
|---|---|
| Notifications, attachments, delivery status | `email.send`, `email.message.send`, `email.status` |
| Sender domains | `email.domain.verify`, `email.domain.get`, `email.domain.delete` |
| Private files | `storage.object.put`, `storage.object.get`, `storage.object.head`, `storage.object.delete`; `storage.upload.create`, `storage.upload.part.put`, `storage.upload.parts.list`, `storage.upload.complete`, `storage.upload.abort` |
| Hosted signing copies | `signature.request.send`, `signature.request.get`, `signature.request.download`, `signature.request.remind`, `signature.request.cancel` |
| Hosted templates | `signature.template.create`, `signature.template.get`, `signature.request.send-template` |
| Signer verification | `identity.verification.create`, `identity.verification.get` |
| Text reminders | `sms.send`, `sms.status` |
| Word uploads | `document.convert`, `document.convert-bulk` (server-side jobs, not live-verified) |
| Document interpretation | `document.extract`, `document.contract.extract`, `document.signature.extract` |
| Connected tools | `apps.catalog.search`, `apps.connection.start`, `apps.connections.list`, `apps.connection.revoke`, `apps.action.execute` |
| Optional sign-in exchange and bot-token checks | `auth.social.exchange`, `auth.enterprise-connection.create`, `auth.enterprise-connections.list`, `auth.enterprise-connection.delete`, `auth.enterprise.start`, `auth.bot-check.verify` |

`CapabilityOperation` records are saved before actions, belong to a user/team and retain action keys for retries. Access checks run before private bytes or saved references are read. Hosted signing copies remain separate from local drafts. Storage transfers go through the app server and use app-owned download/upload grants. Objects up to 25 MB use storage.object.put; larger objects use raw 8 MiB parts with a 1 GiB transfer ceiling (product upload limits still apply). MultipartStorageUpload stores leased resume state and a database copy of large completed files for the existing reader. Confirmed part staging is deleted promptly. Part lengths, completion size and object head must agree before success. Refused uploads or a missing key retain the database path. No storage URL is handed to the browser. The current adapter cannot verify a remote byte checksum or download more than 25 MB.

Connected catalogue pages use cursor/nextCursor with unchanged search inputs and explicit load-more. A bounded per-process cache is keyed by the authenticated sign-in session, user/team and exact page input. Optional text reading persists the connected action result first, then passes returned platform fileId handles straight to document.parse. File-copy or parse failures preserve the result; actions are never replayed to repair a file.

Long reminder runs persist their accepted job id before polling. The server waits beyond the platform’s 35-minute expiry, and saved requests can check or cancel the same job through the client. A start refused with 429 stays waiting and needs a new estimate and approval later. Failed, cancelled or unknown-effect reports retain their step history and never automatically start another send. Cancellation stops new steps; it does not undo completed effects.

## Own infrastructure

- Local sessions, password authentication and access checks remain inside the app. Optional external sign-in builds an authorization redirect with state and PKCE locally; the callback redeems its code through the capability client.
- PostgreSQL provides persistent data, optional PDF bytes and the default job queue. An own Redis instance supports the optional BullMQ queue. Configure `NEXT_PRIVATE_JOBS_PROVIDER=local` or `bullmq`.
- PDF rendering and signature insertion run locally. `packages/signing` signs using an owner-supplied P12 certificate. Chromium renders certificate/audit pages locally. No remote certificate chain, timestamp or digest-signing service is retained.
- Customer-configured webhooks are a product feature. Delivery preserves secret handling, private-address checks and manual redirect handling. Consumers read `X-ESign-Secret`.

## Local signing flow

Upload a PDF, or convert a Word file up to 100 MB through Pramaan when a key is configured. Review the converted layout, then save the PDF to the database or capability storage, save recipients and field positions, send a notification through the capability client, collect the recipient's signature, then seal the document locally and store the signed PDF. Jobs persist notification action keys, completion state and audit events.

Commercial code, telemetry, licence checks and vendor-specific transports are removed. Unsupported features are disabled with clear messages; see [feature limitations](docs/FEATURES.md). Nothing here establishes live capability verification.

## Run and check

Use [README.md](README.md) for setup, [docker/README.md](docker/README.md) for containers and [.env.example](.env.example) for supported settings. [Feature limitations](docs/FEATURES.md) and [sign-in setup](docs/SIGN-IN.md) describe supported behavior and configuration.

Organisation sign-in stores connection metadata, connection-and-subject identity links and encrypted ten-minute sign-in attempts in the local database. Administrators manage connections through Pramaan. Members explicitly link from their existing local sessions; callbacks consume an attempt once, verify state through the exchange and create the existing local session. Customer email claims never select a local account or grant a role. Local passwords and sessions stay owned by this app.

Optional PDF sealing evidence uses `signature.digest.sign` and `signature.timestamp.create` through the same Pramaan client. The server pins the remote public certificate, verifies the returned public key and signature, then builds the CMS PDF signature locally. Timestamping appends a document timestamp after sealing, downloads its file server-side and checks its signed digest/time/certificate fingerprint. Own `CapabilityOperation` rows block automatic resends after an uncertain attempt. Local signing stays the default. Both platform sources remain switched off and not yet live-verified; no revocation retrieval or long-term validation network path is enabled.

Structured document detection uses a named schema inventory checked at startup and build time (`npm run check:schemas`). The single client normalizes schema metadata and rejects unsupported validation rules with the schema name and path before sending. Local result validation retains field constraints. Failed or incomplete extraction cannot complete detection; saved extraction failures record a reason and can be retried explicitly. Uncertain external actions still require review before retrying.

Unavailable service responses use plain messages and preserve existing records. Domain verification never activates or deletes a local domain after a refused call; conversion never substitutes a successful PDF result; optional signing never silently substitutes local evidence. Local accounts, draft editing and PDF uploads remain available.
