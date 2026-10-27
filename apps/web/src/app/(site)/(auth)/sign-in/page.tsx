import { AuthForm } from "../auth-form";
import { signInAction } from "../actions";

export const metadata = { title: "sign in", robots: { index: false } };

export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return <AuthForm mode="sign-in" action={signInAction} next={next} />;
}
