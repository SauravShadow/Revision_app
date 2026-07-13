-- db/init/001-databases.sql
-- Runs once, on first container init (official postgres image convention:
-- anything in /docker-entrypoint-initdb.d runs automatically). POSTGRES_DB
-- below creates `revision_app`; this creates the second database used by
-- the test suite so it never touches dev data.
CREATE DATABASE revision_app_test;
