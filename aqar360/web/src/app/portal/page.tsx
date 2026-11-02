import { requestPortalLink } from "./actions";

/** Sign-in by email link: no password for customers. Staff can also send the link from the customer's page. */
export default async function PortalSignIn({ searchParams }: { searchParams: Promise<{ sent?: string; expired?: string }> }) {
  const q = await searchParams;
  return (
    <section className="a-panel p-signin">
      <h1>حسابي · My account</h1>
      <p className="a-muted">اكتب بريدك الإلكتروني وسنرسل لك رابط الدخول. · Type your email and we will send you a sign-in link.</p>
      {q.expired && <p className="a-alert">انتهت صلاحية الرابط، اطلب رابطا جديدا. · The link has expired; request a new one.</p>}
      {q.sent ? (
        <p className="a-ok">إذا كان البريد مسجلا لدينا فستصلك رسالة خلال دقائق. · If this email is registered with us, a message arrives within minutes.</p>
      ) : (
        <form action={requestPortalLink} className="a-form">
          <label className="a-field"><span>البريد الإلكتروني · Email</span><input type="email" name="email" required dir="ltr" autoComplete="email" /></label>
          <div><button className="a-btn primary">أرسل الرابط · Send link</button></div>
        </form>
      )}
      <p className="a-muted" style={{ marginTop: 16 }}>لديك حساب؟ <a href="/ar/account/login">سجّل الدخول بكلمة المرور</a> · Have an account? <a href="/en/account/login">Log in with your password</a></p>
    </section>
  );
}
