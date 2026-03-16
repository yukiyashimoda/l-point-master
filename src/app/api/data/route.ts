import { kv } from "@vercel/kv";
import { NextResponse } from "next/server";

const KV_KEY = "point-data";

export async function GET() {
  const data = await kv.get(KV_KEY);
  if (!data) return NextResponse.json(null);
  return NextResponse.json(data);
}

export async function PUT(req: Request) {
  const data = await req.json();
  await kv.set(KV_KEY, data);
  return NextResponse.json({ ok: true });
}
