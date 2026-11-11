import { after } from "next/server";
import { type ReactNode, Suspense } from "react";

import { adminDict, adminLang } from "@/admin/i18n";
import { Nav, type NavItem, type NavModule } from "@/admin/Nav";
import { Progress } from "@/admin/Progress";
import { maybeRunAgent } from "@/lib/agent";
import { maybeRunAssignments } from "@/lib/assign";
import { canOpen, requireUser } from "@/lib/auth";
import { unreadCount } from "@/lib/notify";

export default async function AdminAppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  // Requests nobody answered in time move to the next person (at most every 10 minutes, after the page is sent).
  after(() => maybeRunAssignments().catch((e) => console.error("reassign failed:", (e as Error).message)));
  // The agent re-compares our own data at most hourly (reading the web is the daily run's job).
  if (user.role !== "agent") after(() => maybeRunAgent().catch((e) => console.error("agent failed:", (e as Error).message)));
  const lang = await adminLang(user.language);
  const n = adminDict(lang).nav;
  const office = user.role !== "agent";
  const modules: NavModule[] = [];
  // CRM: customers and sales. Agents only ever see their part of the CRM.
  if (canOpen(user, "crm")) modules.push({ key: "crm", label: n.crm, home: "/admin", groups: [
    { label: n.daily, items: [
      { href: "/admin", label: n.today, icon: "today" },
      { href: "/admin/requests/new", label: n.newEntry, icon: "plus" },
      { href: "/admin/requests", label: n.requests, icon: "inbox" },
      { href: "/admin/calendar", label: n.calendar, icon: "cal" },
      { href: "/admin/agreements", label: n.agreements, icon: "pen" },
      { href: "/admin/performance", label: n.performance, icon: "trophy" },
      { href: "/admin/whatsapp", label: n.whatsapp, icon: "chat" },
      { href: "/admin/customers", label: n.customers, icon: "users" },
      { href: "/admin/assistant", label: n.assistant, icon: "spark" },
    ] },
    ...(office ? [
      { label: n.propsSite, items: [
        { href: "/admin/listings", label: n.listings, icon: "building" },
        { href: "/admin/plots", label: n.plots, icon: "map" },
        { href: "/admin/site", label: n.site, icon: "globe" },
        { href: "/admin/messages", label: n.messages, icon: "mail" },
      ] },
      { label: n.insights, items: [
        { href: "/admin/reports", label: n.reports, icon: "chart" },
        { href: "/admin/market", label: n.market, icon: "trend" },
        { href: "/admin/reviews", label: n.reviews, icon: "star" },
      ] },
    ] satisfies NavModule["groups"] : []),
  ] });
  // ERP: money and operations.
  if (canOpen(user, "erp")) modules.push({ key: "erp", label: n.erp, home: "/admin/erp", groups: [{ label: n.money, items: [
    { href: "/admin/erp", label: n.overview, icon: "today" },
    { href: "/admin/invoices", label: n.invoices, icon: "invoice" },
    { href: "/admin/jobs", label: n.jobs, icon: "film" },
    { href: "/admin/approvals", label: n.approvals, icon: "checkc" },
    { href: "/admin/expenses", label: n.expenses, icon: "cash" },
    { href: "/admin/recurring", label: n.recurring, icon: "repeat" },
    { href: "/admin/finance", label: n.finance, icon: "chart" },
    { href: "/admin/payment-methods", label: n.payMethods, icon: "card" },
    { href: "/admin/invoice-design", label: n.invoiceDesign, icon: "pen" },
  ] }] });
  // HR: team, payroll and hiring (salaries stay out of sight for anyone without this app).
  if (canOpen(user, "hr")) modules.push({ key: "hr", label: n.hrApp, home: "/admin/hr", groups: [{ label: n.team, items: [
    { href: "/admin/hr", label: n.people, icon: "id" },
    { href: "/admin/hr/leave", label: n.leave, icon: "palm" },
    { href: "/admin/hr/payroll", label: n.payroll, icon: "wallet" },
    { href: "/admin/hr/renewals", label: n.renewals, icon: "refresh" },
    { href: "/admin/hiring", label: n.hiring, icon: "hand" },
  ] }] });
  // The agent: suggestions and the web pages it reads. Office staff with the CRM.
  if (canOpen(user, "crm") && office) modules.push({ key: "agents", label: n.agentsApp, home: "/admin/agents", groups: [{ label: n.agentsApp, items: [
    { href: "/admin/agents", label: n.agentHome, icon: "spark" },
    { href: "/admin/agents/sources", label: n.agentSources, icon: "globe" },
  ] }] });
  const personal: NavItem[] = [
    { href: "/admin/field", label: n.field, icon: "phone" },
    { href: "/admin/kb", label: n.kb, icon: "book" },
    { href: "/admin/claims", label: n.claims, icon: "receipt" },
    { href: "/admin/account", label: n.account, icon: "user" },
    ...(user.role === "admin" ? [{ href: "/admin/settings", label: n.settings, icon: "gear" }, { href: "/admin/integrations", label: n.integrations, icon: "plug" },
      { href: "/admin/users", label: n.users, icon: "team" }] satisfies NavItem[] : []),
  ];
  const newHref = canOpen(user, "crm") ? "/admin/requests/new" : canOpen(user, "erp") ? "/admin/invoices/new?kind=invoice" : null;
  return (
    <div className="a-shell">
      <div className="a-mesh" aria-hidden="true"><i /><i /><i /></div>
      <Nav modules={modules} personal={personal} unread={await unreadCount(user.id)} t={n} lang={lang} userName={user.name}
        roleLabel={adminDict(lang).roles[user.role]} newHref={newHref} />
      <Suspense><Progress /></Suspense>
      <main className="a-main" id="main">{children}</main>
    </div>
  );
}
