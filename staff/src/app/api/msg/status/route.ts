// 키가 들어 있는지만 알려 줘요 (값은 절대 돌려주지 않아요)
import { NextResponse } from "next/server";
import { ready } from "@/lib/server/nhn";
export const dynamic = "force-dynamic";
export async function GET() { return NextResponse.json(ready()); }
