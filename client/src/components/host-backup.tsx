import { useRef, useState } from "react";

/**
 * 설정 전체 백업: 게임 규칙 · 소수의 선택 질문 · 불참 테이블 · 얼굴 카드 인물과 사진
 * Render에 다시 배포하면 서버 데이터가 지워지므로, 배포 후 이 파일 하나로 복구합니다.
 */
export default function HostBackup({ hostToken, locked, busy, onImported }: { hostToken: string; locked: boolean; busy: boolean; onImported: () => void }) {
  const [status, setStatus] = useState("");
  const [working, setWorking] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const run = async (fn: () => Promise<void>) => {
    setWorking(true); setStatus("");
    try { await fn(); } catch (e) { setStatus(e instanceof Error ? e.message : "다시 시도해 주세요."); } finally { setWorking(false); }
  };
  const download = () => run(async () => {
    const r = await fetch("/api/face/export", { headers: { "x-host-token": hostToken } });
    if (!r.ok) throw new Error("내려받지 못했습니다.");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(await r.blob());
    a.download = `all-in-macau-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    setStatus("백업 파일을 내려받았습니다. 배포 후 \"백업 불러오기\"로 그대로 복구할 수 있습니다.");
  });
  const upload = (file: File | undefined) => run(async () => {
    if (!file) return;
    let json: unknown;
    try { json = JSON.parse(await file.text()); } catch { throw new Error("백업 파일을 읽을 수 없습니다."); }
    const r = await fetch("/api/face/import", { method: "POST", headers: { "Content-Type": "application/json", "x-host-token": hostToken }, body: JSON.stringify(json) });
    const body = await r.json();
    if (!r.ok) throw new Error(body.error || "불러오지 못했습니다.");
    setStatus("백업 파일에서 설정·질문·불참 테이블·인물과 사진을 불러왔습니다.");
    onImported();
  });
  return <section className="host-panel host-backup">
    <div className="host-panel-head"><h2>설정 백업</h2></div>
    <p>게임 규칙, 소수의 선택 질문, 불참 테이블, 얼굴 카드 인물·사진을 <b>파일 하나</b>로 저장합니다. <b>Render에 다시 배포하면 서버 설정이 기본값으로 돌아가니</b>, 설정을 바꾼 뒤에는 꼭 내려받고 배포 후 불러오세요.</p>
    <div className="host-face-actions">
      <button type="button" className="host-btn ghost" disabled={busy || working} onClick={download}>설정 전체 백업 내려받기</button>
      <button type="button" className="host-btn ghost" disabled={busy || working || locked} onClick={() => fileRef.current?.click()}>백업 불러오기</button>
      <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={e => { void upload(e.target.files?.[0]); e.target.value = ""; }} />
    </div>
    {locked && <p className="host-subtle">게임이 시작된 뒤에는 불러올 수 없습니다. 새 게임을 만든 뒤 불러오세요.</p>}
    {status && <p className="host-face-status" role="status">{status}</p>}
  </section>;
}
