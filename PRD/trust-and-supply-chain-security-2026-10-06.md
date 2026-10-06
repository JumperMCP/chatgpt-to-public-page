# PRD: verifiable trust and operator security

Date: 2026-10-06

Status: proposed roadmap; controls below are not implemented merely by being listed

Product: ChatGPT-to-Public Publisher and the Jumper MCP installer

Baseline source: `cdee9b53e7dddbd5da01f881ee3fd593dd724875`

Current distributed Publisher: 0.1.12

Owners: operator/release maintainer; independent reviewer where specified

## 1. Problem and desired outcome

A prospective user grants Cloudflare provisioning access to an installer, then connects software installed by that service to ChatGPT. Checksums, signatures, and successful functional tests are useful but cannot establish that the operator, build, or hosted installer is honest and uncompromised. Today the user must place considerable trust in Jumper MCP.

We need to reduce both the amount of trust required and the impact of a compromise. A user should be able to inspect what they authorize, identify the exact software installed, trace it to reviewed source and a build, revoke access, and keep their sites running independently of the installer. The operator needs enforceable separation between development, signing, deployment, and user workloads, plus detection and recovery procedures.

Success is an evidence chain: reviewed source → identified build → approved signed artifact → recorded deployment → independently checked user installation. No single link proves safety. This PRD is a technical plan, not a security certification or evidence of an existing intrusion.

## 2. What is true today

The following distinguishes code inspection, authenticated configuration checks, prior live evidence, and unknowns. Read-only checks were performed for this assessment; no account/security settings were changed.

| Area | Evidence on 2026-10-06 | Protection and limit |
| --- | --- | --- |
| Repository visibility | GitHub reports PRIVATE. An anonymous API request in the preceding assessment returned 404. | The original source is not independently reviewable by ordinary users. A private repository is not protection from stolen maintainer access. |
| Branch governance | Main-branch protection and ruleset API requests return 403 with a private-repository plan restriction. | Enforced review/protected-branch controls are not established. CI success does not itself prevent direct pushes or deployments. |
| Release environment | GET for the `release` environment returns 404. | The workflow references an environment, but a protected, usable environment is unverified. Treat it as missing/unverified until an authorized settings check succeeds; an environment name in YAML is not an approval gate. |
| Workflow permissions | GitHub reports default workflow permissions `read` and PR-review approval disabled. Validation YAML uses `contents: read`. | Good reduction of default CI authority. It does not isolate a compromised signing/build job. |
| Release workflow | Manual workflow exists; GitHub returns no runs. Actions use mutable major-version tags. | No build attestation from this workflow is evidenced. The declared workflow signs the Publisher manifest and would attest the Publisher, manifest, and installer bundle; it does not currently sign an installer manifest. |
| Release authenticity | Live 0.1.12 signature, module SHA-256 hashes/sizes, and checksum list verified in the preceding assessment. All archived releases passed the local distribution verifier. | Detects altered release files when the key and verifier remain trusted. Does not prove safe source or honest hosting. |
| Signing custody | Local Ed25519 key file has mode 0600 and is owned by the development user. Releases have been built, signed, and deployed from this development environment. | Restricts other OS users, not malware/dependencies/tools running as that user. Hardware isolation, independent approval, backup controls, and key rotation are not established. No private-key contents were included in this assessment. |
| Installer credentials | PKCE S256, state checks, origin/CSRF checks, host-only secure session cookie, encrypted Cloudflare grant; successful completion deletes saved grant, installation encryption key, and handoff token. | Limits common request-forgery/interception and retained-secret exposure. The installer necessarily has provisioning authority during installation. Runtime compromise can use its keys. |
| Expiry and setup | Installer checks a one-hour session expiry and schedules cleanup. The setup link is single-use at Publisher; its installer copy is retained until expiry. | Local deletion/expiry is not provider-side revocation. Cleanup depends on execution, and a previously stolen grant may remain usable subject to Cloudflare's own expiry/revocation rules. Do not advertise “all access automatically disappears after one hour.” |
| Personal publishing key | Refresh handoff is disabled. User supplies a Cloudflare API token to their installed Publisher; it is encrypted with that Worker's secret. | Routine publishing does not require the installer to hold the user's publishing token. Malicious code executing inside that Publisher can decrypt/use it. |
| Owner and MCP access | Password hashing, login throttling, CSRF/origin checks, secure cookies, scoped OAuth, PKCE and exact resource/callback validation. | Normal unauthenticated HTTP requests cannot simply install code or gain project access. Validly authorized malicious code/tool output is a different threat. Callback allowlisting is not full client identity proof. |
| Updates | Owner review, signed downloads, repeat verification before deployment, compatibility checks and preserved bindings. Ordinary project operations do not call the installer. | No silent central push is implemented. A malicious but validly signed update can still be approved. Signature checks do not establish freshness or forbid older signed versions; the current source is pinned to a versioned URL. |
| Published websites | Separate site Workers/origins; deployment metadata excludes owner credentials/bindings. File import has bounded reads and path/archive/download checks. | Reduces direct cross-origin access. A malicious page/file may still supply prompt-injection content when an agent reads it. |
| Monitoring | Both Wrangler files disable application observability. Cloudflare audit delivery, alerts, WAF/rate-limit policy, registrar controls, and incident response have not been verified. | No complete compromise-detection story is established. Lack of evidence here is not evidence these controls are disabled at account level. |
| Account security | GitHub/Cloudflare/email/registrar MFA, recovery, memberships, active sessions, and actual deployment-token scope were not audited. | These remain important unknowns, not assurances. |

