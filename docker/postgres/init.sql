-- =============================================================================
-- Per-service database creation
-- =============================================================================
-- Each service owns exactly one database. No cross-database access is allowed.
-- This script runs once when the PostgreSQL container is first initialized.
--
-- IMPORTANT: This file is idempotent — it uses IF NOT EXISTS to prevent
-- errors if the container restarts with an existing volume.
-- =============================================================================

-- Phase 1
SELECT 'CREATE DATABASE user_db' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'user_db')\gexec

-- Prepared for upcoming phases (safe to have them early)
SELECT 'CREATE DATABASE auth_db' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'auth_db')\gexec
SELECT 'CREATE DATABASE product_db' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'product_db')\gexec
SELECT 'CREATE DATABASE order_db' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'order_db')\gexec
SELECT 'CREATE DATABASE inventory_db' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'inventory_db')\gexec
SELECT 'CREATE DATABASE payment_db' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'payment_db')\gexec
