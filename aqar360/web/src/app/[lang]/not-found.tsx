import Link from "next/link";

// Rendered inside the [lang] layout; the language is not available here, so both are shown.
export default function NotFound() {
  return (
    <section className="container section article">
      <h1>الصفحة غير موجودة · Page not found</h1>
      <p>الصفحة التي تبحث عنها غير موجودة. The page you are looking for does not exist.</p>
      <div className="actions">
        <Link className="btn primary" href="/ar">العودة للرئيسية</Link>
        <Link className="btn secondary" href="/en">Back to home</Link>
      </div>
    </section>
  );
}
