import type { SVGProps } from 'react'

export type IconComponent = (props: SVGProps<SVGSVGElement>) => React.JSX.Element

function icon(paths: React.ReactNode): IconComponent {
  return function Icon(props: SVGProps<SVGSVGElement>) {
    return (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
        {...props}
      >
        {paths}
      </svg>
    )
  }
}

export const Icons = {
  cube: icon(
    <>
      <path d="M12 3 20 7.5v9L12 21l-8-4.5v-9z" />
      <path d="M4 7.5 12 12l8-4.5M12 12v9" />
    </>,
  ),
  assembly: icon(
    <>
      <rect x="3" y="3" width="8" height="8" rx="1" />
      <rect x="13" y="13" width="8" height="8" rx="1" />
      <path d="M7 11v6h6M17 13V7h-6" />
    </>,
  ),
  requirement: icon(
    <>
      <path d="M9 5h10M9 12h10M9 19h10" />
      <path d="m3.5 5 1.5 1.5L7.5 4M3.5 12 5 13.5 7.5 11M3.5 19 5 20.5 7.5 18" />
    </>,
  ),
  procedure: icon(
    <>
      <path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6z" />
      <path d="m8.5 12 2.5 2.5 4.5-5" />
    </>,
  ),
  analysis: icon(
    <>
      <path d="M4 20h16" />
      <path d="M7 16V9M12 16V5M17 16v-4" />
    </>,
  ),
  geometry: icon(
    <>
      <rect x="3" y="9" width="12" height="6" rx="1" />
      <path d="M15 11h6v2h-6M6 9V6h5v3" />
    </>,
  ),
  viewer3d: icon(
    <>
      <path d="M12 3 20 7.5v9L12 21l-8-4.5v-9z" />
      <path d="M4 7.5 12 12l8-4.5M12 12v9" strokeDasharray="2 2" />
    </>,
  ),
  search: icon(
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-4.2-4.2" />
    </>,
  ),
  grid: icon(
    <>
      <rect x="4" y="4" width="6" height="6" rx="1" />
      <rect x="14" y="4" width="6" height="6" rx="1" />
      <rect x="4" y="14" width="6" height="6" rx="1" />
      <rect x="14" y="14" width="6" height="6" rx="1" />
    </>,
  ),
  plus: icon(<path d="M12 5v14M5 12h14" />),
  close: icon(<path d="M6 6l12 12M18 6 6 18" />),
  star: icon(<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />),
  chevron: icon(<path d="m9 6 6 6-6 6" />),
  pointer: icon(<path d="M5 3l14 7-6 2-2 6z" />),
  hand: icon(
    <path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V12M11 11V4.5a1.5 1.5 0 0 1 3 0V12M14 11V6a1.5 1.5 0 0 1 3 0v8a6 6 0 0 1-6 6h-1a6 6 0 0 1-5-2.7L3 15a1.5 1.5 0 0 1 2.5-1.6L8 16" />,
  ),
  fit: icon(
    <>
      <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
      <rect x="9" y="9" width="6" height="6" rx="1" />
    </>,
  ),
  section: icon(
    <>
      <rect x="4" y="4" width="16" height="16" rx="1" />
      <path d="M4 14 14 4M10 20 20 10M4 20 20 4" />
    </>,
  ),
  ruler: icon(
    <>
      <path d="m3 17 14-14 4 4L7 21z" />
      <path d="m7 13 2 2M10 10l2 2M13 7l2 2" />
    </>,
  ),
  edit: icon(<path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" />),
  filter: icon(<path d="M4 5h16l-6 8v5l-4 2v-7z" />),
  link: icon(
    <>
      <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
      <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
    </>,
  ),
  trace: icon(
    <>
      <circle cx="5" cy="6" r="2" />
      <circle cx="19" cy="6" r="2" />
      <circle cx="12" cy="18" r="2" />
      <path d="M7 6h10M6 8l5 8M18 8l-5 8" />
    </>,
  ),
  play: icon(<path d="M7 5v14l11-7z" />),
  save: icon(
    <>
      <path d="M5 4h11l3 3v13H5z" />
      <path d="M8 4v5h7V4M8 20v-6h8v6" />
    </>,
  ),
  compare: icon(<path d="M8 4v16M16 4v16M4 8h4M16 16h4M4 16h4M16 8h4" />),
  sliders: icon(<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4" />),
  clipboard: icon(
    <>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 4h6v3H9zM9 12h6M9 16h4" />
    </>,
  ),
  review: icon(
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12 3 3 5-6" />
    </>,
  ),
  scenario: icon(
    <>
      <path d="M12 3v10" />
      <path d="m8 9 4 4 4-4" />
      <path d="M4 17h16v3H4z" />
    </>,
  ),
  database: icon(
    <>
      <ellipse cx="12" cy="5.5" rx="7" ry="2.5" />
      <path d="M5 5.5v13c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-13M5 12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5" />
    </>,
  ),
  panelLeft: icon(
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16" />
    </>,
  ),
  panelRight: icon(
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M15 4v16" />
    </>,
  ),
  panelBottom: icon(
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 15h18" />
    </>,
  ),
  alert: icon(
    <>
      <path d="M12 4 2.5 20h19z" />
      <path d="M12 10v4.5M12 17.5v.01" />
    </>,
  ),
  info: icon(
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5M12 7.5v.01" />
    </>,
  ),
  open: icon(
    <>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <path d="M12 11v5M9.5 13.5 12 11l2.5 2.5" />
    </>,
  ),
  reset: icon(
    <>
      <path d="M4 12a8 8 0 1 0 2.4-5.7" />
      <path d="M4 4v4.5h4.5" />
    </>,
  ),
  pin: icon(
    <>
      <path d="M9 4h6l-1 6 3 3H7l3-3z" />
      <path d="M12 16v5" />
    </>,
  ),
  external: icon(
    <>
      <path d="M14 4h6v6M20 4l-9 9" />
      <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
    </>,
  ),
  split: icon(
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M12 4v16" />
    </>,
  ),
  display: icon(
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>,
  ),
  menu: icon(<path d="M4 6h16M4 12h16M4 18h16" />),
  windows: icon(
    <>
      <rect x="3" y="7" width="13" height="12" rx="1.5" />
      <path d="M8 7V5a1 1 0 0 1 1-1h11a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-4" />
    </>,
  ),
  chat: icon(<path d="M4 5h16v11H9l-5 4z" />),
  zoomIn: icon(
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-4.2-4.2M11 8v6M8 11h6" />
    </>,
  ),
  zoomOut: icon(
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-4.2-4.2M8 11h6" />
    </>,
  ),
  wireframe: icon(
    <>
      <path d="M12 3 20 7.5v9L12 21l-8-4.5v-9z" />
      <path d="M4 7.5 12 12l8-4.5M12 12v9M12 3v9" strokeDasharray="2 2" />
    </>,
  ),
}

export function iconForType(type: string): IconComponent {
  switch (type) {
    case 'assembly':
      return Icons.assembly
    case 'part':
      return Icons.cube
    case 'requirement':
      return Icons.requirement
    case 'procedure':
      return Icons.procedure
    default:
      return Icons.info
  }
}
