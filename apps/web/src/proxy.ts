import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Next 16 proxy (formerly middleware): refreshes the Supabase session cookie and keeps
 * obviously-unauthenticated users out of private areas. This is a convenience only —
 * every page, action, route handler and database function re-checks authorization.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        toSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  const { data } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  const isPrivate = ["/account", "/organizer", "/gate", "/super-admin", "/promoter"].some((p) => path === p || path.startsWith(`${p}/`));
  if (isPrivate && !data.user) {
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    url.search = `?next=${encodeURIComponent(path + request.nextUrl.search)}`;
    return NextResponse.redirect(url);
  }
  response.headers.set("x-correlation-id", request.headers.get("x-correlation-id") ?? crypto.randomUUID());
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/webhooks|api/jobs|api/health|.*\\.(?:svg|png|jpg|jpeg|webp|avif|ico)$).*)"],
};
