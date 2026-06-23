import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/app/utils/supabase/server";
import AdminGuard from "../../../AdminGuard";
import { addStrike } from "../../actions";

type AddStrikePageProps = {
    params: Promise<{
        memberId: string;
    }>;
};

export default async function AddStrikePage({ params }: AddStrikePageProps) {
    const { memberId } = await params;
    const supabase = await createClient();

    const [{ data: member }, { data: events }] = await Promise.all([
        supabase
            .from("People")
            .select("id, name, illinois_email, auth_id")
            .eq("id", Number(memberId))
            .single(),
        supabase
            .from("events")
            .select("id, name, date")
            .order("date", { ascending: false }),
    ]);

    if (!member?.auth_id) {
        redirect("/users/admin/reviewMemberStats");
    }

    return (
        <AdminGuard>
            <main className="app-shell">
                <div className="page-frame flex w-full flex-col gap-6">
                    <header className="rounded-[2rem] border border-[color:var(--border)] bg-[linear-gradient(145deg,rgba(229,138,39,0.12),rgba(255,251,247,0.88))] p-6 shadow-[0_28px_80px_rgba(79,80,82,0.12)] backdrop-blur">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                            <div className="space-y-2">
                                <p className="eyebrow">Administration</p>
                                <h1 className="page-title" style={{ fontSize: "clamp(2.2rem,4vw,3.4rem)" }}>
                                    Add Strike
                                </h1>
                                <p className="max-w-2xl text-sm leading-6 text-[color:var(--muted)]">
                                    Add a manual strike for {member.name ?? "this member"}.
                                </p>
                            </div>

                            <Link href="/users/admin/reviewMemberStats" className="btn-secondary">
                                Back to Member Stats
                            </Link>
                        </div>
                    </header>

                    <section className="rounded-[2rem] border border-[color:var(--border)] bg-[linear-gradient(180deg,rgba(255,251,247,0.88),rgba(244,236,230,0.82))] p-6 shadow-[0_24px_60px_rgba(79,80,82,0.1)] backdrop-blur">
                        <div className="mb-6 rounded-3xl border border-[color:var(--border)] bg-[rgba(255,251,247,0.62)] p-5">
                            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[color:var(--accent)]">
                                Selected member
                            </p>
                            <h2 className="mt-2 text-2xl font-semibold text-[color:var(--foreground)]">
                                {member.name ?? "Unnamed member"}
                            </h2>
                            <p className="mt-1 text-sm text-[color:var(--muted)]">
                                {member.illinois_email ?? "No email on file"}
                            </p>
                        </div>

                        <form action={addStrike} className="space-y-5">
                            <input type="hidden" name="memberId" value={member.id} />
                            <input type="hidden" name="memberAuthId" value={member.auth_id} />

                            <label className="block space-y-2">
                                <span className="text-sm font-medium text-[color:var(--foreground)]">
                                    Related event
                                </span>
                                <select
                                    name="eventId"
                                    className="w-full rounded-2xl border border-[color:var(--border)] bg-[rgba(255,251,247,0.92)] px-4 py-3 text-sm text-[color:var(--foreground)] outline-none"
                                    defaultValue=""
                                >
                                    <option value="">No event linked</option>
                                    {(events ?? []).map((event) => (
                                        <option key={event.id} value={event.id}>
                                            {event.name ?? "Unnamed event"} {event.date ? `(${formatDate(event.date)})` : ""}
                                        </option>
                                    ))}
                                </select>
                            </label>

                            <label className="block space-y-2">
                                <span className="text-sm font-medium text-[color:var(--foreground)]">
                                    Reason
                                </span>
                                <textarea
                                    name="reason"
                                    required
                                    rows={4}
                                    placeholder="Explain why this strike is being issued."
                                    className="w-full rounded-2xl border border-[color:var(--border)] bg-[rgba(255,251,247,0.92)] px-4 py-3 text-sm text-[color:var(--foreground)] outline-none"
                                />
                            </label>

                            <label className="block space-y-2">
                                <span className="text-sm font-medium text-[color:var(--foreground)]">
                                    Admin note
                                </span>
                                <textarea
                                    name="adminNote"
                                    rows={3}
                                    placeholder="Optional internal note."
                                    className="w-full rounded-2xl border border-[color:var(--border)] bg-[rgba(255,251,247,0.92)] px-4 py-3 text-sm text-[color:var(--foreground)] outline-none"
                                />
                            </label>

                            <div className="flex justify-end gap-3">
                                <Link href="/users/admin/reviewMemberStats" className="btn-secondary">
                                    Cancel
                                </Link>
                                <button type="submit" className="btn-primary">
                                    Submit Strike
                                </button>
                            </div>
                        </form>
                    </section>
                </div>
            </main>
        </AdminGuard>
    );
}

function formatDate(value: string | null) {
    if (!value) return "Unknown date";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return "Unknown date";

    return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
    }).format(date);
}