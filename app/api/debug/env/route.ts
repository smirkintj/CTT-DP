export const dynamic = "force-dynamic";

export async function GET() {
  const url = process.env.DATABASE_URL ?? "";

  return Response.json({
    environment: process.env.VERCEL_ENV ?? "local",
    databaseHost: url.split("@")[1]?.split("/")[0] ?? "unknown",
  });
}