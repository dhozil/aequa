import type { Metadata } from "next";
import { AdminDashboard } from "@/components/admin/admin-dashboard";

export const metadata: Metadata = {
  title: "Owner panel",
  description:
    "Open rounds, publish a public rubric, and manage the Aequa Grants treasury. For the contract owner only.",
  robots: { index: false, follow: false },
};

export default function AdminPage() {
  return <AdminDashboard />;
}
