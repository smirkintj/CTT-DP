import { NextResponse } from "next/server";

export async function GET(req: Request, ctx: any) {
  const id = ctx?.params?.id as string | undefined;
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  // TODO: keep your existing logic here, just adapt to taskId

  return NextResponse.json({ ok: true, taskId: id });
}
