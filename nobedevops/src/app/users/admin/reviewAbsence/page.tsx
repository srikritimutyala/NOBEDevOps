import { createClient } from "@/app/utils/supabase/server";
import AdminGuard from "../AdminGuard";
import ReviewAbsenceClient, { type ReviewAbsenceItem } from "./reviewAbsenceClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ExcusedAbsenceRow = {
  id: string;
  user_id: string | null;
  reason: string | null;
  status: string | null;
  submitted_at: string | null;
  admin_response: string | null;
  reviewed_at: string | null;
  email_sent: boolean | null;
  email_error: string | null;
};

type PersonRow = {
  auth_id: string | null;
  name: string | null;
  illinois_email: string | null;
};

export default async function ReviewAbsence() {
  const supabase = await createClient();

  const [absencesRes, peopleRes] = await Promise.all([
    supabase
      .from("excused_absences")
      .select("id, user_id, reason, status, submitted_at, admin_response, reviewed_at, email_sent, email_error")
      .order("submitted_at", { ascending: false }),
    supabase
      .from("People")
      .select("auth_id, name, illinois_email"),
  ]);

  const error = absencesRes.error ?? peopleRes.error;
  const absences = (absencesRes.data ?? []) as ExcusedAbsenceRow[];
  const people = (peopleRes.data ?? []) as PersonRow[];
  const submitterByAuthId = new Map(
    people
      .filter((person) => person.auth_id)
      .map((person) => [
        person.auth_id as string,
        person.name?.trim() || person.illinois_email?.trim() || person.auth_id,
      ])
  );

  const items: ReviewAbsenceItem[] = absences.map((absence) => ({
    id: absence.id,
    submitterLabel: absence.user_id
      ? submitterByAuthId.get(absence.user_id) ?? absence.user_id
      : "N/A",
    reason: absence.reason,
    status: absence.status,
    submittedAt: absence.submitted_at,
    adminResponse: absence.admin_response,
    reviewedAt: absence.reviewed_at,
    emailSent: absence.email_sent,
    emailError: absence.email_error,
  }));

  return (
    <AdminGuard>
      <main className="mx-auto max-w-6xl p-6 space-y-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold">Review Absences</h1>
          <p className="text-sm opacity-80">
            Review submitted absence requests, send a response, and update request status.
          </p>
        </header>

        {error ? (
          <section className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            Failed to load absence requests: {error.message}
          </section>
        ) : (
          <ReviewAbsenceClient items={items} />
        )}
      </main>
    </AdminGuard>
  );
}
