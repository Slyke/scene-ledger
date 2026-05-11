#!/bin/sh
set -eu

npm install --no-fund --no-audit

exec npm run dev
