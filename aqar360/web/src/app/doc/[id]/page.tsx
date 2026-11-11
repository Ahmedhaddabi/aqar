import { notFound } from "next/navigation";

import { InvoiceDocument } from "@/admin/InvoiceDocument";
import { companyDetails, getInvoice, invoiceAbout } from "@/admin/money";
import { validDocLink } from "@/lib/doc-link";
import { enabledGateways } from "@/lib/payments";
import { docQr, invoiceDesign } from "@/lib/invoice-design";
import { payMethods } from "@/lib/payment-methods";

import { PrintButton } from "../../admin/(app)/invoices/[id]/PrintButton";

// Bilingual like the document itself.
const BANNERS: Record<string, [string, string]> = {
  paid: ["a-ok", "Thank you, your payment was received. · شكرا لك، تم استلام الدفعة."],
  pending: ["a-alert", "We are confirming your payment. Refresh this page in a minute. · جارٍ تأكيد الدفعة، حدّث الصفحة بعد دقيقة."],
  check: ["a-alert", "We received a payment that needs checking by our team. We will contact you. · وصلتنا دفعة تحتاج مراجعة من فريقنا وسنتواصل معك."],
  cancelled: ["a-alert", "The payment was cancelled. You can try again. · تم إلغاء الدفع، يمكنك المحاولة مرة أخرى."],
  failed: ["a-alert", "The payment did not go through. You can try again or use another card. · لم تتم عملية الدفع، حاول مرة أخرى أو استخدم بطاقة أخرى."],
  error: ["a-alert", "Online payment is not available right now. Please try again later or contact us. · الدفع الإلكتروني غير متاح حاليا، حاول لاحقا أو تواصل معنا."],
};
const LABELS = { thawani: "Pay with Thawani · ادفع عبر ثواني", paymob: "Pay by card (Paymob) · ادفع بالبطاقة (Paymob)" };

export default async function CustomerDocPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ s?: string; pay?: string }>;
}) {
  const id = Number((await params).id);
  const { s, pay } = await searchParams;
  if (!Number.isInteger(id) || !validDocLink(id, s)) notFound();
  const data = await getInvoice(id);
  if (!data || ["draft", "cancelled"].includes(data.invoice.status)) notFound();
  const { invoice: inv, paid } = data;
  const balance = inv.total - paid;
  const payable = inv.kind === "invoice" && ["sent", "partly_paid"].includes(inv.status) && balance >= 0.1;
  const gateways = payable ? await enabledGateways() : [];
  const banner = pay ? BANNERS[pay] : undefined;
  return (
    <>
      <title>{inv.number}</title>
      {banner && <p className={banner[0]} role="status" style={{ marginBottom: 16 }}>{banner[1]}</p>}
      <div className="a-noprint a-inline a-doc-actions">
        <PrintButton label="Print / save PDF · طباعة / حفظ PDF" />
        {gateways.map((g) => (
          <form key={g} action={`/api/pay/${g}`} method="post">
            <input type="hidden" name="id" value={inv.id} />
            <input type="hidden" name="s" value={s} />
            <button className="a-btn primary">{LABELS[g]} — {balance.toFixed(3)} OMR</button>
          </form>
        ))}
      </div>
      <InvoiceDocument invoice={inv} contact={data.contact} paid={paid} company={await companyDetails()} pay={await payMethods()}
        design={await invoiceDesign()} qr={await docQr(inv.id)} about={await invoiceAbout(inv)} today={new Date(Date.now() + 4 * 3_600_000).toISOString().slice(0, 10)} />
    </>
  );
}
