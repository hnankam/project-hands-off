/**
 * Connection service logos - Google Drive, Outlook, Dropbox, etc.
 * Uses official brand colors and shapes for consistency.
 */
import * as React from 'react';

interface IconProps {
  className?: string;
  size?: number;
  style?: React.CSSProperties;
}

const svgProps = (props: IconProps) => ({
  viewBox: '0 0 24 24',
  fill: 'none' as const,
  xmlns: 'http://www.w3.org/2000/svg',
  ...(props.className && { className: props.className }),
  ...(props.size != null && { width: props.size, height: props.size }),
  style: { flexShrink: 0, shapeRendering: 'geometricPrecision' as const, ...props.style },
});

/** Google Drive - official logo (Wikipedia/Google 2020) */
export const GoogleDriveIcon: React.FC<IconProps> = (props) => (
  <svg {...svgProps(props)} viewBox="0 0 87.3 78" preserveAspectRatio="xMidYMid meet">
    <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da" />
    <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0-1.2 4.5h27.5z" fill="#00ac47" />
    <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335" />
    <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d" />
    <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc" />
    <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00" />
  </svg>
);

/** Microsoft Outlook - envelope logo (Microsoft 365 / Fluent style) */
export const OutlookIcon: React.FC<IconProps> = (props) => (
  <svg {...svgProps(props)}>
    <path
      d="M4 5h16l-8 6L4 5zm0 2v11h16V7l-8 6-8-6z"
      fill="#0078D4"
    />
  </svg>
);

/** Dropbox - official folded box logo (Simple Icons / brand guidelines) */
export const DropboxIcon: React.FC<IconProps> = (props) => (
  <svg {...svgProps(props)}>
    <path
      d="M6 1.807L0 5.629l6 3.822 6.001-3.822L6 1.807zM18 1.807l-6 3.822 6 3.822 6-3.822-6-3.822zM0 13.274l6 3.822 6.001-3.822L6 9.452l-6 3.822zM18 9.452l-6 3.822 6 3.822 6-3.822-6-3.822zM6 18.371l6.001 3.822 6-3.822-6-3.822L6 18.371z"
      fill="#0061FF"
    />
  </svg>
);

/** Gmail - red M logo */
export const GmailIcon: React.FC<IconProps> = (props) => (
  <svg {...svgProps(props)}>
    <path
      d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L12 9.545l8.073-6.052C21.69 2.28 24 3.434 24 5.457z"
      fill="#EA4335"
    />
  </svg>
);

/** Slack - four-lobed hash logo */
export const SlackIcon: React.FC<IconProps> = (props) => (
  <svg {...svgProps(props)}>
    <path
      d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313z"
      fill="#E01E5A"
    />
    <path
      d="M8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312z"
      fill="#36C5F0"
    />
    <path
      d="M18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312z"
      fill="#2EB67D"
    />
    <path
      d="M15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"
      fill="#ECB22E"
    />
  </svg>
);

/** OneDrive - cloud logo */
export const OneDriveIcon: React.FC<IconProps> = (props) => (
  <svg {...svgProps(props)}>
    <path
      d="M5.9 19.5C2.6 19.5 0 16.9 0 13.75C0 10.65 2.5 8.1 5.65 8C7.0 5.9 9.3 4.5 12 4.5C15.5 4.5 18.4 6.8 19.2 10C22.0 10 24 12.1 24 14.75C24 17.3 21.8 19.5 19.4 19.5H5.9Z"
      fill="#0364B8"
    />
  </svg>
);

/** Render connection icon by service name */
export function getConnectionIcon(
  service: string,
  opts: { className?: string; size?: number } = {}
): React.ReactNode {
  switch (service) {
    case 'gmail':
      return <GmailIcon {...opts} size={opts.size} />;
    case 'outlook':
      return <OutlookIcon {...opts} size={opts.size} />;
    case 'slack':
      return <SlackIcon {...opts} size={opts.size} />;
    case 'google-drive':
      return <GoogleDriveIcon {...opts} size={opts.size} />;
    case 'onedrive':
      return <OneDriveIcon {...opts} size={opts.size} />;
    case 'dropbox':
      return <DropboxIcon {...opts} size={opts.size} />;
    default:
      return null;
  }
}
