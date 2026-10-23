[![CI](https://github.com/Pramaan-OSS/e-sign/actions/workflows/ci.yml/badge.svg)](https://github.com/Pramaan-OSS/e-sign/actions/workflows/ci.yml)

# e-sign

Document signing and templates, with outside service actions routed through Pramaan. Sign-in and the database are provided through Pramaan in test mode.

## Quick start

Install Docker with Compose, then run:

```sh
cp .env.example .env # paste PRAMAAN_API_KEY into .env
./start
```

Open http://localhost:3012. The first build downloads public dependencies and may take several minutes. The command provisions managed sign-in and requests a managed database through Pramaan in test mode, falling back to the bundled local database when provisioning is unavailable, and starts the production build with its local job runner. It generates missing private secrets and a development signing certificate, and runs database migrations. No database account, package-registry login, local runtime or certificate purchase is needed. Private values persist in ignored `.env`, `.local` and `.runtime` with private permissions; database data persists in the Compose volume. Stop with Ctrl-C; run `./start` again to resume. No example users are seeded. Without a key, the app starts and shows “Add PRAMAAN_API_KEY to .env”; local accounts, PDF uploads and local signing remain available.

Managed sign-in is the default with a key: email registration and personal-account sign-in require no separate client credentials. Local accounts remain available when no key is set or provisioning is unavailable. The generated local certificate remains the signing default; remote signing and own-client sign-in are optional. A generated certificate is for local development; configure an own trusted certificate before relying on signed documents outside development. Optional settings are commented at the bottom of `.env.example`. The default sender is development-only; configure your verified sender for real delivery.

For isolated offline verification, `./start --fake` injects the fake client and blocks outside HTTP. Never use that flag for real documents or delivery.

PDF uploads use own database storage by default. With a configured key, Word uploads up to 100 MB convert to PDF on the server; protected Word files are refused. Review the converted layout before sending. Without a key, upload a PDF. Select `NEXT_PUBLIC_UPLOAD_TRANSPORT=pramaan` to use server-side capability storage: up to 25 MB uses storage.object.put; larger files use resumable multipart parts. Large files retain a database copy for reading because capability downloads still cap at 25 MB. Refused uploads and workspaces without a key keep the database path. Product upload limits still apply. Hosted signing copies have separate limits (10 MB total, 10 PDFs, 20 signers and 200 fields) and do not change local drafts.

Personal-account and email sign-in use the managed server. Older authorization links return to the same managed screen. Organisation OIDC sign-in uses an administrator-configured connection and explicitly linked member accounts; setup needs an HTTPS app address and a key. The service is not deployed yet or live-verified. See [sign-in setup](docs/SIGN-IN.md). Add a verified sender address through your Pramaan setup; the example address is development-only. The local container includes the browser needed for PDF audit/certificate rendering.

Connected app discovery loads one paid page at a time, with load-more on demand and session-scoped caching. Opt in to reading returned files as text; platform file handles go directly to document.parse. A failed copy or parse keeps the action result and never runs the action again.

Customer-configured webhooks retain their delivery and private-address protections. The template header is `X-ESign-Secret`; webhook consumers must read that header after migrating from the original product.

## Checks

```sh
npm test -w @e-sign/lib
node --import tsx --test packages/lib/server-only/pramaan/sdk-compat.node-test.ts
```

For local browser checks after building, run `node --import tsx scripts/testing/start-server.mjs`. It injects a fake client and blocks outside HTTP; it never sends real notifications. Its request records stay ignored under `.scratch/`. Stop it before starting the normal server on the same port.

`@pramaan/sdk@0.1.0` supplies the shared client and contracts. Local file and outcome compatibility helpers remain beside the wrapper. All product calls enter `packages/lib/server-only/pramaan.ts`; tests use a fake client. Free managed sign-in provisioning, email sign-in and token verification have been checked live; other capabilities remain unverified.

See [sign-in setup](docs/SIGN-IN.md), [available features and limitations](docs/FEATURES.md), [architecture](ARCHITECTURE.md) and [dependency maintenance](docs/DEPENDENCY-AUDIT.md). The template is licensed under [AGPL-3.0](LICENSE).

## Connected accounts

Connecting an outside account, such as cloud storage or another app, carries a monthly Pramaan charge for each connected
account, billed to the Pramaan account behind `PRAMAAN_API_KEY`. Signing in is free. Disconnecting an account ends its
charge.

## Built on

Built on [Documenso](https://github.com/documenso/documenso), source commit `38ecb217effcc53a7164d7123c51336f636bd3b2`, licensed under AGPL-3.0. Original licence text is in LICENSE-ORIGINAL. Commercial enterprise code is excluded.

Managed database credentials are returned once and saved privately under `.runtime/managed` with mode 0600; restart reuses them. If a provisioning response cannot be confirmed, startup stops for review rather than silently choosing another database. Explicit unavailability uses the bundled database and prints one plain fallback line. Fake mode uses a separate `.runtime/fake` directory. Local development addresses are allowed automatically; public HTTPS addresses are registered with managed sign-in. Tokens are checked through Pramaan before opening a local session, using signed profile claims, the existing email restrictions and a single-use browser attempt. Existing local accounts are never merged automatically by matching an email address; use local sign-in for those accounts. Local extra-verification requirements remain enforced.
