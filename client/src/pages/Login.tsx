import * as React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { AlertCircle, X } from "lucide-react";
import useAuth from "@/hooks/useAuth";

// ============== H3: OAuth / Security Error Code Translation ==============
// Specific Thai user-friendly copy per code (no snake_case to user).
// All codes from server/oauth.ts OAUTH_ERROR_CODES + SEC_* family from env/context gates.
const OAUTH_ERROR_COPY: Record<string, { title: string; body: string }> = {
  // ===== Generic SDK callback =====
  OAUTH_CALLBACK_MISSING_CODE_STATE: {
    title: "ไม่สามารถเข้าสู่ระบบได้ (ข้อมูลไม่ครบ)",
    body: "ระบบ OAuth ไม่ได้รับ code / state ที่จำเป็น กรุณาเริ่มต้นการเข้าสู่ระบบใหม่อีกครั้ง",
  },
  OAUTH_CALLBACK_NO_OPENID: {
    title: "ไม่สามารถตรวจสอบตัวตนผู้ใช้ได้",
    body: "Provider ไม่ส่งค่า OpenId กลับมา กรุณาตรวจสอบสิทธิ์แอป OAuth หรือลองอีกครั้ง",
  },
  OAUTH_CALLBACK_UNKNOWN_ERROR: {
    title: "การเข้าสู่ระบบล้มเหลว",
    body: "เกิดปัญหาในระหว่าง Callback จาก OAuth Provider กรุณาลองใหม่ หากยังไม่ผ่านโปรดติดต่อผู้ดูแลระบบ",
  },
  // ===== Google OAuth start =====
  OAUTH_GOOGLE_CLIENT_ID_NOT_CONFIGURED: {
    title: "Google Login ยังไม่พร้อมใช้งาน",
    body: "ระบบยังไม่ได้ตั้งค่า GOOGLE_CLIENT_ID กรุณาแจ้งผู้ดูแลระบบเพื่อเปิดใช้งาน Google Sign-in",
  },
  // ===== Google OAuth callback =====
  OAUTH_GOOGLE_CALLBACK_MISSING_CODE_STATE: {
    title: "การเข้าสู่ระบบด้วย Google ไม่สมบูรณ์",
    body: "ข้อมูลที่ Google ส่งกลับมาไม่ครบ กรุณาเริ่มการเข้าสู่ระบบใหม่อีกครั้ง",
  },
  OAUTH_GOOGLE_CALLBACK_CREDS_NOT_CONFIGURED: {
    title: "ระบบ Google OAuth ไม่ได้รับการตั้งค่า",
    body: "เซิร์ฟเวอร์ขาด GOOGLE_CLIENT_ID หรือ GOOGLE_CLIENT_SECRET กรุณาติดต่อผู้ดูแลระบบ",
  },
  OAUTH_GOOGLE_STATE_MISMATCH: {
    title: "Session การเข้าสู่หมดอายุหรือถูกเปลี่ยนแปลง",
    body: "ค่า state ไม่ตรงกัน อาจเกิดจากเปิดแท็บหลายแท็บหรือ Session หมดอายุ กรุณาลองเข้าสู่ระบบใหม่อีกครั้ง",
  },
  OAUTH_GOOGLE_BAD_COOKIE_PAYLOAD: {
    title: "Cookie OAuth ไม่ถูกต้อง",
    body: "ไม่สามารถอ่านข้อมูล Session ยืนยันตัวตนได้ กรุณาเปิดใช้งานคุกกี้แล้วลองใหม่",
  },
  OAUTH_GOOGLE_MISSING_COOKIE: {
    title: "ขาด Session OAuth State",
    body: "ระบบไม่พบ State Cookie (อาจเป็นเพื่อนปิดกั้นคุกกี้ หรือหน้าค้างนานเกินไป) กรุณาลองเข้าสู่ระบบใหม่",
  },
  OAUTH_GOOGLE_TOKEN_EXCHANGE_FAILED: {
    title: "ไม่สามารถแลก Token เข้าสู่ระบบกับ Google ได้",
    body: "Google ไม่ยอมรับคำขอ Access Token อาจเป็นจาก Code หมดอายุหรือ Redirect URI ไม่ตรงกัน",
  },
  OAUTH_GOOGLE_MISSING_ACCESS_TOKEN: {
    title: "Google ไม่ส่ง Access Token กลับมา",
    body: "Response จาก Google ไม่มี access_token กรุณาลองใหม่ หากซ้ำๆ ให้ตรวจสอบ Scope/สิทธิ์ Google Console",
  },
  OAUTH_GOOGLE_USERINFO_FAILED: {
    title: "ไม่สามารถดึงข้อมูลผู้ใช้จาก Google ได้",
    body: "ไม่สามารถเรียก /userinfo endpoint ของ Google ได้ หรือ Access Token ไม่มีประสิทธิภาพ กรุณาลองใหม่",
  },
  OAUTH_GOOGLE_MISSING_SUB: {
    title: "Google ไม่ส่ง User ID (sub) กลับมา",
    body: "ข้อมูล UserInfo ไม่มีค่า sub (OpenID) กรุณาตรวจสอบ OpenID Connect scope หรือลองใหม่",
  },
  OAUTH_GOOGLE_CALLBACK_UNKNOWN_ERROR: {
    title: "การเข้าสู่ระบบด้วย Google ล้มเหลว",
    body: "เกิดข้อผิดพลาดที่ไม่ระบุในระหว่าง Callback กรุณาลองใหม่ หากยังไม่ผ่านโปรดรายงานปัญหาต่อผู้ดูแลระบบ",
  },
  // ===== Security family (SEC_* from env/context gates) =====
  SEC_JWT_EMPTY_SECRET_PROD: {
    title: "ระบบ Security ไม่พร้อมใช้งาน",
    body: "เซิร์ฟเวอร์โปรดักชั่นไม่ได้ตั้งค่า JWT_SECRET กรุณาติดต่อผู้ดูแลระบบทันที",
  },
  SEC_JWT_DEFAULT_SECRET_PROD: {
    title: "Risk: ระบบยังใช้ค่า Default JWT Secret",
    body: "เซิร์ฟเวอร์โปรดักชั่นต้องเปลี่ยน JWT_SECRET ให้เป็นค่าแรง (ไม่ใช่ change-me) ก่อนเปิดให้เข้าถึงได้จริง",
  },
  SEC_DEVAUTOAUTH_PROD_BYPASS: {
    title: "Security Block: Dev-AutoLogin ถูกเปิดใน Production",
    body: "ระบบตรวจพบ Dev Auto-login Config ในโหมด Production → ถูกป้องกันโดยระบบ Hard Gate กรุณาติดต่อผู้ดูแลระบบ",
  },
};

