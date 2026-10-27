/**
 * src/app/utils/eventPoints.ts
 *
 * Central utility for determining event point awards and whether an event
 * is mandatory for new members.
 */

export interface EventLike {
  name?: string | null;
  event_type?: string | null;
  description?: string | null;
  points?: number | null;
  is_mandatory?: boolean | null;
}

/**
 * Checks if an event is mandatory for new members.
 * This checks:
 * 1. Event description containing "new member mandatory" or "mandatory for new member"
 * 2. Event type being "NEW_MEMBER_WORKSHOP"
 * 3. Specific known new-member mandatory workshop titles (Client Relations, PowerPoint, LinkedIn, BrewLab Cohort Social, etc.)
 */
export function isNewMemberMandatory(event?: EventLike | null): boolean {
  if (!event) return false;

  const desc = (event.description || "").toLowerCase();
  if (desc.includes("new member mandatory") || desc.includes("mandatory for new member")) {
    return true;
  }

  const typeNorm = (event.event_type || "").toUpperCase().trim();
  if (typeNorm === "NEW_MEMBER_WORKSHOP") {
    return true;
  }

  const name = (event.name || "").toLowerCase();
  return (
    name.includes("client relations & etiquette") ||
    name.includes("client relations and etiquette") ||
    name.includes("powerpoint development") ||
    name.includes("linkedin, networking") ||
    name.includes("linkedin networking") ||
    name.includes("brewlab new cohort social") ||
    name.includes("new member workshop")
  );
}

/**
 * Checks if an event name matches any New Member Mandatory event.
 * Backward-compatible helper.
 */
export function isNewMemberMandatoryWorkshop(eventName?: string | null, description?: string | null): boolean {
  return isNewMemberMandatory({ name: eventName, description });
}

/**
 * Checks if an event is considered mandatory for a specific member.
 * Returns true if the event itself is marked mandatory (event.is_mandatory),
 * or if the member is a new member and the event is mandatory for new members.
 */
export function isEventMandatoryForMember(
  event?: EventLike | null,
  isNewMember?: boolean | null
): boolean {
  if (!event) return false;
  if (Boolean(event.is_mandatory)) return true;
  return Boolean(isNewMember) && isNewMemberMandatory(event);
}

/**
 * Calculates points awarded for an event based on whether the member is a new member.
 * - For new members, events that are mandatory for new members award 0 points
 *   (they satisfy mandatory attendance requirements rather than elective points).
 * - For returning members (or non-new members), they award normal points
 *   (default 1 pt for point-bearing categories like PROFESSIONAL, SOCIAL, SERVICE).
 */
export function getEventPointsForMember(
  event?: EventLike | null,
  isNewMember?: boolean | null
): number {
  if (!event) return 0;

  // New members receive 0 points for events mandatory for new members
  if (Boolean(isNewMember) && isNewMemberMandatory(event)) {
    return 0;
  }

  // Explicit points specified on the event (including 0)
  if (event.points !== null && event.points !== undefined) {
    return event.points;
  }

  // If points are null/undefined, default to 1 for core categories, 0 for others
  const normType = (event.event_type || "").toUpperCase().trim();
  if (
    normType.includes("PROF") ||
    normType.includes("SOCI") ||
    normType.includes("SERV")
  ) {
    return 1;
  }

  return 0;
}
