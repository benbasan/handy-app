import { createClient } from "./server";

/**
 * Read side of the chat — product-spec.md 3.3 and 4.10.
 *
 * A thread is (job, pro). Both functions behind this file are security
 * definer for the same reason the bid readers are: a thread shows the other
 * side's name, and neither `profiles` policy lets a customer and a pro read
 * each other's rows. The functions check the caller is a side of the thread
 * and then return the name and nothing else.
 */

export type MessageThread = {
  jobId: string;
  proId: string;
  counterpartName: string | null;
  jobDescription: string;
  jobStatus: string;
  bidStatus: string;
  lastBody: string | null;
  lastAt: string | null;
  unreadCount: number;
};

/**
 * Every conversation the caller is a side of, newest first — for a pro, one
 * per job they bid on; for a customer, one per offer they received.
 *
 * A thread exists as soon as a bid does, which is what lets either side open
 * the conversation before a word has been said.
 */
export async function listMyThreads(): Promise<MessageThread[]> {
  const supabase = await createClient();

  const { data } = await supabase.rpc("my_message_threads");

  return (data ?? []).map((row) => ({
    jobId: row.job_id,
    proId: row.pro_id,
    counterpartName: row.counterpart_name,
    jobDescription: row.job_description,
    jobStatus: row.job_status,
    bidStatus: row.bid_status,
    lastBody: row.last_body,
    lastAt: row.last_at,
    unreadCount: row.unread_count,
  }));
}

export type ThreadMessage = {
  id: string;
  body: string;
  createdAt: string;
  readAt: string | null;
  /** Decided in the database from auth.uid(), so a bubble cannot be mis-sided. */
  mine: boolean;
  senderName: string | null;
};

export async function listThreadMessages(
  jobId: string,
  proId: string,
): Promise<ThreadMessage[]> {
  const supabase = await createClient();

  const { data } = await supabase.rpc("thread_messages", {
    p_job_id: jobId,
    p_pro_id: proId,
  });

  return (data ?? []).map((row) => ({
    id: row.id,
    body: row.body,
    createdAt: row.created_at,
    readAt: row.read_at,
    mine: row.mine,
    senderName: row.sender_name,
  }));
}

/** Total unread across every thread — the badge in both headers. */
export function totalUnread(threads: readonly MessageThread[]): number {
  return threads.reduce((sum, thread) => sum + thread.unreadCount, 0);
}

/** One pro's side of a job, as the dossier lays it out. */
export type JobThread = {
  proId: string;
  proName: string | null;
  messages: ThreadMessage[];
};

/**
 * Every conversation on one job, in a single round trip.
 *
 * `listThreadMessages` above answers "this one conversation" and is what the
 * two chat screens want. This answers "every conversation on this job", which
 * is a different question and used to be asked by repeating the first one once
 * per bid — the dossier's N+1, TECHNICAL_DEBT #22.
 *
 * It is not an admin reader. `job_threads()` applies the same rule the SELECT
 * policies on `messages` do: every thread for the job's owner and for an
 * admin, their own for a pro who bid. Whoever calls it gets what they are
 * entitled to and nothing else, which is proved in supabase/tests/rls_test.sql
 * rather than assumed here.
 */
export async function listJobThreads(jobId: string): Promise<JobThread[]> {
  const supabase = await createClient();

  const { data } = await supabase.rpc("job_threads", { p_job_id: jobId });

  // Grouped here rather than in SQL: the caller wants one entry per pro with
  // the messages inside it, and a flat result set is the shape a `returns
  // table` can express without an array or a json column.
  const byPro = new Map<string, JobThread>();

  for (const row of data ?? []) {
    const thread = byPro.get(row.pro_id) ?? {
      proId: row.pro_id,
      proName: row.pro_name,
      messages: [],
    };

    thread.messages.push({
      id: row.id,
      body: row.body,
      createdAt: row.created_at,
      readAt: row.read_at,
      mine: row.mine,
      senderName: row.sender_name,
    });

    byPro.set(row.pro_id, thread);
  }

  return [...byPro.values()];
}
