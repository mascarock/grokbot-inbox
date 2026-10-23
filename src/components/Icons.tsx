export function LogoMark() {
  return (
    <svg className="logo" viewBox="0 0 32 32" aria-hidden="true">
      <rect className="logo-bg" width="32" height="32" rx="9" />
      <path className="logo-stroke" d="M7 12h18v10H7z" fill="none" strokeWidth="1.6" />
      <path
        className="logo-stroke"
        d="M7.4 12.6 16 18.4l8.6-5.8"
        fill="none"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function SearchIcon() {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="11" cy="11" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M16 16.5 20 20.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export function PaperclipIcon() {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M8.2 12.4 14.6 6a3 3 0 0 1 4.2 4.2l-8 8.1a4.2 4.2 0 0 1-6-5.9l7.2-7.3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function SunIcon() {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6 6l1.6 1.6M16.4 16.4 18 18M18 6l-1.6 1.6M7.6 16.4 6 18"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function StarIcon({ filled = false }: { filled?: boolean }) {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="m12 3.6 2.6 5.4 5.9.8-4.3 4.1 1.1 5.9L12 17l-5.3 2.8 1.1-5.9-4.3-4.1 5.9-.8Z"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ArchiveIcon() {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 5.5h16v4H4zM5.5 9.5v9h13v-9M10 13h4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

export function ReplyIcon() {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M9.5 6.5 4.5 11l5 4.5M5 11h8.5a5.5 5.5 0 0 1 5.5 5.5v1"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function PenIcon() {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M14.5 5.5 18.5 9.5 9 19H5v-4l9.5-9.5ZM13 7l4 4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function RefreshIcon() {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M19 12a7 7 0 1 1-2.1-5M19 4.5v4h-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CloseIcon() {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="m6 6 12 12M18 6 6 18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export function MoonIcon() {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M15.5 3.8A7.8 7.8 0 1 0 20.2 14 6.2 6.2 0 0 1 15.5 3.8Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}
