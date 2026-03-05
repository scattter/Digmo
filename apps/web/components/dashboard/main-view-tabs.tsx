"use client";

import { MainView } from "@/hooks/use-dashboard-data";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface MainViewTabsProps {
  value: MainView;
  onChange: (value: MainView) => void;
}

export function MainViewTabs({ value, onChange }: MainViewTabsProps) {
  return (
    <Tabs value={value} onValueChange={(next) => onChange(next as MainView)}>
      <TabsList aria-label="主视图切换">
        <TabsTrigger value="portfolios">组合视图</TabsTrigger>
        <TabsTrigger value="funds">基金平铺</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
