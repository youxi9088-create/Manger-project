import { getProjects } from './src/services/db.js';
const r = getProjects({ limit: 10 });
console.log('=== getProjects result ===');
console.log('total:', r.total);
console.log('projects count:', r.projects.length);
for (const p of r.projects) {
  console.log(' ', p.id, '|', p.title, '| status=', p.status, '| phase=', p.current_phase);
}
