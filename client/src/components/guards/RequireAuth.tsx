import { Redirect } from 'wouter';
import useAuth from '@/hooks/useAuth';

const GuardSpinner = () => (
  <div className="min-h-screen flex items-center justify-center bg-[#fbf8f4]">
    <div className="text-center">
      <div className="w-12 h-12 rounded-full border-4 border-amber-600/30 border-t-amber-600 animate-spin mx-auto mb-5" />
      <p className="text-stone-600 text-[14px]">กำลังโหลด EEAT Studio...</p>
    </div>
  </div>
);

type RequireAuthProps = {
  children: any;
  requiredRole?: 'admin' | 'owner';
};

export default function RequireAuth({ children, requiredRole }: RequireAuthProps) {
  const { loading, isLoggedIn, user } = useAuth();

  if (loading) return <GuardSpinner />;
  if (!isLoggedIn) return <Redirect to="/login" replace={true} />;

  if (requiredRole === 'admin') {
    const isAdmin = user?.role === 'admin';
    const isOwner = user?.permission === 'owner';
    if (!isAdmin && !isOwner) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[#fbf8f4]">
          <div className="max-w-md w-full mx-4">
            <div className="bg-white rounded-2xl shadow-lg border border-rose-200 p-8 text-center">
              <div className="w-14 h-14 rounded-full bg-rose-100 flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl">🚫</span>
              </div>
              <h1 className="text-xl font-bold text-rose-700 mb-2">403 FORBIDDEN</h1>
              <p className="text-stone-600 text-sm">หน้านี้ต้องการสิทธิ์ Admin เท่านั้น</p>
            </div>
          </div>
        </div>
      );
    }
  }

  if (requiredRole === 'owner') {
    if (user?.permission !== 'owner') {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[#fbf8f4]">
          <div className="max-w-md w-full mx-4">
            <div className="bg-white rounded-2xl shadow-lg border border-rose-200 p-8 text-center">
              <div className="w-14 h-14 rounded-full bg-rose-100 flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl">🚫</span>
              </div>
              <h1 className="text-xl font-bold text-rose-700 mb-2">403 FORBIDDEN</h1>
              <p className="text-stone-600 text-sm">หน้านี้ต้องการสิทธิ์ Owner เท่านั้น</p>
            </div>
          </div>
        </div>
      );
    }
  }

  return children;
}
