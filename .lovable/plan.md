# Importer rebuild: any sheet, mapped correctly

Today the importer only knows 22 lead fields, matches a column only when the heading is an exact match, and ignores everything else. That is why most of your sheet shows "Ignore" and why tick-box columns like "Loom Sent?" and "Email Viewed?" never land anywhere. The fix is a bigger field list, smarter matching, value translation, and saved mappings.

## 1. Accept CSV and Excel

- Upload .csv, .xlsx or .xls. For Excel files with several tabs, pick the tab to import.
- Blank leading rows and blank columns are skipped automatically, and the header row is detected rather than assumed to be row 1.

## 2. Every field in the app becomes importable

The "Maps to" list grows from 22 options to the full lead record, grouped so it is easy to scan:

- Company: company name, primary contact, country, stage, status, priority, channel, sender account, date added, tags, next follow-up date, last contacted.
- Links: website, company LinkedIn, Instagram, YouTube, plus extra link columns.
- People: up to 8 people per lead, each with name, job title, email, extra emails, LinkedIn, Instagram, phone. Your "Prospect Email 1 to 8" columns all land on the same lead.
- Email outreach: email sent, sent date, viewed, viewed date, replied, replied date, reply sentiment, email status (the single "Sent/+Reply/-Reply" column is understood on its own and fills sent, replied and sentiment together).
- Loom: Loom link, Loom sent, sent date, Loom watched, watched date, watch percent.
- LinkedIn and Instagram: connection request sent, message sent, replied, with dates.
- Outcomes: meeting booked, client closed, with dates.
- Follow-ups: FUP 1 to 8 status, date and channel, written into the lead's follow-up list.
- Notes: research notes, additional notes.

## 3. Tick boxes, dates and lists are translated, not dropped

A value translation layer runs on every mapped column so a sheet written by a human still imports:

- Yes / No / Y / N / TRUE / X / checked / done / 1 / 0 / blank all become the right tick state.
- "Sent", "+Reply", "-Reply", "No reply", "Positive", "Negative" map to the matching outreach state and sentiment.
- Dates in any common order (31/01/2026, Jan 31 2026, 2026-01-31, Excel date numbers) are parsed; anything unreadable is flagged on that row rather than silently lost.
- "85", "85%", "0.85" all become a watch percent of 85.
- Tags, emails and links separated by comma, semicolon, slash or new line become separate entries.
- Country, stage, channel and sender account are matched to your existing records case-insensitively, ignoring punctuation; unknown countries, stages and tags can be created on the fly (you confirm on the mapping step).

## 4. Matching that actually guesses right

No AI is used. Instead:

- A synonym dictionary covers the real-world names you use: "Company Linkedin", "Personal Linkedin", "NOTES", "Loom Links", "Loom Sent? (Yes/No)", "Email Status (Sent/+Reply/-Reply)", "Initial Contact Date", "FUP 1 Status", "prospect email 6", and so on.
- Fuzzy matching on top of that handles typos, extra punctuation, casing and stray words, and numbered columns are recognised by their number ("Prospect Email 3" goes to person 3's email).
- Each guess shows a confidence marker: matched, likely (please check), or unmatched, so you only review the handful that need it.
- The mapping step gains a search box, "only show unmatched" filter, and a warning if the same field is mapped twice.

## 5. Unmapped columns: your choice per import

A toggle on the mapping step: keep leftover columns in the lead's additional notes as "Column: value", or drop them. Default is keep, so nothing is lost while you are still tuning a sheet.

## 6. Saved mappings

- After a successful import you can name and save the mapping.
- Next time a file with the same columns is uploaded, the saved mapping is applied automatically and you jump straight to preview.
- Saved mappings can be renamed and deleted from Settings.

## 7. Better preview, confirm and result

- Preview shows the real lead as it will be saved (company, people, outreach ticks, dates), not just four columns, plus a per-row list of warnings such as unreadable dates or unknown stage.
- Duplicate handling keeps skip/update and adds "merge": fill only the empty fields on the existing lead and never overwrite what is already there.
- Import runs in batches instead of one row at a time, with a progress bar, so 100 to 5000 rows finish quickly.
- The result step lists failures with the row number and the reason, and offers a download of only the failed rows as a CSV so you can fix and re-upload just those.

## Technical notes

- `importFields.ts` becomes a field catalogue: key, label, group, target table (`leads`, `lead_contacts`, `lead_links`, `lead_followups`, `lead_tags`), value type (text, bool, date, percent, enum, list, lookup) and synonym list. Person and follow-up fields are generated for indices 1 to 8.
- New `parseValue(type, raw)` module holds the boolean/date/percent/list/enum coercion with unit tests.
- Auto-match = exact key match, then synonym match, then token-based fuzzy score (normalised Levenshtein + token overlap) with a confidence threshold; numbered suffixes extracted first.
- Excel parsing via `xlsx` (SheetJS), loaded dynamically so it stays out of the main bundle; CSV keeps the existing parser.
- Import executes per row group: bulk `insert` of leads, then child rows batched per table, wrapped so one bad row fails only itself. Lookup maps are built once, with optional create-on-missing for countries, stages and tags.
- New table `import_mappings` (name, column signature hash, mapping json, created_by) with grants and RLS mirroring `followup_templates`.

## Suggested build order

1. Field catalogue + value translation + synonyms and fuzzy matching (this alone fixes most of the pain).
2. Excel support and header detection.
3. Preview, merge mode, batched import, failed-rows CSV.
4. Saved mappings and the Settings entry.
