import RequireAuth from "../RequireAuth";
import MemberAbsenceForm from "./memberAbsenceForm"

export default function MemberPage() {
  return (
    <RequireAuth>
      <MemberAbsenceForm />
    </RequireAuth>
  );
}