import React from 'react';

export default function SiteLogo({ className = '' }) {
  return (
    <svg
      className={className}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="7" y="11" width="50" height="42" rx="4.5" stroke="currentColor" strokeWidth="3.5" />
      <path d="M7 21H57" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />

      <circle cx="13" cy="16" r="1.5" fill="currentColor" />
      <circle cx="17.5" cy="16" r="1.5" fill="currentColor" />
      <circle cx="22" cy="16" r="1.5" fill="currentColor" />

      <rect x="11" y="28" width="4" height="16" rx="0.75" fill="currentColor" />
      <rect x="16" y="24" width="4" height="20" rx="0.75" fill="currentColor" />
      <rect x="21" y="31" width="4" height="13" rx="0.75" fill="currentColor" />

      <rect x="29" y="29" width="11" height="2.6" rx="1.3" fill="currentColor" />
      <rect x="29" y="34" width="11" height="2.6" rx="1.3" fill="currentColor" />
      <rect x="29" y="39" width="11" height="2.6" rx="1.3" fill="currentColor" />

      <path d="M48 23V16A7 7 0 1 1 41 23H48Z" fill="currentColor" />
      <path d="M48 39V32A7 7 0 1 0 55 39H48Z" fill="currentColor" />
    </svg>
  );
}
