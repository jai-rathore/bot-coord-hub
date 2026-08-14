"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import QRCode from "qrcode";

export function PublicInviteQr({
  inviteUrl,
  label,
}: {
  inviteUrl: string;
  label?: string | null;
}) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    setDataUrl(null);
    setError(false);
    void QRCode.toDataURL(inviteUrl, {
      width: 240,
      margin: 2,
      errorCorrectionLevel: "M",
      color: { dark: "#1f4a36", light: "#ffffff" },
    })
      .then((value) => {
        if (active) setDataUrl(value);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [inviteUrl]);

  if (error) {
    return (
      <p className="text-xs text-danger" role="alert">
        QR generation failed. The invite URL still works.
      </p>
    );
  }
  if (!dataUrl) {
    return <div className="h-48 w-48 animate-pulse rounded-lg bg-white/70" />;
  }
  return (
    <div className="space-y-2">
      <Image
        src={dataUrl}
        alt={`QR code for ${label || "HoneyMatcha public invitation"}`}
        width={240}
        height={240}
        unoptimized
        className="h-48 w-48 rounded-lg border border-line bg-white p-1"
      />
      <a
        href={dataUrl}
        download="honeymatcha-public-invite.png"
        className="inline-block text-xs font-semibold text-matcha-deep underline"
      >
        Download QR code
      </a>
    </div>
  );
}
