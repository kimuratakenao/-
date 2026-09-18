// Vercel Routing Middleware (framework-agnostic — no Next.js in this project).
// Basic Auth using a shared training passphrase, hardcoded per explicit request
// (this deployment has no env vars — the passphrase is shared with all participants).

const BASIC_AUTH_USER = 'okamurahome';
const BASIC_AUTH_PASSWORD = '20260917';

function unauthorized(): Response {
  return new Response('Authentication required', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Restricted", charset="UTF-8"',
    },
  });
}

export default function middleware(request: Request): Response | undefined {
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
