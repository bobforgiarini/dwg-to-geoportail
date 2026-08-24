import type { DetailedHTMLProps, HTMLAttributes } from 'react';

type SiteInfoBannerAttributes = DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
  'collapse-after'?: string | number;
  details?: string;
  headline?: string;
  href?: string;
  'logo-alt'?: string;
  'logo-src'?: string;
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  size?: 'sm' | 'md' | 'lg';
  theme?: 'light' | 'dark';
};

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'site-info-banner': SiteInfoBannerAttributes;
    }
  }
}
