#!/bin/sh
set -eu

rm -rf /app/data/* /app/logs/*
mkdir -p /app/data/images /app/data/thumbs /app/logs

exec node src/server.js
