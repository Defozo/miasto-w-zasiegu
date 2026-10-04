import type { SVGProps } from "react";
import "./brand.css";

/** The same route symbol is used in the wordmark, app and install icon. */
export default function BrandMark({
  className = "",
  ...props
}: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className={`brand-symbol ${className}`}
      {...props}
    >
      <rect width="64" height="64" rx="19" fill="currentColor" />
      <path
        d="M18 46V31a13 13 0 0 1 13-13h15M37 9l9 9-9 9M18 46h14a13 13 0 0 0 13-13"
        stroke="var(--brand-accent, #d7f36b)"
        strokeWidth="4.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="18" cy="46" r="4" fill="var(--brand-accent, #d7f36b)" />
    </svg>
  );
}
