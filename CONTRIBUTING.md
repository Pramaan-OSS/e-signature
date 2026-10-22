# Contributing to e-sign

Describe the problem, the expected behavior and the checks that demonstrate the change. Keep changes within the template's signing and document workflow. Follow the shared interface styles and [design application](docs/DESIGN-APPLICATION.md).

Use [README.md](README.md) for local setup. From the project root, run:

```sh
npm run build -w @e-sign/remix
npm test -w @e-sign/lib
node --import tsx --test packages/lib/server-only/pramaan/sdk-compat.node-test.ts
```

Tests use a fake Pramaan client; live service calls require owner authorization. All service changes must enter the single client module and use real capability ids. Describe unsupported behavior in [feature limitations](docs/FEATURES.md).

PDF comparison inputs live in `packages/app-tests/fixtures/pdf-rendering`. Manual baseline generators write to ignored test output; review generated files before deliberately updating an input fixture. Keep secrets, private certificates, customer documents and local verification output out of commits. Preserve licence notices. The owner creates repositories, pushes and publishes the template.

For vulnerability reports, follow [SECURITY.md](SECURITY.md).
