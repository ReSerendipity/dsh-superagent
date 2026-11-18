# Inbox file handoff

Drop a closed Markdown file into the inbox, preferably by renaming a completed temporary file. The existing two-second stability check is retained; it cannot make an actively written file transactional.

The poller moves each settled file into a private `.pending/` claim before awaiting admission. It stores an immutable version under `done/` before constructing the Trigger, so both the Trigger and channel link identify readable content. Reusing a filename creates another archive version instead of overwriting the previous request.

An admission error retains the claim for the next poll. The archive name, original timestamp and Trigger ID remain the same on retry, including when admission committed but its acknowledgement was lost. A newly dropped file at the original path is independent of that retry. An in-place change observed on the claimed inode is retained as a subsequent version.

`done/` can contain a version whose admission is still pending: archive presence alone no longer means delivery completed. Do not edit `.pending/` or archived versions. This is a single-poller local inbox, not a concurrent-producer filesystem transaction or a multi-process queue.
