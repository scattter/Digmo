import { Grid } from "antd";

const { useBreakpoint } = Grid;

export function useIsMobile() {
  const screens = useBreakpoint();
  
  // screens is initially empty {} during SSR and first render
  // We consider "mobile" if we are certain we are NOT on 'md' or larger
  // But since it starts empty, we might want to default to false (desktop)
  // until we know for sure.
  
  // If screens.md is undefined, it means we don't know yet (SSR or mounting).
  // If screens.md is false, it means viewport is < 768px.
  // If screens.md is true, it means viewport is >= 768px.
  
  return screens.md === false;
}
