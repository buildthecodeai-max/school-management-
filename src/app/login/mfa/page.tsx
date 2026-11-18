import { redirect } from "next/navigation";
import { getPendingMfaSession } from "@/lib/auth";
import { MfaForm } from "./MfaForm";

export const metadata = { title: "Two-factor verification" };

export default async function LoginMfaPage() {
  if (!(await getPendingMfaSession())) redirect("/login");
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Two-factor verification</h1>
          <p className="mt-2 text-sm text-slate-500">
            Enter the 6-digit code from your authenticator app to finish signing in.
          </p>
        </div>
        <MfaForm />
      </div>
    </div>
  );
}
