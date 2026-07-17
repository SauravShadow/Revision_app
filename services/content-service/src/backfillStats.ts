// One-off: populate user_stats/user_activity for rows written before the
// stats tables existed. Run inside the container or with DATABASE_URL set:
//   npm run backfill:stats -w services/content-service
import { recomputeAllStats } from './statsStore';

recomputeAllStats()
  .then((n) => {
    console.log(`recomputed stats for ${n} user(s)`);
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
