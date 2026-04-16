import Link from "next/link";
import { createClient } from "@/app/utils/supabase/server";
import AdminGuard from "../AdminGuard";

type MemberRecord = {
  id: string;
  name: string | null;
  role: string | null;
  auth_id: string | null;
  illinois_email: string | null;
};

type EventRecord = {
  id: string;
  name: string;
  date: string;
  is_mandatory: boolean | null;
  event_type: string | null;
  points: number | null;
};

type AttendanceRecord = {
  id: string;
  user_id: string;
  event_id: string;
  timestamp: string | null;
};

type AbsenceRecord = {
  id: string;
  user_id: string;
  event_id: string;
  status: string | null;
  reason: string | null;
  submitted_at: string | null;
};

function formatDate(dateString: string) {
  const date = new Date(dateString);

  if (Number.isNaN(date.getTime())) {
    return dateString;
  }

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function EventReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ eventId?: string }>;
}) {
  const { eventId } = await searchParams;
  const supabase = await createClient();

  const [membersRes, eventsRes, attendanceRes, absencesRes] = await Promise.all([
    supabase
      .from("People")
      .select("id, name, role, auth_id, illinois_email")
      .order("name", { ascending: true }),

    supabase
      .from("events")
      .select("id, name, date, is_mandatory, event_type, points")
      .order("date", { ascending: true }),

    supabase
      .from("attendance")
      .select("id, user_id, event_id, timestamp"),

    supabase
      .from("excused_absences")
      .select("id, user_id, event_id, status, reason, submitted_at"),
  ]);

  const loadError =
    membersRes.error?.message ??
    eventsRes.error?.message ??
    attendanceRes.error?.message ??
    absencesRes.error?.message ??
    null;

  const members = (membersRes.data ?? []) as MemberRecord[];
  const events = (eventsRes.data ?? []) as EventRecord[];
  const attendance = (attendanceRes.data ?? []) as AttendanceRecord[];
  const absences = (absencesRes.data ?? []) as AbsenceRecord[];

  const selectedEvent = events.find((event) => event.id === eventId) ?? null;

  const attendanceForEvent = attendance.filter(
    (record) => record.event_id === eventId
  );

  const attendedUserIds = new Set(
    attendanceForEvent.map((record) => record.user_id)
  );

  const approvedAbsencesForEvent = absences.filter(
    (record) =>
      record.event_id === eventId &&
      record.status?.toLowerCase() === "approved"
  );

  const excusedUserIds = new Set(
    approvedAbsencesForEvent.map((record) => record.user_id)
  );

  const attendedMembers = members.filter(
    (member) => member.auth_id && attendedUserIds.has(member.auth_id)
  );

  const excusedMembers =
    selectedEvent?.is_mandatory === true
      ? members.filter(
          (member) =>
            member.auth_id &&
            !attendedUserIds.has(member.auth_id) &&
            excusedUserIds.has(member.auth_id)
        )
      : [];

  const unexcusedMembers =
    selectedEvent?.is_mandatory === true
      ? members.filter(
          (member) =>
            member.auth_id &&
            !attendedUserIds.has(member.auth_id) &&
            !excusedUserIds.has(member.auth_id)
        )
      : [];

  const attendanceRate =
    members.length > 0
      ? Math.round((attendedMembers.length / members.length) * 100)
      : 0;

  return (
    <AdminGuard>
      <div style={styles.page}>
        <div style={styles.container}>
          <div style={styles.topBar}>
            <div>
              <h1 style={styles.title}>Event Review</h1>
              <div style={styles.subtitle}>
                Member-by-member attendance breakdown
              </div>
            </div>

            <Link href="/users/admin/viewAllEvents" style={styles.backButton}>
              ← Back to Events
            </Link>
          </div>

          {loadError && <div style={styles.errorText}>Error: {loadError}</div>}

          {!loadError && !eventId && (
            <div style={styles.card}>
              <div style={styles.emptyText}>No event selected.</div>
            </div>
          )}

          {!loadError && eventId && !selectedEvent && (
            <div style={styles.card}>
              <div style={styles.emptyText}>Event not found.</div>
            </div>
          )}

          {!loadError && selectedEvent && (
            <>
              <div style={styles.summaryGrid}>
                <div style={styles.card}>
                  <div style={styles.cardLabel}>Event</div>
                  <div style={styles.cardValueSmall}>{selectedEvent.name}</div>
                </div>

                <div style={styles.card}>
                  <div style={styles.cardLabel}>Date & Time</div>
                  <div style={styles.cardValueSmall}>
                    {formatDate(selectedEvent.date)}
                  </div>
                </div>

                <div style={styles.card}>
                  <div style={styles.cardLabel}>Attendance</div>
                  <div style={styles.cardValue}>
                    {attendedMembers.length}/{members.length}
                  </div>
                </div>

                <div style={styles.card}>
                  <div style={styles.cardLabel}>Attendance Rate</div>
                  <div style={styles.cardValue}>{attendanceRate}%</div>
                </div>

                <div style={styles.card}>
                  <div style={styles.cardLabel}>Requirement</div>
                  <div style={styles.cardValueSmall}>
                    {selectedEvent.is_mandatory ? "Mandatory" : "Optional"}
                  </div>
                </div>

                <div style={styles.card}>
                  <div style={styles.cardLabel}>Type</div>
                  <div style={styles.cardValueSmall}>
                    {selectedEvent.event_type ?? "N/A"}
                  </div>
                </div>
              </div>

              <div style={styles.section}>
                <h2 style={styles.sectionTitle}>
                  Attended Members ({attendedMembers.length})
                </h2>

                {attendedMembers.length === 0 ? (
                  <div style={styles.card}>
                    <div style={styles.emptyText}>
                      No attendance records for this event.
                    </div>
                  </div>
                ) : (
                  <div style={styles.list}>
                    {attendedMembers.map((member) => {
                      const attendanceRecord = attendanceForEvent.find(
                        (record) => record.user_id === member.auth_id
                      );

                      return (
                        <div key={member.id} style={styles.row}>
                          <div>
                            <div style={styles.memberName}>
                              {member.name ?? "Unnamed Member"}
                            </div>
                            <div style={styles.memberMeta}>
                              {member.role ?? "No role"} •{" "}
                              {member.illinois_email ?? "No email"}
                            </div>
                          </div>

                          <div style={styles.statusBlock}>
                            <div style={styles.statusBadge}>Attended</div>
                            <div style={styles.timestamp}>
                              {attendanceRecord?.timestamp
                                ? formatDate(attendanceRecord.timestamp)
                                : "No timestamp"}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {selectedEvent.is_mandatory === true && (
                <>
                  <div style={styles.section}>
                    <h2 style={styles.sectionTitle}>
                      Excused Members ({excusedMembers.length})
                    </h2>

                    {excusedMembers.length === 0 ? (
                      <div style={styles.card}>
                        <div style={styles.emptyText}>No excused absences.</div>
                      </div>
                    ) : (
                      <div style={styles.list}>
                        {excusedMembers.map((member) => {
                          const absenceRecord = approvedAbsencesForEvent.find(
                            (record) => record.user_id === member.auth_id
                          );

                          return (
                            <div key={member.id} style={styles.row}>
                              <div>
                                <div style={styles.memberName}>
                                  {member.name ?? "Unnamed Member"}
                                </div>
                                <div style={styles.memberMeta}>
                                  {member.role ?? "No role"} •{" "}
                                  {member.illinois_email ?? "No email"}
                                </div>
                                <div style={styles.reasonText}>
                                  Reason:{" "}
                                  {absenceRecord?.reason ?? "No reason provided"}
                                </div>
                              </div>

                              <div style={styles.statusBlock}>
                                <div style={styles.statusBadge}>Excused</div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div style={styles.section}>
                    <h2 style={styles.sectionTitle}>
                      Unexcused Members ({unexcusedMembers.length})
                    </h2>

                    {unexcusedMembers.length === 0 ? (
                      <div style={styles.card}>
                        <div style={styles.emptyText}>
                          No unexcused absences.
                        </div>
                      </div>
                    ) : (
                      <div style={styles.list}>
                        {unexcusedMembers.map((member) => (
                          <div key={member.id} style={styles.row}>
                            <div>
                              <div style={styles.memberName}>
                                {member.name ?? "Unnamed Member"}
                              </div>
                              <div style={styles.memberMeta}>
                                {member.role ?? "No role"} •{" "}
                                {member.illinois_email ?? "No email"}
                              </div>
                            </div>

                            <div style={styles.statusBlock}>
                              <div style={styles.statusBadge}>Unexcused</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </AdminGuard>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  page: {
    minHeight: "100vh",
    background: "#000000",
    color: "#ffffff",
    padding: "32px 24px",
    fontFamily: "Inter, Arial, sans-serif",
  },
  container: {
    maxWidth: "1200px",
    margin: "0 auto",
  },
  topBar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "16px",
    marginBottom: "24px",
    flexWrap: "wrap",
  },
  title: {
    fontSize: "44px",
    fontWeight: 800,
    margin: 0,
  },
  subtitle: {
    color: "#a3a3a3",
    marginTop: "8px",
    fontSize: "16px",
  },
  backButton: {
    display: "inline-block",
    background: "#111111",
    color: "#ffffff",
    textDecoration: "none",
    fontWeight: 700,
    borderRadius: "10px",
    padding: "10px 14px",
    fontSize: "14px",
    border: "1px solid #2d2d2d",
  },
  summaryGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: "16px",
    marginBottom: "28px",
  },
  card: {
    background: "#111111",
    border: "1px solid #2a2a2a",
    borderRadius: "16px",
    padding: "20px",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
  },
  cardLabel: {
    color: "#a3a3a3",
    fontWeight: 600,
    fontSize: "14px",
    marginBottom: "8px",
  },
  cardValue: {
    fontSize: "34px",
    fontWeight: 800,
  },
  cardValueSmall: {
    fontSize: "18px",
    fontWeight: 700,
    lineHeight: 1.35,
  },
  section: {
    marginBottom: "28px",
  },
  sectionTitle: {
    fontSize: "24px",
    fontWeight: 700,
    marginBottom: "14px",
  },
  list: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  row: {
    background: "#111111",
    border: "1px solid #252525",
    borderRadius: "14px",
    padding: "16px 18px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "16px",
  },
  memberName: {
    fontSize: "18px",
    fontWeight: 700,
    marginBottom: "6px",
  },
  memberMeta: {
    fontSize: "14px",
    color: "#b3b3b3",
  },
  reasonText: {
    fontSize: "14px",
    color: "#d4d4d4",
    marginTop: "8px",
  },
  statusBlock: {
    textAlign: "right",
  },
  statusBadge: {
    display: "inline-block",
    background: "#222222",
    border: "1px solid #333333",
    borderRadius: "999px",
    padding: "6px 10px",
    fontSize: "12px",
    fontWeight: 700,
  },
  timestamp: {
    marginTop: "8px",
    color: "#b3b3b3",
    fontSize: "13px",
  },
  emptyText: {
    color: "#b3b3b3",
    fontSize: "15px",
  },
  errorText: {
    color: "#ff9b71",
    fontWeight: 700,
    fontSize: "16px",
    marginBottom: "20px",
  },
};