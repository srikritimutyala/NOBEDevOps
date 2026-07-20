import { createClient } from "@/app/utils/supabase/server";
import { getPointRequirements } from "@/app/utils/getPointRequirements";
import AdminDashboard from "./adminDashboard";
import AdminGuard from "./AdminGuard";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type MemberRow = {
  id: number;
  name: string | null;
  first_name: string | null;
  last_name: string | null;
  auth_id: string | null;
  strikes: number | null;
  committee: string | null;
  major: string | null;
  social_points: number | null;
  professional_points: number | null;
  service_points: number | null;
  illinois_email: string | null;
  role: string | null;
  year: string | null;
  college: string | null;
};

type EventRow = {
  id: string;
  name: string | null;
  date: string | null;
  event_type: string | null;
  is_mandatory: boolean | null;
  check_in_ends_at: string | null;
  strikes_processed: boolean | null;
  qr_code_secret: string | null;
  points: number | null;
  created_at: string | null;
  location: string | null;
  gcal_event_id: string | null;
  dresscode: string | null;
};

type AttendanceDbRow = {
  id: string;
  user_id: string | null;
  event_id: string | null;
  timestamp: string | null;
};

type AbsenceRow = {
  id: string;
  user_id: string | null;
  event_id: string | null;
  status: string | null;
  reason: string | null;
  submitted_at: string | null;
  email_sent: boolean | null;
  email_error: string | null;
};

type StrikeRow = {
  id: string;
  user_id: string | null;
  event_id: string | null;
  strike_type: string | null;
  reason: string | null;
  status: string | null;
  source: string | null;
  admin_note: string | null;
  created_by: string | null;
  created_at: string | null;
};

type CsvUploadRow = {
  id: string;
  file_name: string | null;
  mime_type: string | null;
  content: string | null;
  uploaded_by: string | null;
  uploaded_at: string | null;
};

