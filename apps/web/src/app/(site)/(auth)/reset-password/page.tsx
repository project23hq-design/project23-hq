import { AuthForm } from "../auth-form";
import { resetPasswordAction } from "../actions";

export const metadata = { title: "reset password", robots: { index: false } };

export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return <AuthForm mode="reset" action={resetPasswordAction} next={next} />;
}
