import type { Metadata } from "next";
import Link from "next/link";

import { AccountActions } from "@/components/account/AccountActions";
import { AccountForms } from "@/components/account/AccountForms";
import { getDictionary } from "@/i18n/dictionaries";
import { frappeCall } from "@/lib/frappe";
import { type LangParams, langOf } from "@/lib/params";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

type Overview = {
  full_name: string;
  requests: { request_number: string; request_type: string; status: string }[];
  orders: { name: string; title: string; status: string; payment_status: string; total: number }[];
  invoices: { name: string; date: string; total: number; outstanding: number; status: string }[];
  preferences: { purpose: string; channel: string; granted: boolean }[];
};

export async function generateMetadata({ params }: LangParams): Promise<Metadata> {
  const t = getDictionary(await langOf(params)).pages.account;
  return { title: t.title, description: t.description, robots: { index: false, follow: false } };
}

export default async function AccountPage({ params }: LangParams) {
  const lang = await langOf(params);
  const dict = getDictionary(lang);
  const t = dict.pages.account;
  const session = await getSession();
  const overview = session
    ? await frappeCall<Overview>("account.get_overview", { params: { language: lang }, session })
    : null;

  if (!overview?.ok) {
    return (
      <section className="container section">
        <h1>{t.title}</h1>
        <AccountForms dict={dict} notice={session ? t.expired : undefined} />
      </section>
    );
  }
  const data = overview.data;
  const money = (value: number) => `${value.toFixed(3)} ${dict.pages.contentServices.from}`;
  return (
    <section className="container section grid" style={{ gap: 24 }}>
      <div>
        <h1>{t.title}</h1>
        <p className="lead">{t.welcome}{lang === "ar" ? "، " : ", "}{data.full_name}</p>
      </div>
      <section className="card">
        <h2>{t.requests}</h2>
        {data.requests.length === 0 ? <p className="muted">{t.noRequests}</p> : (
          <table className="facts"><tbody>{data.requests.map((r) => (
            <tr key={r.request_number}><th scope="row"><span dir="ltr">{r.request_number}</span></th><td>{r.status}</td></tr>
          ))}</tbody></table>
        )}
      </section>
      <section className="card">
        <h2>{t.orders}</h2>
        {data.orders.length === 0 ? <p className="muted">{t.noOrders}</p> : (
          <table className="facts"><tbody>{data.orders.map((o) => (
            <tr key={o.name}><th scope="row">{o.title}</th><td>{o.status}</td><td>{o.payment_status}</td><td>{money(o.total)}</td></tr>
          ))}</tbody></table>
        )}
      </section>
      <section className="card">
        <h2>{t.invoices}</h2>
        {data.invoices.length === 0 ? <p className="muted">{t.noInvoices}</p> : (
          <table className="facts">
            <thead><tr><th>{t.date}</th><th>{t.total}</th><th>{t.outstanding}</th><th>{t.status}</th><th /></tr></thead>
            <tbody>{data.invoices.map((i) => (
              <tr key={i.name}><td>{i.date}</td><td>{money(i.total)}</td><td>{money(i.outstanding)}</td><td>{i.status}</td>
                <td><Link href={`/${lang}/account/invoices/${encodeURIComponent(i.name)}`}>{t.view}</Link></td></tr>
            ))}</tbody>
          </table>
        )}
      </section>
      <AccountActions dict={dict} preferences={data.preferences} />
    </section>
  );
}
