"use client";
import { useEffect, useState } from "react";

/**
 * User-selectable odds display format. Stored client-side (localStorage) and
 * broadcast so every odds display updates live when it changes. All odds in
 * the app are DECIMAL at the source; this only changes presentation.
 */
export type OddsFormat = "decimal" | "fractional" | "american";

const KEY = "sw_odds_format";
const EVENT = "sw-odds-format";

export function getOddsFormat(): OddsFormat {
  if (typeof window === "undefined") return "decimal";
  const v = window.localStorage.getItem(KEY);
  return v === "fractional" || v === "american" ? v : "decimal";
}

export function setOddsFormat(f: OddsFormat): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, f);
  window.dispatchEvent(new Event(EVENT));
}

/** Reactive read — re-renders the caller whenever the format changes. */
export function useOddsFormat(): OddsFormat {
  const [fmt, setFmt] = useState<OddsFormat>("decimal");
  useEffect(() => {
    setFmt(getOddsFormat());
    const on = () => setFmt(getOddsFormat());
    window.addEventListener(EVENT, on);
    window.addEventListener("storage", on);
    return () => {
      window.removeEventListener(EVENT, on);
      window.removeEventListener("storage", on);
    };
  }, []);
  return fmt;
}

/** Reduce a decimal-fraction (odds − 1) to a simple whole-number fraction. */
function toFraction(x: number): string {
  if (!Number.isFinite(x) || x <= 0) return "0";
  let bestN = 1, bestD = 1, bestErr = Infinity;
  for (let d = 1; d <= 20; d++) {
    const n = Math.round(x * d);
    if (n <= 0) continue;
    const err = Math.abs(x - n / d);
    if (err < bestErr) { bestErr = err; bestN = n; bestD = d; }
    if (err < 1e-9) break;
  }
  const g = (a: number, b: number): number => (b ? g(b, a % b) : a);
  const div = g(bestN, bestD) || 1;
  return `${bestN / div}/${bestD / div}`;
}

/**
 * Format a DECIMAL odds value in the chosen display format:
 *   decimal    → 1.85
 *   fractional → 17/20
 *   american   → +185 / −140
 */
export function formatOdds(decimal: number | null | undefined, fmt: OddsFormat): string {
  if (decimal == null || !Number.isFinite(Number(decimal))) return "—";
  const d = Number(decimal);
  if (fmt === "decimal") return String(d);
  if (fmt === "fractional") return toFraction(d - 1);
  // american
  if (d >= 2) return `+${Math.round((d - 1) * 100)}`;
  return `−${Math.round(100 / (d - 1))}`;
}
