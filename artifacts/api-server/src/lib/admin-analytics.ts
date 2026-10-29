import { pool } from "@workspace/db";

export const toolNames = ["message", "voice", "email", "link", "job", "screen"] as const;

/** Monday 00:00 through next Monday 00:00, Africa/Johannesburg (UTC+02). */
export function southAfricanWeek(now = new Date()) {
  const local = new Date(now.getTime() + 2 * 3600000);
  local.setUTCHours(0, 0, 0, 0);
  local.setUTCDate(local.getUTCDate() - ((local.getUTCDay() + 6) % 7));
  const start = new Date(local.getTime() - 2 * 3600000);
  return { start, end: new Date(start.getTime() + 7 * 86400000) };
}

export async function adminAnalytics(allRecords = false) {
  const { start, end } = southAfricanWeek();
  const client = await pool.connect();
  const limit = allRecords ? "" : " LIMIT 500";
  const period = [start, end];
  const visible = "s.deleted_at IS NULL AND u.deleted_at IS NULL";
  const tool = "COALESCE(s.tool,s.kind::text)";
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const totals = (await client.query(`SELECT
      (SELECT count(*)::int FROM ubuntu_users WHERE deleted_at IS NULL) AS users,
      (SELECT count(DISTINCT s.user_id)::int FROM scans s JOIN ubuntu_users u ON u.id=s.user_id WHERE ${visible} AND s.created_at >= $1 AND s.created_at < $2) AS "activeUsers",
      (SELECT count(*)::int FROM scans s JOIN ubuntu_users u ON u.id=s.user_id WHERE ${visible} AND s.created_at >= $1 AND s.created_at < $2) AS scans,
      (SELECT count(*)::int FROM community_reports WHERE deleted_at IS NULL) AS reports,
      (SELECT count(*)::int FROM community_feedback WHERE deleted_at IS NULL) AS feedback`, period)).rows[0];
    const tools = (await client.query(`SELECT ${tool} AS tool,count(*)::int AS count,count(DISTINCT s.user_id)::int AS users
      FROM scans s JOIN ubuntu_users u ON u.id=s.user_id WHERE ${visible} AND s.created_at >= $1 AND s.created_at < $2 GROUP BY ${tool}`, period)).rows;
    const daily = (await client.query(`SELECT to_char(s.created_at AT TIME ZONE 'Africa/Johannesburg','YYYY-MM-DD') AS date,count(*)::int AS count
      FROM scans s JOIN ubuntu_users u ON u.id=s.user_id WHERE ${visible} AND s.created_at >= $1 AND s.created_at < $2 GROUP BY 1 ORDER BY 1`, period)).rows;
    const userTools = (await client.query(`SELECT u.id AS "userId",u.full_name AS "fullName",u.surname,u.email,${tool} AS tool,
      count(*)::int AS count,max(s.created_at) AS "lastUsedAt" FROM scans s JOIN ubuntu_users u ON u.id=s.user_id
      WHERE ${visible} AND s.created_at >= $1 AND s.created_at < $2 GROUP BY u.id,${tool} ORDER BY count(*) DESC,u.email`, period)).rows;
    const scanRecords = (await client.query(`SELECT s.id,u.id AS "userId",concat_ws(' ',u.full_name,u.surname) AS "fullName",u.email,
      ${tool} AS tool,s.status,s.title,s.created_at AS "createdAt" FROM scans s JOIN ubuntu_users u ON u.id=s.user_id
      WHERE ${visible} ORDER BY s.created_at DESC${limit}`)).rows;
    const reports = (await client.query(`SELECT r.id,concat_ws(' ',u.full_name,u.surname) AS "fullName",u.email,r.category,r.status,r.details,r.created_at AS "createdAt"
      FROM community_reports r JOIN ubuntu_users u ON u.id=r.user_id WHERE r.deleted_at IS NULL AND u.deleted_at IS NULL ORDER BY r.created_at DESC${limit}`)).rows;
    const feedback = (await client.query(`SELECT f.id,concat_ws(' ',u.full_name,u.surname) AS "fullName",u.email,f.message,f.created_at AS "createdAt"
      FROM community_feedback f JOIN ubuntu_users u ON u.id=f.user_id WHERE f.deleted_at IS NULL AND u.deleted_at IS NULL ORDER BY f.created_at DESC${limit}`)).rows;
    await client.query("COMMIT");
    return {
      generatedAt: new Date().toISOString(), weekStart: start.toISOString(), weekEnd: end.toISOString(),
      adminEmail: process.env.UBUNTUSAFE_ADMIN_EMAIL?.trim() ?? "", totals,
      tools: toolNames.map(name => tools.find(row => row.tool === name) ?? { tool: name, count: 0, users: 0 }),
      daily: Array.from({ length: 7 }, (_, i) => {
        const date = new Date(start.getTime() + 2 * 3600000 + i * 86400000).toISOString().slice(0, 10);
        return daily.find(row => row.date === date) ?? { date, count: 0 };
      }),
      userTools, scanRecords, reports, feedback,
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined); throw error;
  } finally { client.release(); }
}

/** Quoting plus formula neutralisation prevents CSV spreadsheet injection. */
export function csvCell(value: unknown): string {
  let text = value instanceof Date ? value.toISOString() : String(value ?? "");
  if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
export async function adminReportCsv() {
  const data = await adminAnalytics(true);
  const rows: unknown[][] = [
    ["UbuntuSafe administrator report", data.generatedAt],
    ["Weekly usage period", data.weekStart, data.weekEnd, "Africa/Johannesburg; Monday to Sunday; active records"],
    ["Section", "ID", "Name", "Surname", "Email", "Tool", "Count", "Status", "Title / details", "Date"],
    ...data.tools.map(row => ["Tool usage", "", "", "", "", row.tool, row.count, "", `${row.users} users`, ""]),
    ...data.userTools.map(row => ["User tool usage", row.userId, row.fullName, row.surname, row.email, row.tool, row.count, "", "", row.lastUsedAt]),
    ...data.scanRecords.map(row => ["Scan", row.id, row.fullName, "", row.email, row.tool, "", row.status, row.title, row.createdAt]),
    ...data.reports.map(row => ["Community report", row.id, row.fullName, "", row.email, row.category, "", row.status, row.details, row.createdAt]),
    ...data.feedback.map(row => ["Feedback", row.id, row.fullName, "", row.email, "", "", "", row.message, row.createdAt]),
  ];
  return "\ufeff" + rows.map(row => row.map(csvCell).join(",")).join("\r\n");
}
