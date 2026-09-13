import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // `prisma generate` is a build-time operation and must not require a live
    // database or a runtime environment. Database commands that actually
    // connect (migrate, deploy, etc.) still receive DATABASE_URL from the
    // environment; this fallback is never used by application runtime code.
    url:
      process.env.DATABASE_URL ??
      'postgresql://talent:talent@localhost:5432/talent_network?schema=public',
  },
});
