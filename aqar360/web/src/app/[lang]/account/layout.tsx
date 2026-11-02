import "../../customer.css";

/** Customer account pages: private, never cached; the portal sections inside use the customer styles. */
export const dynamic = "force-dynamic";

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return children;
}