Code references: [installer](../src/installer/worker.ts), [release verification](../src/releases.ts), [release download](../src/release-download.ts), [signing script](../scripts/release.ts), [updater](../src/updates.ts), [owner security](../src/security.ts), [OAuth](../src/oauth.ts), [MCP](../src/mcp.ts), [files](../src/files.ts), [release workflow](../.github/workflows/release.yml), and [acceptance ledger](../docs/acceptance.md).

## 3. Threat model and blast radius

Protected assets include operator identities and sessions; repository/workflows; dependency inputs; release key; Cloudflare deploy authority, DNS and routes; installer grant storage and setup links; installed Publisher code/secrets/project data; and the trust users give MCP tool definitions/results.

| Attack path | Existing barrier | Remaining exposure / proposed response |
| --- | --- | --- |
| Replace only a downloadable Worker | Signature and hash verification | Fails closed under the original trusted verifier. Separate release-writing authority from signing; independently record digests. |
| Replace the hosted installer, its verifier, or configured trust root | Cloudflare account/deployment access controls; application security against ordinary requests | A deployment administrator can bypass verification or serve altered install instructions. Harden deployment identity, monitor actual deployed modules/configuration, and offer a locally verified install route. A badge or HTTPS does not prove honest operator code. |
| Steal the signing key | Local file permissions | Attacker can authorize a malicious release. They additionally need a delivery path to reach users. Separate signing custody, require digest approval, and prepare rotation/revocation. |
| Compromise a dependency, action, or maintainer checkout | Lockfile, validation, clean-tree release rule | A locked dependency can still be malicious. Dependency code running as the development user can reach locally accessible keys/CLI credentials. A clean tree does not prove its bundle came from safe source. |
| Compromise an installation in progress | Grant encryption, expiry, PKCE/CSRF | A compromised installer can use the current grant, replace code, or steal setup material. Minimize grant scope/lifetime and sensitive-data retention; prepare provider-side revocation. |
| Compromise an already installed Publisher | Owner/OAuth checks; no ordinary dependency on the installer | Its code can read its own secrets and exercise the token's real Cloudflare permissions. Normal code checks/ownership tags are not an independent sandbox against malicious replacement code. |
| Compromise operator's personal Publisher in the production installer account | Current application only manipulates owned resources | If its publishing token has account-wide Workers write access, malicious Publisher code may be able to replace the installer itself. This could turn one personal installation into a distribution attack. Prefer separate Cloudflare accounts; verify actual scope before claiming isolation. |
| Poison tool descriptions/results or project content | Scoped endpoints, explicit operations, untrusted-content instructions, owner-only permanent deletion/updates | Model instructions and MCP annotations are not complete prompt-injection defenses. A hostile tool may influence an agent to disclose or publish information it can access. It does not automatically obtain the user's whole ChatGPT history, password, or unrelated app permissions. Impact depends on context, other connected tools and approval behavior. |
| Overload public session/registration/provisioning endpoints | Input bounds, some authentication/rate checks | Public traffic can still consume resources; account-level rate limits, abuse controls and cost alerts need validation without breaking OAuth/MCP clients. |

