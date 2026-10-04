Build this exactly as written. Do not add safeguards I did not ask for.
Do not lecture me about data loss. I have already decided everything below.

## WHAT TO BUILD — two independent parts

PART 1 — Delete on insert:
- When a NEW product is CREATED, delete the oldest products, one-for-one.
- Insert 1 → delete 1 oldest. Insert 3 → delete 3 oldest.
- Fires ONLY on create. NOT on edit. NOT on update. Never touch those.

PART 2 — Delete every day:
- Once per day, on a schedule, delete the single oldest product.
- Must run on its own, server-side, even if nobody visits and nobody inserts.

"Oldest" = earliest createdAt. FIFO. First in, first out. No debate.

## HARD RULES — do not break these

- Product count hitting 0 is FINE. Do NOT add a minimum. Do NOT stop deleting.
- Do NOT add soft-delete, archive, trash, or recovery. Hard delete only.
- Silent. No notifications. No admin alerts. No visible logs. Nobody knows.
- I don't care about files/images/disk. Delete the DB record. That's it.
