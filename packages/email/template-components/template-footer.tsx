import { Link, Section, Text } from '../components';
import { useBranding } from '../providers/branding';
export type TemplateFooterProps = { isDocument?: boolean; reportUrl?: string };
export const TemplateFooter = ({ reportUrl }: TemplateFooterProps) => {
  const branding = useBranding();
  return <Section>{reportUrl && <Text>If you did not expect this email, <Link href={reportUrl}>report the sender</Link>.</Text>}{branding.brandingCompanyDetails && <Text>{branding.brandingCompanyDetails}</Text>}</Section>;
};
