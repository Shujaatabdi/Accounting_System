"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { can } from "@/lib/auth/session";

const NAV = [
  { href: "/dashboard", label: "Dashboard", group: "Overview" },
  { href: "/company", label: "Company", group: "Setup", permission: "company.view" },
  { href: "/settings/accounting-profile", label: "Country profile", group: "Setup", permission: "accounting_profile.view" },
  { href: "/settings/tax-codes", label: "Tax codes", group: "Setup", permission: "tax_codes.view" },
  { href: "/settings/numbering", label: "Numbering", group: "Setup", permission: "numbering.view" },
  { href: "/settings/sales", label: "Sales settings", group: "Setup", permission: "accounting_profile.view" },
  { href: "/branches", label: "Branches", group: "Setup", permission: "branches.view" },
  { href: "/periods", label: "Fiscal periods", group: "Setup", permission: "periods.view" },
  { href: "/users", label: "Users", group: "Access", permission: "users.view" },
  { href: "/roles", label: "Roles", group: "Access", permission: "roles.view" },
  { href: "/audit", label: "Audit log", group: "Access", permission: "audit.view" },
  { href: "/accounts", label: "Chart of accounts", group: "Ledger", permission: "accounts.view" },
  { href: "/journals", label: "Journals", group: "Ledger", permission: "journals.view" },
  { href: "/customers", label: "Customers", group: "Sales", permission: "customers.view" },
  { href: "/products", label: "Products", group: "Sales", permission: "products.view" },
  { href: "/invoices", label: "Invoices", group: "Sales", permission: "invoices.view" },
  { href: "/receipts", label: "Receipts", group: "Sales", permission: "receipts.view" },
  { href: "/customer-returns", label: "Customer returns", group: "Sales", permission: "customer_returns.view" },
  { href: "/reports/trial-balance", label: "Trial balance", group: "Reports", permission: "reports.view" },
  { href: "/reports/profit-and-loss", label: "Profit and loss", group: "Reports", permission: "reports.view" },
  { href: "/reports/balance-sheet", label: "Balance sheet", group: "Reports", permission: "reports.view" },
  { href: "/reports/general-ledger", label: "General ledger", group: "Reports", permission: "reports.view" },
  { href: "/reports/journals", label: "Journal report", group: "Reports", permission: "reports.view" },
  { href: "/reports/receivables-aging", label: "Receivables aging", group: "Reports", permission: "reports.view" },
  { href: "/reports/customer-statement", label: "Customer statement", group: "Reports", permission: "reports.view" },
  { href: "/reports/sales", label: "Sales", group: "Reports", permission: "reports.view" },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!auth.ready) return;
    if (!auth.user) router.replace("/login");
    else if (auth.user.mustChangePassword && pathname !== "/account/password") router.replace("/account/password");
  }, [auth.ready, auth.user, pathname, router]);

  if (!auth.ready || !auth.user) return <p className="content">Loading…</p>;

  let group = "";
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">Ledger<small>One company</small></div>
        {NAV.filter((item) => !item.permission || can(auth.user, item.permission)).map((item) => {
          const heading = item.group !== group ? item.group : "";
          group = item.group;
          return (
            <div key={item.href}>
              {heading ? <div className="nav-group">{heading}</div> : null}
              <Link className={pathname === item.href ? "nav-link active" : "nav-link"} href={item.href}>{item.label}</Link>
            </div>
          );
        })}
      </aside>
      <div className="main">
        <header className="topbar">
          <strong>{auth.user.displayName}</strong>
          <button className="btn quiet" type="button" onClick={() => auth.signOut().then(() => router.push("/login"))}>Sign out</button>
        </header>
        <div className="content">{children}</div>
      </div>
    </div>
  );
}
