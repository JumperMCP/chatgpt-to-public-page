<sub>✅ yes · 🟡 partly, or with conditions · 🔜 planned · ❌ no</sub>

| | Publish from your AI chat | Hosted in your own account | Quick to set up | Edit from a later chat | Version history / undo | Your own domain | Server code | Database |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| **[Publisher](https://chatgpt-to-public.jumpermcp.dev/)** (this project) | ✅ ChatGPT + MCP | ✅ Cloudflare | 🟡 one-time install | ✅ | ✅ last 20 | 🟡 manual today ¹ | 🔜 planned ² | ❌ |
| **[WebsitePublisher.ai](https://www.websitepublisher.ai/)** (hosted AI publisher) | ✅ many AI chats | ❌ their platform | ✅ sign in | ✅ | ✅ count by plan | 🟡 paid plans | 🟡 built-in only | ✅ |
| **[ChatGPT canvas](https://help.openai.com/en/articles/9930697-what-is-canvas)** (share link) | ✅ ChatGPT only | ❌ chatgpt.com | ✅ none | 🟡 original chat | 🟡 | ❌ | ❌ | ❌ |
| **[Claude artifact](https://support.claude.com/en/articles/9547008-publish-and-share-artifacts)** (published link) | ✅ Claude only | ❌ claude.ai | ✅ none | 🟡 original chat | 🟡 | ❌ | 🟡 AI calls only | 🟡 paid plans, 20 MB |
| **[Netlify Drop](https://app.netlify.com/drop)** (drag and drop) | ❌ manual | ✅ once claimed ³ | ✅ none | ❌ re-upload | ✅ | ✅ | 🟡 not via Drop | 🟡 not via Drop |
| **[Cloudflare upload](https://developers.cloudflare.com/pages/get-started/direct-upload/)** (dashboard direct upload) | ❌ manual | ✅ Cloudflare | ✅ dashboard | ❌ re-upload | ✅ | ✅ | 🟡 not via upload | 🟡 not via upload |
| **[Git-based hosting](https://developers.cloudflare.com/pages/configuration/git-integration/)** (GitHub Pages, Cloudflare, Netlify) | 🟡 repo-editing AI | 🟡 repo on GitHub | ❌ Git know-how | 🟡 via the repo | ✅ full history | ✅ | 🟡 depends on host | 🟡 depends on host |
| **[AI app builders](https://docs.lovable.dev/features/custom-domain)** (Lovable, Bolt, v0) | 🟡 their own chat | ❌ mostly theirs | ✅ sign up | ✅ in their editor | ✅ | 🟡 paid plans | ✅ | ✅ |
| **[Netlify MCP server](https://github.com/netlify/netlify-mcp)** (for coding tools) | 🟡 coding tools | ✅ Netlify | ❌ developer setup | 🟡 | ✅ | ✅ | ✅ | 🟡 |

<sub>¹ Attach a domain to the site's Worker in Cloudflare (Settings → Domains & Routes); the domain must be on Cloudflare. Doing this from the chat is planned.</sub><br>
<sub>² Sites are static today. Server code needs a chosen runtime, so it was left out of v1 and is planned. No database support.</sub><br>
<sub>³ Unclaimed Netlify Drop sites are deleted within an hour.</sub><br>
