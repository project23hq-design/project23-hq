import { AuthForm } from "../auth-form";
import { forgotPasswordAction } from "../actions";

export const metadata = { title: "forgot password", robots: { index: false } };

export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return <AuthForm mode="forgot" action={forgotPasswordAction} next={next} />;
}
