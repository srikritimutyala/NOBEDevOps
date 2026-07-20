"use client";

import { createClient } from "@/app/utils/supabase/client";
import { useRouter } from "next/navigation";

export default function LogoutButton() {
  const supabase = createClient();
  const router = useRouter();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace("/users/login"); // send back to login
  }

  return (
    <button
      onClick={handleLogout}
      className="btn-danger"
    >
      Log out
    </button>
  );
}
