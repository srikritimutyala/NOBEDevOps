import Link from "next/link"

export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-8 p-6">
      <h1 className="text-3xl font-bold">NOBE Attendance System</h1>

      <div className="flex gap-6">
        {/* Members Button */}
        <Link
          href="/users/member"
          className="px-6 py-3 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition"
        >
          Members Dashboard
        </Link>

        {/* Admin Button */}
        <Link
          href="/users/admin"
          className="px-6 py-3 rounded-lg bg-purple-600 text-white font-medium hover:bg-purple-700 transition"
        >
          Admin Dashboard
        </Link>
      </div>
    </main>
  )
}