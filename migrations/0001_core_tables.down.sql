-- Rollback for 0001_core_tables.up.sql
-- Safely tears down base tables in reverse foreign-key dependency order.

DROP TABLE IF EXISTS tasks;
DROP TABLE IF EXISTS projects;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS organizations;
DROP TABLE IF EXISTS schema_migrations;
