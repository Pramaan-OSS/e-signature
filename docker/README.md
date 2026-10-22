# e-sign containers

For local use, copy `.env.example` to `.env`, add the Pramaan key, then run `./start` from the project root. Docker with Compose is the only prerequisite. The command generates missing secrets and a local certificate, builds the app, starts PostgreSQL and applies migrations.

For a separately configured production deployment, build the application image with `docker compose -f docker/production/compose.yml build` from the project root. The production configuration runs the app and its own database; the database-backed job queue is the default. Development services contain only PostgreSQL and an optional own Redis queue.

- [Run and configure e-sign](../README.md#quick-start)
- [Environment settings](../.env.example)
- [Local signing certificate](../SIGNING.md)
- [Architecture](../ARCHITECTURE.md)

Production requires private session/encryption secrets, a sender address, a signing certificate and `PRAMAAN_API_KEY`. No email, file-storage, conversion or telemetry service runs alongside the app. Publishing the image is the owner's responsibility.
