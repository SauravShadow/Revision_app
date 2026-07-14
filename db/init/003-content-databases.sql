-- db/init/003-content-databases.sql
-- Runs on first container init alongside 001-databases.sql (revision_app)
-- and 002-auth-databases.sql (revision_auth).
CREATE DATABASE revision_content;
CREATE DATABASE revision_content_test;
