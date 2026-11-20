import { redirect } from "next/navigation";

// 직원 관리는 설정 › 직원으로 옮겼어요 (메라 시안 11-11)
export default function StaffRedirect() {
  redirect("/settings/staff");
}
