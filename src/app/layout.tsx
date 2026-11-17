import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Scholarum — School Management Platform",
  description:
    "Multi-tenant SaaS school management platform. Admissions, students, attendance, academics, fees and portals.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased [font-family:system-ui,-apple-system,'Segoe_UI',Roboto,sans-serif]">
        {children}
      </body>
    </html>
  );
}
