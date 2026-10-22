declare namespace NodeJS {
  export interface ProcessEnv {
    PORT?: string;
    NEXT_PUBLIC_WEBAPP_URL?: string;

    NEXT_PRIVATE_GOOGLE_CLIENT_ID?: string;
    NEXT_PRIVATE_GOOGLE_CLIENT_SECRET?: string;

    NEXT_PRIVATE_MICROSOFT_CLIENT_ID?: string;
    NEXT_PRIVATE_MICROSOFT_CLIENT_SECRET?: string;

    // Derived in `createPublicEnv()`; do not set manually.
    NEXT_PUBLIC_GOOGLE_SSO_ENABLED?: 'true' | 'false';
    NEXT_PUBLIC_MICROSOFT_SSO_ENABLED?: 'true' | 'false';
    NEXT_PUBLIC_OIDC_SSO_ENABLED?: 'true' | 'false';
    NEXT_PUBLIC_OIDC_PROVIDER_LABEL?: string;

    NEXT_PRIVATE_DATABASE_URL: string;
    NEXT_PRIVATE_ENCRYPTION_KEY: string;
    NEXT_PRIVATE_ENCRYPTION_SECONDARY_KEY: string;

    NEXT_PRIVATE_LOGGER_FILE_PATH?: string;

    NEXT_PUBLIC_UPLOAD_TRANSPORT?: 'database' | 'pramaan';

    NEXT_PRIVATE_SIGNING_TRANSPORT?: 'local' | 'http' | 'gcloud-hsm' | 'csc' | 'pramaan';
    /**
     * Derived from `NEXT_PRIVATE_SIGNING_TRANSPORT` in `createPublicEnv()`; do
     * not set manually. Lets the client detect CSC mode for authoring UI gating.
     */
    NEXT_PUBLIC_SIGNING_TRANSPORT_IS_CSC?: 'true' | 'false';
    NEXT_PRIVATE_SIGNING_PASSPHRASE?: string;
    NEXT_PRIVATE_SIGNING_LOCAL_FILE_PATH?: string;
    NEXT_PRIVATE_SIGNING_LOCAL_FILE_CONTENTS?: string;
    NEXT_PRIVATE_SIGNING_CSC_SIGNATURE_LEVEL?: 'AES' | 'QES';
    NEXT_PRIVATE_SIGNING_REASON?: string;
    NEXT_PUBLIC_SIGNING_CONTACT_INFO?: string;
    NEXT_PRIVATE_USE_LEGACY_SIGNING_SUBFILTER?: string;

    NEXT_PRIVATE_SMTP_FROM_NAME?: string;
    NEXT_PRIVATE_SMTP_FROM_ADDRESS?: string;

    NEXT_PUBLIC_DISABLE_SIGNUP?: string;
    NEXT_PUBLIC_DISABLE_EMAIL_PASSWORD_SIGNUP?: string;
    NEXT_PUBLIC_DISABLE_GOOGLE_SIGNUP?: string;
    NEXT_PUBLIC_DISABLE_MICROSOFT_SIGNUP?: string;
    NEXT_PUBLIC_DISABLE_OIDC_SIGNUP?: string;
    NEXT_PRIVATE_ALLOWED_SIGNUP_DOMAINS?: string;

    NEXT_PUBLIC_DISABLE_SIGNIN?: string;
    NEXT_PUBLIC_DISABLE_EMAIL_PASSWORD_SIGNIN?: string;
    NEXT_PUBLIC_DISABLE_GOOGLE_SIGNIN?: string;
    NEXT_PUBLIC_DISABLE_MICROSOFT_SIGNIN?: string;
    NEXT_PUBLIC_DISABLE_OIDC_SIGNIN?: string;
    NEXT_PUBLIC_DISABLE_OIDC_AUTO_REDIRECT?: string;

    NEXT_PRIVATE_JOBS_PROVIDER?: 'local' | 'bullmq';

    NEXT_PUBLIC_PDF_USE_INTERNAL_URL?: string;

    /**
     * Redis / BullMQ environment variables
     */
    NEXT_PRIVATE_REDIS_URL?: string;
    NEXT_PRIVATE_REDIS_PREFIX?: string;
    NEXT_PRIVATE_BULLMQ_CONCURRENCY?: string;

    /**
     * Local database environment variables
     */

    POSTGRES_URL?: string;
    DATABASE_URL?: string;
    POSTGRES_PRISMA_URL?: string;
    POSTGRES_URL_NON_POOLING?: string;

    /**
     *
     */

    /**
     * Legal & Data Protection environment variables
     */
    NEXT_PUBLIC_TERMS_OF_SERVICE_URL?: string;
    NEXT_PUBLIC_PRIVACY_POLICY_URL?: string;
    NEXT_PUBLIC_IMPRINT_URL?: string;
  }
}
