# CRM fixes, positive-only push, and to-dos

## 1. Records page shows nothing (confirmed cause)

There are 4 CRM records in the database, so the page is not empty by accident. The Records page asks for each record together with the lead's channel, and the lead now has three different channel links (outreach channel, contacted channel, reply channel). The request is ambiguous, so it fails and the page falls back to the "No records" message.

Fix: state exactly which channel link to use in the Records request. The same page will then show the 4 existing records straight away. The Pipeline, Dashboard and record detail pages use single links and are unaffected, but I will re-check each CRM page loads real rows after the fix.

## 2. Only positive replies go to the CRM

Today any reply (or any reply stage) pushes the lead to the CRM, regardless of sentiment.

New behaviour:

- A reply alone no longer pushes a lead. The lead is pushed the moment the reply sentiment is set to Positive.
- Negative or neutral replies stay in the Lead Tracker only.
- If a lead was already pushed and its sentiment is later changed to negative or neutral, the lead is pulled back out of the CRM (its record is removed and the "pushed to CRM" mark cleared), with a line in the lead's activity so the change is traceable.
- Manual "Push to CRM" stays available for the rare case you want an exception, but it warns when the sentiment is not positive.
- Existing data: of the 4 current records, 2 are positive and stay. The neutral one and the negative one will be removed from the CRM and remain as leads.

## 3. To-do lists

A single shared task list, visible in two places:

- New **To-dos** page in the CRM sidebar, after Dashboard, Records, Pipeline (before Revenue, or after it if you prefer). Sections for Overdue, Today, Upcoming and Done, each collapsible with counts, plus filters by owner and by lead, quick-add at the top, and tick-to-complete. Live updating like the rest of the app.
- A **To-dos** card on every lead page: add a task with a title, due date and owner, tick it off, and see completed ones behind a toggle. Tasks added there appear on the CRM To-dos page and vice versa.
- Adding, completing or reopening a task is written to the lead's activity feed.

## 4. Same lead information inside the CRM

The CRM record page will show the full lead picture, organised instead of dumped:

- Header: company, lead code, country, stage, priority, owner, and a link that opens the lead in the Lead Tracker in a new tab.
- Contact panel: people, emails, phone, LinkedIn / Instagram / website links.
- Outreach summary: which account contacted them, which channel, email sent / viewed / replied with dates, LinkedIn connection, LinkedIn and Instagram touches, Loom sent and watched.
- Notes and research from the lead, read-only, collapsed by default.
- Deal panel (value, MRR, close date, probability), contact log, follow-ups and to-dos stay as they are.

Records list and cards keep the sending email already shown, and gain the reply sentiment so it is obvious why a lead is there.

## Technical notes

- Records query: disambiguate the embed with an explicit foreign key hint on the leads-to-channels relationship.
- `leads_after_change`: replace the "any reply" push condition with a positive-sentiment condition, and add a pull-back branch when sentiment moves away from positive.
- New table `lead_tasks` (lead_id, title, notes, due_date, assignee_id, completed_at, created_by) with grants, RLS in line with lead and CRM permissions, added to the realtime publication; new permission key `crm.todos`.
- New route `src/routes/crm.todos.tsx`, a `LeadTasksCard` in the lead detail page, and a shared task hook so both views use the same queries and invalidations.
- CRM record page pulls the lead with its contacts and links in one query and lays them out in collapsible sections.

## Build order

1. Records page fix and CRM page verification
2. Positive-only push rule plus data cleanup
3. To-dos table, CRM To-dos page, lead page card
4. Lead information panels inside the CRM record page
