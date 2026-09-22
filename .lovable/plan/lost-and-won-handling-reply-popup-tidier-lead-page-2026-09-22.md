# Lost and won handling, reply popup, tidier lead page

## 1. Lost leads land in the pipeline's Lost column

Today, turning a reply negative removes the lead from the CRM. That changes.

- When a lead that was already worked (replied, ticked with a date) is set to **Not Interested** or **Not A Priority**, it is added to the CRM if it isn't there yet and its pipeline stage is set to **Lost**.
- Same when the lead's status is set to **lost**.
- Nothing is deleted any more, so the history stays and the Lost column fills up properly.
- Existing leads currently marked not interested get moved into the Lost column as part of this change.

No popup is shown for lost, as you asked.

## 2. Marking a lead as Client or Won asks for the deal details

Setting the stage to **Client** (or the status to **won**) opens a short popup:

- When was the call booked
- Closing date
- Deal value
- Monthly amount (MRR)

On save: the call-booked and client-closed ticks are set with those dates, the lead is pushed to the CRM if needed, the values are written to the deal, and its pipeline stage is set to **Closed**. Cancelling leaves the stage unchanged.

## 3. Ticking Replied asks the right questions

Ticking **Replied** on a lead opens a popup asking:

- Which platform the reply came in on: Email, LinkedIn or Instagram
- When the email was viewed
- When they replied

The matching fields are then filled in automatically for that platform (for email, viewed and replied; for LinkedIn or Instagram, the reply date), along with the reply channel, so nothing has to be ticked twice.

## 4. To-dos only where they belong

- The **To-dos** card disappears from ordinary leads. It appears only on leads that are in the CRM (pushed after a positive reply), and on CRM record pages.
- The CRM To-dos page is unchanged.

## 5. Contact log removed from CRM records

The **Contact log** section is removed from the CRM record page. The pipeline and the rest of the record page are untouched.

## 6. People starts with one person

A new lead starts with a single person block instead of two. Extra people are added with **Add person** when needed.

## Technical notes

- `leads_after_change` / `leads_stage_automation`: replace the "remove from CRM when sentiment stops being positive" branch with an `ensure_crm_record` call plus a stage set to the `board='crm'` stage where `is_lost`, triggered by a lead stage with `is_lost` or status `lost`. Won path sets the CRM stage where `is_won`. A one-off data update moves current not-interested leads into the Lost stage.
- New dialogs in `src/routes/lt.leads.$id.tsx`: `WonDialog` (call booked, close date, value, MRR) intercepting the stage/status selects in `HeaderCard`, and `ReplyDialog` (channel, viewed date, reply date) intercepting the Replied `CheckDate` in the outreach card, writing `email_viewed/email_replied`, `linkedin_replied`, `instagram_replied` and `reply_channel_id` in one save.
- `LeadTasksCard` on the lead page rendered only when `lead.pushed_to_crm`.
- Remove the contact log query, card and mutation from `src/routes/crm.records.$id.tsx`.
- The default-contacts effect in `lt.leads.$id.tsx` seeds one row instead of two.
