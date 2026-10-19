# Internal Testing: Android Library lower-screen swipe

Status: **R8 QA / Internal Testing only**. Do not promote to production or merge PR #55 solely on CI success.

- Same R8 push-permission crash fix as the physical Samsung-tested 1.0.209 build.
- Make the Your Library main-content area at least viewport-height on Android,
  matching the already working Account page. This fixes swipe gestures that
  previously started in blank lower-screen space outside the content element.
- Preserve native vertical scrolling, keyboard inputs, native player gestures,
  Android system Back edges and nested horizontal carousels.
- Real Android 11 startup emulator swipe test passed on
  https://github.com/Irgun-shiurai-Torah/irgun-android-public/actions/runs/39239686987
  including Library bottom area -> Account -> Library reverse swipe.
- Updated unit tests passed. Full R8 regression matrix is tracked separately:
  https://github.com/Irgun-shiurai-Torah/irgun-android-public/actions/runs/39239687282
- Source changes: commit 26011069571c56ecf06715935b410c12d926a9ca,
  with original app behaviour fix from 77049325490eda87f3c6ac561d16ce40126f853a.

Manual Samsung Galaxy Tab S10 acceptance:
1. Login and confirm Account/Home navigation and push notification check work.
2. On Your Library, swipe across the lower empty area and inside Likes,
   Watch Later, History, Following, Downloads, Playlists and Purchased.
3. Swipe both directions, then immediately reverse. Ensure the current page
   visually follows the finger and the next page settles into place.
4. Verify buttons, horizontal list scrolling and vertical scrolling still work.
5. Confirm audio, video, mini-player and login survive switching tabs.

Keep production unchanged.