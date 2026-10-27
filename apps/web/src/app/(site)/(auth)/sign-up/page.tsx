import { AuthForm } from "../auth-form";
import { signUpAction } from "../actions";

export const metadata = { title: "sign up", robots: { index: false } };

export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return <AuthForm mode="sign-up" action={signUpAction} next={next} />;
}
