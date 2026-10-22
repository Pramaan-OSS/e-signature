-- Create deleted@example.test
DO $$
BEGIN  
  IF NOT EXISTS (SELECT 1 FROM "User" WHERE "email" = 'deleted-account@example.test') THEN  
    INSERT INTO
      "User" (
        "email",
        "emailVerified",
        "password",
        "createdAt",
        "updatedAt",
        "lastSignedIn",
        "roles",
        "identityProvider",
        "twoFactorEnabled"
      )
    VALUES
      (
        'deleted-account@example.test',
        NOW(),
        NULL,
        NOW(),
        NOW(),
        NOW(),
        ARRAY['USER'::TEXT]::"Role" [],
        CAST('GOOGLE'::TEXT AS "IdentityProvider"),
        FALSE
      );
  END IF;  
END $$
