import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, isLikelySolanaAddress } from "@/lib/supabase";
import { createPaymentRequest, getScanPriceSol } from "@/lib/solanaPay";

const FREE_DAILY_SCANS_PER_IP = Number(process.env.FREE_DAILY_SCANS_PER_IP || "3");

function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  return forwarded ? forwarded.split(",")[0].trim() : "unknown";
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const wallet = typeof body?.wallet === "string" ? body.wallet.trim() : "";

  if (!isLikelySolanaAddress(wallet)) {
    return NextResponse.json({ error: "Dirección de wallet inválida." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  // Cache hit -- previously analyzed wallets are always free to (re)view.
  const { data: existing, error: selectError } = await supabase
    .from("wallet_scores")
    .select("*")
    .eq("wallet_address", wallet)
    .maybeSingle();
  if (selectError) {
    return NextResponse.json({ error: selectError.message }, { status: 500 });
  }
  if (existing) {
    return NextResponse.json(existing);
  }

  // New wallet -- check today's free quota for this IP.
  const ip = getClientIp(req);
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);

  const { count, error: countError } = await supabase
    .from("scan_requests")
    .select("id", { count: "exact", head: true })
    .eq("requester_ip", ip)
    .gte("created_at", startOfDay.toISOString());
  if (countError) {
    return NextResponse.json({ error: countError.message }, { status: 500 });
  }

  if ((count ?? 0) < FREE_DAILY_SCANS_PER_IP) {
    const { data: inserted, error: insertError } = await supabase
      .from("wallet_scores")
      .insert({ wallet_address: wallet, status: "pending" })
      .select()
      .single();
    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }
    await supabase.from("scan_requests").insert({ wallet_address: wallet, requester_ip: ip, free: true });
    return NextResponse.json(inserted);
  }

  // Quota used up -- require a Solana Pay micropayment before queueing.
  let payment;
  try {
    payment = createPaymentRequest(wallet);
  } catch (e) {
    return NextResponse.json(
      { error: "El cobro todavía no está configurado (falta MERCHANT_WALLET_ADDRESS)." },
      { status: 503 },
    );
  }

  const { error: prError } = await supabase.from("scan_requests").insert({
    wallet_address: wallet,
    requester_ip: ip,
    free: false,
    payment_reference: payment.reference,
  });
  if (prError) {
    return NextResponse.json({ error: prError.message }, { status: 500 });
  }

  return NextResponse.json({
    needsPayment: true,
    reference: payment.reference,
    payUrl: payment.url,
    amountSol: getScanPriceSol(),
  });
}
