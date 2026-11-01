# Testing

Tests write and delete rows, so they run against a **separate test database** (`aqar_test`, same Neon server as the
live `neondb`). `.env.test.local` holds its address (git-ignored); every test script refuses to start unless
`DATABASE_URL` points at `aqar_test` (`scripts/test-guard.mts`).

## Once (or after a new migration)

    npm run db:test:setup        # tables, reference + demo data, knowledge base in aqar_test

## Run

1. Build and start the site **on the test database**:

       env $(grep '^DATABASE_URL=' .env.test.local) npx next build
       env $(grep '^DATABASE_URL=' .env.test.local) npm run start

2. In another terminal:

       npm run test:pages -- http://localhost:3000     # every admin page, signed in as a temporary admin
       npm run test:extras -- http://localhost:3000
       npm run test:map -- http://localhost:3000
       npm run test:release-a -- http://localhost:3000
       npm run test:release-b -- http://localhost:3000
       npm run test:owners -- http://localhost:3000
       npm run test:viewings -- http://localhost:3000
       npm run test:integrations
       node scripts/smoke.mjs http://localhost:3000

## Against the live site

Only read-only checks: `node scripts/smoke.mjs https://aqar360-demo.vercel.app` (it does not submit a form unless
`SMOKE_SUBMIT=1`). Never run the `test:*` scripts against the live database.
