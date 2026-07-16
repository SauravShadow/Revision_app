-- Verification links get opened more than once in the real world (mail-app
-- preview browsers, double clicks, client re-mounts). Track first use instead
-- of deleting the row, so repeat visits inside a grace window can still be
-- answered with success.
ALTER TABLE email_verification_tokens
  ADD COLUMN used_at timestamptz;
