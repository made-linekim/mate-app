"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import MobileView from "./view";

/* PC: 설정 첫 화면은 '기본'. 모바일: 설정 보기(보기만, 시안 U-MO-MORE-1_설정보기) */
export default function SettingsHome() {
  const router = useRouter();
  const [mobile, setMobile] = useState<boolean | null>(null);
  useEffect(() => {
    const m = window.matchMedia("(max-width:767px)").matches;
    setMobile(m);
    if (!m) router.replace("/settings/basic");
  }, [router]);
  return mobile ? <MobileView /> : null;
}
