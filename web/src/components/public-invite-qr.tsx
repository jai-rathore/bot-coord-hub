"use client";

import { ShareQr } from "@/components/share-qr";

export function PublicInviteQr({
  inviteUrl,
  label,
}: {
  inviteUrl: string;
  label?: string | null;
}) {
  return (
    <ShareQr
      url={inviteUrl}
      alt={`QR code for ${label || "HoneyMatcha public invitation"}`}
      downloadName="honeymatcha-public-invite.png"
      size={192}
    />
  );
}
