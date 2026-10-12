// Runs the Monday weekly-report job once, now: generates last week's snapshot and emails admins.
//   npm run report:weekly
import { pool } from '../src/db/index.js';
import { runWeeklyReportJob } from '../src/services/weeklyReportService.js';

runWeeklyReportJob()
  .then((report) => console.log(`Weekly report ${report.weekStart} to ${report.weekEnd}: ${report.status}`))
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
