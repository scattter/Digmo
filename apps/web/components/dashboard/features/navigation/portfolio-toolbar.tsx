"use client";

import {
  closestCenter,
  DndContext,
  DragEndEvent,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors
} from "@dnd-kit/core";
import { SortableContext, useSortable, rectSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { PortfolioSummary } from "@digmo/shared";
import { CloseCircleFilled } from "@ant-design/icons";
import { FlatExpandMode } from "@/lib/api";
import { MainView } from "@/hooks/use-dashboard-data";
import { Button, Card, Radio, Badge } from "antd";
import { useIsMobile } from "@/hooks/use-is-mobile";

interface PortfolioToolbarProps {
  mainView: MainView;
  isBusy: boolean;
  portfolios: PortfolioSummary[];
  selectedPortfolioId: string;
  onSelectPortfolio: (portfolioId: string) => void;
  flatExpand: FlatExpandMode;
  onFlatExpandChange: (value: FlatExpandMode) => void;
  onDeletePortfolioTab: (portfolio: PortfolioSummary) => void;
  onPortfolioDragEnd: (event: DragEndEvent) => void;
}

function SortablePortfolioTab(props: {
  portfolio: PortfolioSummary;
  selectedPortfolioId: string;
  isBusy: boolean;
  onSelectPortfolio: (portfolioId: string) => void;
  onDeletePortfolioTab: (portfolio: PortfolioSummary) => void;
}) {
  const { portfolio, selectedPortfolioId, isBusy, onSelectPortfolio, onDeletePortfolioTab } = props;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: portfolio.id,
    disabled: isBusy
  });
  const isMobile = useIsMobile();

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    display: 'inline-block',
    marginRight: 8,
    marginBottom: 8,
  };

  const isSelected = selectedPortfolioId === portfolio.id;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
    >
      <div className="group relative">
         <Badge 
            count={
              <CloseCircleFilled 
                 className="opacity-0 group-hover:opacity-100 transition-opacity bg-white rounded-full"
                 style={{ color: '#ff4d4f', cursor: 'pointer' }}
                 onClick={(e) => {
                    e.stopPropagation();
                    onDeletePortfolioTab(portfolio);
                 }}
              />
            }
            offset={[-5, 5]}
         >
           <Button
              type={isSelected ? "primary" : "default"}
              onClick={() => onSelectPortfolio(portfolio.id)}
              disabled={isBusy}
              size={isMobile ? "small" : "middle"}
           >
              {portfolio.name}
           </Button>
         </Badge>
      </div>
    </div>
  );
}

export function PortfolioToolbar(props: PortfolioToolbarProps) {
  const {
    mainView,
    isBusy,
    portfolios,
    selectedPortfolioId,
    onSelectPortfolio,
    flatExpand,
    onFlatExpandChange,
    onDeletePortfolioTab,
    onPortfolioDragEnd
  } = props;
  
  const isMobile = useIsMobile();

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6
      }
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 120,
        tolerance: 8
      }
    })
  );

  return (
    <Card styles={{ body: { padding: 16 } }}>
        {mainView === "portfolios" ? (
          <div className="flex flex-wrap" role="tablist" aria-label="组合选择">
            <Button
              type={selectedPortfolioId === "all" ? "primary" : "default"}
              onClick={() => onSelectPortfolio("all")}
              style={{ marginRight: 8, marginBottom: 8 }}
              size={isMobile ? "small" : "middle"}
            >
              全部组合
            </Button>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onPortfolioDragEnd}>
              <SortableContext items={portfolios.map((portfolio) => portfolio.id)} strategy={rectSortingStrategy}>
                {portfolios.map((portfolio) => (
                  <SortablePortfolioTab
                    key={portfolio.id}
                    portfolio={portfolio}
                    selectedPortfolioId={selectedPortfolioId}
                    isBusy={isBusy}
                    onSelectPortfolio={onSelectPortfolio}
                    onDeletePortfolioTab={onDeletePortfolioTab}
                  />
                ))}
              </SortableContext>
            </DndContext>
          </div>
        ) : null}

        {mainView === "funds" ? (
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <Radio.Group 
               value={flatExpand} 
               onChange={(e) => onFlatExpandChange(e.target.value)}
               buttonStyle="solid"
               size={isMobile ? "small" : "middle"}
            >
               <Radio.Button value="dedup">去重汇总</Radio.Button>
               <Radio.Button value="expanded">按组合展开</Radio.Button>
            </Radio.Group>
          </div>
        ) : null}
    </Card>
  );
}
