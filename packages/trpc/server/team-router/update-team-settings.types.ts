import { BRANDING_CSS_MAX_LENGTH } from '@e-sign/lib/constants/branding';
import { ZEnvelopeExpirationPeriod } from '@e-sign/lib/constants/envelope-expiration';
import { ZEnvelopeReminderSettings } from '@e-sign/lib/constants/envelope-reminder';
import { SUPPORTED_LANGUAGE_CODES } from '@e-sign/lib/constants/i18n';
import { ZCssVarsSchema } from '@e-sign/lib/types/css-vars';
import { ZDefaultRecipientsSchema } from '@e-sign/lib/types/default-recipients';
import { ZDocumentEmailSettingsSchema } from '@e-sign/lib/types/document-email';
import { ZDocumentMetaDateFormatSchema, ZDocumentMetaTimezoneSchema } from '@e-sign/lib/types/document-meta';
import { DocumentVisibility } from '@e-sign/lib/types/document-visibility';
import { ZSanitizeBrandingCssWarningSchema } from '@e-sign/lib/utils/sanitize-branding-css';
import { zEmail } from '@e-sign/lib/utils/zod';
import { z } from 'zod';

/**
 * Null = Inherit from organisation.
 * Undefined = Do nothing
 */
export const ZUpdateTeamSettingsRequestSchema = z.object({
  teamId: z.number(),
  data: z.object({
    // Document related settings.
    documentVisibility: z.nativeEnum(DocumentVisibility).nullish(),
    documentLanguage: z.enum(SUPPORTED_LANGUAGE_CODES).nullish(),
    documentTimezone: ZDocumentMetaTimezoneSchema.nullish(),
    documentDateFormat: ZDocumentMetaDateFormatSchema.nullish(),
    includeSenderDetails: z.boolean().nullish(),
    includeSigningCertificate: z.boolean().nullish(),
    includeAuditLog: z.boolean().nullish(),
    typedSignatureEnabled: z.boolean().nullish(),
    uploadSignatureEnabled: z.boolean().nullish(),
    drawSignatureEnabled: z.boolean().nullish(),
    delegateDocumentOwnership: z.boolean().nullish(),
    envelopeExpirationPeriod: ZEnvelopeExpirationPeriod.nullish(),
    reminderSettings: ZEnvelopeReminderSettings.nullish(),

    // Branding related settings.
    brandingEnabled: z.boolean().nullish(),
    brandingUrl: z.string().nullish(),
    brandingCompanyDetails: z.string().nullish(),
    brandingColors: ZCssVarsSchema.nullish(),
    brandingCss: z.string().max(BRANDING_CSS_MAX_LENGTH).nullish(),

    // Email related settings.
    emailId: z.string().nullish(),
    emailReplyTo: zEmail().nullish(),
    // emailReplyToName: z.string().nullish(),
    emailDocumentSettings: ZDocumentEmailSettingsSchema.nullish(),

    // Default recipients settings.
    defaultRecipients: ZDefaultRecipientsSchema.nullish(),
    // AI features settings.
    aiFeaturesEnabled: z.boolean().nullish(),
  }),
});

export const ZUpdateTeamSettingsResponseSchema = z.object({
  cssWarnings: z.array(ZSanitizeBrandingCssWarningSchema).optional(),
});
