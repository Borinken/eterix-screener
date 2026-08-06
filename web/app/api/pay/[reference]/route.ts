import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { checkPayment } from "@/lib/solanaPay";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ reference: string }> }) {
  const reference = (await params).reference;
  const supabase = getSupabaseAdmin();

  const { data: scanRequest, error } = await supabase
    .from("scan_requests")
    .select("*")
    .eq("payment_reference", reference)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!scanRequest) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Already confirmed on a previous poll -- just report the scan status.
  if (scanRequest.payment_signature) {
    const { data: score } = await supabase
      .from("wallet_scores")
      .select("*")
      .eq("wallet_address", scanRequest.wallet_address)
      .maybeSingle();
    return NextResponse.json({ paid: true, score });
  }

  let signature: string | null;
  try {
    signature = await checkPayment(reference);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Pago inválido." }, { status: 400 });
  }

  if (!signature) {
    return NextResponse.json({ paid: false });
  }

  await supabase
    .from("scan_requests")
    .update({ payment_signature: signature, paid_at: new Date().toISOString() })
    .eq("payment_reference", reference);

  const { data: score, error: insertError } = await supabase
    .from("wallet_scores")
    .upsert({ wallet_address: scanRequest.wallet_address, status: "pending" }, { onConflict: "wallet_address", ignoreDuplicates: true })
    .select()
    .maybeSingle();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  // ignoreDuplicates means an existing row returns null from upsert -- fetch it directly in that case.
  const finalScore = score ?? (
    await supabase.from("wallet_scores").select("*").eq("wallet_address", scanRequest.wallet_address).maybeSingle()
  ).data;

  return NextResponse.json({ paid: true, score: finalScore });
}
