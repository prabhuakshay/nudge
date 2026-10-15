import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { AppShell } from "@/components/layout/app-shell";
import { getSession, sessionQuery } from "@/features/auth/session";

/** Every route under `_app` needs a signed-in user; anyone else goes to the login page. */
export const Route = createFileRoute("/_app")({
  beforeLoad: async ({ context, location }) => {
    const user = await getSession(context.queryClient);
    if (!user) {
      throw redirect({ to: "/login", search: { redirect: location.href } });
    }
    return { user };
  },
  component: AppLayout,
});

function AppLayout() {
  const { user: signedInUser } = Route.useRouteContext();
  // The cached session reflects profile edits; the route context only has the user at sign-in.
  const { data: user } = useQuery(sessionQuery);
  return (
    <AppShell user={user ?? signedInUser}>
      <Outlet />
    </AppShell>
  );
}
