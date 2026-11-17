"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { enrollMfa, verifyMfa, disableMfa } from "./actions";
import QRCode from "qrcode";

export function MfaSetup({ hasMfa }: { hasMfa: boolean }) {
  const [enrollState, enrollAction, enrollPending] = useActionState(enrollMfa, {});
  const [verifyState, verifyAction, verifyPending] = useActionState(verifyMfa, {});
  const [disableState, disableAction, disablePending] = useActionState(disableMfa, {});
  const [qrSvg, setQrSvg] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (enrollState.qrUrl) {
      QRCode.toDataURL(enrollState.qrUrl, { type: "image/png", width: 200 }).then(setQrSvg);
    }
  }, [enrollState.qrUrl]);

  if (hasMfa && !disableState.ok) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-emerald-700 font-medium">Two-factor authentication is enabled.</p>
        <form action={disableAction} className="space-y-2">
          <p className="text-sm text-gray-600">Enter your current TOTP code to disable MFA:</p>
          <input
            name="code"
            maxLength={6}
            pattern="\d{6}"
            placeholder="000000"
            className="w-40 rounded border border-gray-300 px-3 py-1.5 font-mono text-sm focus:border-indigo-500 focus:outline-none"
            required
          />
          {disableState.error && <p className="text-sm text-red-600">{disableState.error}</p>}
          <button
            type="submit"
            disabled={disablePending}
            className="rounded bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            Disable MFA
          </button>
        </form>
      </div>
    );
  }

  // MFA not yet active — show enroll + verify flow.
  if (!enrollState.qrUrl) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-gray-600">
          Use an authenticator app (Google Authenticator, Authy, etc.) to scan a QR code
          and add two-factor authentication to your account.
        </p>
        <form action={enrollAction}>
          <button
            type="submit"
            disabled={enrollPending}
            className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            Set up MFA
          </button>
        </form>
        {enrollState.error && <p className="text-sm text-red-600">{enrollState.error}</p>}
      </div>
    );
  }

  // Step 2: show QR code and verify form.
  if (verifyState.ok) {
    return <p className="text-sm text-emerald-700 font-medium">MFA enabled successfully. Reload the page to see your new status.</p>;
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">Scan this QR code with your authenticator app, then enter the 6-digit code to confirm:</p>
      {qrSvg && (
        <div className="inline-block rounded border border-gray-200 p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrSvg} alt="TOTP QR code" width={200} height={200} />
        </div>
      )}
      <p className="text-xs text-gray-500 font-mono break-all">
        Manual key: {enrollState.secret}
      </p>
      <form action={verifyAction} className="space-y-2">
        <input
          name="code"
          maxLength={6}
          pattern="\d{6}"
          placeholder="000000"
          autoComplete="one-time-code"
          className="w-40 rounded border border-gray-300 px-3 py-1.5 font-mono text-sm focus:border-indigo-500 focus:outline-none"
          required
        />
        {verifyState.error && <p className="text-sm text-red-600">{verifyState.error}</p>}
        <button
          type="submit"
          disabled={verifyPending}
          className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          Verify & Enable
        </button>
      </form>
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
