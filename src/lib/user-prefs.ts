"use client";

/**
 * Client-side user preferences (localStorage). Only preferences that actually
 * drive behavior live here — no placeholder switches.
 */

export type DefaultTab = "predictions" | "results" | "stats";

const TAB_KEY = "sw_default_tab";
const ALERTS_KEY = "sw_alerts_enabled";
const ALERTS_LEAD_KEY = "sw_alerts_lead_min";

export function getDefaultTab(): DefaultTab {
  if (typeof window === "undefined") return "predictions";
  const v = window.localStorage.getItem(TAB_KEY);
  return v === "results" || v === "stats" ? v : "predictions";
}
export function setDefaultTab(t: DefaultTab): void {
  if (typeof window !== "undefined") window.localStorage.setItem(TAB_KEY, t);
}

export function getAlertsEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(ALERTS_KEY) === "true";
}
export function setAlertsEnabled(on: boolean): void {
  if (typeof window !== "undefined") window.localStorage.setItem(ALERTS_KEY, on ? "true" : "false");
}

/** Minutes before kickoff to fire an alert. */
export function getAlertsLead(): number {
  if (typeof window === "undefined") return 30;
  const n = Number(window.localStorage.getItem(ALERTS_LEAD_KEY));
  return [15, 30, 60].includes(n) ? n : 30;
}
export function setAlertsLead(min: number): void {
  if (typeof window !== "undefined") window.localStorage.setItem(ALERTS_LEAD_KEY, String(min));
}
