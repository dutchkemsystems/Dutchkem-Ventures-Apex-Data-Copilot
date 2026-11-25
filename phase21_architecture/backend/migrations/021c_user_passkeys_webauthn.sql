-- =====================================================================
-- Phase 21C: Phishing-Proof WebAuthn Passkeys & Admin YubiKey Hardware Keys
-- Fail-closed schema with plane isolation (user vs admin) & RLS.
-- =====================================================================

CREATE TABLE IF NOT EXISTS user_passkeys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_plane TEXT NOT NULL CHECK (actor_plane IN ('user', 'admin')),
    user_id UUID NULL REFERENCES users(id) ON DELETE CASCADE,
    admin_id TEXT NULL,
    credential_id TEXT NOT NULL UNIQUE,
    public_key TEXT NOT NULL,
    counter BIGINT NOT NULL DEFAULT 0 CHECK (counter >= 0),
    device_name TEXT NOT NULL,
    aaguid TEXT NULL,
    transports TEXT[] NOT NULL DEFAULT ARRAY['internal']::TEXT[],
    device_type TEXT NOT NULL DEFAULT 'singleDevice',
    backed_up BOOLEAN NOT NULL DEFAULT FALSE,
    is_hardware_yubikey BOOLEAN NOT NULL DEFAULT FALSE,
    rp_id TEXT NOT NULL,
    origin TEXT NOT NULL,
    last_used_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT ck_passkey_actor_binding CHECK (
        (actor_plane = 'user' AND user_id IS NOT NULL AND admin_id IS NULL)
        OR (actor_plane = 'admin' AND admin_id IS NOT NULL AND user_id IS NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_user_passkeys_user_id
    ON user_passkeys (user_id)
    WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_passkeys_admin_id
    ON user_passkeys (admin_id)
    WHERE admin_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_passkeys_credential_id
    ON user_passkeys (credential_id);

CREATE TABLE IF NOT EXISTS webauthn_challenges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    challenge TEXT NOT NULL UNIQUE,
    actor_plane TEXT NOT NULL CHECK (actor_plane IN ('user', 'admin')),
    actor_id TEXT NULL,
    ceremony TEXT NOT NULL CHECK (ceremony IN ('registration', 'authentication')),
    rp_id TEXT NOT NULL,
    origin TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fail-closed Row-Level Security: User plane sees only own user_id passkeys; Admin plane sees admin passkeys
ALTER TABLE user_passkeys ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_passkeys FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_passkeys_user_isolation ON user_passkeys;
CREATE POLICY user_passkeys_user_isolation ON user_passkeys
    FOR ALL
    USING (
        (
            current_setting('app.current_plane', true) = 'user'
            AND actor_plane = 'user'
            AND user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
        )
        OR current_setting('app.current_plane', true) = 'admin'
    )
    WITH CHECK (
        (
            current_setting('app.current_plane', true) = 'user'
            AND actor_plane = 'user'
            AND user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
        )
        OR current_setting('app.current_plane', true) = 'admin'
    );
