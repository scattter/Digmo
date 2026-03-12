"use client";

import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "antd";
import { cn } from "@/lib/utils";

export interface TabItem {
  id: string;
  label: React.ReactNode;
  canDrag?: boolean;
}

interface DraggableTabListProps {
  items: TabItem[];
  activeId: string;
  onChange: (id: string) => void;
  onDragEnd: (event: DragEndEvent) => void;
  className?: string;
  mobileEndSlot?: React.ReactNode;
}

function SortableTab({
  item,
  isActive,
  onClick,
}: {
  item: TabItem;
  isActive: boolean;
  onClick: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id, disabled: !item.canDrag });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 1 : 0,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="inline-block"
    >
      <Button
        type={isActive ? "primary" : "text"}
        onClick={onClick}
        className={cn("mx-1", isActive ? "font-bold" : "text-gray-500")}
      >
        {item.label}
      </Button>
    </div>
  );
}

export function DraggableTabList({
  items,
  activeId,
  onChange,
  onDragEnd,
  className,
  mobileEndSlot,
}: DraggableTabListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 100, tolerance: 5 },
    })
  );

  const fixedItems = items.filter((item) => !item.canDrag);
  const draggableItems = items.filter((item) => item.canDrag);

  return (
    <div
      className={cn(
        "flex items-center overflow-x-auto whitespace-nowrap scrollbar-hide",
        className
      )}
    >
      {/* Fixed Items */}
      {fixedItems.map((item) => (
        <Button
          key={item.id}
          type={item.id === activeId ? "primary" : "text"}
          onClick={() => onChange(item.id)}
          className={cn(
            "mx-1 shrink-0",
            item.id === activeId ? "font-bold" : "text-gray-500"
          )}
        >
          {item.label}
        </Button>
      ))}

      {/* Draggable Items */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
      >
        <SortableContext
          items={draggableItems.map((i) => i.id)}
          strategy={horizontalListSortingStrategy}
        >
          {draggableItems.map((item) => (
            <SortableTab
              key={item.id}
              item={item}
              isActive={item.id === activeId}
              onClick={() => onChange(item.id)}
            />
          ))}
        </SortableContext>
      </DndContext>
      {mobileEndSlot ? <div className="shrink-0 pl-1">{mobileEndSlot}</div> : null}
    </div>
  );
}
