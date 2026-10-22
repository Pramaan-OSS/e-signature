import type { SVGAttributes } from 'react';
export type LogoProps = SVGAttributes<SVGSVGElement>;
export function BrandingLogo(props: LogoProps) {
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 32" role="img" aria-label="e-sign" {...props}><path fill="currentColor" d="M3 3h12v12H3zM18 3h12v12H18zM3 18h12v12H3zM18 18h12v12H18z" /><text x="40" y="25" fill="currentColor" fontFamily="Fraunces, Georgia, serif" fontSize="28">e-sign</text></svg>;
}
