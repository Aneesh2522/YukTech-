/* Optional bridge to an ATS or job-distribution provider that accepts a webhook.
   This does NOT post directly to LinkedIn/Indeed/Naukri; those require their own approved APIs. */
export default async (request) => {
  const cors = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
  if (request.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: cors });
  const env = process.env;
  const { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, JOB_DISTRIBUTION_WEBHOOK_URL, JOB_DISTRIBUTION_WEBHOOK_SECRET } = env;
  if (![SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY].every(Boolean)) return new Response(JSON.stringify({ error: 'Server configuration is incomplete.' }), { status: 500, headers: cors });
  if (!JOB_DISTRIBUTION_WEBHOOK_URL || !JOB_DISTRIBUTION_WEBHOOK_SECRET) return new Response(JSON.stringify({ error: 'External job distribution is not configured. Add an approved ATS/webhook endpoint and secret.' }), { status: 503, headers: cors });
  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return new Response(JSON.stringify({ error: 'Sign-in required.' }), { status: 401, headers: cors });
  const authRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } });
  if (!authRes.ok) return new Response(JSON.stringify({ error: 'Invalid session.' }), { status: 401, headers: cors });
  const user = await authRes.json();
  const headers = { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' };
  const roleRes = await fetch(`${SUPABASE_URL}/rest/v1/user_roles?user_id=eq.${encodeURIComponent(user.id)}&select=role`, { headers });
  const roles = roleRes.ok ? await roleRes.json() : [];
  if (!roles.some(r => ['admin','reviewer'].includes(r.role))) return new Response(JSON.stringify({ error: 'Reviewer/admin role required.' }), { status: 403, headers: cors });
  let body; try { body = await request.json(); } catch { return new Response(JSON.stringify({ error: 'Valid JSON required.' }), { status: 400, headers: cors }); }
  if (!body?.jobId || typeof body.jobId !== 'string') return new Response(JSON.stringify({ error: 'jobId is required.' }), { status: 400, headers: cors });
  const jobRes = await fetch(`${SUPABASE_URL}/rest/v1/job_posts?id=eq.${encodeURIComponent(body.jobId)}&status=eq.published&select=id,title,department,location,work_type,experience,description,apply_url,external_board,external_job_id,published_at`, { headers });
  const jobs = jobRes.ok ? await jobRes.json() : [];
  if (!jobs.length) return new Response(JSON.stringify({ error: 'Job not found or not approved/published.' }), { status: 404, headers: cors });
  const job = jobs[0];
  const result = await fetch(JOB_DISTRIBUTION_WEBHOOK_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${JOB_DISTRIBUTION_WEBHOOK_SECRET}`,
      'X-YUKTECH-Event': 'approved-job-publish' },
    body: JSON.stringify({ source: 'YUKTECH', event: 'approved_job_publish', job })
  });
  if (!result.ok) return new Response(JSON.stringify({ error: `External provider rejected the request (${result.status}).` }), { status: 502, headers: cors });
  return new Response(JSON.stringify({ ok: true, message: 'Approved job payload sent to the configured provider.' }), { status: 200, headers: cors });
};
