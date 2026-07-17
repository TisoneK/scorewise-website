import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db-libsql";

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/predictions/reduced-risk
 *
 * Manually set or clear the reduced-risk (alternative) lines for a prediction.
 *
 * WHY THIS EXISTS — the scraped source (e.g., Flashscore) sometimes reports
 * reduced-risk odds that diverge from the betting site's actual odds. A
 * scraped UNDER 178.5 @ 1.55 might be UNDER 178.5 @ 1.10 on the actual
 * bookmaker site — far below the user's break-even point. Admins and
 * operators need to manually enter the bookmaker's actual odds so users
 * see the real payout, and so the scraper doesn't overwrite the correction
 * on its next run (see /api/webhook/predictions — it skips writes when
 * reducedRiskSource === 'manual').
 *
 * Authorization: ADMIN or OPERATOR only (same gate as /api/admin/predictions/bet-code).
 *
 * Body: {
 *   matchId: string,                          // required, identifies the prediction
 *   reducedOverTotal?:  number | null,        // basketball total, e.g. 178.5
 *   reducedOverOdds?:   number | null,        // decimal odds, must be > 1.0
 *   reducedUnderTotal?: number | null,
 *   reducedUnderOdds?:  number | null,
 *   clear?: boolean                           // if true, set all 4 fields to null + source to null
 * }
 *
 * Validation:
 *   - matchId required, must be a non-empty string
 *   - if a total is provided, it must be > 0 (basketball totals are always positive)
 *   - if odds are provided, they must be > 1.0 (bookmaker odds can't be ≤ 1.0)
 *   - empty string / null / undefined for any field → null in DB (clears that field)
 *   - pairs are independent: you can set reducedOverTotal without reducedOverOdds,
 *     but a missing odds value when the total is set will be flagged (the admin
 *     UI prevents this client-side, but the API enforces it too)
 *
 * Returns: { ok: true, matchId, reducedRiskSource: "manual", updatedAt, values }
 */
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    const role = (session?.user as { role?: string })?.role;
    if (!session || (role !== "ADMIN" && role !== "OPERATOR")) {
      return NextResponse.json({ error: "Admin or operator access required" }, { status: 401 });
    }

    const body = await request.json();
    const { matchId, clear } = body;

    // ── matchId ───────────────────────────────────────────────────────
    if (!matchId || typeof matchId !== "string") {
      return NextResponse.json({ error: "matchId is required" }, { status: 400 });
    }

    // ── Check prediction exists ───────────────────────────────────────
    const existing = await db.prediction.findUnique({ where: { matchId } });
    if (!existing) {
      return NextResponse.json({ error: `No prediction found for matchId: ${matchId}` }, { status: 404 });
    }

    const userId = (session.user as { id?: string })?.id;

    // ── clear=true → null all 4 fields + reset audit ─────────────────
    if (clear === true) {
      await db.prediction.update({
        where: { matchId },
        data: {
          reducedOverTotal: null,
          reducedOverOdds: null,
          reducedUnderTotal: null,
          reducedUnderOdds: null,
          reducedRiskSource: null,
          reducedRiskUpdatedAt: new Date(),
          reducedRiskUpdatedBy: userId ?? null,
        },
      });

      try {
        if (userId) {
          await db.activityLog.create({
            data: {
              userId,
              action: "REDUCED_RISK_OVERRIDE_CLEARED",
              service: "website",
              details: JSON.stringify({
                matchId,
                homeTeam: existing.homeTeam,
                awayTeam: existing.awayTeam,
                previousSource: existing.reducedRiskSource,
              }),
            },
          });
        }
      } catch (logErr) {
        console.warn("[reduced-risk] ActivityLog write failed (clear):", logErr);
      }

      return NextResponse.json({
        ok: true,
        matchId,
        reducedRiskSource: null,
        updatedAt: new Date().toISOString(),
        values: {
          reducedOverTotal: null,
          reducedOverOdds: null,
          reducedUnderTotal: null,
          reducedUnderOdds: null,
        },
      });
    }

    // ── Parse + validate the 4 numeric fields ────────────────────────
    // Accept number, null, undefined, "" (treated as null), or numeric strings.
    const parseNum = (v: unknown): number | null => {
      if (v === null || v === undefined || v === "") return null;
      if (typeof v === "number") return Number.isFinite(v) ? v : null;
      if (typeof v === "string") {
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
      }
      return null;
    };

    // Only the reduced pair on the RECOMMENDED side is meaningful — an
    // UNDER pick has no use for a reduced OVER line and vice versa. Values
    // sent for the off side are ignored (stored as null); the response's
    // `values` object shows exactly what was stored.
    const rec = (existing.recommendation || "").toUpperCase();
    const reducedOverTotal = rec === "OVER" ? parseNum(body.reducedOverTotal) : null;
    const reducedOverOdds = rec === "OVER" ? parseNum(body.reducedOverOdds) : null;
    const reducedUnderTotal = rec === "UNDER" ? parseNum(body.reducedUnderTotal) : null;
    const reducedUnderOdds = rec === "UNDER" ? parseNum(body.reducedUnderOdds) : null;

    // ── Semantic validation ──────────────────────────────────────────
    // Totals must be > 0 (a basketball total can't be 0 or negative).
    // Odds must be > 1.0 (bookmaker decimal odds; ≤1.0 means guaranteed loss).
    const validatePair = (total: number | null, odds: number | null, label: string): string | null => {
      if (total != null && total <= 0) {
        return `${label} total must be greater than 0 (got ${total})`;
      }
      if (odds != null && odds <= 1.0) {
        return `${label} odds must be greater than 1.0 (got ${odds})`;
      }
      // Allow either field to be set independently — the UI sends pairs,
      // but the API tolerates partial updates so a future "set odds only"
      // flow doesn't need a separate endpoint.
      return null;
    };

    const overErr = validatePair(reducedOverTotal, reducedOverOdds, "Reduced OVER");
    if (overErr) return NextResponse.json({ error: overErr }, { status: 400 });

    const underErr = validatePair(reducedUnderTotal, reducedUnderOdds, "Reduced UNDER");
    if (underErr) return NextResponse.json({ error: underErr }, { status: 400 });

    // ── Directional sanity — a REDUCED line is the SAFER line ─────────
    // UNDER: safer means a HIGHER total (easier to stay under), so the
    // reduced line must be above the standard line. OVER: safer means a
    // LOWER total, so the reduced line must be below it. And a safer line
    // always pays less, so reduced odds must be lower than the standard
    // side's odds. These checks catch swapped/mistyped entries.
    const stdLine = existing.bookmakerLine != null ? Number(existing.bookmakerLine) : null;
    if (rec === "UNDER" && reducedUnderTotal != null && stdLine != null && reducedUnderTotal <= stdLine) {
      return NextResponse.json({
        error: `Reduced UNDER line must be HIGHER than the standard line (${stdLine}) — the safer under sits above it. Got ${reducedUnderTotal}.`,
      }, { status: 400 });
    }
    if (rec === "OVER" && reducedOverTotal != null && stdLine != null && reducedOverTotal >= stdLine) {
      return NextResponse.json({
        error: `Reduced OVER line must be LOWER than the standard line (${stdLine}) — the safer over sits below it. Got ${reducedOverTotal}.`,
      }, { status: 400 });
    }
    const stdUnderOdds = existing.underOdds != null ? Number(existing.underOdds) : null;
    if (rec === "UNDER" && reducedUnderOdds != null && stdUnderOdds != null && reducedUnderOdds >= stdUnderOdds) {
      return NextResponse.json({
        error: `Reduced UNDER odds must be LOWER than the standard under odds (${stdUnderOdds}) — a safer line always pays less. Got ${reducedUnderOdds}.`,
      }, { status: 400 });
    }
    const stdOverOdds = existing.overOdds != null ? Number(existing.overOdds) : null;
    if (rec === "OVER" && reducedOverOdds != null && stdOverOdds != null && reducedOverOdds >= stdOverOdds) {
      return NextResponse.json({
        error: `Reduced OVER odds must be LOWER than the standard over odds (${stdOverOdds}) — a safer line always pays less. Got ${reducedOverOdds}.`,
      }, { status: 400 });
    }

    // ── All 4 fields null and not clear → nothing to do ──────────────
    const allNull =
      reducedOverTotal == null && reducedOverOdds == null &&
      reducedUnderTotal == null && reducedUnderOdds == null;
    if (allNull) {
      return NextResponse.json({
        ok: true,
        matchId,
        reducedRiskSource: existing.reducedRiskSource,
        updatedAt: existing.reducedRiskUpdatedAt
          ? (typeof existing.reducedRiskUpdatedAt === "string"
              ? existing.reducedRiskUpdatedAt
              : new Date(existing.reducedRiskUpdatedAt).toISOString())
          : null,
        values: {
          reducedOverTotal: existing.reducedOverTotal,
          reducedOverOdds: existing.reducedOverOdds,
          reducedUnderTotal: existing.reducedUnderTotal,
          reducedUnderOdds: existing.reducedUnderOdds,
        },
        note: "No values provided — no changes made. Use clear=true to reset.",
      });
    }

    // ── Apply the update ─────────────────────────────────────────────
    await db.prediction.update({
      where: { matchId },
      data: {
        reducedOverTotal,
        reducedOverOdds,
        reducedUnderTotal,
        reducedUnderOdds,
        reducedRiskSource: "manual",
        reducedRiskUpdatedAt: new Date(),
        reducedRiskUpdatedBy: userId ?? null,
      },
    });

    // ── Activity log (audit trail) ───────────────────────────────────
    try {
      if (userId) {
        await db.activityLog.create({
          data: {
            userId,
            action: "REDUCED_RISK_OVERRIDE_SET",
            service: "website",
            details: JSON.stringify({
              matchId,
              homeTeam: existing.homeTeam,
              awayTeam: existing.awayTeam,
              previousSource: existing.reducedRiskSource,
              previousValues: {
                reducedOverTotal: existing.reducedOverTotal,
                reducedOverOdds: existing.reducedOverOdds,
                reducedUnderTotal: existing.reducedUnderTotal,
                reducedUnderOdds: existing.reducedUnderOdds,
              },
              newValues: {
                reducedOverTotal,
                reducedOverOdds,
                reducedUnderTotal,
                reducedUnderOdds,
              },
            }),
          },
        });
      }
    } catch (logErr) {
      console.warn("[reduced-risk] ActivityLog write failed (set):", logErr);
    }

    return NextResponse.json({
      ok: true,
      matchId,
      reducedRiskSource: "manual",
      updatedAt: new Date().toISOString(),
      values: {
        reducedOverTotal,
        reducedOverOdds,
        reducedUnderTotal,
        reducedUnderOdds,
      },
    });
  } catch (error) {
    console.error("[reduced-risk] POST error:", error);
    return NextResponse.json(
      { error: "Failed to update reduced-risk values: " + (error instanceof Error ? error.message : String(error)) },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json({ error: "Method not allowed — use POST" }, { status: 405 });
}
