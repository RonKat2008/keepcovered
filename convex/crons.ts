import { cronJobs, anyApi } from "convex/server";

const crons = cronJobs();
crons.hourly("purge expired sessions", { minuteUTC: 0 }, (anyApi as any).sessions.purgeExpired, {});
export default crons;
