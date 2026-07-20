"use client";
import { useEffect, useState } from "react";

/**
 * Favorite teams — stored on the device (localStorage) and broadcast so every
 * star + filter updates live. Device-scoped for now (no account sync yet);
 * the API can be swapped to a server store later without touching callers.
 */
const KEY = "sw_fav_teams";
const EVENT = "sw-favorites";

function read(): string[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(window.localStorage.getItem(KEY) || "[]"); } catch { return []; }
}
function write(list: string[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(list));
  window.dispatchEvent(new Event(EVENT));
}

export function getFavoriteTeams(): string[] { return read(); }

export function toggleFavoriteTeam(name?: string | null): void {
  const n = (name || "").trim();
  if (!n) return;
  const list = read();
  const i = list.findIndex((t) => t.toLowerCase() === n.toLowerCase());
  if (i >= 0) list.splice(i, 1); else list.push(n);
  write(list);
}

/** Reactive favorites list — re-renders callers on any change. */
export function useFavoriteTeams(): string[] {
  const [list, setList] = useState<string[]>([]);
  useEffect(() => {
    setList(read());
    const on = () => setList(read());
    window.addEventListener(EVENT, on);
    window.addEventListener("storage", on);
    return () => { window.removeEventListener(EVENT, on); window.removeEventListener("storage", on); };
  }, []);
  return list;
}

/** True if either team of a match is a favorite (case-insensitive). */
export function matchHasFavorite(favs: string[], home?: string | null, away?: string | null): boolean {
  if (favs.length === 0) return false;
  const l = favs.map((t) => t.toLowerCase());
  return (!!home && l.includes(home.toLowerCase())) || (!!away && l.includes(away.toLowerCase()));
}
