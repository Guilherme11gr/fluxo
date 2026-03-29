CREATE TABLE IF NOT EXISTS public.account (
  id uuid PRIMARY KEY,
  "accountId" text NOT NULL,
  "providerId" text NOT NULL,
  "userId" uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  "accessToken" text,
  "refreshToken" text,
  "idToken" text,
  "accessTokenExpiresAt" timestamptz,
  "refreshTokenExpiresAt" timestamptz,
  scope text,
  password text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_account_provider_account
  ON public.account ("providerId", "accountId");

CREATE INDEX IF NOT EXISTS idx_account_user
  ON public.account ("userId");

CREATE TABLE IF NOT EXISTS public.session (
  id uuid PRIMARY KEY,
  "expiresAt" timestamptz NOT NULL,
  token text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "ipAddress" text,
  "userAgent" text,
  "userId" uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  "impersonatedBy" uuid
);

CREATE UNIQUE INDEX IF NOT EXISTS session_token_key
  ON public.session (token);

CREATE INDEX IF NOT EXISTS idx_session_user
  ON public.session ("userId");

CREATE TABLE IF NOT EXISTS public.verification (
  id uuid PRIMARY KEY,
  identifier text NOT NULL,
  value text NOT NULL,
  "expiresAt" timestamptz NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_verification_identifier
  ON public.verification (identifier);

ALTER TABLE auth.users
  ADD COLUMN IF NOT EXISTS name varchar(255),
  ADD COLUMN IF NOT EXISTS image text,
  ADD COLUMN IF NOT EXISTS email_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS force_password_reset boolean NOT NULL DEFAULT false;
