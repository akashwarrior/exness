const BASE_URL = "http://localhost:3000"

export const generateMessage = ({ token, email }: { token: string, email: string }) => `
<div>
    Hello,

    We received a request from email address ${email}, trying to validate the email address ${email} for exness-clone login.

    If you requested this validation and wish to proceed with confirming your email address, please click on this link:

    <a href="${BASE_URL}/signin/post?token=${token}">Login</a>

    Thank you,

    The exness-clone team
    <a href="${BASE_URL}">Exness-clone</a>

    If you don't know what this is about, then someone has probably entered your email address by mistake. Sorry about that,
    you can ignore this email safely.
</div>
`