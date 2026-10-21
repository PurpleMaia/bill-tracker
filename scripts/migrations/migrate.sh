#!/bin/bash

ENV_ARG=$1
UPS=$2

# Parse environment argument
case $ENV_ARG in
  l|local)
    ENV="local"
    ;;
  p|prod)
    ENV="prod"
    ;;
  *)
    echo "Error: Invalid environment specified"
    echo "Usage: pnpm  migrate:up [l|local|p|prod] [number_of_migrations]"
    echo ""
    echo "Examples:"
    echo "  pnpm migrate:up l        # Run all pending migrations (local)"
    echo "  pnpm migrate:up l 1      # Run only 1 migration (local)"
    echo "  pnpm migrate:up p        # Run all pending migrations (prod)"
    echo "  pnpm migrate:up p 3      # Run 3 migrations (prod)"
    exit 1
    ;;
esac

# Load environment variables FIRST
case $ENV in
  local)
    ENV_FILE=".env"
    export $(cat $ENV_FILE | grep -v '^#' | xargs)
    ;;
  prod)
    ENV_FILE=".env.none"
    export PATH=../bin/:$PATH
    ;;
esac

echo "Running migrations for $ENV environment..."

# Validate UPS argument if provided
if [ -n "$UPS" ]; then
  if ! [[ "$UPS" =~ ^[0-9]+$ ]]; then
    echo "Error: Number of migrations must be a positive integer"
    exit 1
  fi
fi

# Run migrations based on UPS argument
if [ -z "$UPS" ]; then
  # Run ALL pending migrations
  echo ""
  echo "Running all pending migrations..."
  migrate -database "${DATABASE_URL}" -path src/db/migrations up

  # Test rollback
  echo ""
  echo "Testing rollback (down 1)..."
  migrate -database "${DATABASE_URL}" -path src/db/migrations down 1

  # Run migration up again
  echo ""
  echo "Running migration back up..."
  migrate -database "${DATABASE_URL}" -path src/db/migrations up

  echo ""
  echo "Migration test cycle completed successfully!"
else
  # Run specific number of migrations
  echo ""
  echo "Running ${UPS} migration(s) up..."
  migrate -database "${DATABASE_URL}" -path src/db/migrations up ${UPS}

  # Test rollback
  echo ""
  echo "Testing rollback (down 1)..."
  migrate -database "${DATABASE_URL}" -path src/db/migrations down 1

  # Run migration up again
  echo ""
  echo "Running ${UPS} migration(s) back up..."
  migrate -database "${DATABASE_URL}" -path src/db/migrations up ${UPS}

  echo ""
  echo "Migration test cycle completed successfully!"
fi