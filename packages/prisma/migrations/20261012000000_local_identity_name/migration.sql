-- Upgrade pre-template local identities; fresh installs already use E_SIGN.
DO $$
DECLARE legacy_label text;
BEGIN
  SELECT enumlabel INTO legacy_label FROM pg_enum JOIN pg_type ON pg_type.oid = enumtypid
  WHERE typname = 'IdentityProvider' AND enumlabel NOT IN ('E_SIGN', 'GOOGLE', 'OIDC') LIMIT 1;
  IF legacy_label IS NOT NULL THEN
    EXECUTE format('ALTER TYPE "IdentityProvider" RENAME VALUE %L TO %L', legacy_label, 'E_SIGN');
  END IF;
END $$;
