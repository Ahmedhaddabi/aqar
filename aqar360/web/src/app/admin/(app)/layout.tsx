import { type ReactNode, Suspense } from "react";

import { adminDict, adminLang } from "@/admin/i18n";
import { Nav, type NavItem, type NavModule } from "@/admin/Nav";
import { Progress } from "@/admin/Progress";
import { canOpen, requireUser } from "@/lib/auth";
import { unreadCount } from "@/lib/notify";

export default async function AdminAppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const lang = await adminLang(user.language);
  const n = adminDict(lang).nav;
  const office = user.role !== "agent";
  const modules: NavModule[] = [];
  // CRM: customers and sales. Agents only ever see their part of the CRM.
  if (canOpen(user, "crm")) modules.push({ key: "crm", label: n.crm, home: "/admin", items: [
    { href: "/admin", label: n.today, icon: "◉" },
    { href: "/admin/requests/new", label: n.newEntry, icon: "➕" },
    { href: "/admin/requests", label: n.requests, icon: "📥" },
    { href: "/admin/customers", label: n.customers, icon: "🧑" },
    ...(office ? [
      { href: "/admin/listings", label: n.listings, icon: "🏢" },
      { href: "/admin/site", label: n.site, icon: "🌐" },
      { href: "/admin/messages", label: n.messages, icon: "✉️" },
      { href: "/admin/reports", label: n.reports, icon: "📈" },
    ] : []),
  ] });
  // ERP: money and operations.
  if (canOpen(user, "erp")) modules.push({ key: "erp", label: n.erp, home: "/admin/erp", items: [
    { href: "/admin/erp", label: n.overview, icon: "◉" },
    { href: "/admin/invoices", label: n.invoices, icon: "🧾" },
    { href: "/admin/jobs", label: n.jobs, icon: "🎬" },
    { href: "/admin/approvals", label: n.approvals, icon: "✅" },
    { href: "/admin/expenses", label: n.expenses, icon: "💸" },
    { href: "/admin/recurring", label: n.recurring, icon: "🔁" },
    { href: "/admin/finance", label: n.finance, icon: "📊" },
    { href: "/admin/payment-methods", label: n.payMethods, icon: "💳" },
  ] });
  // HR: team, payroll and hiring (salaries stay out of sight for anyone without this app).
  if (canOpen(user, "hr")) modules.push({ key: "hr", label: n.hrApp, home: "/admin/hr", items: [
    { href: "/admin/hr", label: n.people, icon: "🪪" },
    { href: "/admin/hr/leave", label: n.leave, icon: "🌴" },
    { href: "/admin/hr/payroll", label: n.payroll, icon: "💰" },
    { href: "/admin/hr/renewals", label: n.renewals, icon: "📅" },
    { href: "/admin/hiring", label: n.hiring, icon: "🤝" },
  ] });
  const personal: NavItem[] = [
    { href: "/admin/kb", label: n.kb, icon: "📘" },
    { href: "/admin/claims", label: n.claims, icon: "🧾" },
    { href: "/admin/account", label: n.account, icon: "👤" },
    ...(user.role === "admin" ? [{ href: "/admin/settings", label: n.settings, icon: "⚙️" }, { href: "/admin/users", label: n.users, icon: "👥" }] : []),
  ];
  return (
    <div className="a-shell">
      <Nav modules={modules} personal={personal} unread={await unreadCount(user.id)} t={n} lang={lang} userName={user.name}
        roleLabel={adminDict(lang).roles[user.role]} />
      <Suspense><Progress /></Suspense>
      <main className="a-main" id="main">{children}</main>
    </div>
  );
}