export default async function AdminPage() {
  const supabase = await createClient();

  // Get current logged-in user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Get point requirements
  const goals = await getPointRequirements();

  // Fetch all dashboard data concurrently
  const [
    membersRes,
    eventsRes,
    attendanceRes,
    absencesRes,
    strikesRes,
    uploadsRes,
    syncSettingRes,
  ] = await Promise.all([
    supabase
      .from("People")
      .select(
        "id, name, first_name, last_name, auth_id, strikes, committee, major, social_points, professional_points, service_points, illinois_email, role, year, college"
      ),
    supabase
      .from("events")
      .select(
        "id, name, date, event_type, is_mandatory, check_in_ends_at, strikes_processed, qr_code_secret, points, created_at, location, gcal_event_id, dresscode"
      ),
    supabase
      .from("attendance")
      .select("id, user_id, event_id, timestamp"),
    supabase
      .from("excused_absences")
      .select(
        "id, user_id, event_id, status, reason, submitted_at, email_sent, email_error"
      ),
    supabase
      .from("strikes")
      .select(
        "id, user_id, event_id, strike_type, reason, status, source, admin_note, created_by, created_at"
      )
      .eq("status", "ACTIVE"),
    supabase
      .from("csv_uploads")
      .select("id, file_name, content, uploaded_at")
      .order("uploaded_at", { ascending: false }),
    supabase
      .from("SystemSettings")
      .select("value")
      .eq("key", "calendar_last_synced")
      .maybeSingle(),
  ]);

  const loadError =
    membersRes.error?.message ??
    eventsRes.error?.message ??
    attendanceRes.error?.message ??
    absencesRes.error?.message ??
    strikesRes.error?.message ??
    uploadsRes.error?.message ??
    null;

  const members = (membersRes.data ?? []) as MemberRow[];
  const rawEvents = (eventsRes.data ?? []) as EventRow[];
  
  // Deduplicate events with the same name and date (e.g. local vs synced Google Calendar events)
  // Prioritize local events or those with qr_code_secret to avoid double counting and missing check-in keys
  const eventMap = new Map<string, EventRow>();
  for (const e of rawEvents) {
    if (!e.name || !e.date) continue;
    
    // Normalize date to minutes to avoid small millisecond/formatting differences
    const parsedDate = parseDate(e.date);
    const dateKey = parsedDate ? Math.floor(parsedDate.getTime() / 60000).toString() : e.date;
    const key = `${e.name.trim().toLowerCase()}_${dateKey}`;
    const existing = eventMap.get(key);

    if (!existing) {
      eventMap.set(key, e);
    } else {
      const existingIsImported = existing.gcal_event_id?.startsWith("imported:");
      const currentIsImported = e.gcal_event_id?.startsWith("imported:");

      if (existingIsImported && !currentIsImported) {
        // Replace imported event with local event
        eventMap.set(key, e);
      } else if (!existingIsImported && currentIsImported) {
        // Keep existing local event
      } else {
        // Keep the one that has a QR code secret if available
        if (e.qr_code_secret && !existing.qr_code_secret) {
          eventMap.set(key, e);
        }
      }
    }
  }
  const events = Array.from(eventMap.values());

  const attendance = (attendanceRes.data ?? []) as AttendanceDbRow[];
  const absences = (absencesRes.data ?? []) as AbsenceRow[];
  const strikes = (strikesRes.data ?? []) as StrikeRow[];
  const csvUploads = (uploadsRes.data ?? []) as CsvUploadRow[];
  const syncSetting = syncSettingRes.data;

  // Resolve logged-in admin's name
  const currentMember = members.find((m) => m.auth_id === user?.id);
  const adminName =
    currentMember?.first_name ||
    currentMember?.name ||
    user?.email?.split("@")[0] ||
    "Admin";

  const now = Date.now();

  const pastEvents = events.filter((e) => {
    const d = parseDate(e.date);
    return d !== null && d.getTime() <= now;
  });

  const upcomingEventsList = events.filter((e) => {
    const d = parseDate(e.date);
    return d !== null && d.getTime() > now;
  });

  const upcomingEventsCount = upcomingEventsList.length;

  const pendingAbsences = absences.filter(
    (a) => !a.status || a.status.trim().toUpperCase() === "PENDING"
  );
  const pendingAbsencesCount = pendingAbsences.length;

  // Compute members at risk
  const atRiskList = [];
  const authLinkedMembers = members.filter((member) => Boolean(member.auth_id));
  const attendancePairs = new Set(
    attendance
      .filter((row) => row.user_id && row.event_id)
      .map((row) => `${row.user_id}:${row.event_id}`)
  );

  const excusedUserIds = new Set(
    absences
      .filter((row) => row.user_id && row.event_id && row.status?.trim().toUpperCase() === "APPROVED")
      .map((row) => `${row.user_id}:${row.event_id}`)
  );

  for (const member of members) {
    if (!member.auth_id) continue;

    const authId = member.auth_id;
    const strikeCount = strikes.filter(s => s.user_id === authId).length;
    const profPoints = member.professional_points || 0;
    const servPoints = member.service_points || 0;
    const socPoints = member.social_points || 0;

    const missingProf = Math.max(goals.professional_goal - profPoints, 0);
    const missingServ = Math.max(goals.service_goal - servPoints, 0);
    const missingSoc = Math.max(goals.social_goal - socPoints, 0);

    // Latest attendance check
    const memberCheckins = attendance.filter((a) => a.user_id === authId);
    let latestCheckinTime = 0;
    for (const ch of memberCheckins) {
      const t = parseDate(ch.timestamp)?.getTime() || 0;
      if (t > latestCheckinTime) {
        latestCheckinTime = t;
      }
    }

    const fourWeeksAgo = now - 4 * 7 * 24 * 60 * 60 * 1000;
    const hasPastEvents = pastEvents.length > 0;
    const hasnAttendedIn4Weeks =
      hasPastEvents && latestCheckinTime > 0 && latestCheckinTime < fourWeeksAgo;
    const neverAttended = hasPastEvents && memberCheckins.length === 0;

    let isAtRisk = false;
    let reason = "";

    if (strikeCount > 0) {
      isAtRisk = true;
      reason = `${strikeCount} strike${strikeCount === 1 ? "" : "s"} active`;
    }

    if (isAtRisk) {
      atRiskList.push({
        id: member.id.toString(),
        name: member.name || `${member.first_name} ${member.last_name}`,
        strikes: strikeCount,
        professionalPoints: `${profPoints}/${goals.professional_goal}`,
        servicePoints: `${servPoints}/${goals.service_goal}`,
        socialPoints: `${socPoints}/${goals.social_goal}`,
        reason,
      });
    }
  }

  atRiskList.sort((a, b) => b.strikes - a.strikes || a.name.localeCompare(b.name));
  const atRiskMembersCount = atRiskList.length;

  // Needs Attention items
  const needsAttentionList = [];

  // 1. Pending absences
  if (pendingAbsencesCount > 0) {
    needsAttentionList.push({
      id: "pending_absences",
      type: "absence_requests",
      title: `${pendingAbsencesCount} absence request(s) awaiting review`,
      description: "Approve or deny submitted absence requests.",
      link: "/users/admin/reviewAbsence",
    });
  }

  // 2. Strike processing unprocessed meetings
  const unprocessedMandatoryEvents = pastEvents.filter(
    (e) => e.is_mandatory && !e.strikes_processed
  );
  if (unprocessedMandatoryEvents.length > 0) {
    needsAttentionList.push({
      id: "unprocessed_strikes",
      type: "strikes_unprocessed",
      title: `Strike processing hasn't run for ${unprocessedMandatoryEvents[0].name}`,
      description: "Click to run the strike processor to assign strikes for this meeting.",
      link: "#",
      action: "process_strikes",
      eventId: unprocessedMandatoryEvents[0].id,
    });
  }

  // 4. Two strikes members
  const twoStrikesCount = members.filter((m) => {
    if (!m.auth_id) return false;
    const count = strikes.filter(s => s.user_id === m.auth_id).length;
    return count === 2;
  }).length;
  if (twoStrikesCount > 0) {
    needsAttentionList.push({
      id: "two_strikes",
      type: "two_strikes",
      title: `${twoStrikesCount} member(s) have reached 2 strikes`,
      description: "Officers should proactively review and reach out to these members.",
      link: "/users/admin/reviewMemberStats",
    });
  }

  // 5. Email failures
  const failedEmailCount = absences.filter(
    (a) => a.email_sent === false && a.email_error
  ).length;
  if (failedEmailCount > 0) {
    needsAttentionList.push({
      id: "email_failures",
      type: "email_failures",
      title: `Email notification failed for ${failedEmailCount} absence response(s)`,
      description: "Retry sending confirmation emails to members.",
      link: "/users/admin/reviewAbsence",
    });
  }

  // Upcoming Events limit to 15 to enable scroll compatibility
  const upcomingEvents = upcomingEventsList
    .sort((a, b) => parseDate(a.date)!.getTime() - parseDate(b.date)!.getTime())
    .slice(0, 15)
    .map((e) => ({
      id: e.id,
      name: e.name || "Unnamed Event",
      date: e.date || "",
      is_mandatory: e.is_mandatory || false,
      event_type: e.event_type || "GCAL_UNSPECIFIED",
      qr_code_secret: e.qr_code_secret,
      dresscode: e.dresscode,
    }));

  // Attendance Overview calculations
  const lastEvent = pastEvents
    .sort((a, b) => parseDate(b.date)!.getTime() - parseDate(a.date)!.getTime())[0];
  let lastEventRate = null;
  let lastEventName = null;
  if (lastEvent) {
    lastEventName = lastEvent.name;
    const checkedInCount = attendance.filter((a) => a.event_id === lastEvent.id).length;
    const totalAuthMembers = members.filter((m) => m.auth_id).length;
    lastEventRate =
      totalAuthMembers > 0 ? Math.round((checkedInCount / totalAuthMembers) * 100) : 0;
  }

  const totalPossibleOpportunities = authLinkedMembers.length * pastEvents.length;
  let totalAttendedOpportunities = 0;
  for (const member of authLinkedMembers) {
    const authId = member.auth_id as string;
    for (const event of pastEvents) {
      if (attendancePairs.has(`${authId}:${event.id}`)) {
        totalAttendedOpportunities += 1;
      }
    }
  }

  const averageRate =
    totalPossibleOpportunities === 0
      ? null
      : Math.round((totalAttendedOpportunities / totalPossibleOpportunities) * 100);

  const missedMandatoryCount = members.filter(
    (m) => {
      if (!m.auth_id) return false;
      const count = strikes.filter(s => s.user_id === m.auth_id).length;
      return count > 0;
    }
  ).length;

  // Recent Activity Feed compilation
  const activityList: Array<{ id: string; type: string; description: string; timestamp: string }> = [];
  const memberNameByAuthId = new Map(
    members.map((m) => [m.auth_id, m.name || `${m.first_name} ${m.last_name}`])
  );
  const eventNameById = new Map(events.map((e) => [e.id, e.name]));

  // 1. Check-ins
  attendance.forEach((att) => {
    if (!att.timestamp) return;
    const memberName = att.user_id ? memberNameByAuthId.get(att.user_id) || "Member" : "Member";
    const eventName = att.event_id ? eventNameById.get(att.event_id) || "Event" : "Event";
    activityList.push({
      id: `checkin-${att.id}`,
      type: "checkin",
      description: `${memberName} checked into ${eventName}`,
      timestamp: att.timestamp,
    });
  });

  // 2. Absences
  absences.forEach((abs) => {
    if (!abs.submitted_at) return;
    const memberName = abs.user_id ? memberNameByAuthId.get(abs.user_id) || "Member" : "Member";
    const eventName = abs.event_id ? eventNameById.get(abs.event_id) || "Event" : "Event";
    activityList.push({
      id: `absence-${abs.id}`,
      type: "absence",
      description: `${memberName} submitted absence request for ${eventName}`,
      timestamp: abs.submitted_at,
    });
  });

  // 3. Creations
  events.forEach((evt) => {
    if (!evt.created_at) return;
    activityList.push({
      id: `event-create-${evt.id}`,
      type: "event_create",
      description: `Event "${evt.name}" was created`,
      timestamp: evt.created_at,
    });
  });

  // 4. CSV Uploads
  csvUploads.forEach((up) => {
    if (!up.uploaded_at) return;
    const rowCount =
      (up.content as string || "")
        .split("\n")
        .filter((line) => line.trim().length > 0).length - 1;
    activityList.push({
      id: `csv-${up.id}`,
      type: "csv_import",
      description: `CSV import added ${rowCount > 0 ? rowCount : 0} member(s)`,
      timestamp: up.uploaded_at,
    });
  });

  // 5. Strikes
  strikes.forEach((st) => {
    if (!st.created_at) return;
    const memberName = st.user_id ? memberNameByAuthId.get(st.user_id) || "Member" : "Member";
    const eventName = st.event_id ? eventNameById.get(st.event_id) || "Event" : "Event";
    const isAuto = st.source === "AUTOMATIC";
    activityList.push({
      id: `strike-${st.id}`,
      type: "strike",
      description: isAuto
        ? `Cron processed strike for ${memberName} (${eventName})`
        : `Admin issued strike for ${memberName} (${eventName})`,
      timestamp: st.created_at,
    });
  });

  const recentActivity = activityList
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 25);

  // Requirements Completion Progress
  const professionalCompleted = members.filter(
    (m) => (m.professional_points ?? 0) >= goals.professional_goal
  ).length;
  const socialCompleted = members.filter(
    (m) => (m.social_points ?? 0) >= goals.social_goal
  ).length;
  const serviceCompleted = members.filter(
    (m) => (m.service_points ?? 0) >= goals.service_goal
  ).length;

  // System Health
  const supabaseStatus = loadError ? "error" : "healthy";
  const lastSyncTime = syncSetting?.value
    ? new Date(syncSetting.value)
    : new Date(now - 18 * 60 * 1000);

  const formatRelativeTime = (date: Date) => {
    const diffMs = now - date.getTime();
    const diffMins = Math.floor(diffMs / (60 * 1000));
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `Last synced ${diffMins} min ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `Last synced ${diffHours} hr ago`;
    return `Last synced ${date.toLocaleDateString()}`;
  };

  const gcalSyncStatus = formatRelativeTime(lastSyncTime);

  const emailFailuresInLast24 = absences.filter(
    (a) =>
      a.email_sent === false &&
      a.email_error &&
      a.submitted_at &&
      now - new Date(a.submitted_at).getTime() < 24 * 60 * 60 * 1000
  ).length;
  const emailStatus = emailFailuresInLast24 > 0 ? "error" : "healthy";

  const cronStatus = unprocessedMandatoryEvents.length > 0 ? "stopped" : "running";

  // Filter events happening right now or in the future that have check-in keys
  const qrEvents = events
    .filter((e) => {
      if (!e.qr_code_secret) return false;
      const eventDate = parseDate(e.date);
      if (!eventDate) return false;
      
      const isUpcoming = eventDate.getTime() > now;
      const checkInEnds = parseDate(e.check_in_ends_at);
      const isEndingInFuture = checkInEnds ? checkInEnds.getTime() > now : false;

      // Event is today (regardless of check_in_ends_at)
      const todayDate = new Date();
      const isToday =
        eventDate.getDate() === todayDate.getDate() &&
        eventDate.getMonth() === todayDate.getMonth() &&
        eventDate.getFullYear() === todayDate.getFullYear();

      return isUpcoming || isEndingInFuture || isToday;
    })
    .sort((a, b) => parseDate(a.date)!.getTime() - parseDate(b.date)!.getTime())
    .map((e) => ({
      id: e.id,
      name: e.name || "Unnamed Event",
      date: e.date || "",
      qr_code_secret: e.qr_code_secret!,
    }));

  return (
    <AdminGuard>
      <div className="app-shell">
        <div className="page-frame page-stack">
          {loadError && (
            <div className="message-error" style={{ marginBottom: "20px" }}>
              Database Error: {loadError}
            </div>
          )}

          <AdminDashboard
            adminName={adminName}
            quickStats={{
              totalMembers: members.length,
              upcomingEvents: upcomingEventsCount,
              pendingAbsences: pendingAbsencesCount,
              atRiskMembers: atRiskMembersCount,
              attendanceRate: averageRate,
              totalStrikes: strikes.length,
              completedRequirements: members.filter(
                (m) =>
                  (m.professional_points ?? 0) >= goals.professional_goal &&
                  (m.social_points ?? 0) >= goals.social_goal &&
                  (m.service_points ?? 0) >= goals.service_goal
              ).length,
            }}
            needsAttention={needsAttentionList}
            upcomingEvents={upcomingEvents}
            qrEvents={qrEvents}
            attendanceOverview={{
              lastEventRate,
              lastEventName,
              averageRate,
              missedMandatoryCount,
            }}
            membersAtRisk={atRiskList}
            recentActivity={recentActivity}
            clubProgress={{
              professionalCompleted,
              socialCompleted,
              serviceCompleted,
              totalMembers: members.length,
            }}
            systemHealth={{
              supabaseStatus,
              gcalSyncStatus,
              cronStatus,
              emailStatus,
            }}
          />
        </div>
      </div>
    </AdminGuard>
  );
}

function parseDate(value: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
