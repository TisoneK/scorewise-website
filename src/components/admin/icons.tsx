/**
 * Brand + custom icons used across the admin dashboard.
 *
 * Extracted from src/app/page.tsx during the Phase A modularization.
 */

import React from "react";

/**
 * The ScoreWise basketball icon — a stylized basketball SVG.
 * Uses currentColor so it inherits text color from the parent.
 */
export function BasketballIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2a14.5 14.5 0 0 0 0 20" />
      <path d="M12 2a14.5 14.5 0 0 1 0 20" />
      <path d="M2 12h20" />
    </svg>
  );
}
