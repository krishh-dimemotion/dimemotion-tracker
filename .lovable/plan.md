# Buzzspear Tracker - next round of upgrades

A big batch of changes across Lead Tracker, CRM, Settings and the ledger. Grouped below in the order I would build them.

## 1. Live updates everywhere (no more refreshing)

Every page subscribes to live database changes, so edits by you or a teammate show up instantly.

- Leads list, lead page, dashboard, outreach tracker, ledger, follow-ups, CRM records, pipeline and CRM dashboard all refresh themselves the moment a lead, follow-up, CRM record or activity row changes.
- Small edits on a lead page push straight through to the list, the dashboard counters and the outreach numbers.

## 2. Automatic outreach tracking

- The outreach tracker stops being a manual counter. It counts real activity: each lead you mark as email sent, LinkedIn connection sent, LinkedIn message sent or Instagram message sent counts once for that channel, on that date, for the account used.
- Numbers are split by sending account, so you can see which inbox or profile did the work.
- The manual entry box stays as an optional top-up for outreach done outside the app.

## 3. Smarter lead stage behaviour

- Activity now reads "Stage changed: Email Drafted to Contacted" instead of just "Stage changed", and the same for status, owner and outcome changes.
- Moving a lead to Contacted marks the outreach as sent and stamps the date automatically. Moving to Replied marks replied and stamps the date. Moving to Call Booked ticks meeting booked. Moving backwards clears the matching stamp.
- Next to Contacted and Replied there is a small channel picker (Email, LinkedIn, Instagram, other) so the app knows which channel the contact or the reply came through, and records it in the activity and the outreach count.
- Email section gains sent / viewed / replied consistency: marking replied implies viewed.

## 4. New outreach fields on the lead page

Other channels card becomes:

- LinkedIn connection request sent + date
- LinkedIn message sent + date
- LinkedIn replied + date
- Instagram message sent + date
- Instagram replied + date

Each row lets you choose whether the touch was a message or an email where that applies, and stamps the date on the spot.

## 5. Open lead in a new tab

- Table rows and cards get a small open-in-new-tab button, so leads stop replacing each other in the same view.

## 6. Follow-ups

- New Follow-ups page in the Lead Tracker sidebar: overdue, due today, upcoming, each as a collapsible dropdown section with counts, so nothing pushes the rest of the page down.
- The dashboard follow-up blocks become the same collapsible dropdowns.
- Follow-up sequences become template-driven: you define a sequence in Settings (for example day 3, day 7, day 14, per channel). When a lead is first contacted, the sequence is created automatically and the next follow-up date is always calculated for you. The actual sent date stays manual.

## 7. CRM upgrades

- New CRM Dashboard page modelled on the Notion screenshots: closed MRR donut, closed revenue by month bar chart, and a compact records table below with today / all records / high priority / lost / by status views.
- Records page gains a view switcher: table, board (columns by stage) and cards - the same switcher the Lead Tracker already has.
- Every CRM view shows which sending account or email address was used to contact that person, plus contact emails.
- CRM stages updated to the Notion set. Proposed list (tell me if you want different ones): Lead, Follow up, Loom sent, Content audit sent, Circle back, Positive reply, DC set, DC done, In progress, Closed (won), Lost. Colours match the screenshots.

## 8. Ledger rebuild

- Opens on Today rather than a long scroll.
- Period switch: Day, Week, Month, Year, with a dropdown to pick the exact day, week, month or year instead of scrolling.
- Each period renders as a compact table with totals and a comparison against the previous period, plus a CSV export of the visible range.

## 9. Access presets on the Users page

- A preset dropdown when inviting someone or editing their access: Owner (everything), Admin, Employee, Intern (Lead Tracker only), Lead Tracker only, CRM only, plus Select all / Clear all.
- You can save your own presets: tick the permissions you want, name it, and it appears in the dropdown for everyone who manages access. Presets can be renamed and deleted.
- Choosing a preset fills in the permission checkboxes, which you can still adjust before saving.

## Technical notes

- Realtime: add the relevant tables to the realtime publication and subscribe per page through a shared hook that invalidates the matching React Query keys on change; channels are created and torn down inside effects.
- Stage automation and richer activity payloads go into the existing `leads_after_change` trigger (before/after stage names in `meta`), so history is correct regardless of where the edit came from.
- Outreach: derive daily counts from `lead_events` (channel + sender account + day) via a database view, keeping `outreach_daily` only for manual top-ups.
- New tables: `permission_presets` (name, keys, created_by) and `followup_templates` (name, steps: offset days + channel), both with RLS and grants; new lead columns for the LinkedIn connection request and reply-channel fields, added additively.
- CRM stage changes are applied as data updates to `stages`, keeping existing records mapped to the closest new stage.
- Ledger and CRM dashboard aggregate through scoped queries rather than fetching whole tables, which also helps the speed complaints.

## Suggested build order

1. Realtime + automatic outreach tracking
2. Lead stage automation, richer activity, new channel fields, open in new tab
3. Follow-up page, templates, dashboard dropdowns
4. CRM dashboard, view switcher, email visibility, new stages
5. Ledger rebuild
6. Access presets

## Questions before I start

- CRM stage list above: confirm or send the exact names you want.
- Follow-up template default: is day 3 / day 7 / day 14 a good starting sequence?
- Should the outreach tracker count per person (who did the outreach) as well as per account?
