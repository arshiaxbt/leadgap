import { NextResponse } from "next/server";
import { GEO_COOKIE, GEO_COOKIE_MAX_AGE, geoFromRequest } from "@/lib/geo";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const geo = geoFromRequest(req);
  const res = NextResponse.json(geo);
  if (!geo.blocked) {
    res.cookies.set(GEO_COOKIE, "1", {
      httpOnly: true,
      sameSite: "lax",
      maxAge: GEO_COOKIE_MAX_AGE,
      path: "/",
    });
  } else {
    res.cookies.set(GEO_COOKIE, "", { httpOnly: true, maxAge: 0, path: "/" });
  }
  return res;
}
