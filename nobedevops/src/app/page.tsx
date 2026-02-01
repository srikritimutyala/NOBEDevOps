
import { createClient } from '@/utils/supabase/server'
import { cookies } from 'next/headers'

export default async function Page() {
  const cookieStore = await cookies()
  const supabase = createClient(Promise.resolve(cookieStore))

  const { data: todos, error } = await supabase.from('People').select()

  if (error) {
    return <div style={{ padding: 24 }}><p>Error: {error.message}</p></div>
  }

  return (
    <div style={{ padding: 24 }}>
      <h1>People</h1>
      <p>Found {todos?.length || 0} entries</p>
      <ul>
        {todos?.map((todo: any, index: number) => (
          <li key={index}>{JSON.stringify(todo)}</li>
        ))}
      </ul>
    </div>
  )
}
