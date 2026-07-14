-- db/init/002-auth-databases.sql
-- Runs on first container init alongside 001-databases.sql (revision_app).
CREATE DATABASE revision_auth;
CREATE DATABASE revision_auth_test;
