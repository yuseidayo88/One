import { requireSession } from "@/lib/auth/session";
import { appConfig } from "@/config/app";
import { SettingsClient } from "@/app/(app)/settings/SettingsClient";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const auth = await requireSession();

  return (
    <SettingsClient
      organizationName={auth.organization.name}
      displayName={auth.user.displayName}
      email={auth.user.email}
      planKey={auth.organization.planKey}
      locale={auth.organization.locale}
      appName={appConfig.name}
      isAdmin={auth.isAdmin}
    />
  );
}
