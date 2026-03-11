import { Suspense } from "react";
import FundDashboard from "./fund-dashboard";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <FundDashboard />
    </Suspense>
  );
}
