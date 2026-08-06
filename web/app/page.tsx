"use client";

import { useEffect, useRef, useState } from "react";
import { createQR } from "@solana/pay";

type ScoreRow = {
  wallet_address: string;
  status: "pending" | "done" | "error";
  total_trades: number | null;
  atomic_trades: number | null;
  atomic_pct: number | null;
  real_alpha_pct: number | null;
  error_message: string | null;
};

type ScanResponse =
  | ScoreRow
  | { needsPayment: true; reference: string; payUrl: string; amountSol: number };

function verdictFor(atomicPct: number): { label: string; className: string } {
  if (atomicPct >= 60) return { label: "NO COPIABLE — mayormente arbitraje atómico", className: "no-copiable" };
  if (atomicPct <= 20) return { label: "COPIABLE — alpha secuencial real", className: "copiable" };
  return { label: "MIXTO — revisá antes de copiar a ciegas", className: "mixto" };
}

function PaymentPanel({ payUrl, reference, amountSol, onPaid }: {
  payUrl: string; reference: string; amountSol: number; onPaid: (score: ScoreRow | null) => void;
}) {
  const qrRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!qrRef.current) return;
    qrRef.current.innerHTML = "";
    const qr = createQR(payUrl, 220, "transparent", "#e8e9ee");
    qr.append(qrRef.current);
  }, [payUrl]);

  useEffect(() => {
    const interval = setInterval(async () => {
      const res = await fetch(`/api/pay/${reference}`);
      const data = await res.json();
      if (res.ok && data.paid) {
        clearInterval(interval);
        onPaid(data.score ?? null);
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [reference, onPaid]);

  return (
    <div className="card">
      <div className="pending" style={{ marginBottom: 16 }}>
        Ya usaste tus análisis gratis de hoy. Esta wallet es nueva — pagá {amountSol} SOL para escanearla
        (queda cacheada gratis para todos después).
      </div>
      <div ref={qrRef} style={{ display: "flex", justifyContent: "center", margin: "16px 0" }} />
      <a href={payUrl} className="pay-link">Abrir en tu wallet (Phantom, Solflare…) →</a>
      <div className="pending" style={{ marginTop: 16 }}>
        <span className="dot" /> Esperando confirmación on-chain…
      </div>
    </div>
  );
}

export default function Home() {
  const [wallet, setWallet] = useState("");
  const [row, setRow] = useState<ScoreRow | null>(null);
  const [payment, setPayment] = useState<{ reference: string; payUrl: string; amountSol: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  function pollScore(walletAddress: string) {
    pollRef.current = setInterval(async () => {
      const r = await fetch(`/api/score/${walletAddress}`);
      const d = await r.json();
      if (r.ok) {
        setRow(d);
        if (d.status !== "pending" && pollRef.current) {
          clearInterval(pollRef.current);
          setLoading(false);
        }
      }
    }, 2500);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setRow(null);
    setPayment(null);
    if (pollRef.current) clearInterval(pollRef.current);

    const trimmed = wallet.trim();
    setLoading(true);
    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: trimmed }),
      });
      const data: ScanResponse & { error?: string } = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Error desconocido.");
        setLoading(false);
        return;
      }
      if ("needsPayment" in data) {
        setPayment({ reference: data.reference, payUrl: data.payUrl, amountSol: data.amountSol });
        return;
      }
      setRow(data);
      if (data.status === "pending") {
        pollScore(trimmed);
      } else {
        setLoading(false);
      }
    } catch {
      setError("No se pudo conectar con el servidor.");
      setLoading(false);
    }
  }

  function handlePaid(score: ScoreRow | null) {
    setPayment(null);
    if (score) {
      setRow(score);
      if (score.status === "pending") pollScore(score.wallet_address);
      else setLoading(false);
    }
  }

  return (
    <main>
      <div className="eyebrow">Eterix Screener</div>
      <h1>¿Esa wallet se puede copiar de verdad?</h1>
      <p className="subtitle">
        La mayoría de las wallets &quot;top&quot; que ves en GMGN, BullX o Axiom tienen gran parte de su PnL en
        arbitraje atómico — compra y venta en la misma transacción, imposible de replicar con delay. Pegá una
        wallet de Solana y te decimos qué porcentaje de su historial es realmente copiable.
      </p>

      <form onSubmit={submit}>
        <input
          type="text"
          placeholder="Dirección de wallet en Solana"
          value={wallet}
          onChange={(e) => setWallet(e.target.value)}
          required
        />
        <button type="submit" disabled={loading}>
          {loading ? "Analizando…" : "Analizar"}
        </button>
      </form>

      <div className="trust-strip">
        <span>GMGN/BullX/Axiom no separan esto — nosotros sí</span>
        <span>Basado en la propiedad de la tx, no en opinión</span>
        <span>Hasta 74% de las tx en Solana son arb. atómico</span>
      </div>

      {error && <div className="error">{error}</div>}

      {payment && (
        <PaymentPanel
          payUrl={payment.payUrl}
          reference={payment.reference}
          amountSol={payment.amountSol}
          onPaid={handlePaid}
        />
      )}

      {row && (
        <div className="card">
          {row.status === "pending" && (
            <div className="pending">
              <span className="dot" />
              Escaneando historial on-chain — puede tardar hasta un par de minutos si nadie la pidió antes…
            </div>
          )}

          {row.status === "error" && <div className="error">{row.error_message ?? "No se pudo analizar esta wallet."}</div>}

          {row.status === "done" && row.atomic_pct !== null && (
            <>
              <div className={`verdict ${verdictFor(row.atomic_pct).className}`}>
                {verdictFor(row.atomic_pct).label}
              </div>
              <div className="stat-row">
                <span className="label">Trades analizados</span>
                <span>{row.total_trades}</span>
              </div>
              <div className="stat-row">
                <span className="label">% arbitraje atómico (no copiable)</span>
                <span>{row.atomic_pct.toFixed(1)}%</span>
              </div>
              <div className="stat-row">
                <span className="label">% alpha secuencial (copiable)</span>
                <span>{row.real_alpha_pct?.toFixed(1)}%</span>
              </div>
            </>
          )}
        </div>
      )}

      <footer>
        Datos on-chain vía GMGN. Esto es información, no asesoramiento financiero — no es una recomendación de
        inversión ni una garantía de resultados al copiar ninguna wallet. Medimos, no vendemos señales.
      </footer>
    </main>
  );
}
