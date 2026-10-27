/** Organizer and gate screens bring their own frame (sidebar shell or slim top bar). */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh">{children}</div>;
}
