"use client";

/** The browser's print dialog also offers "Save as PDF". */
export function PrintButton({ label }: { label: string }) {
  return <button type="button" className="a-btn small" onClick={() => window.print()}>🖨 {label}</button>;
}
