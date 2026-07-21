CREATE INDEX "Transaction_transferredAt_id_idx"
ON "Transaction"("transferredAt", "id");

CREATE INDEX "Transaction_open_match_lookup_idx"
ON "Transaction"("matchedInvoiceId", "resolvedAt", "reversedAt", "transferredAt", "id");
