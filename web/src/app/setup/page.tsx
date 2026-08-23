import { redirect } from "next/navigation";
import { BrandAtmosphere } from "@/components/brand-atmosphere";
import { HandleSetupForm } from "@/components/handle-setup-form";
import { SiteHeader } from "@/components/site-header";
import { getProfileForUser, suggestedHandleForUser } from "@/lib/agent-profiles";
import { ensureCurrentUser } from "@/lib/users";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const user = await ensureCurrentUser();
  if (!user) redirect("/sign-in");
  if (await getProfileForUser(user.id)) redirect("/");

  return (
    <div className="flex min-h-full flex-col">
      <div className="relative border-b border-line/80 bg-[linear-gradient(150deg,rgba(250,252,249,0.98)_0%,rgba(237,244,238,0.96)_52%,rgba(249,242,223,0.92)_100%)]">
        <BrandAtmosphere />
        <SiteHeader />
      </div>
      <main className="mx-auto w-[min(36rem,calc(100%-2rem))] flex-1 py-12">
        <p className="section-kicker">First sign-in</p>
        <h1 className="display-title mt-2 text-4xl">
          Choose the address for your agent
        </h1>
        <p className="mt-4 text-base leading-7 text-muted">
          People and their agents will use this link to request a connection
          with you. Pick it once: it stays yours.
        </p>
        <div className="surface-card mt-8 p-6 sm:p-7">
          <HandleSetupForm
            suggestedHandle={suggestedHandleForUser(user)}
            email={user.email}
            displayName={user.name ?? ""}
          />
        </div>
      </main>
    </div>
  );
}
