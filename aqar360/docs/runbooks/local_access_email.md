# Local admin access and email delivery

Updated 2026-10-29 at the user's request.

- Main login: http://localhost:8080/login. Named administrator account created on localhost and staging.localhost using the user-supplied credentials. Password is not stored in this document.
- Staging keeps its MFA requirement. Initial enrolment messages are captured locally.
- Signup is enabled on both local sites. Default role is Aqar Customer, with no desk or administrative grants.
- Public signup was tested with a synthetic .invalid address; it created a Website User with only Aqar Customer.
- Signup and password-reset messages were delivered to the separate Aqar Mailpit inbox: http://localhost:8025.
- Site host_name values are set to http://localhost:8080 and http://staging.localhost:8080 so reset links use the right hostname and port.
- Real internet email delivery remains unconfigured. SMTP provider selection and its credentials are required. A Gmail sending account requires a Google App Password entered locally; site login passwords are unrelated.
- Neither email-account passwords nor admin passwords are committed to Git.

Verified through actual HTTP: named admin login on main site, MFA challenge on staging, synthetic signup, password-reset request, and delivery to local capture. Captured mail is not delivery to Gmail.

Gmail SMTP selected by the user: Aqar Gmail SMTP accounts are prepared on localhost and staging.localhost with smtp.gmail.com:587, STARTTLS, authenticated Basic SMTP and aqar@gmail.com as sender. They remain disabled and awaiting a Google App Password. No Gmail credential is stored yet. Enable outgoing/default outgoing only when entering the App Password locally; successful save validates SMTP. Local capture remains the working fallback until then.

Google guidance: https://support.google.com/accounts/answer/185833?hl=en
