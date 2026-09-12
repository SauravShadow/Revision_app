-- db/init/004-ai-databases.sql
-- Runs on first container init alongside 001-databases.sql (revision_app),
-- 002-auth-databases.sql (revision_auth), and 003-content-databases.sql
-- (revision_content).
CREATE DATABASE revision_ai;
CREATE DATABASE revision_ai_test;
