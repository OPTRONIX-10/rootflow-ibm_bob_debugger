# Seeded bug reference

## Symptom
Running `python app.py` or `pytest tests/` raises:

    KeyError: 'email'
      File "routes/auth.py", line 8, in create_user
        "email": validated["email"],

## Root cause
Commit `90a0779` ("refactor: user validation schema", 2 days before the
README commit) renamed the required field from `email` to `email_address`
in `models/user_schema.py`. `routes/auth.py` was never updated to match,
so it still reads the old key name and raises a KeyError once validation
passes with the new field name.

## Propagation
1. `models/user_schema.py` — schema now requires `email_address`, not `email`
2. `routes/auth.py` — still builds the response dict using `validated["email"]`
3. `app.py` — calls `create_user()`, the KeyError surfaces here at runtime

## Decoy to watch for
Commit `b4511be` ("chore: bump token expiry window") touches
`utils/token_service.py` only 4 days before the bug-introducing commit.
It's recent, but unrelated to the failure — a correct root-cause tool
should investigate and then rule it out, not just blame "whatever changed
most recently."

## The fix (not applied in this repo — apply it yourself when testing)
In `routes/auth.py`, change:

    "email": validated["email"],

to:

    "email": validated["email_address"],

This adapts the carrier to the new schema rather than reverting the
refactor. After the fix, both `python app.py` and `pytest tests/` should
pass cleanly.
