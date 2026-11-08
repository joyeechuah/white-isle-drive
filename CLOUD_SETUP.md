# Cloud saves: one-time setup

"Save my progress" uses a free Firebase project: Google sign-in, plus one Firestore record per player. Until a project is set up, the game plays exactly as before. The SAVE MY PROGRESS button is hidden, and the pause menu says cloud saves aren't set up.

## 1. Create the project

1. Open <https://console.firebase.google.com> and choose **Create a project**. Name it, for example, `white-isle-drive`. Google Analytics isn't needed.
2. Stay on the free **Spark** plan.

## 2. Turn on Google sign-in

1. In the left menu, choose **Build → Authentication → Get started**.
2. Under **Sign-in method**, choose **Google**, switch it on, pick a support email, and **Save**.
3. Under **Settings → Authorized domains**, choose **Add domain** and enter `joyeechuah.github.io`.

Email-link sign-in is left out on purpose: the Spark plan allows only 5 sign-in emails a day.

## 3. Create the save database

1. Choose **Build → Firestore Database → Create database**.
2. Pick a location near your players (for example `asia-southeast1`, Singapore) and **production mode**.
3. Open the **Rules** tab and replace everything with the contents of `firestore.rules` from this repository. Then choose **Publish**.

These rules let a signed-in player read and write only their own save (`saves/<their user id>`). Each write must be the next revision, so one device can't overwrite another device's newer progress without seeing it first.

## 4. Register the web app and copy its config

1. Open **Project settings** (the gear icon), then **General → Your apps**, and add a **Web** app (the `</>` icon). Firebase Hosting isn't needed.
2. Firebase shows a `firebaseConfig` object. Copy four of its values into `FIREBASE_CONFIG` near the top of the CLOUD SAVE section in `index.html`:

```js
const FIREBASE_CONFIG={apiKey:"AIza…",authDomain:"white-isle-drive.firebaseapp.com",projectId:"white-isle-drive",appId:"1:…:web:…"};
```

These values only identify the project and are visible to anyone who opens the page; that's how Firebase web apps work. They are not passwords. What protects the saves is the rules from step 3. You can also send me the four values and I'll put them in.

## How it behaves

- **Guests:** play as before, with the save in the browser. Nothing is downloaded from Firebase.
- **Save my progress:** the button is on the start screen, in the garage (top right) and in the pause menu. It signs in with Google and backs up the save: credits, cars, paint, customisations, records, landmarks, contracts, championships and settings. Ghost laps stay on each device, because they can pass Firestore's 1 MB record limit.
- **First sign-in:** if the account has no save yet, this device's progress goes up. A new device with no progress takes the account's. If both have different progress, the player chooses which one to keep. Nothing is added together.
- **While signed in:** the game backs up a few seconds after progress changes (at most every 30 s), when the page is hidden or closed, and when you come back online. The browser copy always stays, so the game never waits for the network and works offline. The garage pill and the panel show when the last backup succeeded.
- **Another device saved meanwhile:** the backup doesn't overwrite it. The player is asked which progress to keep, in the pause menu or the garage, never in the middle of a drive.

## Free-plan limits (Spark)

Firestore allows 50,000 reads and 20,000 writes a day. Each backup is one read and one write, and backups happen at most every 30 s while progress is changing. That covers a few hundred players a day. If the game grows past that, the Blaze plan charges per use.

## Not available in the Claude-hosted copy

The copy on claude.ai runs on a domain Google sign-in won't accept, so cloud saves are off there.
