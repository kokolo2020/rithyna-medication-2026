# Rithyna Medication 2026

Installable medication, temperature and notes log for phone, iPad and computer.

## Features
- Past-date and 24-hour time entry
- Multiple medications at the same time
- 15 preset medications with editable doses
- Temperature alerts: 37.5–37.9 °C yellow, 38.0–38.9 °C red, 39.0 °C+ alarm
- Offline-first PWA
- Optional Supabase cloud synchronization across devices
- CSV export

## Cloud setup
1. Create or use a Supabase project.
2. Run `supabase_schema.sql` in Supabase SQL Editor.
3. Copy the Project URL and anon/public key from Supabase.
4. Deploy this repository to Netlify.
5. Open the deployed app and tap **Cloud setup**.
6. Enter the Project URL and anon key, then create an account or sign in.
7. Use the same account on phone and iPad.

## Install on iPad
Open the deployed URL in Safari, tap **Share**, then **Add to Home Screen**.

The Supabase anon key is intended for client-side use. Do not put a Supabase `service_role` key in this app.