"use server";
import { redirect } from "next/navigation";
import { engineCode, engineErrorMessage } from "@project23/domain";
import { startPayment, paymentProvider } from "@/lib/payments";
import { browserCreatedOrder, rateLimit } from "@/lib/security";
import { adminClient } from "@/lib/supabase/admin";
import { getSession } from "@/lib/auth";
import { TestPaymentProvider } from "@/lib/payments/test-provider";
import { env } from "@/lib/env";

async function canPay(orderId: string) {
  if (await browserCreatedOrder(orderId)) return true;
  const { user } = await getSession();
  if (!user) return false;
  const { data } = await adminClient()
    .from("orders")
    .select("buyer_user_id")
    .eq("id", orderId)
    .maybeSingle();
  return data?.buyer_user_id === user.id;
}

export async function payAction(orderId: string): Promise<{ error: string } | void> {
  if (!(await canPay(orderId))) return { error: engineErrorMessage("forbidden") };
  if (!(await rateLimit("pay", 10, 300))) return { error: engineErrorMessage("rate_limited") };
  let url: string;
  try {
    url = (await startPayment(orderId)).authorizationUrl;
  } catch (e) {
    const code = engineCode(e as { message: string; code?: string }) ?? (e as Error).message;
    return { error: engineErrorMessage(code, "We couldn't start the payment. Please try again.") };
  }
  redirect(url);
}

export async function cancelOrderAction(orderId: string) {
  if (!(await canPay(orderId))) return;
  await adminClient().rpc("checkout_cancel_order", { p_order: orderId });
}

/** Test provider only: simulate the customer's choice on the hosted page, then return like Paystack does. */
export async function simulateTestPaymentAction(
  reference: string,
  outcome: "success" | "failed" | "abandoned",
) {
  if (env().APP_ENV === "production" || env().PAYMENT_PROVIDER !== "test")
    throw new Error("test provider disabled");
  const p = paymentProvider() as TestPaymentProvider;
  await p.simulate(reference, outcome);
  const { data } = await adminClient()
    .from("payment_attempts")
    .select("order_id")
    .eq("reference", reference)
    .single();
  redirect(`/checkout/return?orderId=${data!.order_id}&reference=${encodeURIComponent(reference)}`);
}
