import RequireAuth from "../../RequireAuth";
import AbsencePage from "./memberAbsenceForm"

export default function MemberPage() {
  return (
    <RequireAuth>
      <AbsencePage />
    </RequireAuth>
  );
}