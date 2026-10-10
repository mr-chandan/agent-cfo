import {
  CreditCard,
  HandCoins,
  House,
  Receipt,
  Scale,
  ScrollText,
  ShieldCheck,
  Users,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { title: string; href: string; icon: LucideIcon; hint: string };

// The app's map, shared by the sidebar and the Ctrl+K palette. A group whose
// label matches its only item (Home) renders without an eyebrow in the sidebar.
export const NAV: { label: string; items: NavItem[] }[] = [
  {
    label: "Home",
    items: [{ title: "Home", href: "/", icon: House, hint: "Ask the agent and see what needs you" }],
  },
  {
    label: "Money",
    items: [
      { title: "Payments", href: "/payments", icon: CreditCard, hint: "Orders and payment status" },
      { title: "Customers", href: "/customers", icon: Users, hint: "Who paid and how much" },
      { title: "Payroll", href: "/payroll", icon: HandCoins, hint: "Salaries and payouts to your team" },
      { title: "GST & Tax", href: "/gst", icon: Receipt, hint: "GST estimate and portal link" },
    ],
  },
  {
    label: "Support",
    items: [{ title: "Disputes", href: "/disputes", icon: Scale, hint: "Customer complaints" }],
  },
  {
    label: "Control",
    items: [
      { title: "Approvals", href: "/approvals", icon: ShieldCheck, hint: "Actions waiting for a human" },
      { title: "Audit log", href: "/audit", icon: ScrollText, hint: "Every agent action and decision" },
    ],
  },
];
