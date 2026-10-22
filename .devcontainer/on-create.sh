#!/usr/bin/env bash
set -e
npm ci
# Private database settings must be supplied by the container owner.
npm run prisma:generate
npm run translate:compile
