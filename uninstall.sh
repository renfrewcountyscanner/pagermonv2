#!/bin/bash
set -e

echo "Stopping PagerMon stack..."
docker compose down 2>/dev/null || docker-compose down 2>/dev/null

echo ""
echo "To also remove all data (database, config):"
echo "  docker compose down -v"
echo "  # or: docker-compose down -v"
echo ""
echo "PagerMon has been stopped."
