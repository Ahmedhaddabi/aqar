"use client";
// The new quote / invoice shown in the company's Invoice design while staff fill in the form (same document the customer gets).
import { useEffect, useState } from "react";

import type { contacts, invoices } from "@/db/schema";
import type { InvoiceDesign } from "@/lib/invoice-design";
import { invoiceTotals } from "@/lib/invoice-math";
import type { PayMethods } from "@/lib/payment-methods";

import { InvoiceDocument } from "./InvoiceDocument";
import type { companyDetails } from "./money";

type Inv = typeof invoices.$inferSelect;
type Contact = typeof contacts.$inferSelect;
type Line = Inv["lines"][number];

export function InvoicePreview({ formId, base, contact, company, pay, design, today, label }: {
  formId: string; base: Inv; contact: Contact; company: Awaited<ReturnType<typeof companyDetails>>; pay?: PayMethods;
  design: InvoiceDesign; today: string; label: string;
}) {
  const [inv, setInv] = useState(base);
  const [who, setWho] = useState(contact);
  useEffect(() => {
    const form = document.getElementById(formId) as HTMLFormElement | null;
    if (!form) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Read after React has re-rendered the line editor (its lines live in a hidden field).
    const read = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const f = new FormData(form);
        let lines: Line[] = [];
        try { lines = JSON.parse(String(f.get("lines") || "[]")); } catch { /* keep empty */ }
        const vatRate = f.get("chargeVat") ? Number(f.get("vatRate")) || 0 : 0;
        const sum = invoiceTotals(lines, Number(f.get("discount")) || 0, vatRate);
        const due = String(f.get("dueDate") || "");
        setInv({ ...base, lines, subtotal: sum.subtotal, discount: sum.discount, vatRate, vatTotal: sum.vatTotal, total: sum.total,
          passThroughTotal: sum.media, notes: String(f.get("notes") ?? ""), dueDate: due || base.dueDate });
        setWho({ ...contact, address: String(f.get("customerAddress") ?? contact.address), vatNumber: String(f.get("customerVat") ?? contact.vatNumber) });
      }, 30);
    };
    read();
    for (const type of ["input", "change", "click"]) form.addEventListener(type, read);
    return () => { clearTimeout(timer); for (const type of ["input", "change", "click"]) form.removeEventListener(type, read); };
  }, [formId, base, contact]);
  return (
    <section className="a-design-preview" aria-label={label}>
      <InvoiceDocument invoice={inv} contact={who} paid={0} company={company} pay={pay} design={design} today={today} />
    </section>
  );
}
