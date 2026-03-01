// get-logs.cjs
const TOKEN = 'sbp_15fd2e795a8959ba6e815fef004faae3d1cb6be3';
const REF   = 'eyhdtiriqlnkmmlhclcr';

async function main() {
  const url = `https://api.supabase.com/v1/projects/${REF}/analytics/endpoints/logs.all?` +
    new URLSearchParams({
      'sql': `select timestamp, event_message from edge_logs where request_id is not null order by timestamp desc limit 50`,
    });

  const res = await fetch(url, { headers: { 'Authorization': `Bearer ${TOKEN}` } });
  const text = await res.text();
  console.log(`Logs HTTP ${res.status}:`);
  console.log(text.slice(0, 5000));
}
main().catch(console.error);
