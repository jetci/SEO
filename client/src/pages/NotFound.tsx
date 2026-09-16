import { Link } from "wouter";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#fbf8f4] p-8">
      <div className="text-center max-w-md">
        <h1 className="text-6xl font-bold text-[#b45309] mb-4">404</h1>
        <p className="text-xl text-stone-700 mb-8">หน้าที่คุณค้นหาไม่พบ</p>
        <Link href="/">
          <a className="inline-block px-6 py-3 bg-[#b45309] text-white rounded-lg hover:bg-[#92400e] transition-colors">
            กลับหน้าแรก
          </a>
        </Link>
      </div>
    </div>
  );
}
