# Keep the selected appearance across windows

## Goal
Make light and dark mode stay exactly as selected when opening a new tab, window, or returning to the app.

## Changes
- Save the chosen appearance on the device immediately when it is changed, while continuing to save it to the account.
- Apply the saved appearance before the page is displayed so a dark-mode window never flashes or settles into light mode.
- Reconcile the device preference with the signed-in account after account details load.
- Keep open tabs synchronized when the appearance changes in another tab.
- Preserve the current Light and Dark controls and visual design.

## Verification
- Select Dark, open the app in a new tab and confirm it starts dark.
- Select Light, open the app in a new tab and confirm it starts light.
- Refresh both modes and confirm there is no incorrect-color flash.
- Confirm the saved account preference still applies after signing in on a fresh browser.

## Technical details
The current appearance state always initializes as `light` and only changes after the account profile finishes loading. A small pre-display preference bootstrap plus synchronized local and account state will remove that delay without changing the existing settings interface.
