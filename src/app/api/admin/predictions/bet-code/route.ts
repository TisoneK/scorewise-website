import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db-libsql";

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/predictions/bet-code
 *
 * Sets the betslip booking code for a prediction. Admin + Operator only.
 *
 * The betCode is a short alphanumeric string (e.g. "SD:OP-12345") that
 * users can copy and paste into Linebet/Paripesa/1xbet to generate a
 * pre-populated betslip. These codes are obtained by an admin or operator
 * placing the bet on the bookmaker's site and copying the resulting booking
 * code.
 *
 * Body: { matchId: string, betCode: string }
 *   - matchId: required, identifies the prediction
 *   - betCode: required, the booking code. Empty string clears it.
 *
 * Returns: { ok: true, matchId, betCode }
 */
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    const role = (session?.user as { role?: string })?.role;
    if (!session || (role !== "ADMIN" && role !== "OPERATOR")) {
      return NextResponse.json({ error: "Admin or operator access required" }, { status: 401 });
    }

    const body = await request.json();
    const { matchId, betCode } = body;

    if (!matchId || typeof matchId !== "string") {
      return NextResponse.json({ error: "matchId is required" }, { status: 400 });
    }
    if (typeof betCode !== "string") {
      return NextResponse.json({ error: "betCode must be a string" }, { status: 400 });
    }

    // Trim + limit length to prevent abuse (real booking codes are <50 chars)
    const trimmed = betCode.trim().slice(0, 100);

    // Check the prediction exists
    const existing = await db.prediction.findUnique({ where: { matchId } });
    if (!existing) {
      return NextResponse.json({ error: `No prediction found for matchId: ${matchId}` }, { status: 404 });
    }

    // Update the betCode column. Empty string → null (so the card UI shows
    // "No betslip code yet" instead of an empty code box).
    await db.prediction.update({
      where: { matchId },
      data: { betCode: trimmed || null },
    });

    // Log the change to ActivityLog
    try {
      const systemUserId = (session.user as { id?: string })?.id;
      if (systemUserId) {
        await db.activityLog.create({
          data: {
            userId: systemUserId,
            action: "BET_CODE_UPDATE",
            service: "website",
            details: JSON.stringify({
              matchId,
              homeTeam: existing.homeTeam,
              awayTeam: existing.awayTeam,
              betCode: trimmed || null,
            }),
          },
        });
      }
    } catch (logErr) {
      console.warn("[bet-code] ActivityLog write failed:", logErr);
    }

    return NextResponse.json({
      ok: true,
      matchId,
      betCode: trimmed || null,
    });
  } catch (error) {
    console.error("[bet-code] POST error:", error);
    return NextResponse.json(
      { error: "Failed to update bet code: " + (error instanceof Error ? error.message : String(error)) },
      { status: 500 },
    );
  }
}
