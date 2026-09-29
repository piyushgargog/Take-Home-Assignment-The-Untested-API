# Submission Notes

## a. What I'd test next

The bugs documented but not fixed (`BUGS.md` #2–#6), starting with the empty-string
validation bypass (#5), since that one doesn't have a test for it yet. I'd
also add pagination edge cases like `page=0` and negative values, since
`parseInt(page) || 1` currently swallows them silently instead of erroring.

## b. What surprised me

`README.md` and `ASSIGNMENT.md` disagree on the status enum (`pending/in-progress/completed`
vs. `todo/in_progress/done`) — a consumer following the README would get 400s on
every request. I also didn't expect `completeTask` to silently reset `priority`
back to `medium` on completion; nothing in the spec calls for that.

## c. What I'd ask before shipping to production

There's no persistence (plain in-memory array, wiped on restart) and no auth of
any kind — is that intentional for this stage, or expected to land before
production? I'd also ask whether the generic error handler should return 4xx
instead of a blanket 500 for client mistakes like malformed JSON.
