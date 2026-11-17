import { requireUser } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { MfaSetup } from "./MfaSetup";

export const metadata = { title: "Security Settings" };

export default async function SecuritySettingsPage() {
  const ctx = await requireUser();
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: ctx.user.id },
    select: { mfaSecret: true, email: true, passwordChangedAt: true },
  });

  const hasMfa = !!user.mfaSecret && !user.mfaSecret.startsWith("pending:");

  return (
    <main className="p-6 max-w-xl space-y-8">
      <h1 className="text-2xl font-bold">Security Settings</h1>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Account</h2>
        <div className="text-sm text-gray-600">
          <span className="font-medium">Email:</span> {user.email}
        </div>
        {user.passwordChangedAt && (
          <div className="text-sm text-gray-600">
            <span className="font-medium">Password last changed:</span>{" "}
            {user.passwordChangedAt.toLocaleDateString()}
          </div>
        )}
      </section>

      <section className="rounded border border-gray-200 p-4 space-y-3">
        <h2 className="text-lg font-semibold">Two-Factor Authentication (TOTP)</h2>
        <MfaSetup hasMfa={hasMfa} />
      </section>
    </main>
  );
}
