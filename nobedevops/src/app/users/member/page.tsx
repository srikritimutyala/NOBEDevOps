import RequireAuth from "../RequireAuth";
import EventList from "./eventList"

export default function MemberPage() {
  return (
    <div>
      <RequireAuth>
        <EventList />
      </RequireAuth>

    

    </div>

  );
}