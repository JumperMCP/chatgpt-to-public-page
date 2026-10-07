- "Have you recently replaced coding with prompting? Next: Replace clicks with no clicks!"
- Add to README.md or even to install walkthrough animation:
  - We use the "Account Settings Read" permission to populate the destination-account list (where you will send your data). We are not requesting billing details or permissions."
- Company "WebsitePublishherAI" created the exact same workflow (with themselves in place of CF)
  - https://www.linkedin.com/company/websitepublisher-ai/ / https://www.websitepublisher.ai/


"Minor" features
1. Paste the site's URL to find the project. In a fresh chat you don't need a project ID. The site's name or public URL is enough to find it, and if two projects share a name it asks rather than guessing (src/projects.ts:30-45).
2. Protection against "rest of code unchanged." If an edit introduces a placeholder like // rest of the code unchanged, ... same, or TODO: insert, or a large file shrinks by more than half, the candidate stays private until someone confirms the rewrite was intended (src/files.ts:76-87). This catches the most common way AI edits quietly break a site.
3. Edits are all-or-nothing. Every old_string must match exactly once, or none of the batch is applied. A half-edited page can't go live (src/projects.ts, patch loop).
4. Files you don't mention stay as they are. Sending a new style.css doesn't delete the images. Removing a file takes an explicit delete, so a partial upload can't wipe the site.
5. A change summary for every revision: files added, modified and deleted, plus whether the serving behavior changed. You can see what an edit touched before trusting it.
6. Stale-chat protection. If an old conversation tries to publish over something newer from another chat, it's refused with a request to re-read the project first. Two parallel chats can't silently overwrite each other.
7. A dropped connection doesn't lose a publish. Publishing continues after the chat disconnects, and retrying the same combined request won't publish twice (request_key).
8. "Not reachable yet" is reported separately from "failed." New workers.dev hostnames can take a while to come up. Publisher keeps checking and says "activated, waiting for the address", so you don't re-publish a site that already worked (src/cloudflare.ts:436-445).
9. The address never changes. The hostname is set once and survives edits, undo and unpublish/republish, so links you've shared keep working.
10. Unpublish isn't delete. Unpublishing takes the site offline but keeps the files and history, so you can bring it back or edit it later.
11. Download any retained version as the original files. The export is a short-lived ZIP of the original bytes, which is useful for handing a site to someone or moving it.
12. 404 page and single-page-app behavior just work:
    - Adding 404.html turns on the custom 404 page.
    - Once a site is set up as a single-page app, later edits keep that setting.
    - _headers and _redirects are checked before publishing instead of failing on Cloudflare (src/files.ts:88+).
13. Large files are read in pieces, not cut off. Big files are returned in ranges with a "continue from here" marker, and search works across a whole site. The model reads the real file instead of guessing what's in it.
14. Storage use is visible and deduplicated. Listing projects shows bytes used against the limit, and identical files across revisions are stored once, so 20 snapshots cost far less than 20 copies.