const GENERIC_FALLBACK = {
  title: "ไม่สามารถเข้าสู่ระบบได้",
  body: "เกิดข้อผิดพลาดระหว่างการตรวจสอบสิทธิ์ กรุณาลองเข้าสู่ระบบใหม่อีกครั้ง หรือติดต่อผู้ดูแลระบบหากปัญหายังคงอยู่",
};

/** Resolve error code → human-readable copy (never expose raw code alone). */
function translateError(code: string | undefined | null) {
  if (!code) return null;
  return OAUTH_ERROR_COPY[code] ?? { ...GENERIC_FALLBACK };
}

/**
 * Rendered at top of Login card when URL ?error= is set.
 * Always shows role=alert for accessibility.
 */
function OAuthErrorAlert({
  code,
  detail,
  onClose,
}: {
  code: string | null;
  detail: string | null;
  onClose: () => void;
}) {
  if (!code) return null;
  const copy = translateError(code);
  const { title, body } = copy ?? GENERIC_FALLBACK;
  return (
    <div
      role="alert"
      aria-live="polite"
      className={cn(
        "relative flex gap-3 rounded-lg border p-3 text-left mb-2",
        "border-amber-300 bg-amber-50 dark:border-amber-700/50 dark:bg-amber-900/20",
        "text-amber-900 dark:text-amber-100"
      )}
    >
      <AlertCircle
        size={18}
        className="mt-0.5 shrink-0 text-amber-700 dark:text-amber-300"
        aria-hidden="true"
      />
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-xs uppercase tracking-wider opacity-80 mb-0.5">
          เข้าสู่ระบบไม่สำเร็จ
        </p>
        <p className="text-sm font-medium mb-0.5">{title}</p>
        <p className="text-xs opacity-90 mb-1">{body}</p>
        {detail && (
          <p className="text-[11px] font-mono break-all bg-amber-900/5 dark:bg-amber-100/5 rounded px-2 py-1 mt-1">
            {detail}
          </p>
        )}
        <p className="text-[11px] mt-1 opacity-75 break-all">
          Error Code: <code className="font-mono">{code}</code>
        </p>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close login error alert"
        className="shrink-0 rounded opacity-60 hover:opacity-100 transition-opacity p-1 -m-1"
      >
        <X size={14} aria-hidden="true" />
      </button>
    </div>
  );
}

