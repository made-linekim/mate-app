"use client";
import { useEffect, useState } from "react";
import { sb } from "@/lib/sb";
import { friendly } from "../ui";

type Cat = { id: string; name: string; kind: string; sort: number; hidden: boolean; is_system: boolean };

export default function Accounts() {
  const [rows, setRows] = useState<Cat[]>([]);
  const [err, setErr] = useState("");
  const [name, setName] = useState("");
  const [kind, setKind] = useState("expense");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    sb.rpc("expense_category_list").then(({ data, error }) => {
      setErr(error ? friendly(error.message) : "");
      setRows((data ?? []) as Cat[]);
    });
  }, [tick]);

  async function save(c: Partial<Cat> & { name: string }) {
    const { error } = await sb.rpc("expense_category_save", {
      p_id: c.id ?? null, p_name: c.name, p_kind: c.kind ?? kind, p_sort: c.sort ?? rows.length + 1, p_hidden: c.hidden ?? false,
    });
    if (error) setErr(friendly(error.message)); else { setErr(""); setTick(tick + 1); }
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <div className="card">
        <div className="hd"><h2>계정 추가</h2><span className="meta">경비 지출을 나눌 항목이에요 (예: 임대료, 소모품, 광고비)</span></div>
        <form style={{ display: "flex", gap: 8, flexWrap: "wrap" }} onSubmit={(e) => { e.preventDefault(); if (name.trim()) { save({ name: name.trim() }); setName(""); } }}>
          <div className="seg">
            <button type="button" className={kind === "expense" ? "on" : ""} onClick={() => setKind("expense")}>지출</button>
            <button type="button" className={kind === "income" ? "on" : ""} onClick={() => setKind("income")}>수입</button>
          </div>
          <input className="inp" style={{ maxWidth: 280 }} placeholder="계정 이름" value={name} onChange={(e) => setName(e.target.value)} />
          <button className="btn p">추가</button>
        </form>
      </div>
      {err && <p style={{ color: "var(--red)" }}>{err}</p>}
      <div className="card" style={{ padding: 0, marginTop: "var(--section-gap)" }}>
        <table className="t">
          <thead><tr><th>이름</th><th>구분</th><th>상태</th><th></th></tr></thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id}>
                <td style={{ fontWeight: 600 }}>{c.name}{c.is_system && <span className="badge" style={{ marginLeft: 6 }}>기본</span>}</td>
                <td>{c.kind === "income" ? "수입" : "지출"}</td>
                <td>{c.hidden ? <span className="badge">숨김</span> : <span className="badge ok">사용</span>}</td>
                <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  {!c.is_system && (
                    <button className="btn t sm" onClick={() => {
                      const n = window.prompt("새 이름", c.name);
                      if (n && n.trim() && n.trim() !== c.name) save({ ...c, name: n.trim() });
                    }}>이름 변경</button>
                  )}
                  <button className="btn t sm" onClick={() => save({ ...c, hidden: !c.hidden })}>{c.hidden ? "다시 사용" : "숨기기"}</button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && !err && <tr><td colSpan={4} style={{ textAlign: "center", color: "var(--ink-3)" }}>아직 계정이 없어요</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
