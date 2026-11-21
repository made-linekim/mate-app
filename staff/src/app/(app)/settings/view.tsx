"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { sb } from "@/lib/sb";
import { useMe } from "@/lib/me";
import { V3i, useSettings, val } from "./kit";
import { BASIC0 } from "./defaults";

type Day = { d: number; open: boolean; s: string; e: string };
const WD = ["일", "월", "화", "수", "목", "금", "토"];
/* 요일별 영업 → '화–일 10:00 – 19:00 · 월요일 휴무' */
export function hoursText(days: Day[] | undefined) {
  if (!days?.length) return "—";
  const order = [1, 2, 3, 4, 5, 6, 0];
  const open = order.map((d) => days.find((x) => x.d === d)).filter((x): x is Day => !!x && x.open);
  const off = order.filter((d) => !open.some((x) => x.d === d));
  const groups = new Map<string, number[]>();
  open.forEach((x) => groups.set(`${x.s} – ${x.e}`, [...(groups.get(`${x.s} – ${x.e}`) ?? []), x.d]));
  const span = (ds: number[]) => {
    const idx = ds.map((d) => order.indexOf(d));
    const run = idx.every((v, i) => i === 0 || v === idx[i - 1] + 1);
    return run && ds.length > 2 ? `${WD[ds[0]]}–${WD[ds[ds.length - 1]]}` : ds.map((d) => WD[d]).join("·");
  };
  const parts = [...groups.entries()].map(([t, ds]) => `${span(ds)} ${t}`);
  if (off.length) parts.push(`${off.map((d) => WD[d]).join("·")}요일 휴무`);
  return parts.join(" · ");
}
export const maskTel = (t: string) => t.replace(/^(\d{2,3})-?(\d{3,4})-?(\d{4})$/, "$1-****-$3");

/* 모바일 설정 보기 (시안 U-MO-MORE-1_설정보기) — 보기만 */
export default function MobileView() {
  const me = useMe();
  const router = useRouter();
  const { data } = useSettings(me.branch);
  const [progs, setProgs] = useState<{ name: string; minutes: number; active: boolean; grp: string }[]>([]);
  useEffect(() => { sb.rpc("program_admin_list").then(({ data }) => setProgs((data ?? []) as typeof progs)); }, []);
  const b = val(data, "basic", BASIC0(me.branch));
  const close = val(data, "close", { day: "22:00" } as { day: string });
  const hours = val(data, "hours", { days: [] as Day[] });
  const dur = progs.filter((p) => p.active && p.grp === "시술").map((p) => `${p.name} ${p.minutes}분`).join(" · ") || `${b.dur}분`;
  const rows: [string, string][] = [
    ["지점 이름", b.name || me.branch], ["주소", b.addr || "—"], ["대표 전화", b.tel ? (b.mask ? maskTel(b.tel) : b.tel) : "—"],
    ["예약 단위", `${b.unit}분`], ["기본 소요", dur], ["업무시간", hoursText(hours.days)], ["마감 기준", `그날 ${close.day}`],
  ];
  return (
    <div className="mv">
      <div className="mv-hd"><button type="button" className="mv-x" onClick={() => router.push("/more")}>닫기</button><b>설정 보기</b></div>
      <div className="mv-bd">
        <div className="mv-note"><V3i n="info" />바꾸려면 PC에서 해요.</div>
        {rows.map(([l, v]) => <div key={l} className="mv-row"><span>{l}</span><b>{v}</b></div>)}
        <p className="mv-foot">이 화면에서는 고치거나 저장할 수 없어요.</p>
      </div>
    </div>
  );
}
