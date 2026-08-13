import { BrandLink } from "@/components/brand-link";
import { GuestTaskClient } from "@/components/guest-task-client";

export default async function GuestTaskPage({
  params,
}: {
  params: Promise<{ publicId: string }>;
}) {
  const { publicId } = await params;
  return (
    <main className="relative min-h-full hm-atmosphere px-4 py-8">
      <div className="mx-auto w-full max-w-xl">
        <BrandLink />
        <div className="mt-8 rounded-2xl border border-line bg-white/80 p-6 shadow-[0_24px_70px_rgba(31,74,54,0.08)] sm:p-8">
          <GuestTaskClient publicId={publicId} />
        </div>
        <p className="mt-5 text-center text-xs text-muted">
          This private link works for one request only. It does not create an
          account or give access to the HoneyMatcha network.
        </p>
      </div>
    </main>
  );
}
