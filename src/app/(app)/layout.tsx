import { redirect } from "next/navigation";
import { getCurrentUser, requireSession } from "@/lib/auth/session";
import { getStore } from "@/lib/db";
import { availableBalance, getWallet } from "@/lib/credits/ledger";
import { listNotifications } from "@/lib/notifications/service";
import { AppShell } from "@/components/shell/AppShell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const store = await getStore();
  const memberships = await store.listGlobal("organization_members", { userId: user.id });
  if (memberships.length === 0) redirect("/onboarding");

  const auth = await requireSession();
  const wallet = await getWallet(store, auth.organization.id);
  const notifications = await listNotifications(store, auth.organization.id, 20);

  const businesses = await store.list("businesses", auth.organization.id);
  if (businesses.length === 0) redirect("/onboarding");

  return (
    <AppShell
      user={{
        displayName: auth.user.displayName,
        email: auth.user.email,
        organizationName: auth.organization.name,
        isAdmin: auth.isAdmin,
      }}
      notifications={notifications}
      available={availableBalance(wallet)}
    >
      {children}
    </AppShell>
  );
}
