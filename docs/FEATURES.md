# Features and limitations

## Without a connection key

Local accounts, sessions, PDF uploads in the database, document drafts, recipients, fields, templates, signing views and local PDF sealing use the app's own infrastructure. Sealing needs an owner-supplied signing certificate; setup creates a development certificate only. Notifications, invitations and password-reset delivery require a key and a verified sender, so a complete remote signing workflow needs those settings. Word uploads and workspace service actions stay off with a clear message.

## With a connection key

Notifications, attachments, sender domains, delivery checks, hosted signing copies/templates, consenting signer verification, text reminders, document extraction and connected-app actions use the single Pramaan client. Word files up to 100 MB convert to PDF server-side; protected files are refused. Review conversion fidelity before sending. Multiple Word uploads use bulk conversion. Conversion needs platform-side service configuration and is not yet live-verified.

Optional capability storage sends files up to 25 MB directly and larger files as resumable 8 MiB parts, up to the adapter's 1 GiB ceiling and the product's own limits. Refused storage actions or a missing key retain database storage. Large uploads keep a database copy because remote downloads cap at 25 MB. Remote checksum verification is unavailable; part sizes and completion size are checked. Storage addresses never reach the browser.

Connected-app discovery loads paid pages on demand and caches them for the session. Connections may grant broad access; read the notice and the consent screen before connecting. Returned file handles can be parsed as text. A failed file copy or parse preserves the action result and never replays it. No connection is described as restricted to reading. Execution is not live-verified in this template.

Hosted signing copies are separate from local drafts and support up to 10 MB total, 10 PDFs, 20 signers and 200 fields. Local signing remains local. Remote certificate-secret retrieval, SAML organisation sign-in and a hosted challenge screen are unavailable.

## Long-running reminders

Review the estimate and explicitly approve it before sending. A changed or expired plan needs new approval. Saved long runs can be checked or cancelled; cancellation stops new steps and does not undo steps that already acted. A service refusal because 25 runs are already open means try later, without sending through another path. Runs still open after 35 minutes fail with a timeout. An unknown step effect means check before retrying; it is never automatically repeated. A failed or cancelled report keeps its effect history. An uncertain start or failed status lookup does not authorize another send.

Tests use fake service responses. No capability or outcome is live-verified by this template. See [setup](../README.md), [sign-in](SIGN-IN.md), [architecture](../ARCHITECTURE.md) and [dependency audit](DEPENDENCY-AUDIT.md).

Organisation OIDC sign-in supports administrator-managed connections and explicit linking to existing member accounts. It requires a key and HTTPS app address. The platform service is not deployed yet and has not been live-verified; local accounts and sessions remain available. See [sign-in setup](SIGN-IN.md).

Optional connected-key sealing and trusted document timestamps are wired through Pramaan but switched off on the platform and not yet live-verified. Local certificate sealing remains the default. A requested remote signature or timestamp failure stops sealing with a clear message; uncertain attempts are never automatically repeated. Member-bound keys may require an approver. See [signing setup](../SIGNING.md).

A configured key does not guarantee that every service is available. Word conversion, connected-key signing, trusted timestamps, signer verification and custom email-domain checks can answer “not available yet.” Those responses preserve saved data and show a plain message; local PDF uploads and other page controls remain usable. No successful result is invented. Failed document detection and read-only extraction can be retried explicitly.
