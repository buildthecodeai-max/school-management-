import { isSupportedLocale } from "./locales";

// Portal UI translations, keyed by the English source string. A missing
// locale or missing key falls back to English, so screens can be translated
// incrementally. Machine-drafted: have a native speaker review before launch.
type Dict = Record<string, string>;

const es: Dict = {
  Dashboard: "Panel", Tenants: "Organizaciones", Plans: "Planes", "Audit log": "Registro de auditoría",
  Admissions: "Admisiones", Students: "Estudiantes", Attendance: "Asistencia", Academics: "Académico",
  Assessment: "Evaluación", Fees: "Tarifas", Finance: "Finanzas", Campuses: "Sedes", Setup: "Configuración",
  Integrations: "Integraciones", Subscription: "Suscripción", HR: "RR. HH.", Library: "Biblioteca",
  Transport: "Transporte", Inventory: "Inventario", Health: "Salud", Safeguarding: "Protección",
  Messages: "Mensajes", Calendar: "Calendario", Certificates: "Certificados", Hostel: "Residencia",
  Reports: "Informes", "Sign out": "Cerrar sesión", "Search…": "Buscar…", "No role": "Sin rol",
  "Account settings": "Ajustes de la cuenta", "no campus access": "sin acceso a sedes",
  "Return to platform": "Volver a la plataforma", "My account": "Mi cuenta",
  "Change password": "Cambiar contraseña", "Two-factor authentication": "Autenticación de dos factores",
  "Enabled →": "Activada →", "Not enabled →": "No activada →",
  "Notification preferences": "Preferencias de notificación", "Message inbox": "Bandeja de mensajes",
};
const fr: Dict = {
  Dashboard: "Tableau de bord", Tenants: "Organisations", Plans: "Forfaits", "Audit log": "Journal d'audit",
  Admissions: "Admissions", Students: "Élèves", Attendance: "Présence", Academics: "Scolarité",
  Assessment: "Évaluation", Fees: "Frais", Finance: "Finances", Campuses: "Campus", Setup: "Configuration",
  Integrations: "Intégrations", Subscription: "Abonnement", HR: "RH", Library: "Bibliothèque",
  Transport: "Transport", Inventory: "Inventaire", Health: "Santé", Safeguarding: "Protection",
  Messages: "Messages", Calendar: "Calendrier", Certificates: "Certificats", Hostel: "Internat",
  Reports: "Rapports", "Sign out": "Se déconnecter", "Search…": "Rechercher…", "No role": "Aucun rôle",
  "Account settings": "Paramètres du compte", "no campus access": "aucun accès à un campus",
  "Return to platform": "Retour à la plateforme", "My account": "Mon compte",
  "Change password": "Changer le mot de passe", "Two-factor authentication": "Authentification à deux facteurs",
  "Enabled →": "Activée →", "Not enabled →": "Non activée →",
  "Notification preferences": "Préférences de notification", "Message inbox": "Boîte de messages",
};
const pt: Dict = {
  Dashboard: "Painel", Tenants: "Organizações", Plans: "Planos", "Audit log": "Registro de auditoria",
  Admissions: "Admissões", Students: "Alunos", Attendance: "Frequência", Academics: "Acadêmico",
  Assessment: "Avaliação", Fees: "Taxas", Finance: "Finanças", Campuses: "Unidades", Setup: "Configuração",
  Integrations: "Integrações", Subscription: "Assinatura", HR: "RH", Library: "Biblioteca",
  Transport: "Transporte", Inventory: "Inventário", Health: "Saúde", Safeguarding: "Proteção",
  Messages: "Mensagens", Calendar: "Calendário", Certificates: "Certificados", Hostel: "Alojamento",
  Reports: "Relatórios", "Sign out": "Sair", "Search…": "Pesquisar…", "No role": "Sem função",
  "Account settings": "Configurações da conta", "no campus access": "sem acesso a unidades",
  "Return to platform": "Voltar à plataforma", "My account": "Minha conta",
  "Change password": "Alterar senha", "Two-factor authentication": "Autenticação em dois fatores",
  "Enabled →": "Ativada →", "Not enabled →": "Não ativada →",
  "Notification preferences": "Preferências de notificação", "Message inbox": "Caixa de mensagens",
};
const ar: Dict = {
  Dashboard: "لوحة التحكم", Tenants: "المؤسسات", Plans: "الباقات", "Audit log": "سجل التدقيق",
  Admissions: "القبول", Students: "الطلاب", Attendance: "الحضور", Academics: "الشؤون الأكاديمية",
  Assessment: "التقييم", Fees: "الرسوم", Finance: "المالية", Campuses: "الفروع", Setup: "الإعداد",
  Integrations: "التكاملات", Subscription: "الاشتراك", HR: "الموارد البشرية", Library: "المكتبة",
  Transport: "النقل", Inventory: "المخزون", Health: "الصحة", Safeguarding: "الحماية",
  Messages: "الرسائل", Calendar: "التقويم", Certificates: "الشهادات", Hostel: "السكن",
  Reports: "التقارير", "Sign out": "تسجيل الخروج", "Search…": "بحث…", "No role": "بلا دور",
  "Account settings": "إعدادات الحساب", "no campus access": "لا يوجد وصول إلى الفروع",
  "Return to platform": "العودة إلى المنصة", "My account": "حسابي",
  "Change password": "تغيير كلمة المرور", "Two-factor authentication": "المصادقة الثنائية",
  "Enabled →": "مفعّلة ←", "Not enabled →": "غير مفعّلة ←",
  "Notification preferences": "تفضيلات الإشعارات", "Message inbox": "صندوق الرسائل",
};

const DICTS: Record<string, Dict> = { es, fr, pt, ar };
const RTL = new Set(["ar"]);

export function resolveUiLocale(userLocale: string | null | undefined, tenantLocale: string | null | undefined): string {
  for (const l of [userLocale, tenantLocale]) if (l && isSupportedLocale(l)) return l;
  return "en";
}

export function translator(locale: string): (s: string) => string {
  const dict = DICTS[locale];
  return (s) => dict?.[s] ?? s;
}

export function textDirection(locale: string): "rtl" | "ltr" {
  return RTL.has(locale) ? "rtl" : "ltr";
}
