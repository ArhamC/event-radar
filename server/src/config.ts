import 'dotenv/config';

// Side Street covers London, Ontario. Pin local time to the city's zone so "7pm" means 7pm in London
// even on hosts that run in UTC. Overrides any TZ the host sets. (Node re-reads TZ when it is assigned.)
process.env.TZ = process.env.CITY_TIMEZONE ?? 'America/Toronto';

const isProd = process.env.NODE_ENV === 'production';

if (isProd && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET must be set in production');
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://radar:radar@localhost:5432/radar',
  jwtSecret: process.env.JWT_SECRET ?? 'dev-only-secret-do-not-use-in-prod',
  clientOrigin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173',
  adminEmail: process.env.ADMIN_EMAIL?.toLowerCase(),
  isProd,
  center: {
    lat: Number(process.env.CENTER_LAT ?? 42.9849), // downtown London, Ontario
    lng: Number(process.env.CENTER_LNG ?? -81.2453),
  },
  enablePipelineCron: process.env.ENABLE_PIPELINE_CRON === 'true',
  pipelineCron: process.env.PIPELINE_CRON ?? '0 3 * * *', // daily, 3am city time
  geocoderContact: process.env.GEOCODER_CONTACT ?? 'unset',
};