interface LoginProps {
  className?: string;
  onLogin?: (profile: DemoProfile) => void;
  loginUrl?: string;
  useMock?: boolean;
  demoProfiles?: DemoProfile[];
}

export interface DemoProfile {
  id: string | number;
  name: string;
  email: string;
  avatar?: string;
  role?: string;
  teamId?: string | number;
  teamName?: string;
  projectId?: string | number;
  projectName?: string;
  locale?: string;
  scopes?: string[];
}

const DEFAULT_DEMO: DemoProfile[] = [
  {
    id: import.meta.env.VITE_DEMO_USER_ID ?? "demo-admin-001",
    name: import.meta.env.VITE_DEMO_USER_NAME ?? "EEAT Demo Admin",
    email: import.meta.env.VITE_DEMO_USER_EMAIL ?? "demo@eeat-pro.local",
    role: import.meta.env.VITE_DEMO_USER_ROLE ?? "admin",
    teamId: import.meta.env.VITE_DEMO_TEAM_ID ?? "demo-team-001",
    teamName: import.meta.env.VITE_DEMO_TEAM_NAME ?? "EEAT Pro Studio Demo Team",
    projectId: import.meta.env.VITE_DEMO_PROJECT_ID ?? "demo-project-001",
    projectName: import.meta.env.VITE_DEMO_PROJECT_NAME ?? "My Demo Project",
    locale: import.meta.env.VITE_DEMO_USER_LOCALE ?? "th-TH",
    scopes: ["read", "write", "admin", "publish", "export"],
  },
  {
    id: "demo-writer-002",
    name: "Writer Demo",
    email: "writer@eeat-pro.local",
    role: "writer",
    teamId: "demo-team-001",
    teamName: "EEAT Pro Studio Demo Team",
    projectId: "demo-project-001",
    projectName: "My Demo Project",
    locale: "th-TH",
    scopes: ["read", "write"],
  },
  {
    id: "demo-editor-003",
    name: "Editor Demo",
    email: "editor@eeat-pro.local",
    role: "editor",
    teamId: "demo-team-001",
    teamName: "EEAT Pro Studio Demo Team",
    projectId: "demo-project-001",
    projectName: "My Demo Project",
    locale: "en-US",
    scopes: ["read", "write", "publish"],
  },
];

