UPDATE auth.users AS u
SET
  name = COALESCE(
    u.name,
    u.raw_user_meta_data ->> 'display_name',
    u.raw_user_meta_data ->> 'full_name',
    u.raw_user_meta_data ->> 'name',
    u.raw_user_meta_data ->> 'username',
    (
      SELECT COALESCE(
        i.identity_data ->> 'full_name',
        i.identity_data ->> 'name',
        i.identity_data ->> 'username',
        i.identity_data ->> 'preferred_username'
      )
      FROM auth.identities AS i
      WHERE i.user_id = u.id
      ORDER BY i.created_at ASC NULLS LAST, i.id ASC
      LIMIT 1
    ),
    split_part(u.email, '@', 1)
  ),
  image = COALESCE(
    u.image,
    u.raw_user_meta_data ->> 'avatar_url',
    u.raw_user_meta_data ->> 'picture',
    (
      SELECT COALESCE(
        i.identity_data ->> 'avatar_url',
        i.identity_data ->> 'picture'
      )
      FROM auth.identities AS i
      WHERE i.user_id = u.id
      ORDER BY i.created_at ASC NULLS LAST, i.id ASC
      LIMIT 1
    )
  ),
  email_verified = COALESCE(u.email_verified, false)
    OR u.email_confirmed_at IS NOT NULL
    OR u.confirmed_at IS NOT NULL
WHERE u.deleted_at IS NULL;

INSERT INTO public.account (
  id,
  "accountId",
  "providerId",
  "userId",
  password,
  "createdAt",
  "updatedAt"
)
SELECT
  gen_random_uuid(),
  u.id::text,
  'credential',
  u.id,
  u.encrypted_password,
  COALESCE(u.created_at, now()),
  COALESCE(u.updated_at, u.created_at, now())
FROM auth.users AS u
WHERE u.deleted_at IS NULL
  AND u.encrypted_password IS NOT NULL
  AND u.encrypted_password <> ''
ON CONFLICT ("providerId", "accountId")
DO UPDATE SET
  "userId" = EXCLUDED."userId",
  password = COALESCE(EXCLUDED.password, public.account.password),
  "updatedAt" = EXCLUDED."updatedAt";

INSERT INTO public.account (
  id,
  "accountId",
  "providerId",
  "userId",
  password,
  "createdAt",
  "updatedAt"
)
SELECT
  gen_random_uuid(),
  COALESCE(i.identity_data ->> 'sub', i.provider_id, i.id::text),
  i.provider,
  i.user_id,
  NULL,
  COALESCE(i.created_at, u.created_at, now()),
  COALESCE(i.updated_at, i.created_at, u.updated_at, u.created_at, now())
FROM auth.identities AS i
JOIN auth.users AS u
  ON u.id = i.user_id
WHERE u.deleted_at IS NULL
  AND i.provider <> 'email'
  AND COALESCE(i.identity_data ->> 'sub', i.provider_id, i.id::text) IS NOT NULL
ON CONFLICT ("providerId", "accountId")
DO UPDATE SET
  "userId" = EXCLUDED."userId",
  "updatedAt" = EXCLUDED."updatedAt";
