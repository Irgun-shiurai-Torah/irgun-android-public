# Android Website Admin Parity — Internal QA

Source: draft PR #56, stacked on the R8/Library-swiping fixes in draft PR #55.

This is a **Google Play Internal Testing** trial only. Production and main
must remain unchanged. The full administrator account must be authorized by
the Worker for any change to work.

New Android Account > Admin controls:
- Contact inbox: search, read/unread, reply, archive, delete.
- Comment moderation across shiurim: search, edit, delete, pagination.
- Playback routing on the website; controls cannot change native Media3.
- Schedule JSON batch import with sourceId preview.
- CSV lecture date-only import with title/ID/date verification.
- Manage city-admin assignments and Hebrew Video Shiurim city names.
- Live and historical playback analytics.

Separate assigned City Admin panel:
- Secure chunked Audio/Video upload and final publish after metadata review.
- Manage, edit and remove assigned-city shiurim.

Build tests passed on feature branch:
- https://github.com/Irgun-shiurai-Torah/irgun-android-public/actions/runs/39246037165
- https://github.com/Irgun-shiurai-Torah/irgun-android-public/actions/runs/39246037227

Manual acceptance on Samsung Tab S10:
1. Confirm signed-in Home and Account navigation, especially Library swiping.
2. Verify only authorized admins can see Admin and City Admin tabs.
3. Open each new admin panel and verify data loads without 401/403.
4. Check non-destructive actions first, especially comment search and
   contact-message status, analytics and routing read-only settings.
5. Test a small City Admin file upload and metadata review separately.
6. Do not change live playback routing or delete records unless intended.
7. Ensure existing playback and R8 sign-in stability remain intact.

Do not merge until physical-device acceptance.