An installer compromise after a completed installation is not automatically a compromise of all existing Publishers: current instances run in user accounts, ordinarily do not call the installer, and require update approval. Exceptions include contaminated original installs, retained/stolen credentials, compromised signing/update paths, shared operator privileges, or users following malicious instructions. This distinction must appear in user-facing incident communications.

## 4. Ordered implementation and publication plan

Complete each step with its evidence before claiming its protection. P0 protects the operator and current users; P1 creates inspectable trust evidence; P2 strengthens independent assurance. Estimates are intentionally omitted until ownership and account-plan constraints are resolved.

### Step 1 — P0: inventory and protect control-plane identities

Owner: operator. Dependencies: none.

1. Inventory GitHub, Cloudflare, registrar/DNS, recovery email, installed integrations, deploy tokens, signing access, CLI sessions, backups and who can bypass controls. Store secret references, never values, in the inventory.
2. Verify phishing-resistant MFA/passkeys/security keys where supported; keep protected recovery methods and remove stale sessions/members/integrations. Harden the recovery email too. Cloudflare supports security-key-based 2FA. [Cloudflare guidance](https://developers.cloudflare.com/fundamentals/user-profiles/2fa/)
3. Separate production installer administration from daily browsing/development. Inventory the operator's own Publisher account and token scope immediately. Put personal/testing Publishers in a separate Cloudflare account from the production installer, or demonstrate an equivalent provider-enforced restriction. Plan migrations explicitly; do not rename or move production resources casually.
4. Give deployment automation the narrowest supported account/resource permissions. Do not assume prefix-based Worker restrictions exist. Exclude DNS, member management, billing and token creation unless a separately approved task requires them. Validate provisioning permissions against the live catalog. [Cloudflare permission reference](https://developers.cloudflare.com/fundamentals/api/reference/permissions/)

Acceptance: an operator-reviewed access map; verified recovery; disposable denied-action checks; explicit evidence that a personal Publisher credential cannot modify production installer resources. Publish a redacted responsibility/access summary, not sensitive topology or credentials.

### Step 2 — P0: enforce repository and deployment approval

Owner: maintainer plus independent reviewer. Depends on step 1 and a GitHub plan/visibility decision.

1. Resolve the current protection feature restriction by choosing a supported plan or publishing the repository only after step 5's disclosure review. Until then, do not describe main as protected.
2. Require passing checks and review for main/release changes, prevent force-push/deletion, and audit bypass privileges. Cover workflows, lockfiles, release scripts, trust roots and installer/security code with review ownership. A second account controlled by the same person is not independent approval.
3. Create and inspect the real release environment and allowed deployment refs. Verify approval behavior using an unauthorized branch and a non-approved run. Environment features vary by plan; a YAML reference alone does not establish protection. [GitHub environments](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments)
4. Pin action dependencies to reviewed full commit SHAs. Keep PR builds without release/deploy credentials; do not execute untrusted PR code in privileged workflows. Retain read-only default workflow permissions. [GitHub secure use](https://docs.github.com/en/actions/reference/security/secure-use)

Acceptance: blocked unauthorized push/release demonstrated; protected paths/ref restrictions recorded; changes and approvals linked to each deployment. Retain a documented emergency override with alerts and retrospective review.

### Step 3 — P0: separate build, signing and deployment authority

Owner: release maintainer and signing approver. Depends on steps 1–2.

1. Build in an isolated disposable environment with no production keys or deployment credentials. Review dependency install scripts; pin build tools/runtime as well as package versions. Generate artifacts and a manifest from an identified source commit.
2. Move signing out of the general development account. Evaluate a hardware-backed or isolated signer supporting the chosen algorithm. Preserve compatibility with installed trust roots; do not replace Ed25519 or rotate keys without an explicit migration plan.
3. The signing environment consumes a digest-approved manifest and validated artifact set. It must not run arbitrary repository code, package install hooks, or the current repository-controlled TypeScript release command with the private key present. Restrict network/output and retain a minimal, independently reviewed signing tool.
4. Deploy only the exact approved artifact by digest from a separate job/identity. Do not rebuild after signing. Access to hosting must not automatically provide access to the signing key, and signing must not grant Cloudflare administration.
5. Protect backups and document loss/compromise recovery. Never export keys into logs, PRs, agent chats or public artifacts.

Acceptance: builds cannot read the signer; signer cannot deploy; deployer cannot mint valid signatures; an artifact changed between approval and deployment is refused. Record who approved which digest. Independent review is still needed to detect malicious but intentionally approved source.

### Step 4 — P0: detect unexpected changes and rehearse containment

Owner: operator. Depends on step 1; improve as steps 2–3 ship.

1. Export relevant Cloudflare/GitHub audit events and alert on Worker/route/DNS changes, membership/token changes, release-key/trust-root changes, environment bypass and workflow edits. Verify feature availability instead of assuming default monitoring. Keep a durable log/alert destination outside the same production administrative boundary where feasible.
2. Monitor release bytes and retrieve actual deployed installer code plus relevant non-secret settings using an independent read-only identity. Compare against an approved deployment record, not a hash served only by the same website. Record binding identifiers, OAuth callback/client configuration and trust roots; never export secret values.
3. Add redacted operational events and rate/cost alerts. Do not log OAuth codes, setup links, cookies, private project content, API tokens or signed download URLs. Evaluate endpoint-specific rate limits/WAF policies with real OAuth and MCP flows; do not put browser challenges in front of machine clients indiscriminately.
4. Prepare a release/install pause procedure, clean-account rollback, affected-version advisory, and credential revocation guidance. Freeze new installs/updates first when distribution integrity is uncertain; preserve evidence. Existing unaffected websites should remain served.
5. For potentially stolen credentials, rotate/revoke the appropriate provider grants and tokens, invalidate affected Publisher sessions/MCP grants, and restore code from a separately trusted source. Deleting an installer record or changing its encryption key does not revoke credentials stolen earlier. Rotate encryption keys only with a plan for existing ciphertext and safe reauthorization.

Acceptance: tabletop plus disposable-account drill; unauthorized deployment detected within a proposed five-minute target; alerts acknowledged; installation pause/restore and user notification verified. Publish incident contact and policy before announcing a response-time promise.

### Step 5 — P1: publish reviewable source and candid security information

Owner: maintainer; reviewer approves disclosure. Can prepare alongside P0, but public promotion waits for P0 gates.

1. Review the full repository history, release artifacts, logs, screenshots and documents for secrets/private tester data and third-party redistribution rights. If a secret was committed, revoke it; deleting its latest file is insufficient. Exclude raw traces and local test material.
2. Publish source or a reviewed public distribution repository, with clear history/provenance for released versions. Reconcile stale README statements with the acceptance ledger. Publication is an explicit operator decision, not an automatic consequence of this PRD.
3. Publish `SECURITY.md`, a private vulnerability-reporting channel, support policy, known limitations and a dated review status. Do not call the product audited before an independent audit exists.
4. Add a plain-language trust/permissions page linked before authorization. Explain temporary installer access, the separate installed publishing token, its actual capabilities, retention/setup window, revocation, and the distinction between deleting local data and revoking provider access. Explain that account-wide publishing authority can affect other resources if the software is compromised.
5. Explain checksums, signatures, provenance and their limits. “Protected by Cloudflare” must not be presented as a security audit or Cloudflare endorsement of the application.

Acceptance: an anonymous user can review source, source-to-release links, permission rationale, recovery/uninstall instructions and limitations before granting access. No private account values or exploitable live credentials are published.

### Step 6 — P1: publish build evidence for both Publisher and installer

Owner: release maintainer. Depends on steps 2–3 and public evidence access.

1. Generate versioned manifests for the Publisher and the installer distribution. Cover the installer's server bundle and relevant static assets, including executable progress JavaScript. Record approved public configuration separately from secrets; source code alone does not describe deployment bindings or routes.
2. Run the protected release workflow and publish artifacts, SHA-256 hashes, signatures, source commit, exact toolchain, dependency inventory/SBOM, test results and attestation references. The currently empty run history must be replaced with an actual verifiable example.
3. Generate and verify build attestations for the exact artifact digests, checking repository/workflow identity and source/ref policy. Provenance describes origin and process, not absence of malicious code. Check GitHub's public/private availability requirements. [Artifact attestations](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations)
4. Enforce append-only version publication in the release process; reject replacing an existing version with different bytes. HTTP `immutable` cache headers are not storage immutability. Preserve signed digest records in a separately controlled channel.
5. Publish the verification key/fingerprint through more than the installer itself. A GitHub copy provides limited independence if the same compromised identity controls both channels; document this residual trust.

Acceptance: an anonymous verifier can validate both distributions, identify signer/build identities and exact commits, reject modified files/wrong identities, and find previous versions. Signatures without accessible attestations must remain labeled “signed,” not “provenance verified.”

### Step 7 — P1: prove builds and installed bytes match

Owner: independent verifier with maintainer support. Depends on step 6.

1. Publish a deterministic build recipe, including runtime, package manager, dependency lock, build flags and generated asset inputs. Build on two isolated environments and compare artifact bytes. Fix nondeterminism or disclose precisely what is not reproducible; do not label it reproducible based on one build.
2. Publish a small verifier runnable independently of the installer site. It checks the manifest, pinned key fingerprint, artifact hashes, expected release/build identity, and compatibility. It must not execute the downloaded Worker to verify it.
3. Let an owner export/fetch deployed Publisher modules through their own Cloudflare access and compare them to the reviewed artifact. Inspect non-secret bindings/settings too: release origin, public key, MCP origin/callbacks, DO/KV identifiers and absence of unexpected capabilities. Keep owner credentials local to the verifier.
4. Verify the installed code after a new installation and after an update. A receipt generated by the installer alone is a claim, not independent measurement. A matching measurement proves what was observed at that time, not what will run forever.
5. Document a technical-user installation path from reviewed source/artifacts that avoids granting the hosted installer provisioning access. First test its usability and permissions; do not advertise this path as available until implemented and exercised.

Acceptance: independent rebuild matches; altered installed code/configuration is detected; a novice-readable verification report explains mismatches; manual install is demonstrated on a disposable independent account.

### Step 8 — P1: contain malicious releases and define key lifecycle

Owner: release/security maintainer. Depends on steps 3 and 6.

1. Keep explicit owner update approval and independent operation of existing Publishers. Explain meaningful permission/tool changes in release notes before approval.
2. Define rollback/replay policy: distinguish a deliberate owner rollback from a stale/maliciously replayed signed release. Introduce supported-version/advisory policy and any freshness/sequence checks with offline/outage behavior specified. A signature alone does not prove “latest” or “not revoked.”
3. Implement normal key rotation with an authenticated transition, overlap policy and tested compatibility for existing installs. A stolen old key signing a replacement key is not sufficient emergency recovery; publish an independently authenticated emergency procedure.
4. Stage releases in a canary account, then a small opted-in cohort, before broad promotion. Record rollback drills while preserving keys, bindings and project data.

Acceptance: revoked/damaged/stale release cases and deliberate rollback are tested; existing sites continue during installer outage; emergency key replacement works without trusting only a compromised website or key.

### Step 9 — P1: test agent-facing threats, not only HTTP security

Owner: independent security reviewer plus maintainer. Depends on documented architecture; isolated fixtures only.

1. Threat-model tool descriptions, results, retrieved project files, release notes, attachments and public pages as possible hostile text. Maintain authorization in server code, not model instructions or tool annotations. Review MCP session/token boundaries against the [MCP security guidance](https://modelcontextprotocol.io/docs/2026-07-28/tutorials/security/security_best_practices).
2. Use synthetic canary secrets to test attempts to publish unrelated chat content, read/export other projects, cross an installation boundary, substitute OAuth audience/callbacks, exfiltrate credentials, or disguise tool behavior. Test both per-action approval and the user-observed Always Allow setting; record client behavior rather than assuming a confirmation protects every action.
3. Evaluate separating read access from publishing authority and adding an optional owner-confirmed publication mode bound to exact revision bytes and project. Explain the usability cost; do not promise that a warning in tool output is a confirmation boundary.
4. Preserve owner-only permanent deletion and Publisher updates. Confirm malicious project content cannot invoke these routes without owner session/CSRF checks. Review origin/cookie isolation, file SSRF/archive limits, stored content escaping and resource exhaustion.
5. State realistic impact: a malicious MCP server may influence the agent and use its own granted capabilities. It does not inherently control the entire ChatGPT account. Never test with real third-party accounts or real sensitive conversation data.

Acceptance: a repeatable adversarial test matrix with outcomes, fixed findings and explicit residual risks; no unsupported “prompt-injection proof” claim.

### Step 10 — P2: independent review and ongoing public evidence

Owner: independent reviewer; maintainer remediates. Depends on a stable protected release process.

Commission review of installer provisioning, key/deployment custody, OAuth/MCP boundaries, file handling, agent-facing abuse and incident recovery. Publish scope, date, reviewed commit, findings, remediation and retest evidence. Re-review material permission/auth/update changes. Maintain a dated trust page with links to current source, artifacts, provenance, rebuild results, audit findings, advisories and status history.

Acceptance: critical/high findings resolved or explicitly accepted with launch restrictions; independent retest available; contact and recurring access/dependency/recovery review owned by a named maintainer. Do not substitute a badge, an automated score, or an npm audit result for this review.

## 5. Launch gates and evidence users see

| Gate | Minimum evidence | User-facing statement allowed |
| --- | --- | --- |
| Current limited testing | Present signed artifacts and observed functional results, with private-source/provenance limitations | “Signed releases; independent security assurance is limited.” |
| Broader public installer recommendation | P0 complete; public source/trust page; verifiable build/deployment chain; independent installed-code check; incident drill; material agent-facing findings assessed | Explain exactly which checks exist and link the evidence. Do not say “cannot be compromised.” |
| Independent assurance milestone | Two-environment reproduction and independent review/retest | Name the audit scope, date and commit; avoid claiming it covers future versions automatically. |

Track: protected release/deployment percentage (target 100%); exceptions/bypasses; time to detect/respond; published attestation coverage; independent rebuild matches; tested installed-byte comparisons; age of unresolved findings; and last key/access/recovery review. Publish summaries, not sensitive operational data.

## 6. Immediate decisions and non-goals

The first decisions are production-versus-personal Cloudflare isolation, GitHub protection availability, an independent release reviewer, and signing custody. Account MFA/recovery/token scope must be verified before treating them as protections already present. Until then, avoid putting unrelated important resources in an account where experimental publishing code holds broad write authority.

This PRD does not authorize making the repository public, upgrading paid plans, moving accounts/domains, rotating live keys, revoking grants, changing user permissions, or conducting intrusive testing. Those actions need their concrete implementation/migration reviewed within the user's authorization. Creating this document changes no production security settings.

No system described here eliminates the need to trust software authors and some infrastructure. The goal is narrower authority, inspectable evidence, separation of failures, and a practiced response when trust fails.
