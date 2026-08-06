import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, isLikelySolanaAddress } from "@/lib/supabase";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ wallet: string }> }) {
  const wallet = (await params).wallet.trim();

  if (!isLikelySolanaAddress(wallet)) {
    return NextResponse.json({ error: "Dirección de wallet inválida." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("wallet_scores")
    .select("*")
    .eq("wallet_address", wallet)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json(data);
}
