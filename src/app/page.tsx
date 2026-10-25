"use client";
import dynamic from "next/dynamic";

const App = dynamic(() => import("@/components/App"), {
  ssr: false,
  loading: () => <div className="boot">Loading 3D house…</div>,
});

export default function Page() {
  return <App />;
}
