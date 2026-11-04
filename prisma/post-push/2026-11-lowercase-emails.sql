-- Members added before emails were lowercased could never sign in (sign-in lowercases
-- what is typed). Lowercase them, except where that would collide with another account.
UPDATE "User" u SET email = lower(u.email)
WHERE u.email <> lower(u.email)
  AND NOT EXISTS (SELECT 1 FROM "User" o WHERE o.email = lower(u.email));
