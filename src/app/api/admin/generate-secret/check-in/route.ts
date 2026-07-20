import { NextResponse } from "next/server";
import crypto from "crypto";

function generateSecret64() {
  return crypto
    .randomBytes(48)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

export async function GET() {
  const secret = generateSecret64();
  return NextResponse.json({ secret });
}