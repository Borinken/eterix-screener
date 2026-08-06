import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { encodeURL, findReference, validateTransfer } from "@solana/pay";
import BigNumber from "bignumber.js";

function getConnection(): Connection {
  return new Connection(process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com", "confirmed");
}

function getMerchantWallet(): PublicKey {
  const addr = process.env.MERCHANT_WALLET_ADDRESS;
  if (!addr || addr.startsWith("REEMPLAZAR")) {
    throw new Error("MERCHANT_WALLET_ADDRESS no está configurada todavía.");
  }
  return new PublicKey(addr);
}

export function getScanPriceSol(): number {
  return Number(process.env.SCAN_PRICE_SOL || "0.01");
}

/** Creates a brand-new one-time reference for a payment request. The
 * reference is how we later find this exact payment on-chain -- it's not a
 * secret, it's a public key used purely as a lookup tag. */
export function createPaymentRequest(walletBeingScanned: string) {
  const reference = Keypair.generate().publicKey;
  const recipient = getMerchantWallet();
  const amount = new BigNumber(getScanPriceSol());

  const url = encodeURL({
    recipient,
    amount,
    reference,
    label: "Eterix Screener",
    message: `Copyability Score para ${walletBeingScanned}`,
  });

  return { reference: reference.toBase58(), url: url.toString() };
}

/** Returns the transaction signature if a valid payment for `reference` has
 * landed on-chain paying at least the scan price to the merchant wallet.
 * Returns null if nothing found yet (caller should keep polling). Throws if
 * something matching the reference exists but doesn't validate (wrong
 * amount/recipient) -- that's worth surfacing, not silently ignoring. */
export async function checkPayment(reference: string): Promise<string | null> {
  const connection = getConnection();
  const referenceKey = new PublicKey(reference);

  let signatureInfo;
  try {
    signatureInfo = await findReference(connection, referenceKey, { finality: "confirmed" });
  } catch {
    return null; // not found yet
  }

  await validateTransfer(
    connection,
    signatureInfo.signature,
    { recipient: getMerchantWallet(), amount: new BigNumber(getScanPriceSol()) },
  );

  return signatureInfo.signature;
}
