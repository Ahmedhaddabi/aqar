"use client";

import Link from "next/link";
import { useState } from "react";

import type { Dictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/lib/config";

type T = Dictionary["pages"]["calculators"];

/** Monthly payment of a loan: P·r / (1 − (1 + r)^−n), or P / n without interest. */
export function monthlyPayment(principal: number, yearlyRatePct: number, years: number) {
  const n = Math.round(years * 12);
  const r = yearlyRatePct / 100 / 12;
  if (principal <= 0 || n <= 0) return 0;
  return r === 0 ? principal / n : (principal * r) / (1 - (1 + r) ** -n);
}

/** The loan a monthly payment can carry (the inverse of monthlyPayment). */
export function loanFor(payment: number, yearlyRatePct: number, years: number) {
  const n = Math.round(years * 12);
  const r = yearlyRatePct / 100 / 12;
  if (payment <= 0 || n <= 0) return 0;
  return r === 0 ? payment * n : (payment * (1 - (1 + r) ** -n)) / r;
}

const num = (v: string) => (Number.isFinite(Number(v)) ? Math.max(0, Number(v)) : 0);

function Field({ label, value, onChange, step = "any", suffix }: { label: string; value: string; onChange: (v: string) => void; step?: string; suffix?: string }) {
  return (
    <label className="calc-field">
      <span>{label}</span>
      <span className="calc-input"><input type="number" inputMode="decimal" min={0} step={step} value={value} onChange={(e) => onChange(e.target.value)} dir="ltr" />
        {suffix && <small>{suffix}</small>}</span>
    </label>
  );
}

export function Calculators({ lang, t }: { lang: Locale; t: T }) {
  const fmt = (v: number, digits = 0) => new Intl.NumberFormat(lang === "ar" ? "ar-OM" : "en-GB", { maximumFractionDigits: digits }).format(v);
  // Mortgage
  const [price, setPrice] = useState("120000");
  const [downPct, setDownPct] = useState("20");
  const [rate, setRate] = useState("5.5");
  const [years, setYears] = useState("25");
  const loan = num(price) * (1 - Math.min(num(downPct), 100) / 100);
  const pay = monthlyPayment(loan, num(rate), num(years));
  const totalInterest = Math.max(0, pay * Math.round(num(years) * 12) - loan);
  // Affordability
  const [income, setIncome] = useState("1500");
  const [debts, setDebts] = useState("0");
  const [share, setShare] = useState("50");
  const [savings, setSavings] = useState("25000");
  const room = Math.max(0, (num(income) * Math.min(num(share), 100)) / 100 - num(debts));
  const maxLoan = loanFor(room, num(rate), num(years));
  const maxPrice = maxLoan + num(savings);
  // Rental yield
  const [yPrice, setYPrice] = useState("120000");
  const [rent, setRent] = useState("550");
  const [costs, setCosts] = useState("600");
  const [empty, setEmpty] = useState("1");
  const gross = num(yPrice) ? ((num(rent) * 12) / num(yPrice)) * 100 : 0;
  const net = num(yPrice) ? ((num(rent) * Math.max(0, 12 - Math.min(num(empty), 12)) - num(costs)) / num(yPrice)) * 100 : 0;
  const find = (budget: number, purpose = "Buy") => `/${lang}/find-me-a-property?purpose=${purpose}&budget_max=${Math.round(budget)}`;

  return (
    <div className="calc-grid">
      <section className="card calc">
        <h2>🏦 {t.mortgage}</h2>
        <p className="muted">{t.mortgageIntro}</p>
        <div className="calc-fields">
          <Field label={t.price} value={price} onChange={setPrice} suffix="OMR" />
          <Field label={t.downPayment} value={downPct} onChange={setDownPct} suffix="%" />
          <Field label={t.rate} value={rate} onChange={setRate} suffix="%" />
          <Field label={t.years} value={years} onChange={setYears} step="1" />
        </div>
        <div className="calc-result" aria-live="polite">
          <p>{t.monthly}</p><strong dir="ltr">{fmt(pay)} OMR</strong>
          <small>{t.loanAmount}: {fmt(loan)} OMR · {t.totalInterest}: {fmt(totalInterest)} OMR</small>
        </div>
        <Link className="btn secondary" href={find(num(price))}>{t.findAt.replace("{v}", fmt(num(price)))}</Link>
      </section>

      <section className="card calc">
        <h2>💼 {t.afford}</h2>
        <p className="muted">{t.affordIntro}</p>
        <div className="calc-fields">
          <Field label={t.income} value={income} onChange={setIncome} suffix="OMR" />
          <Field label={t.debts} value={debts} onChange={setDebts} suffix="OMR" />
          <Field label={t.share} value={share} onChange={setShare} suffix="%" />
          <Field label={t.savings} value={savings} onChange={setSavings} suffix="OMR" />
        </div>
        <p className="muted">{t.usesRate.replace("{rate}", fmt(num(rate), 2)).replace("{years}", fmt(num(years)))}</p>
        <div className="calc-result" aria-live="polite">
          <p>{t.maxPrice}</p><strong dir="ltr">{fmt(maxPrice)} OMR</strong>
          <small>{t.maxLoan}: {fmt(maxLoan)} OMR · {t.payment}: {fmt(room)} OMR</small>
        </div>
        <Link className="btn secondary" href={find(maxPrice)}>{t.findAt.replace("{v}", fmt(maxPrice))}</Link>
      </section>

      <section className="card calc">
        <h2>📈 {t.yieldTitle}</h2>
        <p className="muted">{t.yieldIntro}</p>
        <div className="calc-fields">
          <Field label={t.price} value={yPrice} onChange={setYPrice} suffix="OMR" />
          <Field label={t.rent} value={rent} onChange={setRent} suffix="OMR" />
          <Field label={t.costs} value={costs} onChange={setCosts} suffix="OMR" />
          <Field label={t.empty} value={empty} onChange={setEmpty} step="1" />
        </div>
        <div className="calc-result" aria-live="polite">
          <p>{t.netYield}</p><strong dir="ltr">{fmt(net, 1)}%</strong>
          <small>{t.grossYield}: {fmt(gross, 1)}% · {t.yearlyIncome}: {fmt(num(rent) * Math.max(0, 12 - Math.min(num(empty), 12)) - num(costs))} OMR</small>
        </div>
        <Link className="btn secondary" href={`/${lang}/market-my-property?request_type=Let`}>{t.letIt}</Link>
      </section>
      <p className="muted calc-note">{t.note}</p>
    </div>
  );
}
