# Fuel App

Fuel log for Maile Concrete. Drivers use a shop tablet to log truck, equipment and can fill-ups (gallons, DEF, odometer or hours), and the yard logs bulk tank loads, with receipt scanning to fill in the numbers.

## What's in here

| File | What it is |
| --- | --- |
| `index.html` | The whole app in one file. Open it in a browser on the tablet. |
| `supabase/setup.sql` | Database setup: tables, security rules and the PIN-checked functions the app calls. |
| `supabase/functions/scan-receipt/index.ts` | Edge Function that reads a receipt photo with Gemini and returns vendor, address, date, time, line items and total. |

## 1. Set up the database

1. Open your project at [supabase.com](https://supabase.com/dashboard).
2. Go to **SQL Editor** > **New query**.
3. Paste the whole of `supabase/setup.sql` and click **Run**.

It is safe to run again at any time; it only creates what is missing and replaces the functions with the current version. Your data is not touched.

The default Reports PIN is **1234**. Change it inside the app the first time you open Reports.

## 2. Deploy the receipt scanner

1. In Supabase, go to **Edge Functions** > **Deploy a new function** > **Via editor**.
2. Name it exactly `scan-receipt`.
3. Paste the whole of `supabase/functions/scan-receipt/index.ts` and click **Deploy**.
4. Get a Gemini API key from [aistudio.google.com](https://aistudio.google.com/apikey).
5. Go to **Edge Functions** > **Secrets**, add a secret named `GEMINI_API_KEY`, and paste the key as its value.

To update the scanner later, open the function, paste the new file over the old code, and deploy again. The secret stays.

The function tries several Gemini models in order (the `MODELS` list at the top of the file) and falls back to the next one if a model is missing or busy.

## 3. Point the app at your project

Near the top of the script in `index.html` are `SUPABASE_URL` and `SUPABASE_ANON_KEY`. They must match **Project Settings** > **API** in Supabase. The anon key is meant to be public; the database rules below are what keep the logs safe.

## How security works

- The tablet uses the anon key, which can only read active trucks, equipment and drivers, and add new fill-ups and tank loads.
- Reports, deleting entries, managing the truck and driver lists, and the one-time import all go through database functions that check the 4-digit Reports PIN. The PIN is stored as a bcrypt hash, never in plain text.

## Conventions

- Fuel types: Unleaded is saved as **Gas**; everything else is **Diesel**.
- Asset barcodes look like `MC-NAME` (the name in capitals with spaces and symbols removed, e.g. `MC-TRUCK12`).
