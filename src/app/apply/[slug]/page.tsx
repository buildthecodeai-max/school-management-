import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { InquiryForm } from "./InquiryForm";

export default async function ApplyPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const tenant = await prisma.tenant.findUnique({
    where: { slug },
    include: {
      campuses: {
        where: { status: "ACTIVE" },
        include: { gradeLevels: { orderBy: { rank: "asc" } } },
        orderBy: { name: "asc" },
      },
    },
  });
  if (!tenant || tenant.status === "CLOSED") notFound();

  return (
    <div className="min-h-screen bg-[color:var(--color-canvas)]">
      <div
        className="px-6 py-10 text-white"
        style={{ background: tenant.primaryColor }}
      >
        <div className="mx-auto max-w-2xl">
          <p className="text-sm opacity-80">Admissions</p>
          <h1 className="text-3xl font-semibold tracking-tight">{tenant.name}</h1>
          <p className="mt-1 opacity-90">Start your application with an inquiry.</p>
        </div>
      </div>

      <div className="mx-auto max-w-2xl px-6 py-8">
        <div className="card p-6">
          <InquiryForm
            slug={tenant.slug}
            campuses={tenant.campuses.map((c) => ({
              id: c.id,
              name: c.name,
              grades: c.gradeLevels.map((g) => ({ id: g.id, name: g.name })),
            }))}
          />
        </div>
        <p className="mt-4 text-center text-xs text-[color:var(--color-muted)]">
          Powered by Scholarum
        </p>
      </div>
    </div>
  );
}
