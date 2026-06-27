/**
 * analytics.ts — Pure prediction-analytics computation.
 * Filters NO_BET, uses Number() coercion, computes hit rate/ROI/streaks.
 */
import type { Prediction } from "@/lib/types";
import { computeOverUnderOutcome, computeWinnerOutcome } from "@/lib/result-utils";
import { parseMatchDateTime, localDateKey } from "@/lib/timezone";

export type AlgorithmType = "TOTALS" | "WINNER";
export interface Bucket { total: number; wins: number; losses: number; pushes: number; pending: number; hitRate: number; profit: number; roiPercent: number; }
export interface LeagueBucket extends Bucket { league: string; country: string; }
export interface DailyBucket { dateKey: string; label: string; total: number; wins: number; losses: number; pushes: number; hitRate: number; profit: number; }
export interface StreakInfo { type: "W" | "L" | "P" | null; length: number; }
export interface CalibrationRow { confidence: "HIGH" | "MEDIUM" | "LOW"; sample: number; wins: number; losses: number; actualHitRate: number; expectedHitRate: number; }
export interface ScatterPoint { line: number; total: number; outcome: "W" | "L" | "P"; confidence: "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN"; }
export interface DeviationBucket { range: string; count: number; direction: "wrong" | "right"; }
export interface AnalyticsSummary {
  algorithm: AlgorithmType; totalPredictions: number; resolved: number; pending: number;
  wins: number; losses: number; pushes: number; hitRate: number; roiPercent: number; totalStaked: number; totalProfit: number;
  currentStreak: StreakInfo; longestWinStreak: number; longestLossStreak: number; recentForm: ("W" | "L" | "P")[];
  byConfidence: Record<"HIGH" | "MEDIUM" | "LOW", Bucket>; byRecommendation: Record<"OVER" | "UNDER", Bucket>;
  byLeague: LeagueBucket[]; daily: DailyBucket[]; lineDeviation: DeviationBucket[]; calibration: CalibrationRow[]; scatter: ScatterPoint[];
}
const EXPECTED: Record<"HIGH" | "MEDIUM" | "LOW", number> = { HIGH: 70, MEDIUM: 55, LOW: 40 };
const EDGES = [-30, -25, -20, -15, -10, -5, 0, 5, 10, 15, 20, 25, 30];
function eb(): Bucket { return { total: 0, wins: 0, losses: 0, pushes: 0, pending: 0, hitRate: 0, profit: 0, roiPercent: 0 }; }
function fin(b: Bucket) { const s = b.wins + b.losses; b.total = b.wins + b.losses + b.pushes; b.hitRate = s > 0 ? (b.wins / s) * 100 : 0; b.roiPercent = s > 0 ? (b.profit / s) * 100 : 0; }
function cf(p: Prediction): "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN" { const c = p.confidence?.toUpperCase(); return c === "HIGH" || c === "MEDIUM" || c === "LOW" ? c : "UNKNOWN"; }
function fd(dk: string): string { const [, m, d] = dk.split("-").map(Number); if (!m || !d) return dk; return ["","Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][m] + " " + d; }
function fdev(dev: number) { for (let i = 0; i < EDGES.length - 1; i++) { if (dev >= EDGES[i] && dev < EDGES[i+1]) return { range: `${EDGES[i]} to ${EDGES[i+1]}`, direction: dev >= 0 ? "right" as const : "wrong" as const }; } return dev <= EDGES[0] ? { range: `${EDGES[0]} to ${EDGES[1]}`, direction: "wrong" as const } : { range: `${EDGES[EDGES.length-2]} to ${EDGES[EDGES.length-1]}`, direction: "right" as const }; }

export function computeAnalytics(preds: Prediction[], algorithm: AlgorithmType): AnalyticsSummary {
  const isQual = algorithm === "TOTALS" ? (p: Prediction) => { const r = p.recommendation?.toUpperCase(); return r === "OVER" || r === "UNDER"; } : (p: Prediction) => { const w = p.team_winner?.toUpperCase(); return w === "HOME_TEAM" || w === "AWAY_TEAM"; };
  const oFn = algorithm === "TOTALS" ? (p: Prediction) => { const o = computeOverUnderOutcome(p); return o === "MISSING" ? "MISSING" : o; } : (p: Prediction) => { const o = computeWinnerOutcome(p); return o === "MISSING" ? "MISSING" : o; };
  const pFn = algorithm === "TOTALS" ? (p: Prediction, o: string) => { if (o === "PUSH") return 0; if (o === "LOSS") return -1; if (o === "WIN") { const r = p.recommendation?.toUpperCase(); const od = r === "OVER" ? p.over_odds : r === "UNDER" ? p.under_odds : null; if (od == null) return 0; const n = Number(od); return n > 0 ? n - 1 : 0; } return 0; } : (p: Prediction, o: string) => { if (o === "PUSH") return 0; if (o === "LOSS") return -1; if (o === "WIN") { const w = p.team_winner?.toUpperCase(); const od = w === "HOME_TEAM" ? p.home_odds : w === "AWAY_TEAM" ? p.away_odds : null; if (od == null) return 0; const n = Number(od); return n > 0 ? n - 1 : 0; } return 0; };
  const qual = preds.filter(isQual);
  const bc: Record<"HIGH"|"MEDIUM"|"LOW", Bucket> = { HIGH: eb(), MEDIUM: eb(), LOW: eb() };
  const br: Record<"OVER"|"UNDER", Bucket> = { OVER: eb(), UNDER: eb() };
  const lm = new Map<string, Bucket & { league: string; country: string }>();
  const dm = new Map<string, Bucket>();
  const dvm = new Map<string, DeviationBucket>();
  const sc: ScatterPoint[] = [];
  let res = 0, pend = 0, w = 0, l = 0, pu = 0, ts = 0, tp = 0;
  const chrono: Prediction[] = [];
  for (const p of qual) {
    const o = oFn(p); const c = cf(p); const r = p.recommendation?.toUpperCase(); const md = parseMatchDateTime(p.date, p.time);
    if (o === "MISSING") { pend++; if (c !== "UNKNOWN") bc[c].pending++; if (algorithm === "TOTALS" && (r === "OVER" || r === "UNDER")) br[r].pending++; const lk = (p.league || "Unknown").trim() || "Unknown"; const ck = (p.country || "").trim(); const k = `${ck}::${lk}`; if (!lm.has(k)) lm.set(k, { ...eb(), league: lk, country: ck }); lm.get(k)!.pending++; continue; }
    res++; const pr = pFn(p, o); tp += pr;
    if (o === "WIN") w++; if (o === "LOSS") l++; if (o === "PUSH") pu++; if (o === "WIN" || o === "LOSS") ts++;
    if (c !== "UNKNOWN") { const b = bc[c]; if (o === "WIN") b.wins++; if (o === "LOSS") b.losses++; if (o === "PUSH") b.pushes++; b.profit += pr; }
    if (algorithm === "TOTALS" && (r === "OVER" || r === "UNDER")) { const b = br[r]; if (o === "WIN") b.wins++; if (o === "LOSS") b.losses++; if (o === "PUSH") b.pushes++; b.profit += pr; }
    const lk = (p.league || "Unknown").trim() || "Unknown"; const ck = (p.country || "").trim(); const k = `${ck}::${lk}`;
    if (!lm.has(k)) lm.set(k, { ...eb(), league: lk, country: ck }); const lb = lm.get(k)!; if (o === "WIN") lb.wins++; if (o === "LOSS") lb.losses++; if (o === "PUSH") lb.pushes++; lb.profit += pr;
    if (md) { const dk = localDateKey(md); if (!dm.has(dk)) dm.set(dk, eb()); const db = dm.get(dk)!; if (o === "WIN") db.wins++; if (o === "LOSS") db.losses++; if (o === "PUSH") db.pushes++; db.profit += pr; }
    if (algorithm === "TOTALS" && p.bookmaker_line != null && p.home_score != null && p.away_score != null) { const at = Number(p.home_score) + Number(p.away_score); const ln = Number(p.bookmaker_line); const dv = r === "OVER" ? at - ln : r === "UNDER" ? ln - at : 0; const bk = fdev(dv); if (!dvm.has(bk.range)) dvm.set(bk.range, { range: bk.range, count: 0, direction: bk.direction }); dvm.get(bk.range)!.count++; sc.push({ line: ln, total: at, outcome: o === "WIN" ? "W" : o === "LOSS" ? "L" : "P", confidence: c }); }
    chrono.push(p);
  }
  for (const k of ["HIGH","MEDIUM","LOW"] as const) fin(bc[k]); fin(br.OVER); fin(br.UNDER);
  const byLeague = Array.from(lm.values()).map(b => { fin(b); return { ...b } as LeagueBucket; }).filter(b => b.total + b.pending > 0).sort((a, b) => (b.total + b.pending) - (a.total + a.pending)).slice(0, 15);
  const sd = Array.from(dm.keys()).sort();
  const daily = sd.slice(-30).map(dk => { const b = dm.get(dk)!; fin(b); return { dateKey: dk, label: fd(dk), total: b.total, wins: b.wins, losses: b.losses, pushes: b.pushes, hitRate: b.hitRate, profit: b.profit }; });
  const ld = EDGES.slice(0,-1).map((e,i) => { const lb = `${e} to ${EDGES[i+1]}`; const f = dvm.get(lb); return f ?? { range: lb, count: 0, direction: e >= 0 ? "right" as const : "wrong" as const }; });
  const cal = (["HIGH","MEDIUM","LOW"] as const).map(c => { const b = bc[c]; return { confidence: c, sample: b.wins + b.losses, wins: b.wins, losses: b.losses, actualHitRate: b.hitRate, expectedHitRate: EXPECTED[c] }; });
  chrono.sort((a, b) => { const da = parseMatchDateTime(a.date, a.time); const db = parseMatchDateTime(b.date, b.time); if (da && db) return da.getTime() - db.getTime(); if (da) return -1; if (db) return 1; return 0; });
  const seq: ("W"|"L"|"P")[] = []; for (const p of chrono) { const o = oFn(p); if (o === "WIN") seq.push("W"); if (o === "LOSS") seq.push("L"); if (o === "PUSH") seq.push("P"); }
  const rf = seq.slice(-30);
  let cs: StreakInfo = { type: null, length: 0 }; if (seq.length > 0) { const last = seq[seq.length-1]; let len = 0; for (let i = seq.length-1; i >= 0; i--) { if (seq[i] === last) len++; else break; } cs = { type: last, length: len }; }
  let lws = 0, lls = 0, cw = 0, cl = 0; for (const s of seq) { if (s === "W") { cw++; cl = 0; lws = Math.max(lws, cw); } else if (s === "L") { cl++; cw = 0; lls = Math.max(lls, cl); } else { cw = 0; cl = 0; } }
  const hr = (w + l) > 0 ? (w / (w + l)) * 100 : 0; const roi = ts > 0 ? (tp / ts) * 100 : 0;
  return { algorithm, totalPredictions: qual.length, resolved: res, pending: pend, wins: w, losses: l, pushes: pu, hitRate: hr, roiPercent: roi, totalStaked: ts, totalProfit: tp, currentStreak: cs, longestWinStreak: lws, longestLossStreak: lls, recentForm: rf, byConfidence: bc, byRecommendation: br, byLeague, daily, lineDeviation: ld, calibration: cal, scatter: sc };
}

export function computePublicStats(totals: AnalyticsSummary, winner: AnalyticsSummary) {
  const r = totals.resolved + winner.resolved, w = totals.wins + winner.wins, l = totals.losses + winner.losses, pu = totals.pushes + winner.pushes, ts = totals.totalStaked + winner.totalStaked, tp = totals.totalProfit + winner.totalProfit;
  const hr = (w + l) > 0 ? (w / (w + l)) * 100 : 0; const roi = ts > 0 ? (tp / ts) * 100 : 0;
  const rf = [...totals.recentForm, ...winner.recentForm].slice(-30);
  const tsLen = totals.currentStreak.length || 0, wsLen = winner.currentStreak.length || 0;
  return { totalPredictions: totals.totalPredictions + winner.totalPredictions, resolved: r, pending: totals.pending + winner.pending, wins: w, losses: l, pushes: pu, hitRate: hr, roiPercent: roi, totalStaked: ts, totalProfit: tp, currentStreak: tsLen >= wsLen ? totals.currentStreak : winner.currentStreak, longestWinStreak: Math.max(totals.longestWinStreak, winner.longestWinStreak), longestLossStreak: Math.max(totals.longestLossStreak, winner.longestLossStreak), recentForm: rf };
}
