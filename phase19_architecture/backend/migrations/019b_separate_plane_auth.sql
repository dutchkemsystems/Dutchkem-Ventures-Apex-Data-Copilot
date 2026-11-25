-- =====================================================================
-- Phase 19B: Separate Plane Authentication Tables
-- User password resets + Dedicated Admin Staff + Signed Admin Invites
-- =====================================================================

CREATE TABLE IF NOT EXISTS user_password_resets (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash      TEXT NOT NULL UNIQUE,
    expires_at      TIMESTAMPTZ NOT NULL,
    used_at         TIMESTAMPTZ NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_user_password_resets_user
    ON user_password_resets (user_id, expires_at DESC);

-- Isolated Platform Admin Identity Table (never shared with tenant `users` table)
CREATE TABLE IF NOT EXISTS admin_users (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email               TEXT NOT NULL UNIQUE,
    full_name           TEXT NOT NULL,
    password_hash       TEXT NOT NULL,
    role                TEXT NOT NULL CHECK (role IN ('super_admin', 'finance', 'dpo')),
    totp_enabled        BOOLEAN NOT NULL DEFAULT TRUE,
    totp_secret_enc     TEXT NOT NULL,
    invited_by_admin_id UUID NULL REFERENCES admin_users(id),
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login_at       TIMESTAMPTZ NULL
);

-- Signed, single-use, expiring invites issued strictly by super_admin
CREATE TABLE IF NOT EXISTS admin_invites (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email               TEXT NOT NULL,
    role                TEXT NOT NULL CHECK (role IN ('super_admin', 'finance', 'dpo')),
    token_signature     TEXT NOT NULL UNIQUE,
    invited_by_admin_id UUID NOT NULL REFERENCES admin_users(id),
    expires_at          TIMESTAMPTZ NOT NULL,
    accepted_at         TIMESTAMPTZ NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_admin_invites_email
    ON admin_invites (email, expires_at DESC)
    WHERE accepted_at IS NULL;
