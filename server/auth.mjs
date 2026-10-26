import { createHmac, createHash, timingSafeEqual } from 'node:crypto';

const SESSION_SECONDS = 30 * 24 * 60 * 60;
const digest = value => createHash('sha256').update(value).digest();
export const safeEqual = (left, right) => timingSafeEqual(digest(left), digest(right));

export function createAuth({ dashboardToken, cookieSecure }, now = Date.now) {
  const cookieName = cookieSecure ? '__Host-prview' : 'prview';
  const sign = value => createHmac('sha256', dashboardToken).update(`prview-session-v1:${value}`).digest('base64url');
  const cookie = () => {
    const expiry = Math.floor(now() / 1000) + SESSION_SECONDS;
    // Lax allows the clean redirect after opening a shared link from another site.
    // Cross-site subrequests still cannot send this cookie; the app is read-only.
    return `${cookieName}=${expiry}.${sign(String(expiry))}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_SECONDS}${cookieSecure ? '; Secure' : ''}`;
  };
  const authorized = request => {
    const raw = request.headers.cookie || '';
    const value = raw.split(';').map(part => part.trim()).find(part => part.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
    if (!value || value.length > 128) return false;
    const match = /^(\d{10,12})\.([A-Za-z0-9_-]{43})$/.exec(value);
    if (!match) return false;
    const expiry = Number(match[1]);
    const time = Math.floor(now() / 1000);
    return expiry > time && expiry <= time + SESSION_SECONDS && safeEqual(match[2], sign(match[1]));
  };
  return { cookie, authorized, acceptsToken: value => typeof value === 'string' && safeEqual(value, dashboardToken) };
}
