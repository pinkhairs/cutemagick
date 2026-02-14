#!/bin/bash
set -e

chown -R node:node /app/data

exec gosu node "$@"
