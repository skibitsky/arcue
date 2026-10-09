import type { ReactNode } from "react";

const filled = { fill: "currentColor", stroke: "none" } as const;

const paths = {
  view: (
    <path d="M4.04 4.69a.5.5 0 0 1 .65-.65l16 6.5a.5.5 0 0 1-.06.95l-6.13 1.58a2 2 0 0 0-1.44 1.44l-1.58 6.12a.5.5 0 0 1-.95.07z" />
  ),
  comment: (
    <>
      <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
      <path d="M8 12h8M12 8v8" />
    </>
  ),
  lit: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2.5 12h2M19.5 12h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4" />
    </>
  ),
  clay: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8.3 9.4a4.6 4.6 0 0 1 3.3-2.5" />
    </>
  ),
  wireframe: (
    <>
      <path d="M12 2.8l8 4.4v9.6l-8 4.4-8-4.4V7.2z" />
      <path d="M4 7.2l8 4.4 8-4.4M12 11.6V21M4 16.8l8-5.2 8 5.2" />
    </>
  ),
  skeleton: (
    <>
      <circle cx="12" cy="4.8" r="2" />
      <path d="M12 7v6.5M12 13.5L8.5 20M12 13.5l3.5 6.5M6 10.2h12" />
    </>
  ),
  frame: (
    <>
      <path d="M4 8.5v-3A1.5 1.5 0 0 1 5.5 4h3M15.5 4h3A1.5 1.5 0 0 1 20 5.5v3M20 15.5v3a1.5 1.5 0 0 1-1.5 1.5h-3M8.5 20h-3A1.5 1.5 0 0 1 4 18.5v-3" />
      <circle cx="12" cy="12" r="2.5" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.2M12 7.8v.1" />
    </>
  ),
  play: <path d="M7.5 5.2v13.6a.9.9 0 0 0 1.37.77l11-6.8a.9.9 0 0 0 0-1.54l-11-6.8a.9.9 0 0 0-1.37.77z" {...filled} />,
  pause: (
    <>
      <rect x="6.5" y="5" width="4" height="14" rx="1.2" {...filled} />
      <rect x="13.5" y="5" width="4" height="14" rx="1.2" {...filled} />
    </>
  ),
  stepBack: (
    <>
      <path d="M18 6.3v11.4a.8.8 0 0 1-1.26.66l-7.6-5.4a1 1 0 0 1 0-1.62l7.6-5.4A.8.8 0 0 1 18 6.3z" {...filled} />
      <path d="M6.5 6v12" />
    </>
  ),
  stepForward: (
    <>
      <path d="M6 6.3v11.4a.8.8 0 0 0 1.26.66l7.6-5.4a1 1 0 0 0 0-1.62l-7.6-5.4A.8.8 0 0 0 6 6.3z" {...filled} />
      <path d="M17.5 6v12" />
    </>
  ),
  loop: (
    <>
      <path d="M17 2.5l3.5 3.5L17 9.5" />
      <path d="M3.5 11v-.5A4.5 4.5 0 0 1 8 6h12.5" />
      <path d="M7 21.5L3.5 18 7 14.5" />
      <path d="M20.5 13v.5A4.5 4.5 0 0 1 16 18H3.5" />
    </>
  ),
  copy: (
    <>
      <rect x="8.5" y="8.5" width="12.5" height="12.5" rx="2.5" />
      <path d="M15.5 8.5V6A2.5 2.5 0 0 0 13 3.5H6A2.5 2.5 0 0 0 3.5 6v7A2.5 2.5 0 0 0 6 15.5h2.5" />
    </>
  ),
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  x: <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />,
  plus: <path d="M12 5v14M5 12h14" />,
  chevronDown: <path d="M6.5 9.5L12 15l5.5-5.5" />,
  chevronRight: <path d="M9.5 6.5L15 12l-5.5 5.5" />,
  trash: (
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12.2A2 2 0 0 0 9 21h6a2 2 0 0 0 2-1.8L18 7M9 7V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V7" />
  ),
  send: <path d="M12 19V5.5M5.8 11.5L12 5.3l6.2 6.2" />,
  cube: (
    <>
      <path d="M12 2.8l8 4.4v9.6l-8 4.4-8-4.4V7.2z" />
      <path d="M4 7.2l8 4.4 8-4.4M12 11.6V21" />
    </>
  ),
  sent: (
    <>
      <path d="M21 3L10.5 13.5" />
      <path d="M21 3l-6.5 18-4-7.5-7.5-4z" />
    </>
  ),
  reopen: (
    <>
      <path d="M3.5 12a8.5 8.5 0 1 0 2.5-6L3.5 8.5" />
      <path d="M3.5 4v4.5H8" />
    </>
  ),
  upload: (
    <>
      <path d="M12 15V4M7 9l5-5 5 5" />
      <path d="M4 14.5v3A2.5 2.5 0 0 0 6.5 20h11a2.5 2.5 0 0 0 2.5-2.5v-3" />
    </>
  ),
  folder: <path d="M3.5 7.5A2 2 0 0 1 5.5 5.5h4l2 2.2h7a2 2 0 0 1 2 2v7.8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />,
  pin: (
    <>
      <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" />
      <circle cx="12" cy="10" r="2.3" />
    </>
  ),
  region: (
    <path d="M6.5 17.5c-2.6-1.6-3.4-4.6-1.9-7.2C6.4 7 10.2 5 14.3 5.6c3.8.6 6.4 3.1 5.6 6.2-.8 3-4 4.8-7.6 5-2 .1-3.6-.2-5.8.7z" />
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  film: (
    <>
      <rect x="3.5" y="4" width="17" height="16" rx="2.5" />
      <path d="M7.5 4v16M16.5 4v16M3.5 9h4M3.5 15h4M16.5 9h4M16.5 15h4" />
    </>
  ),
  range: <path d="M8.5 5H6v14h2.5M15.5 5H18v14h-2.5" />,
  follow: (
    <>
      <path d="M9 14l-4.5-4.5L9 5" />
      <path d="M4.5 9.5H14a5.5 5.5 0 0 1 0 11h-2" />
    </>
  ),
  alert: (
    <>
      <path d="M10.3 4.2L2.9 17.5A2 2 0 0 0 4.6 20.5h14.8a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0z" />
      <path d="M12 9.5v4.2M12 16.8v.1" />
    </>
  ),
  image: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
      <circle cx="9" cy="10" r="1.8" />
      <path d="M20.5 16l-5-5-9 8.5" />
    </>
  ),
  outline: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
      <path d="M9.5 4.5v15" />
    </>
  ),
  layers: (
    <>
      <path d="M12 3.5l8.5 4.5L12 12.5 3.5 8z" />
      <path d="M3.5 12L12 16.5 20.5 12" />
      <path d="M3.5 16L12 20.5 20.5 16" />
    </>
  ),
  tab: (
    <>
      <rect x="3.5" y="5.5" width="17" height="14" rx="2.5" />
      <path d="M3.5 9.5h17M12 12.5v4.5M9.8 14.8h4.4" />
    </>
  ),
  eye: (
    <>
      <path d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12s-3.5 6.5-9.5 6.5S2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="2.8" />
    </>
  ),
  eyeOff: (
    <>
      <path d="M4 4l16 16" />
      <path d="M9.9 5.8A9.7 9.7 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-2.6 3.4M6.6 7.1C4 8.8 2.5 12 2.5 12s3.5 6.5 9.5 6.5c1.5 0 2.9-.4 4.1-1" />
    </>
  ),
  link: (
    <>
      <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
      <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
    </>
  ),
  bone: (
    <>
      <path d="M8 16l8-8" />
      <circle cx="6.2" cy="17.8" r="2.3" />
      <circle cx="17.8" cy="6.2" r="2.3" />
    </>
  ),
  mesh: <path d="M12 4.5l7.5 13h-15z" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6" />
      <path d="M15.5 15.5L20 20" />
    </>
  ),
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof paths;

export function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg
      className={className ? `ic ${className}` : "ic"}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
