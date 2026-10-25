import { useEffect } from "react";
import MockApp from "./MockApp";
import HermesApp from "./HermesApp";

export default function App() {
  const mode = new URLSearchParams(window.location.search).get("mode")
    || import.meta.env.VITE_APP_MODE || "final";
  useEffect(() => {
    const url = new URL(window.location.href);
    if (["research", "research-api"].includes(url.searchParams.get("mode") || "")) {
      url.searchParams.delete("mode");
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    }
  }, []);
  // The supplied complete document owns its layout and navigation; keep the old UI available.
  if (["final", "research", "research-api"].includes(mode)) return <CompleteHermes />;
  if (mode === "legacy") return <HermesApp />;
  if (mode === "mock" || mode === "api") return <MockApp mode={mode} />;
  return <div className="full-state" role="alert"><h1>이 화면을 열 수 없습니다</h1><p>아래 링크에서 현재 서비스 화면을 열어 주세요.</p><a href="?mode=final">현재 서비스 화면 열기</a></div>;
}

function CompleteHermes() {
  useEffect(() => {
    const target = new URL(`${import.meta.env.BASE_URL}hermes-complete.html`, window.location.origin);
    target.search = window.location.search;
    target.searchParams.delete("mode");
    window.location.replace(target);
  }, []);
  return <main className="full-state">HERMES 화면을 열고 있습니다…</main>;
}
