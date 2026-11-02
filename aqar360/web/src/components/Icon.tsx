/** Line icons for the website (24 × 24, stroke = currentColor), drawn in the style of the customer design. */
const PATHS = {
  home: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4",
  tag: "M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9zM7.5 7.5h.01",
  building: "M4 21V8l6-4v17M10 21V4l10 5v12M2 21h20M14 11h2M14 15h2",
  map: "M9 4 3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14",
  camera: "M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1zM12 17a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z",
  pin: "M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  doc: "M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h5",
  calc: "M6 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM8 7h8M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01",
  chat: "M4 5h16v11H9l-5 4z",
  phone: "M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1z",
  briefcase: "M3 8h18v12H3zM8 8V5h8v3M3 13h18",
  users: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2 20a7 7 0 0 1 14 0M16 4.5a3.5 3.5 0 0 1 0 6.5M18 13.5a6 6 0 0 1 4 6.5",
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5M12 8h.01",
  layers: "m12 3 9 5-9 5-9-5zM3 13l9 5 9-5",
  bed: "M3 18V7M3 13h18v5M21 13a3 3 0 0 0-3-3h-7v3M7 12a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z",
  size: "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5",
  mail: "M3 6h18v12H3zM3 7l9 6 9-6",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
  instagram: "M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM17.5 6.5h.01",
  facebook: "M14 21v-8h3l.5-3.5H14V8c0-1 .4-1.6 1.7-1.6H18V3.3A24 24 0 0 0 15.3 3C12.8 3 11 4.5 11 7.3v2.2H8V13h3v8",
  threads: "M16.5 11.3c-.4-2.4-2-3.6-4.3-3.6-2.6 0-4 1.8-4 1.8M15.6 12.4c-2.6-.6-6.1-.3-6.1 2.1 0 2.4 4.3 2.6 5.6.5 1.7-2.7.6-6.3.6-6.3M12.2 21C7 21 4 17.6 4 12s3-9 8.2-9c4.6 0 7 2.6 7.8 5.6M20 15.5c-.6 3.4-3.6 5.5-7.8 5.5",
  whatsapp: "M4 20l1.3-4A8 8 0 1 1 8.3 19zM9 8.5c0 3.5 3 6.5 6.5 6.5l1.2-1.6-2.2-1-1 .8a5 5 0 0 1-2.2-2.2l.8-1-1-2.2z",
  arrow: "M5 12h14M13 6l6 6-6 6",
} as const;
export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true" focusable="false">
      <path d={PATHS[name]} />
    </svg>
  );
}