export const LoginPage: React.FC<LoginProps> = ({
  className,
  onLogin,
  loginUrl,
  useMock,
  demoProfiles,
}) => {
  // H6: Use useAuth hook (loginWithMock → auth.devSignin mutation) to issue
  // signed JWT HttpOnly cookie via backend. No localStorage PII writes ever.
  const auth = useAuth();
  const envLoginUrl = import.meta.env.VITE_OAUTH_SERVER_URL?.toString() || "";
  const envMock = String(import.meta.env.VITE_USE_MOCK_AUTH ?? "0") !== "0" ? false : false;

  const actualLoginUrl = loginUrl ?? envLoginUrl ?? "";
  const actualMock = useMock ?? envMock ?? !actualLoginUrl;

  const profiles = demoProfiles ?? DEFAULT_DEMO;
  const [email, setEmail] = React.useState(profiles[0].email);
  const [password, setPassword] = React.useState("");
  const [remember, setRemember] = React.useState(true);
  const [loading, setLoading] = React.useState(false);
  const [selectedIdx, setSelectedIdx] = React.useState(0);
  const [err, setErr] = React.useState<string | null>(null);

  // ===== H3: OAuth / Security Redirect Error Banner State =====
  const [oauthErrorCode, setOauthErrorCode] = React.useState<string | null>(null);
  const [oauthErrorDetail, setOauthErrorDetail] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const qs = new URLSearchParams(window.location.search);
    const code = qs.get("error");
    const detail = qs.get("detail");
    setOauthErrorCode(code ? String(code).slice(0, 128) : null);
    setOauthErrorDetail(detail ? String(detail).slice(0, 1000) : null);
    // Security: strip ?error= from browser address bar after reading so F5/refresh
    // does not nag user with stale banner. Uses replaceState → no back-history entry.
    if (code) {
      try {
        const nextQs = new URLSearchParams(window.location.search);
        nextQs.delete("error");
        nextQs.delete("detail");
        const next = nextQs.toString()
          ? `${window.location.pathname}?${nextQs.toString()}`
          : window.location.pathname;
        window.history.replaceState({}, "", next);
      } catch {
        /* ignore replaceState failures (non-http protocols, sandboxed iframes) */
      }
    }
  }, []);

  const clearOauthAlert = () => {
    setOauthErrorCode(null);
    setOauthErrorDetail(null);
  };

  const appTitle =
    import.meta.env.VITE_APP_TITLE?.toString() ??
    (typeof document !== "undefined" ? document.title : "EEAT Pro Studio");

  const submitMock = async (picked: DemoProfile) => {
    setLoading(true);
    setErr(null);
    try {
      if (!picked.email) {
        setErr("โปรดเลือกผู้ใช้หรือใส่อีเมล์");
        setLoading(false);
        return;
      }
      // ============== H6: NO localStorage plaintext write (removed lines 286-289 old buggy code) ==============
      // Replaced with auth.loginWithMock which calls server auth.devSignin mutation:
      //   a) Fail-closed validates NODE_ENV=development, OAUTH_SERVER_URL empty, OWNER_OPEN_ID exists in DB
      //   b) Server sdk.createSessionToken(user.openId) signed JWT using HS256 JWT with ENV.cookieSecret
      //   c) res.cookie(eeat_studio_session, token, { httpOnly, secure: !dev, sameSite })
      // After devSignin: user is authenticated via cookie. F5/hydrate via auth.me server resolution.
      const signedUser = await (auth.loginWithMock as any)({ ...(picked as any), password: String(password || "").trim() });
      onLogin?.((signedUser ?? picked) as any);
      if (typeof window !== "undefined") {
        const target = new URLSearchParams(window.location.search).get("redirect") ?? "/";
        window.location.href = target.startsWith("/") ? target : "/";
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const onFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!actualLoginUrl || actualMock) {
      const profile: DemoProfile =
        profiles[selectedIdx] && profiles[selectedIdx].email === email
          ? profiles[selectedIdx]
          : { ...profiles[0], email, name: email.split("@")[0] || "Guest" };
      await submitMock(profile);
    } else {
      setLoading(true);
      try {
        const redirect = typeof window !== "undefined" ? window.location.href : "";
        const u = new URL(actualLoginUrl);
        if (redirect) u.searchParams.set("redirect", redirect);
        if (email) u.searchParams.set("login_hint", email);
        window.location.href = u.toString();
      } catch {
        window.location.href = actualLoginUrl;
      } finally {
        setLoading(false);
      }
    }
  };

  const ssoClick = () => {
    if (!actualLoginUrl) {
      submitMock(profiles[0]);
      return;
    }
    const redirect = typeof window !== "undefined" ? window.location.href : "";
    const u = new URL(actualLoginUrl, typeof window !== "undefined" ? window.location.origin : "http://localhost");
    if (redirect) u.searchParams.set("redirect", redirect);
    window.location.href = u.toString();
  };

  const googleLoginEnabled = String(import.meta.env.VITE_USE_MOCK_AUTH ?? "0") === "0";

  const onGoogleLoginClick = () => {
    const redirect = new URLSearchParams(window.location.search).get("redirect") ?? "/";
    const target = `/api/auth/google/login?redirect=${encodeURIComponent(redirect)}`;
    window.location.href = target;
  };

  return (
    <div
      className={cn(
        "min-h-screen w-full bg-gradient-to-br from-slate-50 via-white to-indigo-50 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950",
        className
      )}
    >
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col items-center justify-center gap-8 px-4 py-10">
        <header className="flex flex-col items-center gap-2 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-500/30">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-7 w-7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2 L3 7 V17 L12 22 L21 17 V7 Z" />
              <path d="M12 22 V12" />
              <path d="M21 7 L12 12 L3 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{appTitle}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Sign in to manage content, SEO analysis, and EEAT author workflows.
          </p>
        </header>

        <Card className="w-full max-w-md shadow-xl shadow-slate-900/5">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">
                  {actualLoginUrl && !actualMock ? "Sign in with your account" : "เข้าสู่ระบบ (Demo Mode)"}
                </CardTitle>
                <CardDescription className="mt-1 text-xs">
                  {actualLoginUrl && !actualMock
                    ? "Enterprise single sign-on — redirects to your OAuth provider."
                    : "ไม่ได้ตั้งค่า OAuth backend → ใช้บัญชีตัวอย่างเพื่อเข้าใช้งานได้ทันที"}
                </CardDescription>
              </div>
              {actualMock ? (
                <Badge variant="secondary" className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-900/40 dark:text-emerald-300">
                  DEV DEMO · Auto-login
                </Badge>
              ) : (
                <Badge variant="outline">SSO</Badge>
              )}
            </div>
          </CardHeader>
          <form onSubmit={onFormSubmit}>
            <CardContent className="space-y-4">
              {/* H3 OAuth redirect alert — appears ONLY when ?error= present in URL */}
              <OAuthErrorAlert
                code={oauthErrorCode}
                detail={oauthErrorDetail}
                onClose={clearOauthAlert}
              />

              {/* Inline form error banner (submitMock failures, e.g. "pick a user") */}
              {err && (
                <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-800">
                  {err}
                </div>
              )}

              {actualMock && (
                <div className="space-y-2">
                  <Label className="text-xs text-slate-600 dark:text-slate-400">เลือกบัญชีตัวอย่าง (คลิกเลย)</Label>
                  <div className="grid gap-2">
                    {profiles.map((p, i) => (
                      <button
                        key={String(p.id)}
                        type="button"
                        onClick={() => {
                          setSelectedIdx(i);
                          setEmail(p.email);
                        }}
                        className={cn(
                          "flex items-center gap-3 rounded-lg border p-3 text-left transition-all",
                          selectedIdx === i
                            ? "border-indigo-500 bg-indigo-50/60 ring-2 ring-indigo-500/30 dark:bg-indigo-900/30"
                            : "border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
                        )}
                      >
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-sm font-semibold text-white">
                          {(p.name || "U").slice(0, 1).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{p.name}</div>
                          <div className="truncate text-xs text-slate-500 dark:text-slate-400">{p.email}</div>
                        </div>
                        <Badge variant="outline" className="text-[10px] uppercase tracking-wider">{p.role}</Badge>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="email">อีเมล์ / Username</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={actualMock ? "demo@eeat-pro.local" : "you@company.com"}
                  required={!actualMock}
                />
              </div>
              {!actualMock && (
                <div className="space-y-1.5">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                  />
                </div>
              )}

              <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="h-4 w-4 accent-indigo-600"
                />
                จำเข้าสู่ระบบในอุปกรณ์นี้
              </label>
            </CardContent>
            <CardFooter className="flex flex-col gap-2">
              {googleLoginEnabled && (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={onGoogleLoginClick}
                    className="w-full gap-2 border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                  >
                    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
                      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.24 1.44-1.76 4.22-5.5 4.22-3.31 0-6.01-2.74-6.01-6.12s2.7-6.12 6.01-6.12c1.88 0 3.14.8 3.86 1.48l2.63-2.53C16.87 3.44 14.65 2.48 12 2.48 6.72 2.48 2.44 6.76 2.44 12.04s4.28 9.56 9.56 9.56c5.52 0 9.18-3.87 9.18-9.34 0-.63-.07-1.1-.16-1.58H12z"/>
                    </svg>
                    ดำเนินการด้วย Google
                  </Button>
                  <div className="relative w-full py-1">
                    <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-slate-200 dark:border-slate-700" /></div>
                    <div className="relative flex justify-center"><span className="bg-white px-2 text-[11px] text-slate-400 dark:bg-slate-900">หรือ</span></div>
                  </div>
                </>
              )}
              <Button type="submit" disabled={loading} className="w-full">
                {loading ? "กำลังเข้าสู่ระบบ..." : actualMock ? "เข้าสู่ระบบด้วยบัญชีตัวอย่าง →" : "Sign in"}
              </Button>
              {!!actualLoginUrl && (
                <Button type="button" variant="secondary" onClick={ssoClick} className="w-full">
                  Login with SSO (OAuth)
                </Button>
              )}
              <p className="pt-2 text-center text-[11px] text-slate-400 dark:text-slate-500">
                By continuing, you agree to the Terms of Service and Privacy Policy.
              </p>
            </CardFooter>
          </form>
        </Card>

        <footer className="text-[11px] text-slate-400 dark:text-slate-500">
          © {new Date().getFullYear()} {appTitle}. Build {import.meta.env.MODE} — Demo auth enabled: {actualMock ? "YES" : "NO"}
        </footer>
      </div>
    </div>
  );
};

export default LoginPage;
export { DEFAULT_DEMO };
