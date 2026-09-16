export function getLoginUrl(redirect?: string) { return '/login' + (redirect ? '?redirect=' + encodeURIComponent(redirect) : ''); }
export const SITE_NAME = 'EEAT Studio V2';
export default { getLoginUrl, SITE_NAME };
