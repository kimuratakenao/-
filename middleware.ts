// Vercel Routing Middleware (framework-agnostic — no Next.js in this project).
// Basic Auth using shared department passphrases, stored as Vercel project
// environment variables so the credentials never appear in the git history.
//
// - /tokuyaku/ (特約事項アプリ) is limited to fewer people, so it has its own
//   password: TOKUYAKU_AUTH_PASSWORD. The user ID is shared with the rest of
//   the site unless TOKUYAKU_AUTH_USER is set.
// - Everything else uses BASIC_AUTH_USER / BASIC_AUTH_PASSWORD.

const BASIC_AUTH_USER = process.env.BASIC_AUTH_USER;
const BASIC_AUTH_PASSWORD = process.env.BASIC_AUTH_PASSWORD;
const TOKUYAKU_AUTH_USER = process.env.TOKUYAKU_AUTH_USER || BASIC_AUTH_USER;
const TOKUYAKU_AUTH_PASSWORD = process.env.TOKUYAKU_AUTH_PASSWORD;

// A separate realm makes the browser ask for (and remember) the 特約事項アプリ
// credentials separately from the rest of the site.
function unauthorized(realm: string): Response {
  return new Response('Authentication required', {
    status: 401,
    headers: {
      'WWW-Authenticate': `Basic realm="${realm}", charset="UTF-8"`,
    },
  });
}

function isTokuyakuPath(pathname: string): boolean {
  return pathname === '/tokuyaku' || pathname.startsWith('/tokuyaku/');
}

export default function middleware(request: Request): Response | undefined {
  const { pathname } = new URL(request.url);
  const tokuyaku = isTokuyakuPath(pathname);
  const realm = tokuyaku ? 'Tokuyaku' : 'Restricted';
  const expectedUser = tokuyaku ? TOKUYAKU_AUTH_USER : BASIC_AUTH_USER;
  const expectedPassword = tokuyaku ? TOKUYAKU_AUTH_PASSWORD : BASIC_AUTH_PASSWORD;

  if (!expectedUser || !expectedPassword) {
    return unauthorized(realm);
  }

  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    return unauthorized(realm);
  }

  let decoded: string;
  try {
    decoded = atob(authHeader.slice('Basic '.length));
  } catch {
    return unauthorized(realm);
  }

  const separatorIndex = decoded.indexOf(':');
  if (separatorIndex === -1) {
    return unauthorized(realm);
  }

  const suppliedUser = decoded.slice(0, separatorIndex);
  const suppliedPassword = decoded.slice(separatorIndex + 1);

  if (suppliedUser !== expectedUser || suppliedPassword !== expectedPassword) {
    return unauthorized(realm);
  }

  return undefined;
}

export const config = {
  matcher: '/((?!favicon\\.ico$).*)',
};
