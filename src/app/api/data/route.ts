import { Redis } from "@upstash/redis";
import { NextResponse } from "next/server";

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

const KV_KEY = "point-data";

export async function GET() {
  const data = await redis.get(KV_KEY);
  if (!data) return NextResponse.json(null);
  return NextResponse.json(data);
}

export async function PUT(req: Request) {
  const data = await req.json();
  await redis.set(KV_KEY, data);
  return NextResponse.json({ ok: true });
}
