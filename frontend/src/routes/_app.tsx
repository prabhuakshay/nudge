import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { AppShell } from "@/components/layout/app-shell";
import { getSession } from "@/features/auth/session";

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
  const { user } = Route.useRouteContext();
  return (
    <AppShell user={user}>
      <Outlet />
    </AppShell>
  );
}
