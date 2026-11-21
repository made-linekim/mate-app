import { redirect } from "next/navigation";

// 해피콜은 '오늘 할 일' 안의 탭이에요 (메라 시안 02-01)
export default function HappyCall() {
  redirect("/work?tab=happycall");
}
