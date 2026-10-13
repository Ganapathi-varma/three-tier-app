-- Database schema for the 3-tier learning app.
-- This file is executed automatically by the official postgres image
-- when the data directory is empty (mounted at
-- /docker-entrypoint-initdb.d/). It creates the tables only.
--
-- The demo user is seeded by the backend at startup (see seed.js),
-- because the password must be hashed with bcrypt in application code.

CREATE TABLE IF NOT EXISTS users (
    id            SERIAL PRIMARY KEY,
    username      VARCHAR(100) UNIQUE NOT NULL,
    password_hash TEXT        NOT NULL,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS products (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(200)   NOT NULL,
    description TEXT,
    price       NUMERIC(10, 2) NOT NULL,
    created_at  TIMESTAMPTZ    NOT NULL DEFAULT now()
);
