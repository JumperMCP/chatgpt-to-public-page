# 0.1.4 — recoverable ChatGPT connection errors

OAuth authorization validation errors now show the provider's public error description and code, with a link to retry the consent request. Previously these expected failures appeared as a generic internal error. Incorrect owner passwords and login throttling keep the sign-in form and ChatGPT connection destination, without retaining the password.

The exact stable ChatGPT callback has been observed by the independent tester and configured for new installations. The tester confirmed dynamic client registration succeeds after configuring it; live consent and token exchange remain unverified. This release improves diagnosis and recovery; it does not claim to resolve the still-unidentified live authorization failure.

No storage migration, password reset, or relaxation of callback, PKCE, scope, or owner authentication checks. Existing passwords and projects remain intact.
