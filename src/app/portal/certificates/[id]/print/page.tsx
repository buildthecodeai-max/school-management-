import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/db";

export default async function PrintCertificatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await requirePermission("student.write");
  const { id } = await params;

  const issue = await prisma.certificateIssue.findFirst({
    where: { id, tenantId: ctx.tenantId! },
    include: {
      student: {
        include: {
          person: true,
          enrollments: {
            include: { gradeLevel: true, section: true, academicYear: true, campus: true },
            orderBy: { startDate: "desc" },
            take: 1,
          },
        },
      },
    },
  });
  if (!issue) notFound();

  const tenant = await prisma.tenant.findUnique({ where: { id: ctx.tenantId! } });
  if (!tenant) notFound();

  const campus = issue.student.enrollments[0]?.campus;
  const enrollment = issue.student.enrollments[0];
  const student = issue.student;
  const person = student.person;
  const issuedDate = issue.issuedAt.toLocaleDateString("en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const issuedByUser = issue.issuedByUserId
    ? await prisma.user.findUnique({ where: { id: issue.issuedByUserId }, select: { displayName: true } })
    : null;
  const principalName = issuedByUser?.displayName ?? "Principal";

  const certType = issue.certificateType as string;

  const titles: Record<string, string> = {
    BONAFIDE: "Bonafide Certificate",
    TRANSFER: "School Leaving Certificate",
    CHARACTER: "Character Certificate",
  };

  const bodies: Record<string, string> = {
    BONAFIDE: `This is to certify that <strong>${person.firstName} ${person.lastName}</strong>,
    Admission No. <strong>${student.admissionNumber}</strong>, is a bonafide student of
    <strong>${tenant.name}</strong>${campus ? `, ${campus.name}` : ""}${
      enrollment ? `, currently enrolled in <strong>${enrollment.gradeLevel.name}${enrollment.section ? ` — ${enrollment.section.name}` : ""}</strong>` : ""
    } for the academic year <strong>${enrollment?.academicYear.name ?? new Date().getFullYear()}</strong>.`,

    TRANSFER: `This is to certify that <strong>${person.firstName} ${person.lastName}</strong>,
    Admission No. <strong>${student.admissionNumber}</strong>, was a student of
    <strong>${tenant.name}</strong>${campus ? `, ${campus.name}` : ""}.
    ${person.dateOfBirth ? `Date of birth: <strong>${new Date(person.dateOfBirth).toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" })}</strong>.<br>` : ""}
    ${enrollment ? `Last class attended: <strong>${enrollment.gradeLevel.name}${enrollment.section ? ` — ${enrollment.section.name}` : ""}</strong>.<br>` : ""}
    The student is hereby granted a school leaving certificate to seek admission in any other institution.
    The student's conduct during the period of study was <strong>Satisfactory</strong>.`,

    CHARACTER: `This is to certify that <strong>${person.firstName} ${person.lastName}</strong>,
    Admission No. <strong>${student.admissionNumber}</strong>, is/was a student of
    <strong>${tenant.name}</strong>${campus ? `, ${campus.name}` : ""}.
    ${enrollment ? `Currently enrolled in <strong>${enrollment.gradeLevel.name}${enrollment.section ? ` — ${enrollment.section.name}` : ""}</strong>.<br>` : ""}
    Based on the records maintained by this institution, the character and conduct of the student
    has been <strong>Good</strong>. The student is known to be of good moral character and
    has not been involved in any disciplinary proceedings during the period of study.`,
  };

  const body = bodies[certType] ?? bodies.BONAFIDE;
  const title = titles[certType] ?? "Certificate";

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; margin: 0 !important; }
          .page { box-shadow: none !important; margin: 0 !important; }
        }
        * { box-sizing: border-box; }
        body {
          font-family: "Times New Roman", Times, serif;
          color: #1a1a2e;
          background: #f0f0f0;
          margin: 0;
          padding: 2rem;
        }
        .page {
          max-width: 760px;
          margin: 0 auto;
          background: white;
          padding: 60px 72px;
          box-shadow: 0 2px 12px rgba(0,0,0,0.15);
          border: 12px solid transparent;
          background-clip: padding-box;
          position: relative;
        }
        .border-outer {
          position: absolute;
          inset: 0;
          border: 3px solid #1e3a5f;
          pointer-events: none;
        }
        .border-inner {
          position: absolute;
          inset: 8px;
          border: 1px solid #c9a84c;
          pointer-events: none;
        }
        .logo-area { text-align: center; margin-bottom: 16px; }
        .school-name { font-size: 26px; font-weight: bold; color: #1e3a5f; letter-spacing: 1px; }
        .school-tagline { font-size: 13px; color: #64748b; margin-top: 4px; }
        .campus-info { font-size: 12px; color: #94a3b8; margin-top: 2px; }
        .divider {
          border: none;
          height: 2px;
          background: linear-gradient(to right, transparent, #c9a84c, #1e3a5f, #c9a84c, transparent);
          margin: 20px 0;
        }
        .cert-title {
          text-align: center;
          font-size: 28px;
          font-weight: bold;
          color: #1e3a5f;
          letter-spacing: 2px;
          text-transform: uppercase;
          margin: 24px 0 8px;
        }
        .cert-number {
          text-align: center;
          font-size: 12px;
          color: #94a3b8;
          margin-bottom: 32px;
          letter-spacing: 1px;
        }
        .cert-body {
          font-size: 15px;
          line-height: 2;
          text-align: justify;
          color: #1a1a2e;
        }
        .seal-area {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          margin-top: 60px;
        }
        .signature-block { text-align: center; min-width: 180px; }
        .signature-line {
          border-top: 1px solid #1e3a5f;
          padding-top: 6px;
          font-size: 13px;
          color: #1a1a2e;
          font-weight: 600;
        }
        .signature-role { font-size: 11px; color: #64748b; margin-top: 2px; }
        .date-issued { font-size: 13px; color: #64748b; text-align: center; }
        .watermark {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          pointer-events: none;
          z-index: 0;
          opacity: 0.04;
          font-size: 120px;
          font-weight: 900;
          color: #1e3a5f;
          transform: rotate(-30deg);
          white-space: nowrap;
          overflow: hidden;
        }
        .content { position: relative; z-index: 1; }
        .no-print {
          text-align: center;
          margin-bottom: 20px;
        }
        .print-btn {
          background: #1e3a5f;
          color: white;
          border: none;
          padding: 10px 28px;
          font-size: 14px;
          border-radius: 6px;
          cursor: pointer;
          margin-right: 8px;
        }
        .print-btn:hover { background: #2d4f7c; }
        .back-btn {
          background: white;
          color: #1e3a5f;
          border: 1px solid #1e3a5f;
          padding: 10px 28px;
          font-size: 14px;
          border-radius: 6px;
          cursor: pointer;
          text-decoration: none;
          display: inline-block;
        }
      `}</style>

      <div className="no-print">
        <a href={`/portal/certificates`} className="back-btn">← Back</a>
        <button className="print-btn" id="print-btn">Print / Save PDF</button>
      </div>

      <div className="page">
        <div className="border-outer"></div>
        <div className="border-inner"></div>
        <div className="watermark">{tenant.name}</div>

        <div className="content">
          <div className="logo-area">
            <div className="school-name">{tenant.name}</div>
            {campus && <div className="school-tagline">{campus.name}</div>}
            <div className="campus-info">
              {campus?.city && `${campus.city}`}
            </div>
          </div>

          <hr className="divider" />

          <div className="cert-title">{title}</div>
          <div className="cert-number">Certificate No: {issue.number}</div>

          <div
            className="cert-body"
            dangerouslySetInnerHTML={{ __html: body }}
          />

          <div className="seal-area">
            <div className="signature-block">
              <div className="signature-line">{principalName}</div>
              <div className="signature-role">Principal / Head of School</div>
            </div>
            <div className="date-issued">
              Date of issue:<br />
              <strong>{issuedDate}</strong>
            </div>
            <div className="signature-block">
              <div className="signature-line">Class Teacher</div>
              <div className="signature-role">Homeroom / Class Teacher</div>
            </div>
          </div>
        </div>
      </div>

      <script dangerouslySetInnerHTML={{
        __html: `
          document.getElementById('print-btn').addEventListener('click', function() {
            window.print();
          });
        `
      }} />
    </>
  );
}
