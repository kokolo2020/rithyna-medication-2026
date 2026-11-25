# Care app · v9 staging

A new application, separate from the previous site and database. No old data, staff identity, clinical schedule, demo record, or credential is included.

## Run checks
- `node --test test/*.test.mjs test/*.test.cjs`
- `node tools/build.mjs`

## Set up a private test deployment before any cutover
1. Use a fresh Supabase project and review/apply `schema.sql` there only. Disable public/self-service sign-ups. Create named accounts through an authorized admin workflow, with a separate account per caregiver, and give each only the appropriate membership.
2. Set the test Netlify branch context’s `ICARE_PILOT_ORIGIN` (exact HTTPS origin, no slash), `ICARE_PILOT_SUPABASE_URL` and `ICARE_PILOT_SUPABASE_PUBLISHABLE_KEY` in its Functions environment. These values are intentionally not included in this code. Do not set them for the production context. Do not copy variables from the original app, expose any service-role secret, or commit an environment file. Set up a separate Git branch/site for testing.
3. With a synthetic test schedule and users, test sign-in, role boundaries, history, late and delegated entry, invalid and duplicate records, session expiration, and sign-out. Test on Papa’s Android and a nurse iPhone. Verify the project can't read old records and contains no real details during test. Remove synthetic data before moving to real care.
4. Have Papa review the actual configured medication schedule before anyone uses it. Keep the existing app and its records available unless Papa explicitly changes that. Take no action from an unconfirmed or disputed record without checking the established care plan.
5. A release is not complete until the hosting build and real authenticated workflows are verified. Do not switch the original care site to this branch until Papa confirms the cutover destination and testing is complete.

The medication logging foundation does not send notifications. Roster-driven delivery, photo uploads, appointment reminders, shared messaging, and historical report imports need their own integration and verification.
