import { asc, desc, eq, sql } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";

import { db } from "@/db";
import { applications, contacts, employees, expenses, invoices, payments, properties, requests, users } from "@/db/schema";
import { audit, canOpen, currentUser } from "@/lib/auth";

type Row = Record<string, unknown>;

/** Spreadsheet-safe cell: quoted, and text that a spreadsheet would run as a formula is prefixed with '. */
function cell(value: unknown) {
  if (value == null) return "";
  let text = value instanceof Date ? value.toISOString() : typeof value === "object" ? JSON.stringify(value) : String(value);
  if (/^[=@\t\r]/.test(text) || (/^[+-]/.test(text) && !/^[+-]?[\d\s.]+$/.test(text))) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const toCsv = (rows: Row[]) => {
  if (!rows.length) return "";
  const head = Object.keys(rows[0]);
  return [head.join(","), ...rows.map((r) => head.map((k) => cell(r[k])).join(","))].join("\r\n");
};

const paid = sql<number>`coalesce((select sum(${payments.amount}) from ${payments} where ${payments.invoiceId} = ${invoices.id}), 0)::float`;

const EXPORTS: Record<string, () => Promise<Row[]>> = {
  requests: () => db.select({ number: requests.number, kind: requests.kind, subtype: requests.subtype, status: requests.status,
    customer: contacts.name, phone: contacts.phone, email: contacts.email, owner: users.name, property_type: requests.propertyType,
    budget_min: requests.budgetMin, budget_max: requests.budgetMax, bedrooms_min: requests.bedroomsMin, source: requests.sourceChannel,
    created: requests.createdAt, first_response: requests.firstResponseAt, expires: requests.expiresOn, closed_reason: requests.closedReason })
    .from(requests).innerJoin(contacts, eq(requests.contactId, contacts.id)).leftJoin(users, eq(requests.assignedTo, users.id))
    .orderBy(desc(requests.createdAt)),
  customers: () => db.select({ id: contacts.id, name: contacts.name, phone: contacts.phone, email: contacts.email, language: contacts.language,
    created: contacts.createdAt }).from(contacts).orderBy(desc(contacts.createdAt)),
  properties: () => db.select({ code: properties.code, kind: properties.kind, purpose: properties.purpose, status: properties.status,
    title: properties.title, sale_price: properties.salePrice, rent_price: properties.rentPrice, unit: properties.unitNumber, bedrooms: properties.bedrooms, size_sqm: properties.sizeSqm, public: properties.public, verified: properties.verified,
    owner_name: properties.ownerName, owner_phone: properties.ownerPhone, created: properties.createdAt }).from(properties).orderBy(asc(properties.code)),
  invoices: () => db.select({ number: invoices.number, kind: invoices.kind, status: invoices.status, customer: contacts.name,
    issue_date: invoices.issueDate, due_date: invoices.dueDate, total: invoices.total, client_media: invoices.passThroughTotal, paid })
    .from(invoices).innerJoin(contacts, eq(invoices.contactId, contacts.id)).orderBy(desc(invoices.createdAt)),
  payments: () => db.select({ invoice: invoices.number, customer: contacts.name, amount: payments.amount, method: payments.method,
    reference: payments.reference, paid_on: payments.paidOn }).from(payments).innerJoin(invoices, eq(payments.invoiceId, invoices.id))
    .innerJoin(contacts, eq(invoices.contactId, contacts.id)).orderBy(desc(payments.paidOn)),
  expenses: () => db.select({ date: expenses.spentOn, category: expenses.category, description: expenses.description, paid_to: expenses.vendor,
    amount: expenses.amount, paid_from: expenses.paidFrom, receipt: expenses.receiptUrl }).from(expenses).orderBy(desc(expenses.spentOn)),
  employees: () => db.select({ name: employees.name, job_title: employees.jobTitle, phone: employees.phone, email: employees.email,
    nationality: employees.nationality, id_number: employees.idNumber, id_expiry: employees.idExpiry, passport_expiry: employees.passportExpiry,
    visa_expiry: employees.visaExpiry, joined: employees.joinDate, basic_salary: employees.basicSalary, allowances: employees.allowances,
    active: employees.active }).from(employees).orderBy(asc(employees.name)),
  applications: () => db.select({ kind: applications.kind, name: applications.name, phone: applications.phone, email: applications.email,
    status: applications.status, details: applications.details, file: applications.fileUrl, received: applications.createdAt })
    .from(applications).orderBy(desc(applications.createdAt)),
};

/** Office staff download any list as CSV (UTF-8 with BOM so Excel shows Arabic correctly). */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  const user = await currentUser();
  if (!user || user.role === "agent") return new NextResponse("Not allowed", { status: 403 });
  const { kind } = await params;
  const load = EXPORTS[kind];
  if (!load) return new NextResponse("Not found", { status: 404 });
  const app = ["employees", "applications"].includes(kind) ? "hr" : ["invoices", "payments", "expenses"].includes(kind) ? "erp" : "crm";
  if (!canOpen(user, app)) return new NextResponse("Not allowed", { status: 403 });
  const rows = await load();
  await audit("exported", kind, null, { rows: rows.length }, user.id);
  const date = new Date(Date.now() + 4 * 3_600_000).toISOString().slice(0, 10);
  return new NextResponse(`﻿${toCsv(rows)}`, { headers: { "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="aqar360-${kind}-${date}.csv"`, "Cache-Control": "no-store" } });
}
