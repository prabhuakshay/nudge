#!/bin/sh
# Applies database migrations (unless NUDGE_RUN_MIGRATIONS=false), then runs the given command.
set -eu

if [ "${NUDGE_RUN_MIGRATIONS:-true}" = "true" ]; then
    python manage.py migrate --noinput
fi

exec "$@"
