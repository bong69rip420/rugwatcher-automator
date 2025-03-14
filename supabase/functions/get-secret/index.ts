
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

serve(async (req) => {
  const { name } = await req.json()
  const secret = Deno.env.get(name)

  if (!secret) {
    return new Response(
      JSON.stringify({ error: 'Secret not found' }),
      { status: 404, headers: { 'Content-Type': 'application/json' } }
    )
  }

  return new Response(
    JSON.stringify({ secret }),
    { headers: { 'Content-Type': 'application/json' } }
  )
})
