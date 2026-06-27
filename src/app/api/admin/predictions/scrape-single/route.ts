import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getScraperUrl } from "@/lib/service-config";

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * POST /api/admin/predictions/scrape-single
 *
 * Enqueues a single-match scrape job on the scraper. Returns immediately
 * with { job_id, status: "QUEUED" | "RUNNING", position }.
 *
 * The frontend polls GET /api/admin/predictions/scrape-single?job_id=xxx
 * for the result.
 *
 * Body: { matchId: "GzcUBljD" }
 */
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    const role = (session?.user as { role?: string })?.role;
    if (!session || (role !== "ADMIN" && role !== "OPERATOR")) {
      return NextResponse.json({ error: "Admin or operator access required" }, { status: 401 });
    }

    const body = await request.json();
    const { matchId } = body;

    if (!matchId || typeof matchId !== "string") {
      return NextResponse.json({ error: "matchId is required" }, { status: 400 });
    }

    const scraperUrl = await getScraperUrl();
    if (!scraperUrl) {
      return NextResponse.json({ error: "Scraper URL not configured" }, { status: 500 });
    }

    // Enqueue on the scraper — returns immediately with job_id + status
    const res = await fetch(`${scraperUrl}/api/scrape/results/single`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ match_id: matchId }),
      signal: AbortSignal.timeout(10000),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      return NextResponse.json(
        { error: data.message || data.detail || `Scraper returned ${res.status}` },
        { status: res.status },
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("[scrape-single] Error:", error);
    return NextResponse.json(
      { error: "Failed to enqueue scrape: " + (error instanceof Error ? error.message : String(error)) },
      { status: 500 },
    );
  }
}

/**
 * GET /api/admin/predictions/scrape-single?job_id=xxx
 *   → poll a specific job's status
 *
 * GET /api/admin/predictions/scrape-single?status=true
 *   → get the full queue status
 */
export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    const role = (session?.user as { role?: string })?.role;
    if (!session || (role !== "ADMIN" && role !== "OPERATOR")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const scraperUrl = await getScraperUrl();
    if (!scraperUrl) {
      return NextResponse.json({ error: "Scraper URL not configured" }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('job_id');
    const wantStatus = searchParams.get('status') === 'true';

    let endpoint = '/api/scrape/results/single/status';
    if (jobId) {
      endpoint = `/api/scrape/results/single/${jobId}`;
    }

    const res = await fetch(`${scraperUrl}${endpoint}`, {
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      return NextResponse.json({ error: `Scraper returned ${res.status}` }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("[scrape-single GET] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch status: " + (error instanceof Error ? error.message : String(error)) },
      { status: 500 },
    );
  }
}
