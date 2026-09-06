-- ---------------------------------------------------------------------------
-- One round trip for every conversation on a job.
--
-- TECHNICAL_DEBT #22. The admin's job dossier
-- (app/(admin)/(authed)/admin/jobs/[jobId]/page.tsx) drew the conversations by
-- calling `thread_messages(job, pro)` once per bid: four offers meant four
-- round trips, and the count grew with the job rather than staying put. They
-- ran in parallel, so the cost was the slowest rather than the sum — but it
-- was still N calls where the question is one.
--
-- The question `thread_messages` answers is "this one conversation"; the
-- question the dossier asks is "every conversation on this job". Those are two
-- questions and now they are two functions, rather than one asked repeatedly.
--
-- **Not an admin-only projection.** CLAUDE.md section 3 records that there is
-- no such thing in this repo, and this does not introduce the first one. The
-- row filter below is the two SELECT policies on `messages` restated: the job's
-- owner sees every thread on their own job, an admin sees every thread, and a
-- pro who bid sees their own and no one else's. The customer's chat screen
-- could read it tomorrow and get exactly what it is entitled to.
--
-- A definer function for the same reason `thread_messages` is one: a thread
-- names the other side, and `profiles` has no cross-user read policy, so the
-- sender's name has to be resolved inside a function that can see it. The
-- function returns names and message bodies and nothing else about anybody.
-- ---------------------------------------------------------------------------

create function public.job_threads(p_job_id uuid)
returns table (
  pro_id uuid,
  pro_name text,
  id uuid,
  body text,
  created_at timestamptz,
  read_at timestamptz,
  mine boolean,
  sender_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  -- The front door. `is_bidding_pro` is deliberately here as well as in the
  -- row filter below: without it a pro who bid on the job would be refused
  -- outright, and with it alone they would see every thread. One decides
  -- whether you may ask, the other decides what you are told.
  if not (
    public.is_job_owner(p_job_id)
    or public.is_bidding_pro(p_job_id)
    or public.is_admin()
  ) then
    raise exception 'not your job' using errcode = '42501';
  end if;

  return query
  select
    m.pro_id,
    pro.full_name,
    m.id,
    m.body,
    m.created_at,
    m.read_at,
    m.sender_id = (select auth.uid()),
    sender.full_name
  from public.messages m
  join public.profiles sender on sender.id = m.sender_id
  join public.profiles pro on pro.id = m.pro_id
  where m.job_id = p_job_id
    and (
      -- Exactly the two SELECT policies on `messages`, restated. A definer
      -- function suspends RLS, so the rule it suspended has to be written out
      -- again here or the pro branch above would leak the other threads.
      public.is_job_owner(p_job_id)
      or public.is_admin()
      or m.pro_id = (select auth.uid())
    )
  order by m.pro_id, m.created_at
  -- Four times what `thread_messages` allows one conversation, which is the
  -- same order of magnitude for a job with a handful of bidders. A job that
  -- reaches it is not a job any more.
  limit 2000;
end;
$$;

comment on function public.job_threads(uuid) is
  'Every conversation on one job that the caller is entitled to: all of them for the job owner and an admin, their own for a pro who bid. One round trip instead of one per bid.';

revoke execute on function public.job_threads(uuid) from public, anon;
grant execute on function public.job_threads(uuid) to authenticated;
