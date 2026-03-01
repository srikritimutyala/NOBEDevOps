import { createClient } from "@/utils/supabase/server";
import { randomBytes } from "crypto";
import { cookies } from "next/headers";

export default function AdminPage() {
  async function createEvent(formData: FormData) {
    "use server";

    // Create per-request cookie store + supabase client
    const cookieStore = cookies();
    const supabase = createClient(Promise.resolve(cookieStore));

    const name = String(formData.get("name") ?? "");
    const event_type = String(formData.get("event_type") ?? "");
    const points = Number(formData.get("points") ?? 0);
    const is_mandatory =
      String(formData.get("is_mandatory") ?? "false") === "true";
    const date = String(formData.get("date") ?? "");

    if (!name || !event_type || !date || Number.isNaN(points)) {
      throw new Error("Missing/invalid fields");
    }

    const qr_code_secret = randomBytes(32).toString("hex");

    const { error } = await supabase.from("events").insert({
      name,
      event_type,
      points,
      is_mandatory,
      date,
      qr_code_secret,
    });

    if (error) throw new Error(error.message);
  }

  return (
    <div style={{ maxWidth: 520, margin: "40px auto" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 16 }}>
        Create Event
      </h1>

      <form action={createEvent} style={{ display: "grid", gap: 12 }}>
        <label>
          Name
          <input name="name" required style={{ width: "100%", padding: 8 }} />
        </label>

        <label>
          Event type
          <select
            name="event_type"
            required
            style={{ width: "100%", padding: 8 }}
            >
            <option value="PROFESSIONAL">PROFESSIONAL</option>
            <option value="SOCIAL">SOCIAL</option>
            <option value="PHILANTHROPY">PHILANTHROPY</option>
            <option value="GENERAL_MEETING">GENERAL_MEETING</option>
            <option value="NEW_MEMBER_WORKSHOP">NEW_MEMBER_WORKSHOP</option>
            <option value="PROJECT_MEETING">PROJECT_MEETING</option>
            <option value="OTHER_MANDATORY">OTHER_MANDATORY</option>
            </select>
        </label>

        <label>
          Points
          <input
            type="number"
            name="points"
            required
            min={0}
            step={1}
            style={{ width: "100%", padding: 8 }}
          />
        </label>

        <label>
          Date/time
          <input
            type="datetime-local"
            name="date"
            required
            style={{ width: "100%", padding: 8 }}
          />
        </label>

        <label>
          Mandatory?
          <select name="is_mandatory" style={{ width: "100%", padding: 8 }}>
            <option value="false">false</option>
            <option value="true">true</option>
          </select>
        </label>

        <button type="submit" style={{ padding: 10, fontWeight: 600 }}>
          Create
        </button>
      </form>
    </div>
  );
}