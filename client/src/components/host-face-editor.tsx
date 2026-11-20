import { useEffect, useRef, useState } from "react";

export type FacePersonDraft = { id?: string; name: string; aliases: string; photo: string | null };
type FacePerson = { id: string; name: string; aliases: string[]; photo: string | null };
type Props = { people: FacePerson[]; hostToken: string; locked: boolean; busy: boolean; onSave: (people: { id?: string; name: string; aliases: string[]; photo: string | null }[]) => void; onImported: () => void };

const toDraft = (p: FacePerson): FacePersonDraft => ({ id: p.id, name: p.name, aliases: (p.aliases || []).join(", "), photo: p.photo });

/** 사진을 긴 변 600px JPEG로 줄여 data URL로 (업로드 용량·전송량 절약) */
async function resizeToDataUrl(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = () => reject(new Error("이미지를 읽을 수 없습니다.")); i.src = url; });
    const scale = Math.min(1, 600 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.82);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function HostFaceEditor({ people, hostToken, locked, busy, onSave, onImported }: Props) {
  const [draft, setDraft] = useState<FacePersonDraft[]>(people.map(toDraft));
  const [status, setStatus] = useState("");
  const [working, setWorking] = useState(false);
  const bulkRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const key = JSON.stringify(people);
  useEffect(() => { setDraft(people.map(toDraft)); }, [key]);

  const upload = async (file: File): Promise<string> => {
    const data = await resizeToDataUrl(file);
    const r = await fetch("/api/face/photo", { method: "POST", headers: { "Content-Type": "application/json", "x-host-token": hostToken }, body: JSON.stringify({ data }) });
    const body = await r.json();
    if (!r.ok) throw new Error(body.error || "사진을 올리지 못했습니다.");
    return body.id as string;
  };
  const run = async (fn: () => Promise<void>) => {
    setWorking(true); setStatus("");
    try { await fn(); } catch (e) { setStatus(e instanceof Error ? e.message : "다시 시도해 주세요."); } finally { setWorking(false); }
  };
  const addPhotos = (files: FileList | null) => run(async () => {
    if (!files?.length) return;
    const added: FacePersonDraft[] = [];
    for (const file of Array.from(files).slice(0, 40)) {
      setStatus(`사진 올리는 중… ${added.length + 1} / ${files.length}`);
      const photo = await upload(file);
      // 파일 이름을 그대로 이름으로 사용 (예: 홍길동.jpg → 홍길동)
      added.push({ name: file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim().slice(0, 30), aliases: "", photo });
    }
    setDraft(prev => [...prev, ...added].slice(0, 40));
    setStatus(`${added.length}명을 추가했습니다. 이름을 확인하고 저장하세요.`);
  });
  const replacePhoto = (index: number, file: File | undefined) => run(async () => {
    if (!file) return;
    const photo = await upload(file);
    setDraft(prev => prev.map((p, i) => i === index ? { ...p, photo } : p));
    setStatus("사진을 바꿨습니다. 저장하세요.");
  });
  const exportFile = () => run(async () => {
    const r = await fetch("/api/face/export", { headers: { "x-host-token": hostToken } });
    if (!r.ok) throw new Error("내려받지 못했습니다.");
    const blob = await r.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "face-cards.json";
    a.click();
    URL.revokeObjectURL(a.href);
    setStatus("저장된 인물과 사진을 파일로 내려받았습니다. 재배포 후 사진이 사라지면 이 파일을 불러오세요.");
  });
  const importFile = (file: File | undefined) => run(async () => {
    if (!file) return;
    const json = JSON.parse(await file.text());
    const r = await fetch("/api/face/import", { method: "POST", headers: { "Content-Type": "application/json", "x-host-token": hostToken }, body: JSON.stringify(json) });
    const body = await r.json();
    if (!r.ok) throw new Error(body.error || "불러오지 못했습니다.");
    setStatus("파일에서 인물과 사진을 불러왔습니다.");
    onImported();
  });

  const ready = draft.filter(p => p.name.trim() && p.photo).length;
  const save = () => {
    if (draft.some(p => !p.name.trim() || !p.photo)) { setStatus("이름과 사진이 모두 있어야 합니다. 비어 있는 사람을 채우거나 삭제해 주세요."); return; }
    onSave(draft.map(p => ({ id: p.id, name: p.name.trim(), aliases: p.aliases.split(",").map(a => a.trim()).filter(Boolean), photo: p.photo })));
    setStatus("");
  };
  const disabled = locked || busy || working;

  return <section className="host-panel host-face-editor">
    <div className="host-panel-head"><h2>얼굴 카드 인물</h2><span className="host-subtle">{ready}명 · 카드 {ready * 2}장</span></div>
    <p>사진을 여러 장 한 번에 고르면 <b>파일 이름이 이름</b>으로 들어갑니다 (예: <code>홍길동.jpg</code>). 2명 이상 등록하면 얼굴 카드가 1라운드로 진행되고, 비워 두면 얼굴 카드 없이 시작합니다.</p>
    <p className="host-subtle">추천: 테이블 10개 기준 8~12명 (약 10~15분). 다른 표기(영문 이름, 별명)는 쉼표로 적으면 정답으로 인정합니다.</p>
    <div className="host-face-actions">
      <button type="button" className="host-btn ghost" disabled={disabled} onClick={() => bulkRef.current?.click()}>+ 사진 여러 장 추가</button>
      <button type="button" className="host-btn ghost" disabled={busy || working || !people.length} onClick={exportFile}>파일로 내려받기 (백업)</button>
      <button type="button" className="host-btn ghost" disabled={disabled} onClick={() => importRef.current?.click()}>백업 파일 불러오기</button>
      <input ref={bulkRef} type="file" accept="image/*" multiple hidden onChange={e => { void addPhotos(e.target.files); e.target.value = ""; }} />
      <input ref={importRef} type="file" accept="application/json,.json" hidden onChange={e => { void importFile(e.target.files?.[0]); e.target.value = ""; }} />
    </div>
    {status && <p className="host-face-status" role="status">{status}</p>}
    <div className="host-face-list">
      {draft.map((p, i) => <div className="host-face-row" key={p.id ?? `new-${i}`}>
        <label className="host-face-photo" title="사진 바꾸기">{p.photo ? <img src={`/photos/${p.photo}`} alt="" /> : <span>사진 없음</span>}<input type="file" accept="image/*" hidden disabled={disabled} onChange={e => { void replacePhoto(i, e.target.files?.[0]); e.target.value = ""; }} /></label>
        <div className="host-face-fields">
          <label>이름<input type="text" maxLength={30} value={p.name} disabled={disabled} onChange={e => setDraft(prev => prev.map((q, j) => j === i ? { ...q, name: e.target.value } : q))} /></label>
          <label>다른 표기 (쉼표로 구분)<input type="text" maxLength={120} value={p.aliases} disabled={disabled} placeholder="예: Gildong Hong, 길동" onChange={e => setDraft(prev => prev.map((q, j) => j === i ? { ...q, aliases: e.target.value } : q))} /></label>
        </div>
        <button type="button" className="host-face-remove" disabled={disabled} onClick={() => setDraft(prev => prev.filter((_, j) => j !== i))}>삭제</button>
      </div>)}
      {!draft.length && <p className="empty">등록된 인물이 없습니다.</p>}
    </div>
    <button className="primary" type="button" disabled={disabled} onClick={save}>인물 저장 →</button>
    {locked && <p className="host-subtle">게임이 시작되어 수정할 수 없습니다. 새 게임을 만들면 다시 수정할 수 있습니다.</p>}
  </section>;
}
