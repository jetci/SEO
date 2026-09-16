import { createApp } from '../server/app.js';

let cachedApp: any = null;

function getApp() {
  if (!cachedApp) {
    const instance = createApp();
    cachedApp = instance.app;
  }
  return cachedApp;
}

export default async function handler(req: any, res: any) {
  const app = getApp();
  if (!req.url?.startsWith('/api')) {
    req.url = '/api' + (req.url || '/');
  }
  return app(req, res);
}
