import { NextRequest, NextResponse } from "next/server";

const PULSEMCP_BASE_URL = "https://api.pulsemcp.com/v0beta";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const q = request.nextUrl.searchParams.get("q")?.trim();
  if (!q) {
    return NextResponse.json({ servers: [], total_count: 0 });
  }

  const apiKey = process.env.PULSEMCP_API_KEY;
  const tenantId = process.env.PULSEMCP_TENANT_ID;

  const params = new URLSearchParams({ q, count_per_page: "10" });
  if (tenantId) {
    params.set("tenant_id", tenantId);
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  try {
    const res = await fetch(
      `${PULSEMCP_BASE_URL}/servers?${params.toString()}`,
      { headers, cache: "no-store" },
    );

    if (!res.ok) {
      return NextResponse.json(
        { error: "PulseMCP search failed", status: res.status },
        { status: res.status },
      );
    }

    const data: unknown = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "PulseMCP search failed" },
      { status: 502 },
    );
  }
}
