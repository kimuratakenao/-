// Vercel Routing Middleware (framework-agnostic — no Next.js in this project).
// Basic Auth using a shared department passphrase, stored as Vercel project
// environment variables (BASIC_AUTH_USER / BASIC_AUTH_PASSWORD) so the
// credentials never appear in the git history.

const BASIC_AUTH_USER = process.env.BASIC_AUTH_USER;
const BASIC_AUTH_PASSWORD = process.env.BASIC_AUTH_PASSWORD;

function unauthorized(): Response {
  return new Response('Authentication required', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Restricted", charset="UTF-8"',
    },
  });
}

export default function middleware(request: Request): Response | undefined {
  if (!BASIC_AUTH_USER || !BASIC_AUTH_PASSWORD) {
    return unauthorized();
  }

  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    return unauthorized();
  }

  let decoded: string;
  try {
    decoded = atob(authHeader.slice('Basic '.length));
  } catch {
    return unauthorized();
  }

  const separatorIndex = decoded.indexOf(':');
  if (separatorIndex === -1) {
    return unauthorized();
  }

  const suppliedUser = decoded.slice(0, separatorIndex);
  const suppliedPassword = decoded.slice(separatorIndex + 1);

  if (suppliedUser !== BASIC_AUTH_USER || suppliedPassword !== BASIC_AUTH_PASSWORD) {
    return unauthorized();
  }

  return undefined;
}

export const config = {
  matcher: '/((?!favicon\\.ico$).*)',
};
