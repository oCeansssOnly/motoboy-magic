// get-logs.cjs — Fetch edge function logs from Supabase
const TOKEN = 'sbp_15fd2e795a8959ba6e815fef004faae3d1cb6be3';
const REF   = 'eyhdtiriqlnkmmlhclcr';

async function main() {
  // Get logs for ifood-auth
  const now = Date.now();
  const url = `https://api.supabase.com/v1/projects/${REF}/analytics/endpoints/logs.all?` +
    new URLSearchParams({
      'sql': `select timestamp, event_message, metadata from edge_logs where timestamp > now() - interval '10 minutes' and identifier = 'ifood-auth' order by timestamp desc limit 20`,
    });

  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${TOKEN}` }
  });
  const text = await res.text();
  console.log(`Logs HTTP ${res.status}:`);
  console.log(text.slice(0, 3000));
}
main().catch(e => console.error(e.message));
