// 디자인 v3 가독성: 잠금 칩 · 한 줄 안내 · 개수 칩 (이모지 대신 선 아이콘)
const P = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;

export const LockIco = ({ s = 12 }: { s?: number }) => (
  <svg viewBox="0 0 24 24" width={s} height={s} aria-hidden><rect x="5" y="11" width="14" height="9" rx="2" {...P} /><path d="M8 11V8a4 4 0 018 0v3" {...P} /></svg>
);
export const InfoIco = ({ s = 16 }: { s?: number }) => (
  <svg viewBox="0 0 24 24" width={s} height={s} aria-hidden style={{ flex: "none" }}><circle cx="12" cy="12" r="8.5" {...P} /><path d="M12 11v5M12 8h.01" {...P} /></svg>
);

/** 권한·조건 설명 문장 대신 쓰는 잠금 칩: "대표 · 지점장만" */
export function Lock({ children, red, title }: { children: React.ReactNode; red?: boolean; title?: string }) {
  return <span className={`v3-lock${red ? " red" : ""}`} title={title}><LockIco />{children}</span>;
}

/** 꼭 필요한 안내만 한 줄로 */
export function InfoLine({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`v3-info ${className}`}><InfoIco />{children}</div>;
}

/** 카드 제목 옆 개수 칩. now = 지금 처리해야 할 개수(빨강 채움) */
export function Cnt({ n, now }: { n: number | string; now?: boolean }) {
  return <span className={`v3-cnt num${now ? " now" : ""}`}>{n}</span>;
}
