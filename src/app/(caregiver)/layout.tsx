import { CaregiverHeader } from "@/components/caregiver-header";

export default function CaregiverLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="caregiver-shell">
      <CaregiverHeader />
      {children}
    </div>
  );
}
