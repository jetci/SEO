import * as React from "react";
import { cn } from "@/lib/utils";

const Calendar = ({ className, selected, onSelect, fromDate, toDate, ...props }: any) => {
  const [cursor, setCursor] = React.useState<Date>(selected ?? new Date());
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startWeekday = firstDay.getDay();
  const monthName = firstDay.toLocaleString(undefined, { month: "long" });
  const cells: (number | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const isSameDay = (a?: Date | null, b?: Date | null) =>
    a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  return (
    <div className={cn("p-3 rounded-md border bg-white text-sm", className)} {...props}>
      <div className="flex items-center justify-between mb-2">
        <button type="button" onClick={() => setCursor(new Date(year, month - 1, 1))}>‹</button>
        <div className="font-medium">{monthName} {year}</div>
        <button type="button" onClick={() => setCursor(new Date(year, month + 1, 1))}>›</button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground mb-1">
        {["Su","Mo","Tu","We","Th","Fr","Sa"].map((d) => (<div key={d} className="py-1">{d}</div>))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (d === null) return <div key={i} />;
          const dt = new Date(year, month, d);
          const isSel = isSameDay(dt, selected);
          return (
            <button
              key={i}
              type="button"
              onClick={() => onSelect?.(dt)}
              className={cn(
                "h-8 w-8 rounded-md text-sm hover:bg-accent",
                isSel && "bg-primary text-primary-foreground hover:bg-primary"
              )}
            >{d}</button>
          );
        })}
      </div>
    </div>
  );
};

export { Calendar };
