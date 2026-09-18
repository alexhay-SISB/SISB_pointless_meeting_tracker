# SISB Pointless Meeting Tracker

A static GitHub Pages website for recording meetings that should have been emails.

## Publish with GitHub Pages

This copy is configured for:

`alexhay-SISB/SISB_pointless_meeting_tracker`

1. Upload all files in this folder to the repository root.
2. In the repository, open **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**.
4. Select `main` and `/ (root)`, then click **Save**.
5. Open the Pages URL shown by GitHub.

## Enable the Add Meeting form

The meeting history is stored in `meetings.json`. To add meetings from the website:

1. In GitHub, go to **Settings → Developer settings → Personal access tokens → Fine-grained tokens**.
2. Create a token that can access only this repository.
3. Give it **Repository permissions → Contents → Read and write**. No other permission is required.
4. On the website, click the cog, enter the repository details and token, then choose **Save & test sync**.

The token is kept only in that browser's local storage. It is not committed to the repository and is not visible to visitors. Your colleague can view the website and refreshed entries without a token.

## Local preview

Run any static web server in this folder. For example:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.
