INSERT INTO "User" ("email", "name") VALUES (
  'serviceaccount@example.test',
  'Service Account'
) ON CONFLICT DO NOTHING;
