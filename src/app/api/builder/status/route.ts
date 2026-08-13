import { NextResponse } from "next/server";
import { BUILDER_CODE, BUILDER_NAME } from "@/lib/builder";
import { builderApiCreds } from "@/lib/builder-server";

export async function GET() {
  return NextResponse.json({
    builder: BUILDER_NAME,
    builderCode: BUILDER_CODE,
    hasKeys: Boolean(builderApiCreds()),
  });
}
